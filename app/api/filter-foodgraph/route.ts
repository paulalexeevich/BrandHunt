import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { compareProductImages } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const { detectionId, croppedImageBase64, preFilteredResultIds } = await request.json();

    if (!detectionId || !croppedImageBase64) {
      return NextResponse.json({ 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch ONLY the pre-filtered results (if provided), otherwise fallback to top 50
    let foodgraphResults;
    let fetchError;
    
    if (preFilteredResultIds && preFilteredResultIds.length > 0) {
      // Fetch only the specific pre-filtered results
      console.log(`🔍 Fetching ${preFilteredResultIds.length} pre-filtered results for AI comparison...`);
      const { data, error } = await supabase
        .from('branghunt_foodgraph_results')
        .select('*')
        .in('id', preFilteredResultIds);
      foodgraphResults = data;
      fetchError = error;
    } else {
      // Fallback: Fetch top 50 if no pre-filter was applied
      console.log(`⚠️ No pre-filtered results provided, fetching top 50...`);
      const { data, error } = await supabase
        .from('branghunt_foodgraph_results')
        .select('*')
        .eq('detection_id', detectionId)
        .order('result_rank')
        .limit(50);
      foodgraphResults = data;
      fetchError = error;
    }

    if (fetchError) {
      console.error('Error fetching FoodGraph results:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to fetch FoodGraph results',
        details: fetchError.message 
      }, { status: 500 });
    }

    if (!foodgraphResults || foodgraphResults.length === 0) {
      return NextResponse.json({ 
        filteredResults: [],
        totalFiltered: 0,
        totalOriginal: 0
      });
    }

    console.log(`🔍 Starting image comparison for ${foodgraphResults.length} FoodGraph results...`);

    // Compare each FoodGraph result image with the cropped product image
    const comparisonPromises = foodgraphResults.map(async (result) => {
      if (!result.front_image_url) {
        console.log(`⚠️ No image URL for result ${result.id}, keeping it`);
        return { result, isMatch: true, confidence: 0.0, visualSimilarity: 0.0, reason: 'No image URL' };
      }

      try {
        const comparisonDetails = await compareProductImages(
          croppedImageBase64,
          result.front_image_url,
          true // Get detailed results with confidence, visualSimilarity, and reason
        );
        console.log(`   ✅ Result ${result.product_name}: ${comparisonDetails.isMatch ? 'MATCH' : 'NO MATCH'} (confidence: ${comparisonDetails.confidence}, visual similarity: ${comparisonDetails.visualSimilarity}) - ${comparisonDetails.reason}`);
        return { 
          result, 
          isMatch: comparisonDetails.isMatch,
          confidence: comparisonDetails.confidence,
          visualSimilarity: comparisonDetails.visualSimilarity,
          reason: comparisonDetails.reason
        };
      } catch (error) {
        console.error(`Error comparing result ${result.id}:`, error);
        // On error, keep the result
        return { result, isMatch: true, confidence: 0.0, visualSimilarity: 0.0, reason: 'Comparison error' };
      }
    });

    // Wait for all comparisons to complete
    const comparisonResults = await Promise.all(comparisonPromises);

    // Update database with is_match status for ALL results
    console.log(`💾 Updating ${comparisonResults.length} results in database...`);
    const updatePromises = comparisonResults.map(async ({ result, isMatch, confidence, visualSimilarity, reason }) => {
      const { error: updateError } = await supabase
        .from('branghunt_foodgraph_results')
        .update({ 
          is_match: isMatch,
          match_confidence: confidence, // AI's confidence in its assessment
          visual_similarity: visualSimilarity // How similar the images look (0-1)
        })
        .eq('id', result.id);
      
      if (updateError) {
        console.error(`Failed to update result ${result.id}:`, updateError);
      }
      
      return { 
        ...result, 
        is_match: isMatch, 
        match_confidence: confidence,
        visual_similarity: visualSimilarity,
        match_reason: reason 
      };
    });

    const updatedResults = await Promise.all(updatePromises);

    // Count how many passed the threshold
    const matchingResults = updatedResults.filter(r => r.is_match);
    
    // Sort by visual similarity (highest first) so users see closest matches first
    // This shows visually similar products even if they're different variants
    const sortedBySimilarity = [...updatedResults].sort((a, b) => {
      const simA = a.visual_similarity ?? 0;
      const simB = b.visual_similarity ?? 0;
      return simB - simA; // Descending order (highest similarity first)
    });
    
    console.log(`✅ Image filtering complete: ${matchingResults.length}/${foodgraphResults.length} products passed 70% threshold`);
    console.log(`   Showing all ${sortedBySimilarity.length} results sorted by visual similarity`);
    
    // Log top 3 for debugging
    sortedBySimilarity.slice(0, 3).forEach((r, i) => {
      const visualSim = r.visual_similarity !== undefined ? `, visual: ${Math.round(r.visual_similarity * 100)}%` : '';
      console.log(`   ${i + 1}. ${r.product_name} - ${r.is_match ? '✓ PASS' : '✗ FAIL'} (confidence: ${Math.round(r.match_confidence * 100)}%${visualSim})`);
    });

    return NextResponse.json({
      filteredResults: sortedBySimilarity, // Return ALL results sorted by visual similarity
      totalFiltered: matchingResults.length, // How many passed 70% threshold
      totalOriginal: foodgraphResults.length,
      showingAllWithConfidence: true // New flag indicating we're showing all results with scores
    });

  } catch (error) {
    console.error('Filter FoodGraph error:', error);
    return NextResponse.json({ 
      error: 'Failed to filter FoodGraph results',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Increase timeout for AI image filtering (multiple Gemini API calls)
export const maxDuration = 60; // 60 seconds for processing up to 50 products

// Explicitly set runtime to nodejs (required for maxDuration > 10s with Fluid Compute)
export const runtime = 'nodejs';

