import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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

    // Fetch all detections that have brand info but no FoodGraph results yet
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select(`
        *,
        branghunt_foodgraph_results(count)
      `)
      .eq('image_id', imageId)
      .not('brand_name', 'is', null)
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

    console.log(`🔎 Searching FoodGraph for ${detectionsToProcess.length} products in parallel...`);

    // Process all detections in parallel
    const results: SearchResult[] = await Promise.all(
      detectionsToProcess.map(async (detection) => {
        const result: SearchResult = {
          detectionId: detection.id,
          detectionIndex: detection.detection_index,
          status: 'error'
        };

        try {
          console.log(`  [${detection.detection_index}] Searching for: ${detection.brand_name}...`);
          
          const foodgraphResults = await searchProducts(detection.brand_name);
          
          if (foodgraphResults.length > 0) {
            // Save top 50 results to database
            const resultsToSave = foodgraphResults.slice(0, 50).map((r: any, index: number) => ({
              detection_id: detection.id,
              result_rank: index + 1,
              product_name: r.product_name,
              brand_name: r.brand_name,
              category: r.category,
              front_image_url: r.front_image_url,
              product_gtin: r.product_gtin,
              full_data: r
            }));

            const { error: insertError } = await supabase
              .from('branghunt_foodgraph_results')
              .insert(resultsToSave);

            if (insertError) {
              throw new Error(`Database insert failed: ${insertError.message}`);
            }

            result.status = 'success';
            result.resultsCount = resultsToSave.length;

            console.log(`  ✅ [${detection.detection_index}] Found and saved ${resultsToSave.length} results`);
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

        return result;
      })
    );

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`✅ Batch FoodGraph search complete: ${successCount} success, ${errorCount} errors`);

    return NextResponse.json({
      message: 'Batch FoodGraph search complete',
      total: detectionsToProcess.length,
      success: successCount,
      errors: errorCount,
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

// 90 second timeout for parallel searches
export const maxDuration = 90;
export const runtime = 'nodejs';

