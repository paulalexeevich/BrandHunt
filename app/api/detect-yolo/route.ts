import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';

// Configure for Fluid Compute (60s timeout on Vercel free tier)
export const runtime = 'nodejs';
export const maxDuration = 60;

// YOLO API configuration
const YOLO_API_URL = 'http://157.180.25.214/api/detect';
const CONFIDENCE_THRESHOLD = 0.5; // Minimum 50% confidence required

interface YOLODetection {
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  confidence: number;
  class_id: number;
  class_name: string;
}

interface YOLOResponse {
  success: boolean;
  image_dimensions: {
    width: number;
    height: number;
  };
  detections: YOLODetection[];
  total_detections: number;
}

export async function POST(request: NextRequest) {
  console.log('[YOLO Detection] Starting YOLO detection...');
  const startTime = Date.now();

  try {
    const body = await request.json();
    const imageId = body.imageId as string;

    if (!imageId) {
      return NextResponse.json(
        { error: 'Image ID is required' },
        { status: 400 }
      );
    }

    console.log(`[YOLO Detection] Processing image ID: ${imageId}`);

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch image from database
    const { data: image, error: fetchError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (fetchError || !image) {
      console.error('[YOLO Detection] Error fetching image:', fetchError);
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    console.log(`[YOLO Detection] Image size: ${image.width}x${image.height}`);

    // Convert base64 to buffer for YOLO API
    const base64Data = image.file_path.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    console.log('[YOLO Detection] Calling YOLO API...');
    console.log(`[YOLO Detection] Buffer size: ${buffer.length} bytes`);
    const yoloStartTime = Date.now();

    // Create FormData using Node.js built-in (available in Node 18+)
    const formData = new FormData();
    const blob = new Blob([buffer], { type: image.mime_type || 'image/jpeg' });
    formData.append('file', blob, 'image.jpg');

    // Call YOLO API
    const yoloResponse = await fetch(YOLO_API_URL, {
      method: 'POST',
      body: formData,
    });

    console.log(`[YOLO Detection] API response status: ${yoloResponse.status}`);
    
    if (!yoloResponse.ok) {
      const errorText = await yoloResponse.text();
      console.error('[YOLO Detection] API error response:', errorText.substring(0, 200));
      throw new Error(`YOLO API error: ${yoloResponse.status} - ${errorText.substring(0, 100)}`);
    }

    // Check if response is JSON
    const contentType = yoloResponse.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await yoloResponse.text();
      console.error('[YOLO Detection] Non-JSON response:', responseText.substring(0, 200));
      throw new Error(`YOLO API returned non-JSON response (${contentType}): ${responseText.substring(0, 100)}`);
    }

    const yoloData: YOLOResponse = await yoloResponse.json();
    const yoloTime = Date.now() - yoloStartTime;

    console.log(`[YOLO Detection] YOLO API returned ${yoloData.total_detections} detections in ${yoloTime}ms`);

    if (!yoloData.success || !yoloData.detections) {
      throw new Error('YOLO API returned invalid response');
    }

    // Convert YOLO format to BrangHunt format
    // YOLO returns pixel coordinates (x1, y1, x2, y2)
    // BrangHunt expects normalized coordinates {y0, x0, y1, x1} (0-1000 scale)
    // IMPORTANT: Use YOLO's reported dimensions, not database dimensions!
    const yoloWidth = yoloData.image_dimensions.width;
    const yoloHeight = yoloData.image_dimensions.height;
    
    console.log(`[YOLO Detection] Using YOLO dimensions: ${yoloWidth}x${yoloHeight} (DB: ${image.width}x${image.height})`);
    
    // Filter out low-confidence detections (< 50%)
    const filteredDetections = yoloData.detections.filter(det => det.confidence >= CONFIDENCE_THRESHOLD);
    console.log(`[YOLO Detection] Filtered ${yoloData.detections.length} detections to ${filteredDetections.length} (confidence >= ${CONFIDENCE_THRESHOLD * 100}%)`);
    
    const detections = filteredDetections.map((det, index) => {
      const normalizedBox = {
        y0: Math.round((det.bbox.y1 / yoloHeight) * 1000),
        x0: Math.round((det.bbox.x1 / yoloWidth) * 1000),
        y1: Math.round((det.bbox.y2 / yoloHeight) * 1000),
        x1: Math.round((det.bbox.x2 / yoloWidth) * 1000),
      };

      return {
        detection_index: index,
        confidence: det.confidence,
        bounding_box: normalizedBox,
        label: det.class_name,
      };
    });

    console.log(`[YOLO Detection] Converted ${detections.length} detections to BrangHunt format`);
    if (detections.length > 0) {
      console.log(`[YOLO Detection] Sample detection #1:`, JSON.stringify(detections[0]));
      console.log(`[YOLO Detection] Confidence range: ${Math.min(...detections.map(d => d.confidence))} - ${Math.max(...detections.map(d => d.confidence))}`);
    }

    // Save detections to database
    const { error: insertError } = await supabase
      .from('branghunt_detections')
      .insert(
        detections.map((det) => ({
          image_id: imageId,
          detection_index: det.detection_index,
          bounding_box: det.bounding_box,
          confidence_score: det.confidence,
          label: det.label,
        }))
      );

    if (insertError) {
      console.error('[YOLO Detection] Error saving detections:', insertError);
      throw new Error(`Failed to save detections: ${insertError.message}`);
    }

    // Update image status - set detection_completed flag
    await supabase
      .from('branghunt_images')
      .update({
        processed: true,
        processing_status: 'completed',
        detection_completed: true,
        detection_completed_at: new Date().toISOString(),
      })
      .eq('id', imageId);

    const totalTime = Date.now() - startTime;
    console.log(`[YOLO Detection] Completed in ${totalTime}ms (YOLO: ${yoloTime}ms, DB save: ${totalTime - yoloTime}ms)`);

    return NextResponse.json({
      success: true,
      detections,
      total_detections: detections.length,
      processing_time_ms: totalTime,
      yolo_time_ms: yoloTime,
      detection_method: 'YOLO',
    });

  } catch (error) {
    console.error('[YOLO Detection] Error:', error);
    const totalTime = Date.now() - startTime;
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        processing_time_ms: totalTime,
      },
      { status: 500 }
    );
  }
}

