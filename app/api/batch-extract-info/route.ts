import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { extractProductInfo } from '@/lib/gemini';

interface ExtractionResult {
  detectionId: string;
  detectionIndex: number;
  status: 'success' | 'error';
  productInfo?: {
    brand: string;
    productName: string;
    category: string;
    flavor: string;
    size: string;
    sku: string;
    description: string;
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

    console.log(`📋 Starting batch info extraction for image ${imageId}...`);

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

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

    // Fetch all detections that don't have brand info yet
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('image_id', imageId)
      .is('brand_name', null)
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

    console.log(`📦 Extracting info for ${detections.length} products with concurrency control...`);

    // Process detections with concurrency limit to avoid rate limiting
    const CONCURRENCY_LIMIT = 5; // Process 5 products at a time
    const results: ExtractionResult[] = [];

    for (let i = 0; i < detections.length; i += CONCURRENCY_LIMIT) {
      const batch = detections.slice(i, i + CONCURRENCY_LIMIT);
      console.log(`  🔄 Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(detections.length / CONCURRENCY_LIMIT)} (${batch.length} products)...`);

      const batchResults = await Promise.all(
        batch.map(async (detection) => {
          const result: ExtractionResult = {
            detectionId: detection.id,
            detectionIndex: detection.detection_index,
            status: 'error'
          };

          try {
            console.log(`  [${detection.detection_index}] Extracting product info...`);
            
            const productInfo = await extractProductInfo(
              image.file_path,
              image.mime_type || 'image/jpeg',
              detection.bounding_box
            );

            if (productInfo.brand) {
              // Save to database immediately
              const { error: updateError } = await supabase
                .from('branghunt_detections')
                .update({
                  brand_name: productInfo.brand,
                  product_name: productInfo.productName,
                  category: productInfo.category,
                  flavor: productInfo.flavor,
                  size: productInfo.size,
                  sku: productInfo.sku,
                  description: productInfo.description,
                  brand_extraction_response: JSON.stringify(productInfo),
                  updated_at: new Date().toISOString()
                })
                .eq('id', detection.id);

              if (updateError) {
                throw new Error(`Database update failed: ${updateError.message}`);
              }

              result.status = 'success';
              result.productInfo = {
                brand: productInfo.brand,
                productName: productInfo.productName,
                category: productInfo.category,
                flavor: productInfo.flavor,
                size: productInfo.size,
                sku: productInfo.sku,
                description: productInfo.description
              };

              console.log(`  ✅ [${detection.detection_index}] Info extracted and saved`);
            } else {
              result.error = 'No brand information found';
            }

          } catch (error) {
            console.error(`  ❌ [${detection.detection_index}] Error:`, error);
            result.error = error instanceof Error ? error.message : 'Unknown error';
            result.status = 'error';
          }

          return result;
        })
      );

      results.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + CONCURRENCY_LIMIT < detections.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between batches
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`✅ Batch info extraction complete: ${successCount} success, ${errorCount} errors`);

    return NextResponse.json({
      message: 'Batch info extraction complete',
      total: detections.length,
      success: successCount,
      errors: errorCount,
      results: results
    });

  } catch (error) {
    console.error('Batch info extraction error:', error);
    return NextResponse.json({ 
      error: 'Failed to extract product information',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 60 second timeout for parallel extraction
export const maxDuration = 60;
export const runtime = 'nodejs';

