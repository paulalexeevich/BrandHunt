import { NextRequest, NextResponse } from 'next/server';
import { searchProducts, getFrontImageUrl } from '@/lib/foodgraph';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Test endpoint to search FoodGraph and return detailed results
 * GET /api/test-foodgraph?q=search+term
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || 'Dove Men+Care 24H Extra Fresh Extra Fresh';

    console.log('🔍 Testing FoodGraph Search');
    console.log('Search Query:', query);

    // Search FoodGraph
    const result = await searchProducts(query);
    const products = result.products;
    const searchTerm = result.searchTerm;

    if (products.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No results found',
        searchTerm,
        query
      });
    }

    // Get TOP 1 result
    const top1 = products[0];
    const imageUrl = getFrontImageUrl(top1);

    // Format response with detailed information
    const response = {
      success: true,
      searchTerm,
      query,
      totalResults: products.length,
      top1: {
        title: top1.title,
        brand: top1.companyBrand || null,
        manufacturer: top1.companyManufacturer || null,
        category: top1.category || [],
        measures: top1.measures || null,
        key: top1.key,
        score: top1._score || null,
        frontImageUrl: imageUrl,
        additionalKeys: top1.keys || {},
        ingredients: top1.ingredients ? top1.ingredients.substring(0, 500) + '...' : null,
        sourceUrls: top1.sourcePdpUrls?.slice(0, 3) || [],
        createdAt: top1._createdAt,
        updatedAt: top1._updatedAt
      },
      fullData: top1, // Include complete JSON for analysis
      allResults: products.map((p, idx) => ({
        rank: idx + 1,
        title: p.title,
        brand: p.companyBrand,
        measures: p.measures,
        score: p._score,
        key: p.key
      }))
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('❌ FoodGraph test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

