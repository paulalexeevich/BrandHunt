import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { compareProductImages, MatchStatus } from '@/lib/gemini';

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

    // Fetch detection with image to get project_id
    const { data: detection, error: detectionError } = await supabase
      .from('branghunt_detections')
      .select('*, image:branghunt_images(project_id)')
      .eq('id', detectionId)
      .single();

    if (detectionError || !detection) {
      console.error('Error fetching detection:', detectionError);
      return NextResponse.json({ 
        error: 'Detection not found' 
      }, { status: 404 });
    }

    const projectId = detection.image?.project_id || null;
    console.log(`🔍 Project ID: ${projectId || 'null (using default prompt)'}`);

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
        console.log(`⚠️ No image URL for result ${result.id}, treating as not_match`);
        return { result, matchStatus: 'not_match' as MatchStatus, confidence: 0.0, visualSimilarity: 0.0, reason: 'No image URL' };
      }

      try {
        const comparisonDetails = await compareProductImages(
          croppedImageBase64,
          result.front_image_url,
          true, // Get detailed results with matchStatus, confidence, visualSimilarity, and reason
          projectId // Use custom prompt if available
        );
        console.log(`   ✅ Result ${result.product_name}: ${comparisonDetails.matchStatus.toUpperCase()} (confidence: ${comparisonDetails.confidence}, visual similarity: ${comparisonDetails.visualSimilarity}) - ${comparisonDetails.reason}`);
        return { 
          result, 
          matchStatus: comparisonDetails.matchStatus,
          confidence: comparisonDetails.confidence,
          visualSimilarity: comparisonDetails.visualSimilarity,
          reason: comparisonDetails.reason
        };
      } catch (error) {
        console.error(`Error comparing result ${result.id}:`, error);
        // On error, treat as not_match to be safe
        return { result, matchStatus: 'not_match' as MatchStatus, confidence: 0.0, visualSimilarity: 0.0, reason: 'Comparison error' };
      }
    });

    // Wait for all comparisons to complete
    const comparisonResults = await Promise.all(comparisonPromises);

    // CONSOLIDATION LOGIC: Check for identical and almost_same matches
    const identicalMatches = comparisonResults.filter(r => r.matchStatus === 'identical');
    const almostSameMatches = comparisonResults.filter(r => r.matchStatus === 'almost_same');
    
    console.log(`📊 Match status breakdown:`);
    console.log(`   - Identical: ${identicalMatches.length}`);
    console.log(`   - Almost Same: ${almostSameMatches.length}`);
    console.log(`   - Not Match: ${comparisonResults.length - identicalMatches.length - almostSameMatches.length}`);
    
    // Consolidation: If NO identical matches but exactly ONE almost_same match, promote it
    let finalMatchStatus: Record<string, boolean> = {};
    let consolidationApplied = false;
    
    if (identicalMatches.length === 0 && almostSameMatches.length === 1) {
      console.log(`🔄 CONSOLIDATION: No identical matches but exactly 1 "almost_same" match - promoting to match`);
      console.log(`   Promoted product: ${almostSameMatches[0].result.product_name}`);
      finalMatchStatus[almostSameMatches[0].result.id] = true;
      consolidationApplied = true;
    } else {
      // Normal case: only identical matches count as is_match
      identicalMatches.forEach(m => {
        finalMatchStatus[m.result.id] = true;
      });
    }

    // Update database with match_status for ALL results
    console.log(`💾 Updating ${comparisonResults.length} results in database...`);
    const updatePromises = comparisonResults.map(async ({ result, matchStatus, confidence, visualSimilarity, reason }) => {
      const isMatch = finalMatchStatus[result.id] || false;
      
      const { error: updateError } = await supabase
        .from('branghunt_foodgraph_results')
        .update({ 
          is_match: isMatch,
          match_status: matchStatus, // Store the three-tier status
          match_confidence: confidence,
          visual_similarity: visualSimilarity
        })
        .eq('id', result.id);
      
      if (updateError) {
        console.error(`Failed to update result ${result.id}:`, updateError);
      }
      
      return { 
        ...result, 
        is_match: isMatch,
        match_status: matchStatus,
        match_confidence: confidence,
        visual_similarity: visualSimilarity,
        match_reason: reason 
      };
    });

    const updatedResults = await Promise.all(updatePromises);

    // Count how many are considered matches (after consolidation)
    const finalMatches = updatedResults.filter(r => r.is_match);
    
    // Sort by visual similarity (highest first) so users see closest matches first
    const sortedBySimilarity = [...updatedResults].sort((a, b) => {
      const simA = a.visual_similarity ?? 0;
      const simB = b.visual_similarity ?? 0;
      return simB - simA;
    });
    
    console.log(`✅ Image filtering complete: ${finalMatches.length} final match(es)`);
    if (consolidationApplied) {
      console.log(`   ⭐ Consolidation applied: 1 "almost_same" promoted to match`);
    }
    console.log(`   Showing all ${sortedBySimilarity.length} results sorted by visual similarity`);
    
    // Log top 3 for debugging
    sortedBySimilarity.slice(0, 3).forEach((r, i) => {
      const status = r.match_status || 'unknown';
      const visualSim = r.visual_similarity !== undefined ? `, visual: ${Math.round(r.visual_similarity * 100)}%` : '';
      console.log(`   ${i + 1}. ${r.product_name} - ${status.toUpperCase()} ${r.is_match ? '✓ MATCH' : ''} (confidence: ${Math.round((r.match_confidence || 0) * 100)}%${visualSim})`);
    });

    return NextResponse.json({
      filteredResults: sortedBySimilarity,
      totalFiltered: finalMatches.length,
      totalOriginal: foodgraphResults.length,
      showingAllWithConfidence: true,
      consolidationApplied, // Flag indicating if consolidation was used
      identicalCount: identicalMatches.length,
      almostSameCount: almostSameMatches.length
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

