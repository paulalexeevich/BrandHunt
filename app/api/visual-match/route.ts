import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { selectBestMatchFromMultiple, VisualMatchCandidate } from '@/lib/gemini';
import { getImageBase64ForProcessing } from '@/lib/image-processor';
import { cropImageToBoundingBox } from '@/lib/gemini';

/**
 * Visual Matching Selection API
 * 
 * This endpoint takes a detection with multiple identical/almost_same matches
 * and uses Gemini to select the best match based on visual similarity and metadata
 * 
 * POST /api/visual-match
 * Body: { detectionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { detectionId } = await request.json();

    if (!detectionId) {
      return NextResponse.json({ 
        error: 'Missing detectionId parameter' 
      }, { status: 400 });
    }

    console.log(`🎯 Starting visual matching selection for detection ${detectionId}...`);

    const supabase = await createAuthenticatedSupabaseClient();

    // 1. Fetch the detection with extracted info
    const { data: detection, error: detectionError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('id', detectionId)
      .single();

    if (detectionError || !detection) {
      return NextResponse.json({ 
        error: 'Detection not found',
        details: detectionError?.message 
      }, { status: 404 });
    }

    // 2. Fetch the image
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', detection.image_id)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ 
        error: 'Image not found',
        details: imageError?.message 
      }, { status: 404 });
    }

    const projectId = image.project_id || null;

    // 3. Fetch FoodGraph results that are identical or almost_same
    const { data: foodgraphResults, error: resultsError } = await supabase
      .from('branghunt_foodgraph_results')
      .select('*')
      .eq('detection_id', detectionId)
      .eq('processing_stage', 'ai_filter')
      .in('match_status', ['identical', 'almost_same'])
      .order('result_rank');

    if (resultsError) {
      return NextResponse.json({ 
        error: 'Failed to fetch FoodGraph results',
        details: resultsError.message 
      }, { status: 500 });
    }

    if (!foodgraphResults || foodgraphResults.length === 0) {
      return NextResponse.json({ 
        error: 'No identical or almost_same matches found',
        message: 'This detection has no candidates for visual matching'
      }, { status: 400 });
    }

    if (foodgraphResults.length === 1) {
      // Auto-select the only candidate
      const result = foodgraphResults[0];
      
      await supabase
        .from('branghunt_detections')
        .update({
          selected_foodgraph_result_id: result.id,
          selected_foodgraph_gtin: result.product_gtin,
          selected_foodgraph_product_name: result.product_name,
          selected_foodgraph_brand_name: result.brand_name,
          selected_foodgraph_category: result.category,
          selected_foodgraph_image_url: result.front_image_url,
          fully_analyzed: true,
          analysis_completed_at: new Date().toISOString(),
        })
        .eq('id', detectionId);

      return NextResponse.json({
        message: 'Only one candidate - auto-selected',
        selected: {
          resultId: result.id,
          gtin: result.product_gtin,
          productName: result.product_name,
          brandName: result.brand_name
        },
        confidence: 1.0,
        reasoning: 'Only one candidate available',
        autoSelected: true
      });
    }

    console.log(`   Found ${foodgraphResults.length} candidates for visual matching`);

    // 4. Get the cropped product image
    const imageBase64 = await getImageBase64ForProcessing(image);
    const boundingBox = detection.bounding_box as { y0: number; x0: number; y1: number; x1: number };
    
    const { croppedBase64 } = await cropImageToBoundingBox(imageBase64, boundingBox);

    // 5. Prepare extracted info
    const extractedInfo = {
      brand: detection.brand_name || 'Unknown',
      productName: detection.product_name || 'Unknown',
      size: detection.size || 'Unknown',
      flavor: detection.flavor || 'Unknown',
      category: detection.category || 'Unknown'
    };

    // 6. Prepare candidates
    const candidates: VisualMatchCandidate[] = foodgraphResults.map(result => ({
      id: result.id,
      gtin: result.product_gtin || '',
      productName: result.product_name || '',
      brandName: result.brand_name || '',
      size: result.measures || result.full_data?.measures || 'Unknown',
      category: result.category || result.full_data?.category?.[0] || undefined,
      ingredients: result.full_data?.ingredients || undefined,
      imageUrl: result.front_image_url || '',
      matchStatus: result.match_status as 'identical' | 'almost_same'
    }));

    console.log(`   Extracted Info: ${extractedInfo.brand} - ${extractedInfo.productName} (${extractedInfo.size})`);
    console.log(`   Candidates: ${candidates.map(c => `${c.brandName} - ${c.productName} (${c.gtin})`).join(', ')}`);

    // 7. Call Gemini visual matching
    const selection = await selectBestMatchFromMultiple(
      croppedBase64,
      extractedInfo,
      candidates,
      projectId
    );

    console.log(`   Selection Result: ${selection.selectedGtin || 'None'} (confidence: ${Math.round(selection.confidence * 100)}%)`);
    console.log(`   Reasoning: ${selection.reasoning}`);

    // 8. Save the selection to database if a match was found
    if (selection.selectedCandidateId && selection.selectedGtin) {
      const selectedResult = foodgraphResults.find(r => r.id === selection.selectedCandidateId);
      
      if (selectedResult) {
        await supabase
          .from('branghunt_detections')
          .update({
            selected_foodgraph_result_id: selectedResult.id,
            selected_foodgraph_gtin: selectedResult.product_gtin,
            selected_foodgraph_product_name: selectedResult.product_name,
            selected_foodgraph_brand_name: selectedResult.brand_name,
            selected_foodgraph_category: selectedResult.category,
            selected_foodgraph_image_url: selectedResult.front_image_url,
            selection_method: 'visual_matching',
            fully_analyzed: true,
            analysis_completed_at: new Date().toISOString(),
          })
          .eq('id', detectionId);

        console.log(`   ✅ Saved visual match selection to detection`);

        return NextResponse.json({
          message: 'Visual match selected successfully',
          selected: {
            resultId: selectedResult.id,
            gtin: selectedResult.product_gtin,
            productName: selectedResult.product_name,
            brandName: selectedResult.brand_name,
            imageUrl: selectedResult.front_image_url
          },
          confidence: selection.confidence,
          reasoning: selection.reasoning,
          visualSimilarityScore: selection.visualSimilarityScore,
          brandMatch: selection.brandMatch,
          sizeMatch: selection.sizeMatch,
          flavorMatch: selection.flavorMatch,
          totalCandidates: candidates.length,
          autoSelected: false
        });
      }
    }

    // No match found
    return NextResponse.json({
      message: 'No suitable match found',
      selected: null,
      confidence: selection.confidence,
      reasoning: selection.reasoning,
      visualSimilarityScore: selection.visualSimilarityScore,
      totalCandidates: candidates.length,
      autoSelected: false
    });

  } catch (error) {
    console.error('Visual matching error:', error);
    return NextResponse.json({ 
      error: 'Failed to perform visual matching',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 60 second timeout for visual matching (multiple images + Gemini processing)
export const maxDuration = 60;
export const runtime = 'nodejs';

