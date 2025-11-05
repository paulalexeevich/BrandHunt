import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { searchProducts, getFrontImageUrl } from '@/lib/foodgraph';

export async function POST(request: NextRequest) {
  try {
    const { detectionId, brandName } = await request.json();

    if (!detectionId || !brandName) {
      return NextResponse.json({ error: 'detectionId and brandName required' }, { status: 400 });
    }

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch full detection info to get all extracted product details
    const { data: detection, error: detectionError } = await supabase
      .from('branghunt_detections')
      .select('brand_extraction_response')
      .eq('id', detectionId)
      .single();

    if (detectionError) {
      console.error('Failed to fetch detection:', detectionError);
    }

    // Parse product info from brand_extraction_response
    let productInfo = null;
    if (detection?.brand_extraction_response) {
      try {
        productInfo = JSON.parse(detection.brand_extraction_response);
      } catch (e) {
        console.error('Failed to parse brand_extraction_response:', e);
      }
    }

    // Search FoodGraph with enhanced search term including all product details
    let products;
    try {
      if (productInfo && (productInfo.productName || productInfo.flavor || productInfo.size)) {
        // Use enhanced search with all available product information
        console.log('Using enhanced search with product details:', productInfo);
        products = await searchProducts(brandName, {
          brand: productInfo.brand,
          productName: productInfo.productName,
          flavor: productInfo.flavor,
          size: productInfo.size
        });
      } else {
        // Fallback to brand name only
        products = await searchProducts(brandName);
      }
    } catch (error) {
      console.error(`Failed to search FoodGraph:`, error);
      throw error;
    }

    const searchTerm = productInfo 
      ? `${productInfo.brand} ${productInfo.productName || ''} ${productInfo.flavor || ''}`.trim()
      : brandName;
    console.log(`Found ${products.length} products for "${searchTerm}"`);

    // Save top 5 results
    const foodgraphResults = [];
    for (let rank = 0; rank < products.length; rank++) {
      const product = products[rank];
      const frontImageUrl = getFrontImageUrl(product);

      const { data, error } = await supabase
        .from('branghunt_foodgraph_results')
        .insert({
          detection_id: detectionId,
          search_term: searchTerm,
          result_rank: rank + 1,
          product_gtin: product.keys?.GTIN14 || product.key || null,
          product_name: product.title || null,
          brand_name: product.companyBrand || null,
          category: Array.isArray(product.category) ? product.category.join(', ') : null,
          front_image_url: frontImageUrl,
          full_data: product,
        })
        .select()
        .single();

      if (!error && data) {
        foodgraphResults.push(data);
      }
    }

    return NextResponse.json({ 
      success: true,
      productsCount: foodgraphResults.length,
      products: foodgraphResults,
      message: 'FoodGraph search completed' 
    });
  } catch (error) {
    console.error('FoodGraph search error:', error);
    return NextResponse.json({ 
      error: 'FoodGraph search failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Increase timeout for FoodGraph API authentication and search
export const maxDuration = 60; // 60 seconds for FoodGraph API

// Explicitly set runtime to nodejs (required for maxDuration > 10s with Fluid Compute)
export const runtime = 'nodejs';


