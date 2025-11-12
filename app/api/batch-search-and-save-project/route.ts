import { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { searchProducts, getFrontImageUrl, preFilterFoodGraphResults } from '@/lib/foodgraph';
import { compareProductImages, cropImageToBoundingBox, MatchStatus } from '@/lib/gemini';

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
  stage?: 'searching' | 'prefiltering' | 'filtering' | 'visual-matching' | 'saving' | 'done' | 'error';
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
    const { projectId, concurrency } = await request.json();

    if (!projectId) {
      return new Response(JSON.stringify({ 
        error: 'Missing projectId parameter' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔍 Starting AI Filter pipeline for project ${projectId}...`);
    console.log(`⚡ Concurrency level: ${concurrency === 999999 ? 'ALL (unlimited)' : concurrency} products at a time`);

    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch ALL images in the project
    const { data: images, error: imagesError } = await supabase
      .from('branghunt_images')
      .select('id, s3_url, file_path, storage_type, mime_type, store_name, project_id')
      .eq('project_id', projectId);

    if (imagesError || !images || images.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No images found in project',
        details: imagesError?.message 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const imageIds = images.map(img => img.id);
    console.log(`📸 Found ${images.length} images in project`);

    // Fetch ALL detections from ALL images in one query
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .in('image_id', imageIds)
      .not('brand_name', 'is', null)
      .not('fully_analyzed', 'eq', true)
      .order('image_id')
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

    console.log(`🚀 Found ${detections.length} products across ${images.length} images`);
    
    // Create a map of imageId -> image data for O(1) lookup
    const imageMap = new Map(images.map(img => [img.id, img]));
    
    const CONCURRENCY_LIMIT = concurrency || 3;
    
    // Preload all image base64 data
    const { getImageBase64ForProcessing } = await import('@/lib/image-processor');
    const imageDataCache = new Map<string, string>();
    
    console.log(`📊 Processing ${detections.length} products with concurrency: ${CONCURRENCY_LIMIT === 999999 ? `ALL` : CONCURRENCY_LIMIT}`);

    // Create streaming response with Server-Sent Events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const results: SearchAndSaveResult[] = [];
        
        // Track cumulative stats
        let cumulativeSuccess = 0;
        let cumulativeNoMatch = 0;
        let cumulativeErrors = 0;

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
            // Get image data for this detection
            const image = imageMap.get(detection.image_id);
            if (!image) {
              throw new Error('Image not found for detection');
            }

            // Load image data if not cached
            if (!imageDataCache.has(image.id)) {
              const imageBase64 = await getImageBase64ForProcessing(image);
              imageDataCache.set(image.id, imageBase64);
            }
            const imageBase64 = imageDataCache.get(image.id)!;

            // Step 1: Search FoodGraph
            console.log(`\n[#${detection.detection_index}] Starting search...`);
            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'searching',
              message: `Searching FoodGraph...`,
              currentProduct: detection.brand_name || `Product #${detection.detection_index}`,
              processed: globalIndex + 1,
              total: detections.length,
              success: cumulativeSuccess,
              noMatch: cumulativeNoMatch,
              errors: cumulativeErrors
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
            
            const searchTerm = searchResult.searchTerm;
            
            // Transform products
            const foodgraphResults = searchResult.products.map(product => ({
              ...product,
              product_name: product.title,
              brand_name: product.companyBrand || null,
              product_gtin: product.keys?.GTIN14 || product.key || null,
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
              cumulativeNoMatch++;
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'No results found',
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });
              return result;
            }

            // Step 2: Pre-filter
            const preFilteredResults = preFilterFoodGraphResults(
              foodgraphResults, 
              {
                brand: detection.brand_name || undefined,
                size: detection.size || undefined,
                productName: detection.product_name || undefined,
                sizeConfidence: detection.size_confidence || undefined
              },
              image.store_name || undefined
            );

            console.log(`  ✅ Pre-filtered to ${preFilteredResults.length} results`);

            if (preFilteredResults.length === 0) {
              result.status = 'no_match';
              result.error = 'No matches after pre-filtering';
              cumulativeNoMatch++;
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'No matches after pre-filter',
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });
              return result;
            }

            // Step 3: AI Filter
            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'filtering',
              message: `AI filtering ${preFilteredResults.length} results...`,
              resultsFound: preFilteredResults.length,
              processed: globalIndex + 1,
              total: detections.length,
              success: cumulativeSuccess,
              noMatch: cumulativeNoMatch,
              errors: cumulativeErrors
            });

            // Crop image
            let boundingBox: { y0: number; x0: number; y1: number; x1: number };
            
            if (detection.bounding_box && typeof detection.bounding_box === 'object') {
              boundingBox = detection.bounding_box as { y0: number; x0: number; y1: number; x1: number };
            } else if (detection.y0 != null && detection.x0 != null && detection.y1 != null && detection.x1 != null) {
              boundingBox = {
                y0: detection.y0,
                x0: detection.x0,
                y1: detection.y1,
                x1: detection.x1
              };
            } else {
              result.status = 'error';
              result.error = 'Invalid bounding box coordinates';
              cumulativeErrors++;
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'Invalid coordinates',
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });
              return result;
            }

            const { croppedBase64, width, height } = await cropImageToBoundingBox(imageBase64, boundingBox);

            // Run AI Filter comparison
            const comparisonResults = await compareProductImages(
              croppedBase64,
              {
                brand: detection.brand_name || 'Unknown',
                productName: detection.product_name || 'Unknown',
                size: detection.size || 'Unknown',
                flavor: detection.flavor || 'Unknown',
                category: detection.category || 'Unknown'
              },
              preFilteredResults.map(m => ({
                id: String(m.id || Math.random()),
                gtin: String(m.product_gtin || m.key || ''),
                productName: String(m.product_name || m.title || ''),
                brandName: String(m.brand_name || m.companyBrand || ''),
                size: String(m.measures || ''),
                category: String(m.category || ''),
                ingredients: String(m.ingredients || ''),
                imageUrl: String(m.front_image_url || ''),
              })),
              image?.project_id || null
            );

            // Determine best match
            const identicalMatches = comparisonResults.filter(r => r.matchStatus === 'identical');
            const almostSameMatches = comparisonResults.filter(r => r.matchStatus === 'almost_same');
            
            let bestMatch = null;
            let needsManualReview = false;

            if (identicalMatches.length === 1) {
              bestMatch = preFilteredResults.find(r => (r.product_gtin || r.key) === identicalMatches[0].gtin);
            } else if (identicalMatches.length > 1 || almostSameMatches.length > 1) {
              needsManualReview = true;
            }

            // Save match
            if (bestMatch) {
              const { error: updateError } = await supabase
                .from('branghunt_detections')
                .update({
                  selected_foodgraph_gtin: bestMatch.product_gtin,
                  selected_foodgraph_product_name: bestMatch.product_name,
                  selected_foodgraph_brand_name: bestMatch.brand_name,
                  selected_foodgraph_category: bestMatch.category,
                  selected_foodgraph_image_url: bestMatch.front_image_url,
                  selection_method: 'auto_select',
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

              cumulativeSuccess++;

              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'done',
                message: `✓ ${bestMatch.product_name}`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });

              console.log(`  ✅ [#${detection.detection_index}] Complete`);
            } else {
              result.status = 'no_match';
              result.error = needsManualReview ? 'Manual review needed' : 'No match found';
              
              cumulativeNoMatch++;
              
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'done',
                message: `⏸️ ${result.error}`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });

              console.log(`  ⏸️ [#${detection.detection_index}] ${result.error}`);
            }

          } catch (error) {
            console.error(`  ❌ [#${detection.detection_index}] Error:`, error);
            result.error = error instanceof Error ? error.message : 'Unknown error';
            result.status = 'error';
            
            cumulativeErrors++;
            
            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'error',
              message: `Error: ${result.error}`,
              processed: globalIndex + 1,
              total: detections.length,
              success: cumulativeSuccess,
              noMatch: cumulativeNoMatch,
              errors: cumulativeErrors
            });
          }

          return result;
        };

        // Process detections in batches with concurrency control
        for (let i = 0; i < detections.length; i += CONCURRENCY_LIMIT) {
          const batch = detections.slice(i, i + CONCURRENCY_LIMIT);
          console.log(`\n🔄 Processing batch: products ${i + 1}-${Math.min(i + CONCURRENCY_LIMIT, detections.length)}`);
          
          // Start all promises in parallel
          const promises = batch.map((detection, batchIndex) => 
            processDetection(detection, i + batchIndex)
          );

          // Await sequentially for progress updates
          for (const promise of promises) {
            const result = await promise;
            results.push(result);
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
    console.error('Batch AI Filter error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to run AI Filter pipeline',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const maxDuration = 300;
export const runtime = 'nodejs';

