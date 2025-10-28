import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractPrice } from '@/lib/gemini';

interface PriceResult {
  detectionId: string;
  detectionIndex: number;
  status: 'success' | 'error' | 'skipped';
  priceInfo?: {
    price: string;
    currency: string;
    confidence: number;
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

    console.log(`💰 Starting batch price extraction for image ${imageId}...`);

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

    // Fetch all detections that have brand info but no price yet
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('image_id', imageId)
      .not('brand_name', 'is', null)
      .or('price.is.null,price.eq.Unknown')
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

    console.log(`💵 Extracting prices for ${detections.length} products in parallel...`);

    // Process all detections in parallel
    const results: PriceResult[] = await Promise.all(
      detections.map(async (detection) => {
        const result: PriceResult = {
          detectionId: detection.id,
          detectionIndex: detection.detection_index,
          status: 'error'
        };

        try {
          console.log(`  [${detection.detection_index}] Extracting price...`);
          
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
            // Save to database immediately
            const { error: updateError } = await supabase
              .from('branghunt_detections')
              .update({
                price: priceData.price,
                price_currency: priceData.currency,
                price_confidence: priceData.confidence,
                updated_at: new Date().toISOString()
              })
              .eq('id', detection.id);

            if (updateError) {
              throw new Error(`Database update failed: ${updateError.message}`);
            }

            result.status = 'success';
            result.priceInfo = {
              price: priceData.price,
              currency: priceData.currency,
              confidence: priceData.confidence
            };

            console.log(`  ✅ [${detection.detection_index}] Price extracted: ${priceData.currency} ${priceData.price}`);
          } else {
            result.status = 'skipped';
            result.error = 'No price found';
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
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`✅ Batch price extraction complete: ${successCount} success, ${skippedCount} skipped, ${errorCount} errors`);

    return NextResponse.json({
      message: 'Batch price extraction complete',
      total: detections.length,
      success: successCount,
      skipped: skippedCount,
      errors: errorCount,
      results: results
    });

  } catch (error) {
    console.error('Batch price extraction error:', error);
    return NextResponse.json({ 
      error: 'Failed to extract prices',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 60 second timeout for parallel extraction
export const maxDuration = 60;
export const runtime = 'nodejs';

