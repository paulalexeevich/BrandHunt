import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { extractProductInfo } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const { detectionId } = await request.json();

    if (!detectionId) {
      return NextResponse.json({ error: 'No detectionId provided' }, { status: 400 });
    }

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch detection and associated image with project info
    const { data: detection, error: detectionError } = await supabase
      .from('branghunt_detections')
      .select('*, image:branghunt_images(*, project_id)')
      .eq('id', detectionId)
      .single();

    if (detectionError || !detection) {
      return NextResponse.json({ error: 'Detection not found' }, { status: 404 });
    }

    const image = detection.image;
    const projectId = image?.project_id || null;
    
    // Get image data (handles both S3 URLs and base64 storage)
    const { getImageBase64ForProcessing, getImageMimeType } = await import('@/lib/image-processor');
    const imageBase64 = await getImageBase64ForProcessing(image);
    const mimeType = getImageMimeType(image);
    const boundingBox = detection.bounding_box;

    // Extract brand name and category using Gemini (with custom prompt if available)
    let productInfo;
    try {
      productInfo = await extractProductInfo(imageBase64, mimeType, boundingBox, projectId);
    } catch (error) {
      console.error(`Failed to extract product info:`, error);
      throw error;
    }

    // Update detection with complete product information including classification and confidence
    const { data: updatedDetection, error: updateError } = await supabase
      .from('branghunt_detections')
      .update({
        // Classification fields
        is_product: productInfo.isProduct,
        details_visible: productInfo.detailsVisible,
        extraction_notes: productInfo.extractionNotes || null,
        // Product fields
        brand_name: productInfo.brand,
        category: productInfo.category,
        sku: productInfo.sku,
        product_name: productInfo.productName,
        flavor: productInfo.flavor,
        size: productInfo.size,
        description: productInfo.description,
        // Confidence scores
        brand_confidence: productInfo.brandConfidence,
        product_name_confidence: productInfo.productNameConfidence,
        category_confidence: productInfo.categoryConfidence,
        flavor_confidence: productInfo.flavorConfidence,
        size_confidence: productInfo.sizeConfidence,
        sku_confidence: productInfo.skuConfidence,
        description_confidence: productInfo.descriptionConfidence,
        // Metadata
        brand_extraction_prompt: `Product info extraction for detection ${detectionId}`,
        brand_extraction_response: JSON.stringify(productInfo),
      })
      .eq('id', detectionId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update detection:', updateError);
      throw new Error('Failed to update detection');
    }

    return NextResponse.json({ 
      success: true,
      // Classification
      isProduct: productInfo.isProduct,
      detailsVisible: productInfo.detailsVisible,
      extractionNotes: productInfo.extractionNotes,
      // Product data
      brandName: productInfo.brand,
      category: productInfo.category,
      sku: productInfo.sku,
      productName: productInfo.productName,
      flavor: productInfo.flavor,
      size: productInfo.size,
      description: productInfo.description,
      // Confidence scores
      brandConfidence: productInfo.brandConfidence,
      productNameConfidence: productInfo.productNameConfidence,
      categoryConfidence: productInfo.categoryConfidence,
      flavorConfidence: productInfo.flavorConfidence,
      sizeConfidence: productInfo.sizeConfidence,
      skuConfidence: productInfo.skuConfidence,
      descriptionConfidence: productInfo.descriptionConfidence,
      // Full detection record
      detection: updatedDetection,
      message: 'Product info extracted successfully' 
    });
  } catch (error) {
    console.error('Brand extraction error:', error);
    return NextResponse.json({ 
      error: 'Brand extraction failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Increase timeout for Gemini API calls (brand extraction + image cropping)
export const maxDuration = 60; // 60 seconds for Gemini processing

// Explicitly set runtime to nodejs (required for maxDuration > 10s with Fluid Compute)
export const runtime = 'nodejs';

