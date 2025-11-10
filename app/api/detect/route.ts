import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { detectProducts } from '@/lib/gemini';
import { getImageBase64ForProcessing, getImageMimeType } from '@/lib/image-processor';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('🚀 Detection started at:', new Date().toISOString());
  
  try {
    const { imageId } = await request.json();

    if (!imageId) {
      return NextResponse.json({ error: 'No imageId provided' }, { status: 400 });
    }

    console.log(`📸 Processing image: ${imageId}`);

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch image from database
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      console.error('❌ Image not found:', imageError);
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    console.log(`✅ Image loaded: ${image.original_filename}`);

    // Update status to processing
    await supabase
      .from('branghunt_images')
      .update({ processing_status: 'detecting' })
      .eq('id', imageId);

    // Get image data (handles both S3 URLs and base64 storage)
    const imageBase64 = await getImageBase64ForProcessing(image);
    const mimeType = getImageMimeType(image);
    
    // Check image size (base64 string length)
    const imageSizeKB = (imageBase64.length * 3 / 4 / 1024).toFixed(2);
    console.log(`📊 Image size: ${imageSizeKB} KB (base64 length: ${imageBase64.length})`);
    
    if (imageBase64.length > 20_000_000) { // ~15MB after base64 encoding
      console.warn('⚠️ Image is very large, detection may take longer than 60s');
    }

    // Step 1: Detect products using Gemini
    let detections;
    try {
      console.log('🤖 Calling Gemini API for product detection...');
      const timeoutMs = 55000; // 55 seconds timeout (leave 5s buffer for response)
      
      const detectionPromise = detectProducts(imageBase64, mimeType);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Detection timed out after 55 seconds')), timeoutMs)
      );
      
      detections = await Promise.race([detectionPromise, timeoutPromise]) as Awaited<typeof detectionPromise>;
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Gemini detection completed in ${elapsed}s`);
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`❌ Gemini detection failed after ${elapsed}s:`, error);
      await supabase
        .from('branghunt_images')
        .update({ processing_status: 'error_detection' })
        .eq('id', imageId);
      
      // Return more specific error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ 
        error: 'Detection failed',
        details: errorMessage,
        elapsed: `${elapsed}s`
      }, { status: 500 });
    }

    console.log(`📦 Detected ${detections.length} products`);
    
    // Debug: Log first few detections to verify coordinates
    console.log('🔍 Sample detections:', JSON.stringify(detections.slice(0, 3), null, 2));

    // Save detections to database (without brand names, categories, or SKUs yet)
    const detectionsToSave = detections.map((detection, i) => {
      const bbox = {
        y0: detection.box_2d[0],
        x0: detection.box_2d[1],
        y1: detection.box_2d[2],
        x1: detection.box_2d[3],
      };
      console.log(`Detection ${i}: [${detection.box_2d}] -> ${JSON.stringify(bbox)}`);
      return {
        image_id: imageId,
        detection_index: i,
        bounding_box: bbox,
        label: detection.label || null,
        confidence_score: null,
      brand_name: null,
      category: null,
      sku: null,
      product_name: null,
      flavor: null,
      size: null,
      description: null,
      brand_extraction_prompt: null,
      brand_extraction_response: null,
      };
    });

    const { data: savedDetections, error: detectionError } = await supabase
      .from('branghunt_detections')
      .insert(detectionsToSave)
      .select();

    if (detectionError) {
      console.error('Failed to save detections:', detectionError);
      throw new Error('Failed to save detections');
    }

    // Update image status - set detection_completed flag and status to 'detected'
    await supabase
      .from('branghunt_images')
      .update({ 
        status: 'detected',
        processing_status: 'detected',
        processed: false,
        detection_completed: true,
        detection_completed_at: new Date().toISOString(),
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

// Increase timeout for Gemini API product detection
export const maxDuration = 60; // 60 seconds for Gemini vision processing

// Explicitly set runtime to nodejs (required for maxDuration > 10s with Fluid Compute)
export const runtime = 'nodejs';

