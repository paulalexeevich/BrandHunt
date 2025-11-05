import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * POST /api/save-result
 * Saves the selected FoodGraph match for a detection, marking it as fully analyzed
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { detectionId, foodgraphResultId } = body;

    if (!detectionId || !foodgraphResultId) {
      return NextResponse.json(
        { error: 'Missing required fields', details: 'detectionId and foodgraphResultId are required' },
        { status: 400 }
      );
    }

    console.log('💾 Saving result for detection:', detectionId, 'with FoodGraph result:', foodgraphResultId);

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch the FoodGraph result details
    const { data: foodgraphResult, error: fetchError } = await supabase
      .from('branghunt_foodgraph_results')
      .select('*')
      .eq('id', foodgraphResultId)
      .single();

    if (fetchError || !foodgraphResult) {
      console.error('❌ Failed to fetch FoodGraph result:', fetchError);
      return NextResponse.json(
        { error: 'FoodGraph result not found', details: fetchError?.message },
        { status: 404 }
      );
    }

    console.log('✅ Found FoodGraph result:', foodgraphResult.product_name);

    // Update the detection with the selected FoodGraph match
    const { data: updatedDetection, error: updateError } = await supabase
      .from('branghunt_detections')
      .update({
        selected_foodgraph_gtin: foodgraphResult.product_gtin,
        selected_foodgraph_product_name: foodgraphResult.product_name,
        selected_foodgraph_brand_name: foodgraphResult.brand_name,
        selected_foodgraph_category: foodgraphResult.category,
        selected_foodgraph_image_url: foodgraphResult.front_image_url,
        selected_foodgraph_result_id: foodgraphResult.id,
        fully_analyzed: true,
        analysis_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', detectionId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Failed to update detection:', updateError);
      return NextResponse.json(
        { error: 'Failed to save result', details: updateError.message },
        { status: 500 }
      );
    }

    console.log('✅ Successfully saved result for detection:', detectionId);

    return NextResponse.json({
      success: true,
      detection: updatedDetection,
      savedMatch: {
        gtin: foodgraphResult.product_gtin,
        productName: foodgraphResult.product_name,
        brandName: foodgraphResult.brand_name,
        category: foodgraphResult.category,
        imageUrl: foodgraphResult.front_image_url,
      },
    });
  } catch (error) {
    console.error('❌ Error in save-result API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

