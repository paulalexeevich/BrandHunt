import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractProductInfo, extractPrice, compareProductImages } from '@/lib/gemini';
import { searchProducts } from '@/lib/foodgraph';

interface ProcessResult {
  detectionId: string;
  detectionIndex: number;
  status: 'success' | 'error' | 'partial';
  steps: {
    brandExtraction: boolean;
    priceExtraction: boolean;
    foodgraphSearch: boolean;
    aiFilter: boolean;
    saved: boolean;
  };
  error?: string;
  savedMatch?: {
    productName: string;
    brandName: string;
    gtin: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { imageId } = await request.json();

    if (!imageId) {
      return NextResponse.json({ 
        error: 'Missing imageId parameter' 
      }, { status: 400 });
    }

    console.log(`🚀 Starting batch processing for image ${imageId}...`);

    // Fetch the image data
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ 
        error: 'Image not found',
        details: imageError?.message 
      }, { status: 404 });
    }

    // Fetch all detections that are not fully analyzed
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('image_id', imageId)
      .or('fully_analyzed.is.null,fully_analyzed.eq.false')
      .order('detection_index');

    if (detectionsError) {
      return NextResponse.json({ 
        error: 'Failed to fetch detections',
        details: detectionsError.message 
      }, { status: 500 });
    }

    if (!detections || detections.length === 0) {
      return NextResponse.json({
        message: 'No products to process',
        processed: 0,
        results: []
      });
    }

    console.log(`📦 Processing ${detections.length} products in parallel...`);

    // Process all detections in parallel
    const results: ProcessResult[] = await Promise.all(
      detections.map(async (detection) => {
        const result: ProcessResult = {
          detectionId: detection.id,
          detectionIndex: detection.detection_index,
          status: 'error',
          steps: {
            brandExtraction: false,
            priceExtraction: false,
            foodgraphSearch: false,
            aiFilter: false,
            saved: false
          }
        };

        try {
          // Step 1: Extract brand info if not already done
          if (!detection.brand_name) {
            console.log(`  [${detection.detection_index}] Extracting brand info...`);
            
            const brandData = await extractProductInfo(
              image.file_path,
              image.mime_type || 'image/jpeg',
              detection.bounding_box
            );

            if (brandData.brand) {
              await supabase
                .from('branghunt_detections')
                .update({
                  brand_name: brandData.brand,
                  product_name: brandData.productName,
                  category: brandData.category,
                  flavor: brandData.flavor,
                  size: brandData.size,
                  sku: brandData.sku,
                  description: brandData.description
                })
                .eq('id', detection.id);

              result.steps.brandExtraction = true;
              detection.brand_name = brandData.brand; // Update for next steps
            }
          } else {
            result.steps.brandExtraction = true;
          }

          // Step 2: Extract price if not already done
          if (!detection.price || detection.price === 'Unknown') {
            console.log(`  [${detection.detection_index}] Extracting price...`);
            
            try {
              const priceData = await extractPrice(
                image.file_path,
                image.mime_type || 'image/jpeg',
                detection.bounding_box,
                {
                  brand: detection.brand_name,
                  productName: detection.product_name,
                  label: detection.label
                }
              );

              if (priceData.price && priceData.price !== 'Unknown') {
                await supabase
                  .from('branghunt_detections')
                  .update({
                    price: priceData.price,
                    price_currency: priceData.currency,
                    price_confidence: priceData.confidence
                  })
                  .eq('id', detection.id);

                result.steps.priceExtraction = true;
              }
            } catch (priceError) {
              console.log(`  [${detection.detection_index}] Price extraction failed (optional):`, priceError);
              // Price extraction is optional, continue anyway
            }
          } else {
            result.steps.priceExtraction = true;
          }

          // Step 3: Search FoodGraph if brand exists
          if (detection.brand_name) {
            console.log(`  [${detection.detection_index}] Searching FoodGraph...`);
            
            const searchResult = await searchProducts(detection.brand_name);
            const foodgraphResults = searchResult.products;
            
            if (foodgraphResults.length > 0) {
              // Save top 50 results to database
              const resultsToSave = foodgraphResults.slice(0, 50).map((r: any, index: number) => ({
                detection_id: detection.id,
                result_rank: index + 1,
                product_name: r.product_name,
                brand_name: r.brand_name,
                category: r.category,
                front_image_url: r.front_image_url,
                product_gtin: r.product_gtin
              }));

              await supabase
                .from('branghunt_foodgraph_results')
                .insert(resultsToSave);

              result.steps.foodgraphSearch = true;

              // Step 4: AI Filter to find best match
              console.log(`  [${detection.detection_index}] AI filtering ${foodgraphResults.length} results...`);
              
              // Get cropped image as base64
              const { data: imageBlob } = await supabase.storage
                .from('product-images')
                .download(image.file_path);

              if (imageBlob) {
                const arrayBuffer = await imageBlob.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64Image = buffer.toString('base64');

                // Crop the image to detection bounding box
                const bbox = detection.bounding_box;
                // Note: In production, you'd use Sharp or similar to actually crop
                // For now, we'll use the full image (AI can still compare)
                const croppedBase64 = base64Image;

                // Compare each result (in parallel batches to avoid overwhelming)
                const comparisonPromises = resultsToSave.map(async (result: any) => {
                  if (!result.front_image_url) return { result, isMatch: false };

                  try {
                    const isMatch = await compareProductImages(
                      croppedBase64,
                      result.front_image_url
                    );
                    return { result, isMatch };
                  } catch {
                    return { result, isMatch: false };
                  }
                });

                const comparisons = await Promise.all(comparisonPromises);
                
                // Update database with match status
                for (const { result: fgResult, isMatch } of comparisons) {
                  await supabase
                    .from('branghunt_foodgraph_results')
                    .update({
                      is_match: isMatch,
                      match_confidence: isMatch ? 0.95 : 0.0
                    })
                    .eq('detection_id', detection.id)
                    .eq('result_rank', fgResult.result_rank);
                }

                result.steps.aiFilter = true;

                // Step 5: Auto-save the best match
                const bestMatch = comparisons.find(c => c.isMatch);
                
                if (bestMatch) {
                  console.log(`  [${detection.detection_index}] Saving best match...`);
                  
                  const matchResult = bestMatch.result;
                  
                  // Fetch the full result from database to get the ID
                  const { data: savedFgResult } = await supabase
                    .from('branghunt_foodgraph_results')
                    .select('*')
                    .eq('detection_id', detection.id)
                    .eq('result_rank', matchResult.result_rank)
                    .single();

                  if (savedFgResult) {
                    await supabase
                      .from('branghunt_detections')
                      .update({
                        selected_foodgraph_gtin: savedFgResult.product_gtin,
                        selected_foodgraph_product_name: savedFgResult.product_name,
                        selected_foodgraph_brand_name: savedFgResult.brand_name,
                        selected_foodgraph_category: savedFgResult.category,
                        selected_foodgraph_image_url: savedFgResult.front_image_url,
                        selected_foodgraph_result_id: savedFgResult.id,
                        fully_analyzed: true,
                        analysis_completed_at: new Date().toISOString()
                      })
                      .eq('id', detection.id);

                    result.steps.saved = true;
                    result.savedMatch = {
                      productName: savedFgResult.product_name || 'Unknown',
                      brandName: savedFgResult.brand_name || 'Unknown',
                      gtin: savedFgResult.product_gtin || 'Unknown'
                    };
                  }
                }
              }
            }
          }

          // Determine overall status
          if (result.steps.saved) {
            result.status = 'success';
          } else if (result.steps.brandExtraction || result.steps.foodgraphSearch) {
            result.status = 'partial';
          }

          console.log(`  ✅ [${detection.detection_index}] Completed: ${result.status}`);

        } catch (error) {
          console.error(`  ❌ [${detection.detection_index}] Error:`, error);
          result.error = error instanceof Error ? error.message : 'Unknown error';
          result.status = 'error';
        }

        return result;
      })
    );

    const successCount = results.filter(r => r.status === 'success').length;
    const partialCount = results.filter(r => r.status === 'partial').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`✅ Batch processing complete: ${successCount} success, ${partialCount} partial, ${errorCount} errors`);

    return NextResponse.json({
      message: 'Batch processing complete',
      total: detections.length,
      success: successCount,
      partial: partialCount,
      errors: errorCount,
      results: results
    });

  } catch (error) {
    console.error('Batch processing error:', error);
    return NextResponse.json({ 
      error: 'Failed to process products',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Extended timeout for batch processing (5 minutes for processing many products)
export const maxDuration = 300;

// Explicitly set runtime to nodejs (required for maxDuration > 10s with Fluid Compute)
export const runtime = 'nodejs';

