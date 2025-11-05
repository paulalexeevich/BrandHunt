import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;

    // Create authenticated Supabase client with user session
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch image
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Fetch detections
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('image_id', imageId)
      .order('detection_index', { ascending: true });

    if (detectionsError) {
      console.error('Failed to fetch detections:', detectionsError);
      return NextResponse.json({ error: 'Failed to fetch detections' }, { status: 500 });
    }

    // Fetch FoodGraph results for each detection
    const detectionsWithResults = await Promise.all(
      (detections || []).map(async (detection) => {
        const { data: foodgraphResults, error: resultsError } = await supabase
          .from('branghunt_foodgraph_results')
          .select('*')
          .eq('detection_id', detection.id)
          .order('result_rank', { ascending: true });

        if (resultsError) {
          console.error('Failed to fetch FoodGraph results:', resultsError);
          return { ...detection, foodgraph_results: [] };
        }

        return { ...detection, foodgraph_results: foodgraphResults || [] };
      })
    );

    return NextResponse.json({ 
      image,
      detections: detectionsWithResults 
    });
  } catch (error) {
    console.error('Results fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}





