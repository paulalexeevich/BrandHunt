import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractPrice } from '@/lib/gemini';

export const maxDuration = 300; // 5 minutes timeout for Gemini API

export async function POST(request: NextRequest) {
  try {
    const { detectionId } = await request.json();

    if (!detectionId) {
      return NextResponse.json(
        { error: 'Missing required field: detectionId' },
        { status: 400 }
      );
    }

    console.log('🏷️ Starting price extraction for detection:', detectionId);

    // 1. Get the detection and its image
    const { data: detection, error: detectionError } = await supabase
      .from('branghunt_detections')
      .select(`
        *,
        branghunt_images (
          file_path,
          mime_type
        )
      `)
      .eq('id', detectionId)
      .single();

    if (detectionError || !detection) {
      console.error('Detection not found:', detectionError);
      return NextResponse.json(
        { error: 'Detection not found', details: detectionError?.message },
        { status: 404 }
      );
    }

    const image = detection.branghunt_images as { file_path: string; mime_type: string };
    
    if (!image || !image.file_path) {
      return NextResponse.json(
        { error: 'Image data not found for this detection' },
        { status: 404 }
      );
    }

    console.log('📸 Found detection with bounding box:', detection.bounding_box);

    // 2. Extract price using Gemini API
    const priceInfo = await extractPrice(
      image.file_path,
      image.mime_type || 'image/jpeg',
      detection.bounding_box,
      {
        brand: detection.brand_name,
        productName: detection.product_name,
        label: detection.label
      }
    );

    console.log('💰 Extracted price:', priceInfo);

    // 3. Update the detection with price information
    const { error: updateError } = await supabase
      .from('branghunt_detections')
      .update({
        price: priceInfo.price,
        price_currency: priceInfo.currency,
        price_confidence: priceInfo.confidence,
        updated_at: new Date().toISOString()
      })
      .eq('id', detectionId);

    if (updateError) {
      console.error('Failed to update detection with price:', updateError);
      return NextResponse.json(
        { error: 'Failed to save price information', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      price: priceInfo.price,
      currency: priceInfo.currency,
      confidence: priceInfo.confidence
    });

  } catch (error) {
    console.error('Price extraction error:', error);
    return NextResponse.json(
      {
        error: 'Price extraction failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

