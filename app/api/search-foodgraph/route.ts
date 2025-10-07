import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { searchProducts, getFrontImageUrl } from '@/lib/foodgraph';

export async function POST(request: NextRequest) {
  try {
    const { detectionId, brandName } = await request.json();

    if (!detectionId || !brandName) {
      return NextResponse.json({ error: 'detectionId and brandName required' }, { status: 400 });
    }

    // Search FoodGraph for products
    let products;
    try {
      products = await searchProducts(brandName);
    } catch (error) {
      console.error(`Failed to search FoodGraph:`, error);
      throw error;
    }

    console.log(`Found ${products.length} products for "${brandName}"`);

    // Save top 50 results
    const foodgraphResults = [];
    for (let rank = 0; rank < products.length; rank++) {
      const product = products[rank];
      const frontImageUrl = getFrontImageUrl(product);

      const { data, error } = await supabase
        .from('branghunt_foodgraph_results')
        .insert({
          detection_id: detectionId,
          search_term: brandName,
          result_rank: rank + 1,
          product_gtin: product.gtin || null,
          product_name: product.name || null,
          brand_name: product.brand || null,
          category: product.category || null,
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

export const maxDuration = 60; // 1 minute for FoodGraph search

