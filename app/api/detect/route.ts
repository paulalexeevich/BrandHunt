import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { detectProducts } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const { imageId } = await request.json();

    if (!imageId) {
      return NextResponse.json({ error: 'No imageId provided' }, { status: 400 });
    }

    // Fetch image from database
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Update status to processing
    await supabase
      .from('branghunt_images')
      .update({ processing_status: 'detecting' })
      .eq('id', imageId);

    const imageBase64 = image.file_path;
    const mimeType = image.mime_type || 'image/jpeg';

    // Step 1: Detect products using Gemini
    let detections;
    try {
      detections = await detectProducts(imageBase64, mimeType);
    } catch (error) {
      await supabase
        .from('branghunt_images')
        .update({ processing_status: 'error_detection' })
        .eq('id', imageId);
      throw error;
    }

    console.log(`Detected ${detections.length} products`);

    // Save detections to database (without brand names, categories, or SKUs yet)
    const detectionsToSave = detections.map((detection, i) => ({
      image_id: imageId,
      detection_index: i,
      bounding_box: {
        y0: detection.box_2d[0],
        x0: detection.box_2d[1],
        y1: detection.box_2d[2],
        x1: detection.box_2d[3],
      },
      confidence_score: null,
      brand_name: null,
      category: null,
      brand_extraction_prompt: null,
      brand_extraction_response: null,
    }));

    const { data: savedDetections, error: detectionError } = await supabase
      .from('branghunt_detections')
      .insert(detectionsToSave)
      .select();

    if (detectionError) {
      console.error('Failed to save detections:', detectionError);
      throw new Error('Failed to save detections');
    }

    // Update image status
    await supabase
      .from('branghunt_images')
      .update({ 
        processing_status: 'detected',
        processed: false 
      })
      .eq('id', imageId);

    return NextResponse.json({ 
      success: true,
      detectionsCount: detections.length,
      detections: savedDetections,
      message: 'Products detected successfully' 
    });
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json({ 
      error: 'Detection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export const maxDuration = 60; // 1 minute for detection

