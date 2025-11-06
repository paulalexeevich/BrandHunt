import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { cropImageToBoundingBox } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const { imageId, detectionId } = await request.json();

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch the image
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ 
        error: 'Image not found' 
      }, { status: 404 });
    }

    // Fetch the detection
    const { data: detection, error: detectionError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('id', detectionId)
      .single();

    if (detectionError || !detection) {
      return NextResponse.json({ 
        error: 'Detection not found' 
      }, { status: 404 });
    }

    // Extract bounding box
    const boundingBox = detection.bounding_box as { y0: number; x0: number; y1: number; x1: number };
    
    console.log('Testing crop with bounding box:', boundingBox);
    console.log('Image dimensions from DB:', image.width, 'x', image.height);

    // Crop the image
    const { croppedBase64, width, height } = await cropImageToBoundingBox(
      image.file_path,
      boundingBox
    );

    console.log('Cropped image size:', width, 'x', height);
    console.log('Cropped base64 length:', croppedBase64.length);

    // Return the cropped image as a data URL for display
    return NextResponse.json({
      success: true,
      boundingBox,
      originalDimensions: {
        width: image.width,
        height: image.height
      },
      croppedDimensions: {
        width,
        height
      },
      croppedImageDataUrl: `data:image/jpeg;base64,${croppedBase64}`,
      base64Length: croppedBase64.length
    });

  } catch (error) {
    console.error('Test crop error:', error);
    return NextResponse.json({ 
      error: 'Failed to test crop',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export const maxDuration = 30;
export const runtime = 'nodejs';

