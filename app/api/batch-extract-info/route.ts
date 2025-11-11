import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { extractProductInfo } from '@/lib/gemini';

interface ExtractionResult {
  detectionId: string;
  detectionIndex: number;
  status: 'success' | 'error';
  productInfo?: {
    isProduct: boolean;
    extractionNotes?: string;
    brand: string;
    productName: string;
    category: string;
    flavor: string;
    size: string;
    brandConfidence: number;
    productNameConfidence: number;
    categoryConfidence: number;
    flavorConfidence: number;
    sizeConfidence: number;
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

    // Fetch the image data with project info
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*, project_id')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ 
        error: 'Image not found',
        details: imageError?.message 
      }, { status: 404 });
    }

    const projectId = image.project_id || null;

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

    console.log(`📦 Extracting info for ${detections.length} products in parallel...`);

    // Process all detections in parallel (2000 req/min quota allows unlimited parallel)
    const results: ExtractionResult[] = await Promise.all(
      detections.map(async (detection) => {
        const result: ExtractionResult = {
          detectionId: detection.id,
          detectionIndex: detection.detection_index,
          status: 'error'
        };

        try {
          console.log(`  [${detection.detection_index}] Extracting product info...`);
          
          // Get image data (handles both S3 URLs and base64 storage)
          const { getImageBase64ForProcessing, getImageMimeType } = await import('@/lib/image-processor');
          const imageBase64 = await getImageBase64ForProcessing(image);
          const mimeType = getImageMimeType(image);
          
          const productInfo = await extractProductInfo(
            imageBase64,
            mimeType,
            detection.bounding_box,
            projectId
          );

          // Save to database immediately (regardless of isProduct status)
          const { error: updateError } = await supabase
            .from('branghunt_detections')
            .update({
              // Classification fields
              is_product: productInfo.isProduct,
              extraction_notes: productInfo.extractionNotes || null,
              // Product fields
              brand_name: productInfo.brand,
              product_name: productInfo.productName,
              category: productInfo.category,
              flavor: productInfo.flavor,
              size: productInfo.size,
              // Confidence scores
              brand_confidence: productInfo.brandConfidence,
              product_name_confidence: productInfo.productNameConfidence,
              category_confidence: productInfo.categoryConfidence,
              flavor_confidence: productInfo.flavorConfidence,
              size_confidence: productInfo.sizeConfidence,
              // Metadata
              brand_extraction_response: JSON.stringify(productInfo),
              updated_at: new Date().toISOString()
            })
            .eq('id', detection.id);

          if (updateError) {
            throw new Error(`Database update failed: ${updateError.message}`);
          }

          result.status = 'success';
          result.productInfo = {
            isProduct: productInfo.isProduct,
            extractionNotes: productInfo.extractionNotes,
            brand: productInfo.brand,
            productName: productInfo.productName,
            category: productInfo.category,
            flavor: productInfo.flavor,
            size: productInfo.size,
            brandConfidence: productInfo.brandConfidence,
            productNameConfidence: productInfo.productNameConfidence,
            categoryConfidence: productInfo.categoryConfidence,
            flavorConfidence: productInfo.flavorConfidence,
            sizeConfidence: productInfo.sizeConfidence
          };

          console.log(`  ✅ [${detection.detection_index}] Info extracted and saved (isProduct: ${productInfo.isProduct})`);


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

