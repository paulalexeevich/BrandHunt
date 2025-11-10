import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const startTime = Date.now();
  try {
    const { imageId } = await params;

    // Create authenticated Supabase client with user session
    const authStart = Date.now();
    const supabase = await createAuthenticatedSupabaseClient();
    console.log(`⏱️ Auth client created: ${Date.now() - authStart}ms`);

    // Fetch image
    const imageStart = Date.now();
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();
    console.log(`⏱️ Image fetched: ${Date.now() - imageStart}ms`);

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Fetch detections
    const detectionsStart = Date.now();
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('image_id', imageId)
      .order('detection_index', { ascending: true });
    console.log(`⏱️ Detections fetched: ${Date.now() - detectionsStart}ms (${detections?.length || 0} detections)`);

    if (detectionsError) {
      console.error('Failed to fetch detections:', detectionsError);
      return NextResponse.json({ error: 'Failed to fetch detections' }, { status: 500 });
    }

    // Fetch FoodGraph results for all detections in ONE query (optimized)
    const resultsStart = Date.now();
    const detectionIds = (detections || []).map(d => d.id);
    
    const { data: allFoodgraphResults, error: resultsError } = await supabase
      .from('branghunt_foodgraph_results')
      .select('*')
      .in('detection_id', detectionIds)
      .order('result_rank', { ascending: true });
    
    console.log(`⏱️ FoodGraph results fetched: ${Date.now() - resultsStart}ms (${allFoodgraphResults?.length || 0} results)`);

    if (resultsError) {
      console.error('Failed to fetch FoodGraph results:', resultsError);
    }

    // Group results by detection_id
    const resultsByDetection = (allFoodgraphResults || []).reduce((acc, result) => {
      if (!acc[result.detection_id]) {
        acc[result.detection_id] = [];
      }
      acc[result.detection_id].push(result);
      return acc;
    }, {} as Record<string, typeof allFoodgraphResults>);

    // Attach results to detections
    const detectionsWithResults = (detections || []).map((detection) => {
      const foodgraphResults = resultsByDetection[detection.id] || [];
      
      // Log detections with results for debugging
      if (foodgraphResults.length > 0) {
        console.log(`📦 Detection #${detection.detection_index}: ${foodgraphResults.length} FoodGraph results, fully_analyzed=${detection.fully_analyzed}`);
      }

      return { ...detection, foodgraph_results: foodgraphResults };
    });
    
    // Log summary
    const withResults = detectionsWithResults.filter(d => d.foodgraph_results && d.foodgraph_results.length > 0);
    const totalTime = Date.now() - startTime;
    console.log(`📊 API Response: ${detectionsWithResults.length} total detections, ${withResults.length} have FoodGraph results`);
    console.log(`⏱️ 🎯 TOTAL API TIME: ${totalTime}ms`);

    return NextResponse.json({ 
      image,
      detections: detectionsWithResults 
    });
  } catch (error) {
    console.error('Results fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}





