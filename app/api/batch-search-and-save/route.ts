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

    // Create authenticated Supabase client (same as used for detection updates)
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
    
    // Get image data (handles both S3 URLs and base64 storage)
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
            
            // Capture search term for database storage
            const searchTerm = searchResult.searchTerm;
            
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

            // Step 2: Pre-filter by text similarity (brand, size, flavor)
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

            // Use UPSERT to insert or update existing results
            // This prevents duplicates and updates rows as they progress through stages
            const { error: searchInsertError } = await supabase
              .from('branghunt_foodgraph_results')
              .upsert(searchInserts, {
                onConflict: 'detection_id,product_gtin',
                ignoreDuplicates: false  // UPDATE existing rows
              });

            if (searchInsertError) {
              console.error(`    ❌ FAILED TO SAVE SEARCH RESULTS for detection #${detection.detection_index}:`, {
                error: searchInsertError,
                message: searchInsertError.message,
                details: searchInsertError.details,
                hint: searchInsertError.hint,
                code: searchInsertError.code,
                detection_id: detection.id,
                image_id: detection.image_id,
                project_id: image?.project_id,
                num_results: searchInserts.length,
                first_gtin: searchInserts[0]?.product_gtin
              });
              throw new Error(`Failed to save search results: ${searchInsertError.message}`);
            } else {
              console.log(`    ✅ Saved ${searchInserts.length} raw search results`);
              
              // Send progress update with save count
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'saving',
                message: `💾 Search: ${searchInserts.length} results saved`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });
            }

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

            // SAVE STAGE 2: Pre-filtered results
            console.log(`  [#${detection.detection_index}] 💾 Saving ${preFilteredResults.length} pre-filtered results...`);
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
                ignoreDuplicates: false  // UPDATE existing rows
              });

            if (preFilterInsertError) {
              console.error(`    ❌ FAILED TO SAVE PRE-FILTER RESULTS for detection #${detection.detection_index}:`, {
                error: preFilterInsertError,
                message: preFilterInsertError.message,
                details: preFilterInsertError.details,
                hint: preFilterInsertError.hint,
                code: preFilterInsertError.code,
                detection_id: detection.id,
                image_id: detection.image_id,
                project_id: image?.project_id,
                num_results: preFilterInserts.length,
                first_gtin: preFilterInserts[0]?.product_gtin
              });
              throw new Error(`Failed to save pre-filter results: ${preFilterInsertError.message}`);
            } else {
              console.log(`    ✅ Saved ${preFilterInserts.length} pre-filtered results`);
              
              // Send progress update with save count
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'saving',
                message: `💾 Pre-filter: ${preFilterInserts.length} results saved`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });
            }

            sendProgress({
              type: 'progress',
              detectionIndex: detection.detection_index,
              stage: 'prefiltering',
              message: `Pre-filtered to ${preFilteredResults.length} results`,
              preFilteredCount: preFilteredResults.length,
              processed: globalIndex + 1,
              total: detections.length,
              success: cumulativeSuccess,
              noMatch: cumulativeNoMatch,
              errors: cumulativeErrors
            });

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

            // Step 3: Filter with AI
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
            
            // Validate the extracted coordinates
            if (isNaN(boundingBox.y0) || isNaN(boundingBox.x0) || isNaN(boundingBox.y1) || isNaN(boundingBox.x1)) {
              console.error(`    ❌ NaN in bounding box:`, boundingBox);
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
                
                const comparisonDetails = await compareProductImages(
                  croppedBase64,  // Use cropped product image, not full shelf!
                  fgResult.front_image_url as string,
                  true // Get detailed results with matchStatus
                );
                
                if (comparisonDetails.matchStatus !== 'not_match' && index < 3) {
                  console.log(`    ✨ ${comparisonDetails.matchStatus.toUpperCase()} found at index ${index}: ${fgResult.product_name}`);
                }
                
                return { result: fgResult, matchStatus: comparisonDetails.matchStatus, details: comparisonDetails };
              } catch (error) {
                console.error(`    ⚠️ Comparison error for ${fgResult.product_name}:`, error);
                return { result: fgResult, matchStatus: 'not_match' as MatchStatus, details: { matchStatus: 'not_match' as MatchStatus, confidence: 0, visualSimilarity: 0, reason: 'Error' } };
              }
            });

            const comparisonResults = await Promise.all(comparisonPromises);
            
            // SAVE STAGE 3: AI-filtered results with match scores
            console.log(`  [#${detection.detection_index}] 💾 Saving ${comparisonResults.length} AI-filtered results to database...`);
            
            const aiFilterInserts = comparisonResults.map((comparison, index) => {
              const fgResult = comparison.result;
              return {
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
                processing_stage: 'ai_filter',
                match_status: comparison.matchStatus || 'not_match',
                match_confidence: comparison.details?.confidence || 0,
                visual_similarity: comparison.details?.visualSimilarity || 0,
                match_reason: comparison.details?.reason || null,
              };
            });

            // UPSERT AI-filtered results (updates existing rows from pre-filter stage)
            console.log(`    💾 Saving ${aiFilterInserts.length} AI-filtered results for detection ${detection.id}`);
            console.log(`    📋 First result: GTIN=${aiFilterInserts[0]?.product_gtin}, stage=${aiFilterInserts[0]?.processing_stage}, match_status=${aiFilterInserts[0]?.match_status}`);
            
            const { error: aiFilterInsertError, data: aiFilterInsertData } = await supabase
              .from('branghunt_foodgraph_results')
              .upsert(aiFilterInserts, {
                onConflict: 'detection_id,product_gtin',
                ignoreDuplicates: false  // UPDATE existing rows
              })
              .select();

            if (aiFilterInsertError) {
              console.error(`    ❌ FAILED TO SAVE AI-FILTERED RESULTS for detection #${detection.detection_index}:`, {
                error: aiFilterInsertError,
                message: aiFilterInsertError.message,
                details: aiFilterInsertError.details,
                hint: aiFilterInsertError.hint,
                code: aiFilterInsertError.code,
                detection_id: detection.id,
                image_id: detection.image_id,
                project_id: image?.project_id,
                num_results: aiFilterInserts.length,
                first_gtin: aiFilterInserts[0]?.product_gtin
              });
              throw new Error(`Failed to save AI-filtered results: ${aiFilterInsertError.message}`);
            } else {
              console.log(`    ✅ Saved ${aiFilterInserts.length} AI-filtered results to database`);
              console.log(`    📊 Upsert confirmed: ${aiFilterInsertData?.length || 0} rows affected`);
              
              // VERIFY: Query back the results immediately to confirm they're in DB
              const { data: verifyData, error: verifyError } = await supabase
                .from('branghunt_foodgraph_results')
                .select('product_gtin, processing_stage, match_status')
                .eq('detection_id', detection.id);
              
              console.log(`    ✅ VERIFICATION: Found ${verifyData?.length || 0} total rows in database for this detection`);
              if (verifyError) {
                console.error(`    ❌ Verification query error:`, verifyError);
              } else if (verifyData) {
                const stageBreakdown = verifyData.reduce((acc: any, r: any) => {
                  acc[r.processing_stage] = (acc[r.processing_stage] || 0) + 1;
                  return acc;
                }, {});
                console.log(`    📊 Stage breakdown:`, stageBreakdown);
              }
              
              console.log(`    📊 Total saved: search=${searchInserts.length}, pre-filter=${preFilterInserts.length}, AI-filter=${aiFilterInserts.length}`);
              
              // Send progress update with all save counts
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'saving',
                message: `💾 AI-filter: ${aiFilterInserts.length} results saved (Total: ${searchInserts.length + preFilterInserts.length + aiFilterInserts.length})`,
                processed: globalIndex + 1,
                total: detections.length
              });
            }
            
            // CONSOLIDATION LOGIC: Check for identical and almost_same matches
            const identicalMatches = comparisonResults.filter(r => r.matchStatus === 'identical');
            const almostSameMatches = comparisonResults.filter(r => r.matchStatus === 'almost_same');
            const totalCandidates = identicalMatches.length + almostSameMatches.length;
            
            console.log(`    📊 Match status breakdown: Identical=${identicalMatches.length}, Almost Same=${almostSameMatches.length}, Total=${totalCandidates}`);
            
            let bestMatch = null;
            let consolidationApplied = false;
            let needsManualReview = false;
            let visualMatchingApplied = false;
            
            // STEP 1: Check if we have exactly 1 candidate (auto-select)
            if (totalCandidates === 1) {
              bestMatch = identicalMatches.length > 0 ? identicalMatches[0].result : almostSameMatches[0].result;
              const matchType = identicalMatches.length > 0 ? 'IDENTICAL' : 'ALMOST_SAME';
              console.log(`    ✅ Single ${matchType} match: ${bestMatch.product_name}`);
            }
            // STEP 2: Check if we have 2+ candidates (run visual matching)
            else if (totalCandidates >= 2) {
              console.log(`    🎯 VISUAL MATCHING: ${totalCandidates} candidates - running Gemini selection...`);
              
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'visual-matching',
                message: `🎯 Visual matching ${totalCandidates} candidates...`,
                processed: globalIndex + 1,
                total: detections.length
              });
              
              try {
                // Import visual matching function
                const { selectBestMatchFromMultiple } = await import('@/lib/gemini');
                
                // Prepare candidates for visual matching
                const candidates = [...identicalMatches, ...almostSameMatches].map(m => ({
                  id: String(m.result.id || Math.random()),
                  gtin: String(m.result.product_gtin || m.result.key || ''),
                  productName: String(m.result.product_name || m.result.title || ''),
                  brandName: String(m.result.brand_name || m.result.companyBrand || ''),
                  size: String(m.result.measures || ''),
                  category: String(m.result.category || ''),
                  ingredients: String(m.result.ingredients || ''),
                  imageUrl: String(m.result.front_image_url || ''),
                  matchStatus: m.matchStatus || 'almost_same' as MatchStatus
                }));
                
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
                console.log(`    🎯 Reasoning: ${visualSelection.reasoning}`);
                
                // If visual matching selected a match with good confidence
                if (visualSelection.selectedGtin && visualSelection.confidence >= 0.6) {
                  // Find the selected match in our results
                  const selectedResult = [...identicalMatches, ...almostSameMatches].find(
                    m => (m.result.product_gtin || m.result.key) === visualSelection.selectedGtin
                  );
                  
                  if (selectedResult) {
                    bestMatch = selectedResult.result;
                    visualMatchingApplied = true;
                    console.log(`    ✅ Visual match selected: ${bestMatch.product_name} (confidence: ${Math.round(visualSelection.confidence * 100)}%)`);
                  } else {
                    console.log(`    ⚠️ Visual selection GTIN not found in results - falling back to manual review`);
                    needsManualReview = true;
                  }
                } else {
                  // Visual matching couldn't confidently select one
                  console.log(`    ⚠️ Visual matching low confidence (${Math.round(visualSelection.confidence * 100)}%) - needs manual review`);
                  needsManualReview = true;
                }
              } catch (error) {
                console.error(`    ❌ Visual matching error:`, error);
                console.log(`    ⚠️ Visual matching failed - falling back to manual review`);
                needsManualReview = true;
              }
            }
            // STEP 3: No matches found
            else {
              console.log(`    ⚠️ No matches found in ${resultsToCompare.length} results`);
            }
            
            if (bestMatch) {
              const method = visualMatchingApplied ? 'VISUAL MATCH' : 'AUTO-SELECT';
              console.log(`    ✅ ${method}: ${bestMatch.product_name}`);
            } else if (needsManualReview) {
              console.log(`    ⏸️ Awaiting manual review: ${totalCandidates} possible matches saved`);
            }

            // Step 3: Save match to DB
            if (bestMatch) {
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'saving',
                message: `Saving match...`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });

              console.log(`  [#${detection.detection_index}] Saving: ${bestMatch.product_name}`);
              
              // Determine selection method
              const selectionMethod = visualMatchingApplied 
                ? 'visual_matching' 
                : consolidationApplied 
                  ? 'consolidation' 
                  : 'auto_select';
              
              const { error: updateError } = await supabase
                .from('branghunt_detections')
                .update({
                  selected_foodgraph_gtin: bestMatch.product_gtin,
                  selected_foodgraph_product_name: bestMatch.product_name,
                  selected_foodgraph_brand_name: bestMatch.brand_name,
                  selected_foodgraph_category: bestMatch.category,
                  selected_foodgraph_image_url: bestMatch.front_image_url,
                  selection_method: selectionMethod,
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
              
              // Add metadata about which method was used
              if (visualMatchingApplied) {
                (result as any).selectionMethod = 'visual_matching';
                (result as any).candidatesCount = totalCandidates;
              } else if (consolidationApplied) {
                (result as any).selectionMethod = 'consolidation';
              } else {
                (result as any).selectionMethod = 'auto_select';
              }

              cumulativeSuccess++;

              const methodLabel = visualMatchingApplied ? '🎯 Visual match' : consolidationApplied ? '🔄 Consolidated' : '✓ Auto-select';
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'done',
                message: `${methodLabel}: ${bestMatch.product_name}`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });

              console.log(`  ✅ [#${detection.detection_index}] Complete`);
            } else if (needsManualReview) {
              // Multiple almost_same matches - requires user review
              // Mark as fully_analyzed so frontend can load the results
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

              result.status = 'no_match'; // Keep as no_match so it shows in statistics
              result.error = `Manual review needed: ${almostSameMatches.length} similar matches found`;
              result.resultsSearched = comparisonResults.length;
              
              cumulativeNoMatch++;
              
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'done',
                message: `⏸️ Manual review: ${almostSameMatches.length} matches`,
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });

              console.log(`  ⏸️ [#${detection.detection_index}] Awaiting manual review - ${almostSameMatches.length} results saved for review`);
            } else {
              // No matches found at all
              // Mark as fully_analyzed so frontend can load the results (all will be "not_match")
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
              result.error = 'No matching product found after AI filtering';
              result.resultsSearched = comparisonResults.length;
              
              cumulativeNoMatch++;
              
              sendProgress({
                type: 'progress',
                detectionIndex: detection.detection_index,
                stage: 'error',
                message: 'No match found',
                processed: globalIndex + 1,
                total: detections.length,
                success: cumulativeSuccess,
                noMatch: cumulativeNoMatch,
                errors: cumulativeErrors
              });

              console.log(`  ⚠️ [#${detection.detection_index}] No match found - ${comparisonResults.length} results saved with "not_match" status`);
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
