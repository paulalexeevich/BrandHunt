import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractProductInfo } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const { detectionId } = await request.json();

    if (!detectionId) {
      return NextResponse.json({ error: 'No detectionId provided' }, { status: 400 });
    }

    // Fetch detection and associated image
    const { data: detection, error: detectionError } = await supabase
      .from('branghunt_detections')
      .select('*, image:branghunt_images(*)')
      .eq('id', detectionId)
      .single();

    if (detectionError || !detection) {
      return NextResponse.json({ error: 'Detection not found' }, { status: 404 });
    }

    const image = detection.image;
    const imageBase64 = image.file_path;
    const mimeType = image.mime_type || 'image/jpeg';
    const boundingBox = detection.bounding_box;

    // Extract brand name and category using Gemini
    let productInfo;
    try {
      productInfo = await extractProductInfo(imageBase64, mimeType, boundingBox);
    } catch (error) {
      console.error(`Failed to extract product info:`, error);
      throw error;
    }

    // Update detection with complete product information
    const { data: updatedDetection, error: updateError } = await supabase
      .from('branghunt_detections')
      .update({
        brand_name: productInfo.brand,
        category: productInfo.category,
        sku: productInfo.sku,
        product_name: productInfo.productName,
        flavor: productInfo.flavor,
        size: productInfo.size,
        description: productInfo.description,
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
      brandName: productInfo.brand,
      category: productInfo.category,
      sku: productInfo.sku,
      productName: productInfo.productName,
      flavor: productInfo.flavor,
      size: productInfo.size,
      description: productInfo.description,
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

