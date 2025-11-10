import { NextRequest } from 'next/server';
import { compareProductImages, cropImageToBoundingBox } from '@/lib/gemini';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Test endpoint to verify Gemini AI comparison is working correctly
 * Tests comparison for a specific detection and FoodGraph result
 */
export async function POST(request: NextRequest) {
  try {
    const { imageId, detectionId, foodgraphResultId } = await request.json();

    console.log('\n🧪 ===== AI COMPARISON TEST =====');
    console.log(`Image ID: ${imageId}`);
    console.log(`Detection ID: ${detectionId}`);
    console.log(`FoodGraph Result ID: ${foodgraphResultId || 'First pre-filtered result'}`);

    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch image
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return new Response(JSON.stringify({ 
        error: 'Image not found',
        details: imageError?.message 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`✅ Image loaded: ${image.image_dimensions?.width}x${image.image_dimensions?.height}px`);

    // Fetch detection
    const { data: detection, error: detectionError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('id', detectionId)
      .single();

    if (detectionError || !detection) {
      return new Response(JSON.stringify({ 
        error: 'Detection not found',
        details: detectionError?.message 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`✅ Detection loaded: Product #${detection.detection_index}`);
    console.log(`   Brand: ${detection.brand_name}`);
    console.log(`   Product: ${detection.product_name}`);
    console.log(`   Bounding Box:`, detection.bounding_box);

    // Fetch FoodGraph results (pre-filtered stage)
    const { data: foodgraphResults, error: fgError } = await supabase
      .from('branghunt_foodgraph_results')
      .select('*')
      .eq('detection_id', detectionId)
      .eq('processing_stage', 'pre_filter')
      .order('result_rank');

    if (fgError || !foodgraphResults || foodgraphResults.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No pre-filtered FoodGraph results found',
        details: fgError?.message 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`✅ Found ${foodgraphResults.length} pre-filtered FoodGraph results`);

    // Select which result to test
    const resultToTest = foodgraphResultId 
      ? foodgraphResults.find(r => r.id === foodgraphResultId)
      : foodgraphResults[0]; // Default to first result

    if (!resultToTest) {
      return new Response(JSON.stringify({ 
        error: 'FoodGraph result not found' 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`\n🎯 Testing with FoodGraph result #${resultToTest.result_rank}:`);
    console.log(`   Product: ${resultToTest.product_name}`);
    console.log(`   Brand: ${resultToTest.brand_name}`);
    console.log(`   GTIN: ${resultToTest.product_gtin}`);
    console.log(`   Image URL: ${resultToTest.front_image_url}`);

    if (!resultToTest.front_image_url) {
      return new Response(JSON.stringify({ 
        error: 'FoodGraph result has no image URL' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract bounding box
    let boundingBox: { y0: number; x0: number; y1: number; x1: number };
    
    if (detection.bounding_box && typeof detection.bounding_box === 'object') {
      boundingBox = detection.bounding_box as { y0: number; x0: number; y1: number; x1: number };
    } else if (detection.y0 != null && detection.x0 != null && detection.y1 != null && detection.x1 != null) {
      boundingBox = {
        y0: detection.y0,
        x0: detection.x0,
        y1: detection.y1,
        x1: detection.x1
      };
    } else {
      return new Response(JSON.stringify({ 
        error: 'Invalid bounding box coordinates' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`\n✂️ Cropping product from shelf image...`);
    console.log(`   Bounding box: y0=${boundingBox.y0}, x0=${boundingBox.x0}, y1=${boundingBox.y1}, x1=${boundingBox.x1}`);

    const imageBase64 = image.file_path;
    console.log(`   Original image: ${imageBase64.length} chars (base64)`);

    const { croppedBase64, width, height } = await cropImageToBoundingBox(imageBase64, boundingBox);
    
    console.log(`   ✅ Cropped to: ${width}x${height}px (${croppedBase64.length} chars base64)`);

    // Perform AI comparison
    console.log(`\n🤖 Calling Gemini API for AI comparison...`);
    const startTime = Date.now();

    const comparisonResult = await compareProductImages(
      croppedBase64,
      resultToTest.front_image_url,
      true // Get detailed results
    );

    const elapsed = Date.now() - startTime;
    console.log(`   ⏱️ Comparison took: ${elapsed}ms`);

    console.log(`\n📊 Gemini AI Result:`);
    console.log(`   Match Status: ${comparisonResult.matchStatus}`);
    console.log(`   Confidence: ${(comparisonResult.confidence * 100).toFixed(1)}%`);
    console.log(`   Visual Similarity: ${(comparisonResult.visualSimilarity * 100).toFixed(1)}%`);
    console.log(`   Reason: ${comparisonResult.reason}`);

    console.log('\n✅ ===== TEST COMPLETE =====\n');

    // Return detailed test results
    return new Response(JSON.stringify({
      success: true,
      test_info: {
        image_id: imageId,
        detection_id: detectionId,
        detection_index: detection.detection_index,
        foodgraph_result_id: resultToTest.id,
        foodgraph_result_rank: resultToTest.result_rank
      },
      detected_product: {
        brand: detection.brand_name,
        product: detection.product_name,
        bounding_box: boundingBox,
        cropped_image_size: `${width}x${height}px`
      },
      foodgraph_product: {
        brand: resultToTest.brand_name,
        product: resultToTest.product_name,
        gtin: resultToTest.product_gtin,
        image_url: resultToTest.front_image_url
      },
      ai_comparison_result: {
        match_status: comparisonResult.matchStatus,
        confidence: comparisonResult.confidence,
        visual_similarity: comparisonResult.visualSimilarity,
        reason: comparisonResult.reason,
        processing_time_ms: elapsed
      },
      interpretation: {
        is_match: comparisonResult.matchStatus === 'identical' || comparisonResult.matchStatus === 'almost_same',
        should_auto_save: comparisonResult.matchStatus === 'identical',
        needs_review: comparisonResult.matchStatus === 'almost_same',
        should_reject: comparisonResult.matchStatus === 'not_match'
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('\n❌ Test error:', error);
    return new Response(JSON.stringify({ 
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

