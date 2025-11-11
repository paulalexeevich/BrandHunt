import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { searchProducts } from '@/lib/foodgraph';

interface SearchResult {
  detectionId: string;
  detectionIndex: number;
  status: 'success' | 'error';
  resultsCount?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { imageId } = await request.json();

    if (!imageId) {
      return NextResponse.json({ 
        error: 'Missing imageId parameter' 
      }, { status: 400 });
    }

    console.log(`🔍 Starting batch FoodGraph search for image ${imageId}...`);

    // Create authenticated Supabase client (same as used for detection updates)
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch all detections that have brand info but no FoodGraph results yet
    // SKIP products marked as is_product = false (not actual products)
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select(`
        *,
        branghunt_foodgraph_results(count)
      `)
      .eq('image_id', imageId)
      .not('brand_name', 'is', null)
      .not('is_product', 'eq', false)  // Skip non-products
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

    // Filter out detections that already have results
    const detectionsToProcess = detections.filter((d: any) => {
      const resultsCount = Array.isArray(d.branghunt_foodgraph_results) 
        ? d.branghunt_foodgraph_results.length 
        : 0;
      return resultsCount === 0;
    });

    if (detectionsToProcess.length === 0) {
      return NextResponse.json({
        message: 'All products already have FoodGraph results',
        processed: 0,
        results: []
      });
    }

    console.log(`🔎 Searching FoodGraph for ${detectionsToProcess.length} products SEQUENTIALLY (with delays)...`);

    // Process detections sequentially with delays to avoid rate limiting
    const results: SearchResult[] = [];
    
    for (let i = 0; i < detectionsToProcess.length; i++) {
      const detection = detectionsToProcess[i];
      const result: SearchResult = {
        detectionId: detection.id,
        detectionIndex: detection.detection_index,
        status: 'error'
      };

      try {
        // Parse product info from brand_extraction_response for comprehensive search
        let productInfo = null;
        if (detection.brand_extraction_response) {
          try {
            productInfo = JSON.parse(detection.brand_extraction_response);
          } catch (e) {
            console.error(`  ⚠️ Failed to parse brand_extraction_response for detection ${detection.id}:`, e);
          }
        }

        // Build search description for logging
        const searchDesc = productInfo 
          ? `${productInfo.brand || ''} ${productInfo.productName || ''} ${productInfo.flavor || ''} ${productInfo.size || ''}`.trim()
          : detection.brand_name;
        
        console.log(`  [${detection.detection_index}] (${i + 1}/${detectionsToProcess.length}) Searching for: ${searchDesc}...`);
        
        // Search with all available product details
        const searchResult = productInfo && (productInfo.productName || productInfo.flavor || productInfo.size)
          ? await searchProducts(detection.brand_name, {
              brand: productInfo.brand,
              productName: productInfo.productName,
              flavor: productInfo.flavor,
              size: productInfo.size
            })
          : await searchProducts(detection.brand_name);
        
        const foodgraphResults = searchResult.products;
        
        if (foodgraphResults.length > 0) {
          // Save top 50 results to intermediate table (cache for step 4)
          // Use UPSERT to prevent duplicates - updates existing rows instead of inserting
          const resultsToSave = foodgraphResults.slice(0, 50).map((r: any, index: number) => ({
            detection_id: detection.id,
            result_rank: index + 1,
            product_name: r.product_name,
            brand_name: r.brand_name,
            category: r.category,
            front_image_url: r.front_image_url,
            product_gtin: r.product_gtin,
            full_data: r,
            processing_stage: 'search' // Set processing stage to enable unique constraint
          }));

          const { error: insertError } = await supabase
            .from('branghunt_foodgraph_results')
            .upsert(resultsToSave, {
              onConflict: 'detection_id,product_gtin',
              ignoreDuplicates: false  // UPDATE existing rows
            });

          if (insertError) {
            console.error(`  ❌ FAILED TO SAVE SEARCH RESULTS for detection #${detection.detection_index}:`, {
              error: insertError,
              message: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
              code: insertError.code,
              detection_id: detection.id,
              num_results: resultsToSave.length
            });
            throw new Error(`Database insert failed: ${insertError.message}`);
          }

          result.status = 'success';
          result.resultsCount = resultsToSave.length;

          console.log(`  ✅ [${detection.detection_index}] Found and saved ${resultsToSave.length} results to cache`);
        } else {
          result.status = 'error';
          result.error = 'No results found';
          console.log(`  ⚠️ [${detection.detection_index}] No results found`);
        }

      } catch (error) {
        console.error(`  ❌ [${detection.detection_index}] Error:`, error);
        result.error = error instanceof Error ? error.message : 'Unknown error';
        result.status = 'error';
      }

      results.push(result);

      // Add delay between requests (10 seconds) to avoid rate limiting and allow API to respond
      if (i < detectionsToProcess.length - 1) {
        console.log(`  ⏳ Waiting 10s before next request...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const totalResultsCached = results.reduce((sum, r) => sum + (r.resultsCount || 0), 0);

    console.log(`✅ Batch FoodGraph search complete: ${successCount} success, ${errorCount} errors, ${totalResultsCached} total results cached`);

    return NextResponse.json({
      message: 'Batch FoodGraph search complete',
      total: detectionsToProcess.length,
      success: successCount,
      errors: errorCount,
      totalCached: totalResultsCached,
      results: results
    });

  } catch (error) {
    console.error('Batch FoodGraph search error:', error);
    return NextResponse.json({ 
      error: 'Failed to search FoodGraph',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 300 second timeout for sequential searches (40 products × 10s delay + processing time = ~400s, capped at Vercel max)
export const maxDuration = 300;
export const runtime = 'nodejs';

