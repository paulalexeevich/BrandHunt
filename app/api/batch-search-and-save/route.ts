import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { searchProducts, getFrontImageUrl } from '@/lib/foodgraph';
import { compareProductImages } from '@/lib/gemini';

interface SearchAndSaveResult {
  detectionId: string;
  detectionIndex: number;
  status: 'success' | 'error' | 'no_match';
  productName?: string;
  brandName?: string;
  resultsSearched?: number;
  savedMatch?: {
    productName: string;
    brandName: string;
    gtin: string;
    imageUrl: string;
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { imageId } = await request.json();

    if (!imageId) {
      return NextResponse.json({ 
        error: 'Missing imageId parameter' 
      }, { status: 400 });
    }

    console.log(`🔍 Starting batch search & save for image ${imageId}...`);

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch the image data
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ 
        error: 'Image not found',
        details: imageError?.message 
      }, { status: 404 });
    }

    // Fetch all detections that have brand info but are not fully analyzed yet
    // Match frontend logic: !fully_analyzed includes both null AND false
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('image_id', imageId)
      .not('brand_name', 'is', null)
      .not('fully_analyzed', 'eq', true)
      .order('detection_index');

    if (detectionsError) {
      return NextResponse.json({ 
        error: 'Failed to fetch detections',
        details: detectionsError.message 
      }, { status: 500 });
    }

    if (!detections || detections.length === 0) {
      return NextResponse.json({
        message: 'No products to process',
        processed: 0,
        results: []
      });
    }

    console.log(`🚀 Found ${detections.length} products that need processing`);
    
    // FOR TESTING: Process only first 1 product
    const detectionsToProcess = detections.slice(0, 1);
    console.log(`🧪 TESTING MODE: Processing only ${detectionsToProcess.length} product(s)`);

    // Process detections sequentially with delays
    const results: SearchAndSaveResult[] = [];
    
    for (let i = 0; i < detectionsToProcess.length; i++) {
      const detection = detectionsToProcess[i];
      const result: SearchAndSaveResult = {
        detectionId: detection.id,
        detectionIndex: detection.detection_index,
        status: 'error'
      };

      try {
        // Step 3a: Search FoodGraph (keep results in memory)
        console.log(`\n========================================`);
        console.log(`  [${detection.detection_index}] (${i + 1}/${detectionsToProcess.length}) Step 1: Searching FoodGraph...`);
        
        // Parse product info for comprehensive search
        let productInfo = null;
        if (detection.brand_extraction_response) {
          try {
            productInfo = JSON.parse(detection.brand_extraction_response);
          } catch (e) {
            console.error(`  ⚠️ Failed to parse brand_extraction_response:`, e);
          }
        }

        const searchDesc = productInfo 
          ? `${productInfo.brand || ''} ${productInfo.productName || ''} ${productInfo.flavor || ''} ${productInfo.size || ''}`.trim()
          : detection.brand_name;
        
        console.log(`     📝 Product Info:`, JSON.stringify(productInfo, null, 2));
        console.log(`     🔍 Searching for: "${searchDesc}"`);
        
        // Search FoodGraph with all available details
        const searchResult = productInfo && (productInfo.productName || productInfo.flavor || productInfo.size)
          ? await searchProducts(detection.brand_name, {
              brand: productInfo.brand,
              productName: productInfo.productName,
              flavor: productInfo.flavor,
              size: productInfo.size
            })
          : await searchProducts(detection.brand_name);
        
        // Transform products to add front_image_url property
        const foodgraphResults = searchResult.products.map(product => ({
          ...product,
          product_name: product.title,
          brand_name: product.companyBrand || null,
          product_gtin: product.keys?.GTIN14 || product.key || null,
          category: Array.isArray(product.category) ? product.category.join(', ') : product.category,
          front_image_url: getFrontImageUrl(product)
        }));
        result.resultsSearched = foodgraphResults.length;
        result.productName = detection.product_name || detection.brand_name;
        result.brandName = detection.brand_name;
        
        console.log(`     ✅ Found ${foodgraphResults.length} FoodGraph results`);
        if (foodgraphResults.length > 0) {
          console.log(`     📦 First 3 results:`, foodgraphResults.slice(0, 3).map((r: any) => ({
            name: r.product_name,
            brand: r.brand_name,
            hasImage: !!r.front_image_url
          })));
        }

        if (foodgraphResults.length === 0) {
          result.status = 'no_match';
          result.error = 'No FoodGraph results found';
          console.log(`     ⚠️ No results to filter`);
          results.push(result);
          
          // Add delay before next product
          if (i < detections.length - 1) {
            console.log(`  ⏳ Waiting 10s before next product...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
          continue;
        }

        // Step 3b: Filter with AI (results still in memory)
        console.log(`\n  [${detection.detection_index}] Step 2: AI filtering ${foodgraphResults.length} results...`);
        
        // For simplicity, use the full image base64 for comparison
        // (In production, you might want to crop it first for better accuracy)
        const imageBase64 = image.file_path;
        console.log(`     🖼️ Using image base64 length: ${imageBase64.length} chars`);
        
        // Crop the product from the image for comparison
        const img = Buffer.from(image.file_path, 'base64');
        const boundingBox = detection.bounding_box;

        // Compare first 20 results (to avoid too many API calls)
        const resultsToCompare = foodgraphResults.slice(0, 20);
        console.log(`     🔬 Comparing first ${resultsToCompare.length} results with AI...`);
        let bestMatch = null;

        for (let j = 0; j < resultsToCompare.length; j++) {
          const fgResult = resultsToCompare[j];
          
          if (!fgResult.front_image_url) {
            continue;
          }

          try {
            console.log(`     🔄 [${j + 1}/${resultsToCompare.length}] Comparing with: ${fgResult.product_name}`);
            const imageUrlPreview = fgResult.front_image_url ? fgResult.front_image_url.substring(0, 60) : 'N/A';
            console.log(`        Image URL: ${imageUrlPreview}...`);
            
            const isMatch = await compareProductImages(
              imageBase64,
              fgResult.front_image_url as string
            );

            console.log(`        Result: ${isMatch ? '✅ MATCH!' : '❌ No match'}`);

            if (isMatch) {
              bestMatch = fgResult;
              console.log(`     ✅ BEST MATCH FOUND: ${fgResult.product_name} (${fgResult.brand_name})`);
              break; // Stop at first match
            }
          } catch (error) {
            console.error(`     ⚠️ Comparison error for result ${j + 1}:`, error);
            // Continue to next result
          }

          // Small delay between comparisons (2 seconds)
          if (j < resultsToCompare.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // Step 3c: Save only the final match to DB
        if (bestMatch) {
          console.log(`\n  [${detection.detection_index}] Step 3: Saving best match to DB...`);
          console.log(`     💾 Saving: ${bestMatch.product_name} (GTIN: ${bestMatch.product_gtin})`);
          
          const { error: updateError } = await supabase
            .from('branghunt_detections')
            .update({
              selected_foodgraph_gtin: bestMatch.product_gtin,
              selected_foodgraph_product_name: bestMatch.product_name,
              selected_foodgraph_brand_name: bestMatch.brand_name,
              selected_foodgraph_category: bestMatch.category,
              selected_foodgraph_image_url: bestMatch.front_image_url,
              fully_analyzed: true,
              analysis_completed_at: new Date().toISOString()
            })
            .eq('id', detection.id);

          if (updateError) {
            throw new Error(`Database update failed: ${updateError.message}`);
          }

          result.status = 'success';
          result.savedMatch = {
            productName: (bestMatch.product_name || 'Unknown') as string,
            brandName: (bestMatch.brand_name || 'Unknown') as string,
            gtin: (bestMatch.product_gtin || 'Unknown') as string,
            imageUrl: (bestMatch.front_image_url || '') as string
          };

          console.log(`  ✅ [${detection.detection_index}] Saved match: ${bestMatch.product_name}`);
        } else {
          result.status = 'no_match';
          result.error = 'No matching product found after AI filtering';
          console.log(`  ⚠️ [${detection.detection_index}] No AI match found`);
        }

      } catch (error) {
        console.error(`  ❌ [${detection.detection_index}] Error:`, error);
        result.error = error instanceof Error ? error.message : 'Unknown error';
        result.status = 'error';
      }

      results.push(result);

      // Add delay between products (10 seconds for FoodGraph API)
      if (i < detectionsToProcess.length - 1) {
        console.log(`  ⏳ Waiting 10s before next product...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const noMatchCount = results.filter(r => r.status === 'no_match').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`✅ Batch search & save complete: ${successCount} saved, ${noMatchCount} no match, ${errorCount} errors`);

    return NextResponse.json({
      message: 'Batch search & save complete',
      total: detectionsToProcess.length,
      totalAvailable: detections.length,
      success: successCount,
      noMatch: noMatchCount,
      errors: errorCount,
      results: results
    });

  } catch (error) {
    console.error('Batch search & save error:', error);
    return NextResponse.json({ 
      error: 'Failed to search and save',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 300 second timeout for sequential processing with delays
// (120 products × 10s delay + ~3s processing per product = ~1560s, but capped at Vercel max 300s)
export const maxDuration = 300;
export const runtime = 'nodejs';

