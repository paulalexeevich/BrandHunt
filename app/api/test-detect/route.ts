import { NextRequest, NextResponse } from 'next/server';
import { detectProducts } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const { imageData, mimeType } = await request.json();

    if (!imageData) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }

    console.log('🧪 Testing Gemini detection with image data...');
    
    // Call Gemini directly without database interaction
    const detections = await detectProducts(imageData, mimeType || 'image/jpeg');
    
    console.log(`✅ Detected ${detections.length} products`);
    console.log('🔍 Sample detections:', JSON.stringify(detections.slice(0, 3), null, 2));

    // Transform detections to match expected format
    const products = detections.map((detection) => ({
      label: detection.label,
      bounding_box: {
        y0: detection.box_2d[0],
        x0: detection.box_2d[1],
        y1: detection.box_2d[2],
        x1: detection.box_2d[3],
      }
    }));

    return NextResponse.json({ 
      success: true,
      products,
      raw_detections: detections
    });
  } catch (error) {
    console.error('❌ Test detection error:', error);
    return NextResponse.json({ 
      error: 'Detection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Increase timeout for Gemini API
export const maxDuration = 90;
export const runtime = 'nodejs';

