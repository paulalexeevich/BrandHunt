import { NextRequest, NextResponse } from 'next/server';
import { validateImageQuality } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';

export const maxDuration = 60; // 60 seconds timeout for validation

export async function POST(request: NextRequest) {
  try {
    const { imageId } = await request.json();

    if (!imageId) {
      return NextResponse.json(
        { error: 'Missing imageId parameter' },
        { status: 400 }
      );
    }

    console.log(`🔍 Starting quality validation for image ${imageId}`);

    // Get the image from database
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      console.error('Failed to fetch image:', imageError);
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    // Extract base64 and mime type from the data URL
    const dataUrlMatch = image.image_data.match(/^data:(.+);base64,(.+)$/);
    if (!dataUrlMatch) {
      return NextResponse.json(
        { error: 'Invalid image data format' },
        { status: 400 }
      );
    }

    const mimeType = dataUrlMatch[1];
    const imageBase64 = dataUrlMatch[2];

    // Validate image quality using Gemini
    const validation = await validateImageQuality(imageBase64, mimeType);

    console.log(`✅ Quality validation completed for image ${imageId}:`, validation);

    // Update image record with validation results
    const { error: updateError } = await supabase
      .from('branghunt_images')
      .update({
        is_blurry: validation.isBlurry,
        blur_confidence: validation.blurConfidence,
        estimated_product_count: validation.estimatedProductCount,
        product_count_confidence: validation.productCountConfidence,
        quality_validated_at: new Date().toISOString(),
      })
      .eq('id', imageId);

    if (updateError) {
      console.error('Failed to update validation results:', updateError);
      // Continue anyway - we'll still return the validation results
    }

    return NextResponse.json({
      success: true,
      validation: {
        isBlurry: validation.isBlurry,
        blurConfidence: validation.blurConfidence,
        estimatedProductCount: validation.estimatedProductCount,
        productCountConfidence: validation.productCountConfidence,
        warnings: validation.warnings,
        canProcess: validation.canProcess,
      },
    });
  } catch (error) {
    console.error('Quality validation error:', error);
    return NextResponse.json(
      { 
        error: 'Quality validation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

