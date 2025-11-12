import { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { searchProducts, getFrontImageUrl, preFilterFoodGraphResults } from '@/lib/foodgraph';
import { cropImageToBoundingBox, selectBestMatchFromMultiple } from '@/lib/gemini';

/**
 * Performance-Instrumented Pipeline 2 API
 * Tracks detailed timing for: Search → Pre-filter → Visual Match → Save
 */

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

interface TimingEvent {
  stage: 'search' | 'prefilter' | 'visual_match' | 'crop' | 'gemini' | 'save';
  type: 'start' | 'end';
  timestamp: number;
  data?: Record<string, any>;
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
  timing?: TimingEvent;
}

export async function POST(request: NextRequest) {
  try {
    const { imageId, concurrency, detectionIndexFilter } = await request.json();

    if (!imageId) {
      return new Response(JSON.stringify({ 
        error: 'Missing imageId parameter' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔬 Starting TIMED Pipeline 2 analysis for image ${imageId}...`);
    if (detectionIndexFilter) {
      console.log(`🎯 Filtering to detection index: ${detectionIndexFilter}`);
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

    // Fetch detections
    let query = supabase
      .from('branghunt_detections')
      .select('*')
      .eq('image_id', imageId)
      .not('brand_name', 'is', null)
      .order('detection_index');

    // Apply detection index filter if provided
    if (detectionIndexFilter !== null && detectionIndexFilter !== undefined) {
      query = query.eq('detection_index', detectionIndexFilter);
    } else {
      // If no filter, only get first detection for performance testing
      query = query.limit(1);
    }

    const { data: detections, error: detectionsError } = await query;

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

    console.log(`🎯 Testing ${detections.length} product(s)`);
    
    // Get image data
    const { getImageBase64ForProcessing } = await import('@/lib/image-processor');
    const imageBase64 = await getImageBase64ForProcessing(image);

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

        // Helper to send timing events
        const sendTiming = (timing: TimingEvent) => {
          sendProgress({ type: 'progress', timing });
        };

        // Process function for a single detection
        const processDetection = async (detection: any, globalIndex: number): Promise<SearchAndSaveResult> => {
          const result: SearchAndSaveResult = {
            detectionId: detection.id,
            detectionIndex: detection.detection_index,
            status: 'error'
          };

          try {
            // ==================== STEP 1: SEARCH ====================
            console.log(`\n[#${detection.detection_index}] 🔍 Starting SEARCH...`);
            const searchStartTime = Date.now();
            sendTiming({ stage: 'search', type: 'start', timestamp: searchStartTime });
            
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

            const searchEndTime = Date.now();
            const searchDuration = searchEndTime - searchStartTime;
            sendTiming({ 
              stage: 'search', 
              type: 'end', 
              timestamp: searchEndTime,
              data: { resultCount: foodgraphResults.length, duration: searchDuration }
            });
            
            console.log(`  ✅ SEARCH complete: ${searchDuration}ms (Found ${foodgraphResults.length} results)`);

            result.resultsSearched = foodgraphResults.length;
            result.productName = detection.product_name || detection.brand_name;
            result.brandName = detection.brand_name;

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

            // ==================== STEP 2: PRE-FILTER ====================
            console.log(`\n[#${detection.detection_index}] ⚡ Starting PRE-FILTER...`);
            const prefilterStartTime = Date.now();
            sendTiming({ stage: 'prefilter', type: 'start', timestamp: prefilterStartTime });

            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'prefiltering',
              message: `Pre-filtering ${foodgraphResults.length} results...`,
              resultsFound: foodgraphResults.length,
              processed: globalIndex + 1,
              total: detections.length,
              success: cumulativeSuccess,
              noMatch: cumulativeNoMatch,
              errors: cumulativeErrors
            });

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

            const prefilterEndTime = Date.now();
            const prefilterDuration = prefilterEndTime - prefilterStartTime;
            sendTiming({ 
              stage: 'prefilter', 
              type: 'end', 
              timestamp: prefilterEndTime,
              data: { resultCount: preFilteredResults.length, duration: prefilterDuration }
            });

            console.log(`  ✅ PRE-FILTER complete: ${prefilterDuration}ms (Filtered to ${preFilteredResults.length} results)`);

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

            // ==================== STEP 3: VISUAL MATCH ====================
            console.log(`\n[#${detection.detection_index}] 🎯 Starting VISUAL MATCH...`);
            const visualMatchStartTime = Date.now();
            sendTiming({ stage: 'visual_match', type: 'start', timestamp: visualMatchStartTime });

            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'visual-matching',
              message: `🎯 Visual matching ${preFilteredResults.length} candidates...`,
              preFilteredCount: preFilteredResults.length,
              processed: globalIndex + 1,
              total: detections.length,
              success: cumulativeSuccess,
              noMatch: cumulativeNoMatch,
              errors: cumulativeErrors
            });

            // 3A: CROP IMAGE
            console.log(`  [#${detection.detection_index}] ✂️ Cropping image...`);
            const cropStartTime = Date.now();
            sendTiming({ stage: 'crop', type: 'start', timestamp: cropStartTime });

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
            
            const cropEndTime = Date.now();
            const cropDuration = cropEndTime - cropStartTime;
            sendTiming({ 
              stage: 'crop', 
              type: 'end', 
              timestamp: cropEndTime,
              data: { width, height, duration: cropDuration }
            });
            
            console.log(`    ✅ CROP complete: ${cropDuration}ms (${width}x${height}px)`);

            // 3B: GEMINI API CALL
            console.log(`  [#${detection.detection_index}] 🤖 Calling Gemini API...`);
            const geminiStartTime = Date.now();
            sendTiming({ stage: 'gemini', type: 'start', timestamp: geminiStartTime });

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
            
            const geminiEndTime = Date.now();
            const geminiDuration = geminiEndTime - geminiStartTime;
            const confidencePercent = Math.round(visualSelection.confidence * 100);
            sendTiming({ 
              stage: 'gemini', 
              type: 'end', 
              timestamp: geminiEndTime,
              data: { 
                confidence: confidencePercent,
                duration: geminiDuration,
                selectedGtin: visualSelection.selectedGtin
              }
            });
            
            console.log(`    ✅ GEMINI complete: ${geminiDuration}ms (Confidence: ${confidencePercent}%)`);

            const visualMatchEndTime = Date.now();
            const visualMatchTotalDuration = visualMatchEndTime - visualMatchStartTime;
            sendTiming({ 
              stage: 'visual_match', 
              type: 'end', 
              timestamp: visualMatchEndTime,
              data: { duration: visualMatchTotalDuration }
            });
            
            console.log(`  ✅ VISUAL MATCH complete: ${visualMatchTotalDuration}ms total`);

            // Check if we got a good match
            let bestMatch = null;
            if (visualSelection.selectedGtin && visualSelection.confidence >= 0.6) {
              bestMatch = preFilteredResults.find(
                r => (r.product_gtin || r.key) === visualSelection.selectedGtin
              );
            }

            // ==================== STEP 4: SAVE ====================
            if (bestMatch) {
              console.log(`\n[#${detection.detection_index}] 💾 Starting SAVE...`);
              const saveStartTime = Date.now();
              sendTiming({ stage: 'save', type: 'start', timestamp: saveStartTime });

              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'saving',
                message: `Saving visual match...`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });
              
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

              const saveEndTime = Date.now();
              const saveDuration = saveEndTime - saveStartTime;
              sendTiming({ 
                stage: 'save', 
                type: 'end', 
                timestamp: saveEndTime,
                data: { duration: saveDuration }
              });
              
              console.log(`  ✅ SAVE complete: ${saveDuration}ms`);

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
              result.status = 'no_match';
              result.error = `Manual review needed: Visual matching low confidence (${confidencePercent}%)`;
              
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

        // Process single detection for performance testing
        const detection = detections[0];
        const result = await processDetection(detection, 0);
        results.push(result);

        // Send final complete message
        const successCount = results.filter(r => r.status === 'success').length;
        const noMatchCount = results.filter(r => r.status === 'no_match').length;
        const errorCount = results.filter(r => r.status === 'error').length;

        console.log(`\n✅ Complete: ${successCount} saved, ${noMatchCount} no match, ${errorCount} errors`);

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

export const maxDuration = 300;
export const runtime = 'nodejs';

