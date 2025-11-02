import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// Configure for Fluid Compute (60s timeout on Vercel free tier)
export const runtime = 'nodejs';
export const maxDuration = 60;

// YOLO API configuration
const YOLO_API_URL = 'http://157.180.25.214/api/detect';

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

    // Fetch image from database
    const supabase = createClient();
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

    // Convert base64 to blob for YOLO API
    const base64Data = image.file_path.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Create FormData for YOLO API
    const yoloFormData = new FormData();
    const blob = new Blob([buffer], { type: image.mime_type });
    yoloFormData.append('file', blob, 'image.jpg');

    console.log('[YOLO Detection] Calling YOLO API...');
    const yoloStartTime = Date.now();

    // Call YOLO API
    const yoloResponse = await fetch(YOLO_API_URL, {
      method: 'POST',
      body: yoloFormData,
    });

    if (!yoloResponse.ok) {
      throw new Error(`YOLO API error: ${yoloResponse.status}`);
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
    const detections = yoloData.detections.map((det, index) => {
      const normalizedBox = {
        y0: Math.round((det.bbox.y1 / image.height) * 1000),
        x0: Math.round((det.bbox.x1 / image.width) * 1000),
        y1: Math.round((det.bbox.y2 / image.height) * 1000),
        x1: Math.round((det.bbox.x2 / image.width) * 1000),
      };

      return {
        detection_index: index,
        confidence: det.confidence,
        bounding_box: normalizedBox,
        label: det.class_name,
      };
    });

    console.log(`[YOLO Detection] Converted ${detections.length} detections to BrangHunt format`);

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

    // Update image status
    await supabase
      .from('branghunt_images')
      .update({
        processed: true,
        processing_status: 'completed',
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

