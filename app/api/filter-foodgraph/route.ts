import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { compareProductImages } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const { detectionId, croppedImageBase64 } = await request.json();

    if (!detectionId || !croppedImageBase64) {
      return NextResponse.json({ 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }

    // Fetch only top 50 FoodGraph results for this detection (matching what's displayed)
    const { data: foodgraphResults, error: fetchError } = await supabase
      .from('branghunt_foodgraph_results')
      .select('*')
      .eq('detection_id', detectionId)
      .order('result_rank')
      .limit(50);

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

    // Filter to only matching results
    const matchingResults = comparisonResults
      .filter(({ isMatch }) => isMatch)
      .map(({ result }) => result);

    // De-duplicate: Keep only the first result (highest rank) since FoodGraph returns duplicates
    // If multiple products match, they're likely the same product with duplicate entries
    const uniqueResults = matchingResults.length > 0 ? [matchingResults[0]] : [];

    console.log(`✅ Image filtering complete: ${matchingResults.length}/${foodgraphResults.length} products matched, ${uniqueResults.length} unique shown`);

    return NextResponse.json({
      filteredResults: uniqueResults,
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

export const maxDuration = 10; // Vercel free tier limit

