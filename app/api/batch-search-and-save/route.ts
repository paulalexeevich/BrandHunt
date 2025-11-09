import { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { searchProducts, getFrontImageUrl, preFilterFoodGraphResults } from '@/lib/foodgraph';
import { compareProductImages, cropImageToBoundingBox } from '@/lib/gemini';

interface SearchAndSaveResult {
  detectionId: string;
  detectionIndex: number;
  status: 'success' | 'error' | 'no_match';
  productName?: string;
  brandName?: string;
  resultsSearched?: number;
  savedMatch?: {
    productName: string;
    brandName: string;
    gtin: string;
    imageUrl: string;
  };
  error?: string;
}

interface ProgressUpdate {
  type: 'progress' | 'complete';
  detectionIndex?: number;
  stage?: 'searching' | 'prefiltering' | 'filtering' | 'saving' | 'done' | 'error';
  message?: string;
  resultsFound?: number;
  preFilteredCount?: number;
  currentProduct?: string;
  processed?: number;
  total?: number;
  success?: number;
  noMatch?: number;
  errors?: number;
  results?: SearchAndSaveResult[];
}

export async function POST(request: NextRequest) {
  try {
    const { imageId, concurrency } = await request.json();

    if (!imageId) {
      return new Response(JSON.stringify({ 
        error: 'Missing imageId parameter' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔍 Starting batch search & save for image ${imageId}...`);
    if (concurrency) {
      console.log(`⚡ Concurrency level: ${concurrency === 999999 ? 'ALL (unlimited)' : concurrency} products at a time`);
    }

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch the image data
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return new Response(JSON.stringify({ 
        error: 'Image not found',
        details: imageError?.message 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch all detections that have brand info but are not fully analyzed yet
    // Match frontend logic: !fully_analyzed includes both null AND false
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('image_id', imageId)
      .not('brand_name', 'is', null)
      .not('fully_analyzed', 'eq', true)
      .order('detection_index');

    if (detectionsError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch detections',
        details: detectionsError.message 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!detections || detections.length === 0) {
      return new Response(JSON.stringify({
        message: 'No products to process',
        processed: 0,
        results: []
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`🚀 Found ${detections.length} products that need processing`);
    
    // Configurable concurrency: 3 (default), 10, 20, 50, or 999999 (all at once)
    const CONCURRENCY_LIMIT = concurrency || 3;
    const DELAY_BETWEEN_BATCHES = 5000; // 5 second delay between batches (for FoodGraph API rate limiting)
    const imageBase64 = image.file_path;
    
    console.log(`📊 Processing with concurrency limit: ${CONCURRENCY_LIMIT === 999999 ? `ALL ${detections.length}` : CONCURRENCY_LIMIT}`);

    // Create streaming response with Server-Sent Events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const results: SearchAndSaveResult[] = [];

        // Helper to send progress updates
        const sendProgress = (update: ProgressUpdate) => {
          const data = `data: ${JSON.stringify(update)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        // Process function for a single detection
        const processDetection = async (detection: any, globalIndex: number): Promise<SearchAndSaveResult> => {
          const result: SearchAndSaveResult = {
            detectionId: detection.id,
            detectionIndex: detection.detection_index,
            status: 'error'
          };

          try {
            // Step 1: Search FoodGraph
            console.log(`\n[#${detection.detection_index}] Starting search...`);
            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'searching',
              message: `Searching FoodGraph...`,
              currentProduct: detection.brand_name || `Product #${detection.detection_index}`,
              processed: globalIndex + 1,
              total: detections.length
            });

            // Parse product info
            let productInfo = null;
            if (detection.brand_extraction_response) {
              try {
                productInfo = JSON.parse(detection.brand_extraction_response);
              } catch (e) {
                console.error(`  ⚠️ Failed to parse brand_extraction_response:`, e);
              }
            }

            // Search FoodGraph
            const searchResult = productInfo && (productInfo.productName || productInfo.flavor || productInfo.size)
              ? await searchProducts(detection.brand_name, {
                  brand: productInfo.brand,
                  productName: productInfo.productName,
                  flavor: productInfo.flavor,
                  size: productInfo.size
                })
              : await searchProducts(detection.brand_name);
            
            // Transform products to add front_image_url property
            const foodgraphResults = searchResult.products.map(product => ({
              ...product,
              product_name: product.title,
              brand_name: product.companyBrand || null,
              product_gtin: product.keys?.GTIN14 || product.key || null,
              // Keep category as array for type compatibility with FoodGraphProduct
              category: product.category,
              front_image_url: getFrontImageUrl(product)
            }));

            result.resultsSearched = foodgraphResults.length;
            result.productName = detection.product_name || detection.brand_name;
            result.brandName = detection.brand_name;
            
            console.log(`  ✅ Found ${foodgraphResults.length} FoodGraph results`);

            if (foodgraphResults.length === 0) {
              result.status = 'no_match';
              result.error = 'No FoodGraph results found';
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'No results found',
                processed: globalIndex + 1,
                total: detections.length
              });
              return result;
            }

            // Step 2: Pre-filter by text similarity (brand, size, flavor)
            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'prefiltering',
              message: `Pre-filtering ${foodgraphResults.length} results...`,
              resultsFound: foodgraphResults.length,
              processed: globalIndex + 1,
              total: detections.length
            });

            console.log(`  [#${detection.detection_index}] Pre-filtering ${foodgraphResults.length} results by brand/size/retailer...`);

            // Apply text-based pre-filtering with retailer matching
            const preFilteredResults = preFilterFoodGraphResults(
              foodgraphResults, 
              {
                brand: detection.brand_name || undefined,
                size: detection.size || undefined,
                productName: detection.product_name || undefined,
                sizeConfidence: detection.size_confidence || undefined
              },
              image.store_name || undefined // Pass store name for retailer matching
            );

            console.log(`  ✅ Pre-filtered to ${preFilteredResults.length} results (from ${foodgraphResults.length})`);

            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'prefiltering',
              message: `Pre-filtered to ${preFilteredResults.length} results`,
              preFilteredCount: preFilteredResults.length,
              processed: globalIndex + 1,
              total: detections.length
            });

            if (preFilteredResults.length === 0) {
              result.status = 'no_match';
              result.error = 'No matches after pre-filtering';
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'No matches after pre-filter',
                processed: globalIndex + 1,
                total: detections.length
              });
              return result;
            }

            // Step 3: Filter with AI
            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'filtering',
              message: `AI filtering ${preFilteredResults.length} results...`,
              resultsFound: preFilteredResults.length,
              processed: globalIndex + 1,
              total: detections.length
            });

            console.log(`  [#${detection.detection_index}] AI filtering ${preFilteredResults.length} pre-filtered results...`);

            // CRITICAL: Crop image to just this product (like manual filter does!)
            // Extract bounding box from JSONB column or individual columns
            let boundingBox: { y0: number; x0: number; y1: number; x1: number };
            
            if (detection.bounding_box && typeof detection.bounding_box === 'object') {
              // Coordinates stored in bounding_box JSONB column
              boundingBox = detection.bounding_box as { y0: number; x0: number; y1: number; x1: number };
            } else if (detection.y0 != null && detection.x0 != null && detection.y1 != null && detection.x1 != null) {
              // Coordinates stored as individual columns
              boundingBox = {
                y0: detection.y0,
                x0: detection.x0,
                y1: detection.y1,
                x1: detection.x1
              };
            } else {
              console.error(`    ❌ Invalid bounding box data:`, detection.bounding_box || { y0: detection.y0, x0: detection.x0, y1: detection.y1, x1: detection.x1 });
              result.status = 'error';
              result.error = 'Invalid bounding box coordinates';
              
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'Invalid coordinates',
                processed: globalIndex + 1,
                total: detections.length
              });
              
              return result;
            }
            
            // Validate the extracted coordinates
            if (isNaN(boundingBox.y0) || isNaN(boundingBox.x0) || isNaN(boundingBox.y1) || isNaN(boundingBox.x1)) {
              console.error(`    ❌ NaN in bounding box:`, boundingBox);
              result.status = 'error';
              result.error = 'Invalid bounding box coordinates';
              
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'Invalid coordinates',
                processed: globalIndex + 1,
                total: detections.length
              });
              
              return result;
            }
            
            console.log(`    ✂️ Cropping product #${detection.detection_index} with bounding box:`, boundingBox);
            console.log(`    📏 Original image size: ${imageBase64.length} chars (base64)`);
            
            const { croppedBase64, width, height } = await cropImageToBoundingBox(imageBase64, boundingBox);
            
            console.log(`    ✅ Cropped to ${width}x${height}px (${croppedBase64.length} chars base64)`);

            // Compare pre-filtered results in PARALLEL (much faster than comparing all results)
            const resultsToCompare = preFilteredResults;
            
            console.log(`    🚀 Comparing ${resultsToCompare.length} results in parallel...`);
            
            // Run all comparisons simultaneously
            const comparisonPromises = resultsToCompare.map(async (fgResult, index) => {
              if (!fgResult.front_image_url) {
                return { result: fgResult, isMatch: false };
              }

              try {
                if (index === 0) {
                  console.log(`    🔍 Sample comparison: Cropped product (${width}x${height}px) vs FoodGraph "${fgResult.product_name}"`);
                  console.log(`       FoodGraph image URL: ${fgResult.front_image_url}`);
                }
                
                const isMatch = await compareProductImages(
                  croppedBase64,  // Use cropped product image, not full shelf!
                  fgResult.front_image_url as string
                );
                
                if (isMatch && index < 3) {
                  console.log(`    ✨ MATCH found at index ${index}: ${fgResult.product_name}`);
                }
                
                return { result: fgResult, isMatch };
              } catch (error) {
                console.error(`    ⚠️ Comparison error for ${fgResult.product_name}:`, error);
                return { result: fgResult, isMatch: false };
              }
            });

            const comparisonResults = await Promise.all(comparisonPromises);
            
            // Find the first match
            const matchingResult = comparisonResults.find(r => r.isMatch);
            const bestMatch = matchingResult ? matchingResult.result : null;
            
            if (bestMatch) {
              console.log(`    ✅ MATCH FOUND: ${bestMatch.product_name}`);
            } else {
              console.log(`    ⚠️ No matches found in ${resultsToCompare.length} results`);
            }

            // Step 3: Save match to DB
            if (bestMatch) {
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'saving',
                message: `Saving match...`,
                processed: globalIndex + 1,
                total: detections.length
              });

              console.log(`  [#${detection.detection_index}] Saving: ${bestMatch.product_name}`);
              
              const { error: updateError } = await supabase
                .from('branghunt_detections')
                .update({
                  selected_foodgraph_gtin: bestMatch.product_gtin,
                  selected_foodgraph_product_name: bestMatch.product_name,
                  selected_foodgraph_brand_name: bestMatch.brand_name,
                  selected_foodgraph_category: bestMatch.category,
                  selected_foodgraph_image_url: bestMatch.front_image_url,
                  fully_analyzed: true,
                  analysis_completed_at: new Date().toISOString()
                })
                .eq('id', detection.id);

              if (updateError) {
                throw new Error(`Database update failed: ${updateError.message}`);
              }

              result.status = 'success';
              result.savedMatch = {
                productName: (bestMatch.product_name || 'Unknown') as string,
                brandName: (bestMatch.brand_name || 'Unknown') as string,
                gtin: (bestMatch.product_gtin || 'Unknown') as string,
                imageUrl: (bestMatch.front_image_url || '') as string
              };

              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'done',
                message: `✓ Saved: ${bestMatch.product_name}`,
                processed: globalIndex + 1,
                total: detections.length
              });

              console.log(`  ✅ [#${detection.detection_index}] Complete`);
            } else {
              result.status = 'no_match';
              result.error = 'No matching product found after AI filtering';
              
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'No match found',
                processed: globalIndex + 1,
                total: detections.length
              });

              console.log(`  ⚠️ [#${detection.detection_index}] No match found`);
            }

          } catch (error) {
            console.error(`  ❌ [#${detection.detection_index}] Error:`, error);
            result.error = error instanceof Error ? error.message : 'Unknown error';
            result.status = 'error';
            
            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'error',
              message: `Error: ${result.error}`,
              processed: globalIndex + 1,
              total: detections.length
            });
          }

          return result;
        };

        // Process detections in batches with concurrency control
        for (let i = 0; i < detections.length; i += CONCURRENCY_LIMIT) {
          const batch = detections.slice(i, i + CONCURRENCY_LIMIT);
          console.log(`\n🔄 Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}: products ${i + 1}-${Math.min(i + CONCURRENCY_LIMIT, detections.length)}`);
          
          // Process batch in parallel
          const batchResults = await Promise.all(
            batch.map((detection, batchIndex) => 
              processDetection(detection, i + batchIndex)
            )
          );

          results.push(...batchResults);
          
          // Small delay between batches to avoid rate limiting
          if (i + CONCURRENCY_LIMIT < detections.length) {
            console.log(`  ⏳ Waiting 5s before next batch...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
          }
        }

        // Send final complete message
        const successCount = results.filter(r => r.status === 'success').length;
        const noMatchCount = results.filter(r => r.status === 'no_match').length;
        const errorCount = results.filter(r => r.status === 'error').length;

        console.log(`✅ Complete: ${successCount} saved, ${noMatchCount} no match, ${errorCount} errors`);

        sendProgress({
          type: 'complete',
          processed: detections.length,
          total: detections.length,
          success: successCount,
          noMatch: noMatchCount,
          errors: errorCount,
          results: results
        });

        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Batch search & save error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to search and save',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 300 second timeout for parallel processing with delays
export const maxDuration = 300;
export const runtime = 'nodejs';
