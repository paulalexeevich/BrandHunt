import { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { searchProducts, getFrontImageUrl, preFilterFoodGraphResults } from '@/lib/foodgraph';
import { cropImageToBoundingBox, selectBestMatchFromMultiple } from '@/lib/gemini';

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
  stage?: 'searching' | 'prefiltering' | 'visual-matching' | 'saving' | 'done' | 'error';
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

    console.log(`🎯 Starting VISUAL-ONLY batch search & save for image ${imageId}...`);
    console.log(`📌 Pipeline: Search → Pre-filter → Visual Match (NO AI Filter)`);
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
    
    // Configurable concurrency
    const CONCURRENCY_LIMIT = concurrency || 3;
    const DELAY_BETWEEN_BATCHES = 5000; // 5 second delay between batches
    
    // Get image data
    const { getImageBase64ForProcessing } = await import('@/lib/image-processor');
    const imageBase64 = await getImageBase64ForProcessing(image);
    
    console.log(`📊 Processing with concurrency limit: ${CONCURRENCY_LIMIT === 999999 ? `ALL ${detections.length}` : CONCURRENCY_LIMIT}`);

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

            // SAVE STAGE 1: Raw search results
            console.log(`  [#${detection.detection_index}] 💾 Saving ${foodgraphResults.length} raw search results...`);
            const searchInserts = foodgraphResults.map((fgResult, index) => ({
              detection_id: detection.id,
              search_term: searchTerm || `${detection.brand_name} ${detection.product_name || ''}`.trim(),
              result_rank: index + 1,
              product_gtin: fgResult.product_gtin || fgResult.key || null,
              product_name: fgResult.product_name || fgResult.title || null,
              brand_name: fgResult.brand_name || fgResult.companyBrand || null,
              category: fgResult.category || null,
              measures: fgResult.measures || null,
              front_image_url: fgResult.front_image_url || null,
              full_data: fgResult,
              processing_stage: 'search',
              match_status: null,
              match_confidence: null,
              visual_similarity: null,
            }));

            const { error: searchInsertError } = await supabase
              .from('branghunt_foodgraph_results')
              .upsert(searchInserts, {
                onConflict: 'detection_id,product_gtin',
                ignoreDuplicates: false
              });

            if (searchInsertError) {
              throw new Error(`Failed to save search results: ${searchInsertError.message}`);
            }
            
            console.log(`    ✅ Saved ${searchInserts.length} raw search results`);

            // Step 2: Pre-filter by text similarity
            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'prefiltering',
              message: `Pre-filtering ${foodgraphResults.length} results...`,
              resultsFound: foodgraphResults.length,
              processed: globalIndex + 1,
              total: detections.length
            });

            console.log(`  [#${detection.detection_index}] Pre-filtering ${foodgraphResults.length} results...`);

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

            // SAVE STAGE 2: Pre-filtered results
            const preFilterInserts = preFilteredResults.map((fgResult, index) => ({
              detection_id: detection.id,
              search_term: searchTerm || `${detection.brand_name} ${detection.product_name || ''}`.trim(),
              result_rank: index + 1,
              product_gtin: fgResult.product_gtin || fgResult.key || null,
              product_name: fgResult.product_name || fgResult.title || null,
              brand_name: fgResult.brand_name || fgResult.companyBrand || null,
              category: fgResult.category || null,
              measures: fgResult.measures || null,
              front_image_url: fgResult.front_image_url || null,
              full_data: fgResult,
              processing_stage: 'pre_filter',
              match_status: null,
              match_confidence: null,
              visual_similarity: null,
            }));

            const { error: preFilterInsertError } = await supabase
              .from('branghunt_foodgraph_results')
              .upsert(preFilterInserts, {
                onConflict: 'detection_id,product_gtin',
                ignoreDuplicates: false
              });

            if (preFilterInsertError) {
              throw new Error(`Failed to save pre-filter results: ${preFilterInsertError.message}`);
            }

            console.log(`    ✅ Saved ${preFilterInserts.length} pre-filtered results`);

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

            // Step 3: VISUAL MATCHING (Skip AI Filter entirely!)
            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'visual-matching',
              message: `🎯 Visual matching ${preFilteredResults.length} candidates...`,
              preFilteredCount: preFilteredResults.length,
              processed: globalIndex + 1,
              total: detections.length
            });

            console.log(`  [#${detection.detection_index}] 🎯 VISUAL MATCHING: ${preFilteredResults.length} pre-filtered candidates...`);

            // Crop image to product bounding box
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
            
            console.log(`    ✂️ Cropping product with bounding box:`, boundingBox);
            const { croppedBase64, width, height } = await cropImageToBoundingBox(imageBase64, boundingBox);
            console.log(`    ✅ Cropped to ${width}x${height}px`);

            // Prepare candidates for visual matching
            const candidates = preFilteredResults
              .filter(r => r.front_image_url)
              .map(m => ({
                id: String(m.id || Math.random()),
                gtin: String(m.product_gtin || m.key || ''),
                productName: String(m.product_name || m.title || ''),
                brandName: String(m.brand_name || m.companyBrand || ''),
                size: String(m.measures || ''),
                category: String(m.category || ''),
                ingredients: String(m.ingredients || ''),
                imageUrl: String(m.front_image_url || ''),
                matchStatus: 'almost_same' as const
              }));

            if (candidates.length === 0) {
              result.status = 'no_match';
              result.error = 'No candidates with images for visual matching';
              cumulativeNoMatch++;
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'No candidates with images',
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });
              return result;
            }

            console.log(`    🎯 Running visual matching on ${candidates.length} candidates...`);

            // Prepare extracted info
            const extractedInfo = {
              brand: detection.brand_name || 'Unknown',
              productName: detection.product_name || 'Unknown',
              size: detection.size || 'Unknown',
              flavor: detection.flavor || 'Unknown',
              category: detection.category || 'Unknown'
            };
            
            // Run visual matching
            const visualSelection = await selectBestMatchFromMultiple(
              croppedBase64,
              extractedInfo,
              candidates,
              image?.project_id || null
            );
            
            console.log(`    🎯 Visual matching result: confidence=${Math.round(visualSelection.confidence * 100)}%`);
            console.log(`    🎯 Selected: ${visualSelection.selectedGtin || 'none'}`);
            console.log(`    🎯 Reasoning: ${visualSelection.reasoning}`);

            // SAVE STAGE 3: Visual matching results
            const visualMatchInserts = candidates.map((candidate, index) => ({
              detection_id: detection.id,
              search_term: searchTerm || `${detection.brand_name} ${detection.product_name || ''}`.trim(),
              result_rank: index + 1,
              product_gtin: candidate.gtin,
              product_name: candidate.productName,
              brand_name: candidate.brandName,
              category: candidate.category,
              measures: candidate.size,
              front_image_url: candidate.imageUrl,
              full_data: preFilteredResults.find(p => (p.product_gtin || p.key) === candidate.gtin),
              processing_stage: 'visual_match',
              match_status: candidate.gtin === visualSelection.selectedGtin ? 'identical' : 'not_match',
              match_confidence: candidate.gtin === visualSelection.selectedGtin ? visualSelection.confidence : 0,
              visual_similarity: candidate.gtin === visualSelection.selectedGtin ? visualSelection.confidence : 0,
              match_reason: candidate.gtin === visualSelection.selectedGtin ? visualSelection.reasoning : null,
            }));

            const { error: visualMatchInsertError } = await supabase
              .from('branghunt_foodgraph_results')
              .upsert(visualMatchInserts, {
                onConflict: 'detection_id,product_gtin',
                ignoreDuplicates: false
              });

            if (visualMatchInsertError) {
              throw new Error(`Failed to save visual match results: ${visualMatchInsertError.message}`);
            }

            console.log(`    ✅ Saved ${visualMatchInserts.length} visual match results`);

            // Check if we got a good match
            let bestMatch = null;
            if (visualSelection.selectedGtin && visualSelection.confidence >= 0.6) {
              bestMatch = preFilteredResults.find(
                r => (r.product_gtin || r.key) === visualSelection.selectedGtin
              );
            }

            // Step 4: Save match to DB
            if (bestMatch) {
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'saving',
                message: `Saving visual match...`,
                processed: globalIndex + 1,
                total: detections.length
              });

              console.log(`  [#${detection.detection_index}] Saving visual match: ${bestMatch.product_name}`);
              
              const { error: updateError } = await supabase
                .from('branghunt_detections')
                .update({
                  selected_foodgraph_gtin: bestMatch.product_gtin,
                  selected_foodgraph_product_name: bestMatch.product_name,
                  selected_foodgraph_brand_name: bestMatch.brand_name,
                  selected_foodgraph_category: bestMatch.category,
                  selected_foodgraph_image_url: bestMatch.front_image_url,
                  selection_method: 'visual_matching',
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
                message: `🎯 Visual match: ${bestMatch.product_name}`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });

              console.log(`  ✅ [#${detection.detection_index}] Complete`);
            } else {
              // Visual matching couldn't select confidently - mark for manual review
              const { error: updateError } = await supabase
                .from('branghunt_detections')
                .update({
                  fully_analyzed: true,
                  analysis_completed_at: new Date().toISOString()
                })
                .eq('id', detection.id);

              if (updateError) {
                console.error(`    ⚠️ Failed to mark detection as fully_analyzed: ${updateError.message}`);
              }

              result.status = 'no_match';
              result.error = `Manual review needed: Visual matching low confidence (${Math.round((visualSelection.confidence || 0) * 100)}%)`;
              
              cumulativeNoMatch++;
              
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'done',
                message: `⏸️ Manual review: Low confidence match`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });

              console.log(`  ⏸️ [#${detection.detection_index}] Manual review needed`);
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
          console.log(`\n🔄 Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}: products ${i + 1}-${Math.min(i + CONCURRENCY_LIMIT, detections.length)}`);
          
          // Process batch in parallel
          const batchResults = await Promise.all(
            batch.map((detection, batchIndex) => 
              processDetection(detection, i + batchIndex)
            )
          );

          results.push(...batchResults);
          
          // Small delay between batches
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
    console.error('Batch visual search error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to search with visual matching',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 300 second timeout for parallel processing
export const maxDuration = 300;
export const runtime = 'nodejs';

