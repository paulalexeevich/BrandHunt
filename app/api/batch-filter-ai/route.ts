import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { compareProductImages } from '@/lib/gemini';

interface FilterResult {
  detectionId: string;
  detectionIndex: number;
  status: 'success' | 'error';
  matchedCount?: number;
  bestMatch?: {
    productName: string;
    brandName: string;
    gtin: string;
    imageUrl: string;
  };
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

    console.log(`🤖 Starting batch AI filtering for image ${imageId}...`);

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

    // Fetch all detections that have FoodGraph results but no filtering done yet
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select(`
        *,
        branghunt_foodgraph_results(*)
      `)
      .eq('image_id', imageId)
      .not('brand_name', 'is', null)
      .is('fully_analyzed', null)
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

    // Filter to only those with FoodGraph results
    const detectionsToProcess = detections.filter((d: any) => 
      d.branghunt_foodgraph_results && d.branghunt_foodgraph_results.length > 0
    );

    if (detectionsToProcess.length === 0) {
      return NextResponse.json({
        message: 'No products with FoodGraph results to filter',
        processed: 0,
        results: []
      });
    }

    console.log(`🔍 AI filtering ${detectionsToProcess.length} products in parallel...`);

    // Get the image as base64 once
    const { data: imageBlob } = await supabase.storage
      .from('product-images')
      .download(image.file_path);

    let base64Image = '';
    if (imageBlob) {
      const arrayBuffer = await imageBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      base64Image = buffer.toString('base64');
    }

    // Process all detections in parallel
    const results: FilterResult[] = await Promise.all(
      detectionsToProcess.map(async (detection) => {
        const result: FilterResult = {
          detectionId: detection.id,
          detectionIndex: detection.detection_index,
          status: 'error'
        };

        try {
          console.log(`  [${detection.detection_index}] Filtering ${detection.branghunt_foodgraph_results.length} results...`);
          
          const foodgraphResults = detection.branghunt_foodgraph_results;

          // Compare each result in parallel (limited batches)
          const comparisonPromises = foodgraphResults.map(async (fgResult: any) => {
            if (!fgResult.front_image_url) {
              return { fgResult, isMatch: false };
            }

            try {
              const isMatch = await compareProductImages(
                base64Image,
                fgResult.front_image_url
              );
              return { fgResult, isMatch };
            } catch {
              return { fgResult, isMatch: false };
            }
          });

          const comparisons = await Promise.all(comparisonPromises);
          
          // Update database with match status
          for (const { fgResult, isMatch } of comparisons) {
            await supabase
              .from('branghunt_foodgraph_results')
              .update({
                is_match: isMatch,
                match_confidence: isMatch ? 0.95 : 0.0
              })
              .eq('id', fgResult.id);
          }

          const matchedCount = comparisons.filter(c => c.isMatch).length;
          result.matchedCount = matchedCount;

          // Auto-save the best match if found
          const bestMatch = comparisons.find(c => c.isMatch);
          
          if (bestMatch) {
            const fgResult = bestMatch.fgResult;
            
            await supabase
              .from('branghunt_detections')
              .update({
                selected_foodgraph_gtin: fgResult.product_gtin,
                selected_foodgraph_product_name: fgResult.product_name,
                selected_foodgraph_brand_name: fgResult.brand_name,
                selected_foodgraph_category: fgResult.category,
                selected_foodgraph_image_url: fgResult.front_image_url,
                selected_foodgraph_result_id: fgResult.id,
                fully_analyzed: true,
                analysis_completed_at: new Date().toISOString()
              })
              .eq('id', detection.id);

            result.bestMatch = {
              productName: fgResult.product_name || 'Unknown',
              brandName: fgResult.brand_name || 'Unknown',
              gtin: fgResult.product_gtin || 'Unknown',
              imageUrl: fgResult.front_image_url || ''
            };
          }

          result.status = 'success';
          console.log(`  ✅ [${detection.detection_index}] Filtered: ${matchedCount} matches found`);

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
    const savedCount = results.filter(r => r.bestMatch).length;

    console.log(`✅ Batch AI filtering complete: ${successCount} success, ${savedCount} auto-saved, ${errorCount} errors`);

    return NextResponse.json({
      message: 'Batch AI filtering complete',
      total: detectionsToProcess.length,
      success: successCount,
      saved: savedCount,
      errors: errorCount,
      results: results
    });

  } catch (error) {
    console.error('Batch AI filtering error:', error);
    return NextResponse.json({ 
      error: 'Failed to filter with AI',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 120 second timeout for parallel AI filtering
export const maxDuration = 120;
export const runtime = 'nodejs';

