import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ detectionId: string }> }
) {
  const startTime = Date.now();
  try {
    const { detectionId } = await params;

    // Create authenticated Supabase client with user session
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch FoodGraph results for this specific detection
    const { data: results, error: resultsError } = await supabase
      .from('branghunt_foodgraph_results')
      .select('*')
      .eq('detection_id', detectionId)
      .order('result_rank', { ascending: true });

    if (resultsError) {
      console.error('Failed to fetch FoodGraph results:', resultsError);
      return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
    }

    const totalTime = Date.now() - startTime;
    console.log(`⏱️ Fetched ${results?.length || 0} FoodGraph results for detection ${detectionId} in ${totalTime}ms`);

    return NextResponse.json({ 
      results: results || []
    });
  } catch (error) {
    console.error('FoodGraph results fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}

