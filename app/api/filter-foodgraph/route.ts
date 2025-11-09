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
        return { result, isMatch: true };
      }

      try {
        const isMatch = await compareProductImages(
          croppedImageBase64,
          result.front_image_url
        );
        return { result, isMatch };
      } catch (error) {
        console.error(`Error comparing result ${result.id}:`, error);
        // On error, keep the result
        return { result, isMatch: true };
      }
    });

    // Wait for all comparisons to complete
    const comparisonResults = await Promise.all(comparisonPromises);

    // Update database with is_match status for ALL results
    console.log(`💾 Updating ${comparisonResults.length} results in database...`);
    const updatePromises = comparisonResults.map(async ({ result, isMatch }) => {
      const { error: updateError } = await supabase
        .from('branghunt_foodgraph_results')
        .update({ 
          is_match: isMatch,
          match_confidence: isMatch ? 0.95 : 0.0 // High confidence for matches
        })
        .eq('id', result.id);
      
      if (updateError) {
        console.error(`Failed to update result ${result.id}:`, updateError);
      }
      
      return { ...result, is_match: isMatch, match_confidence: isMatch ? 0.95 : 0.0 };
    });

    const updatedResults = await Promise.all(updatePromises);

    // Filter to only matching results
    const matchingResults = updatedResults.filter(r => r.is_match);

    // De-duplicate: Keep only the first result (highest rank) since FoodGraph returns duplicates
    // If multiple products match, they're likely the same product with duplicate entries
    const uniqueResults = matchingResults.length > 0 ? [matchingResults[0]] : [];

    console.log(`✅ Image filtering complete: ${matchingResults.length}/${foodgraphResults.length} products matched, ${uniqueResults.length} unique shown`);

    return NextResponse.json({
      filteredResults: uniqueResults, // Return only the top match (de-duplicated)
      totalFiltered: uniqueResults.length,
      totalOriginal: foodgraphResults.length
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

