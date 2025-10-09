import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { detectProducts, extractBrandName } from '@/lib/gemini';
import { searchProducts, getFrontImageUrl } from '@/lib/foodgraph';

export async function POST(request: NextRequest) {
  try {
    const { imageId } = await request.json();

    if (!imageId) {
      return NextResponse.json({ error: 'No imageId provided' }, { status: 400 });
    }

    // Fetch image from database
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Update status to processing
    await supabase
      .from('branghunt_images')
      .update({ processing_status: 'processing' })
      .eq('id', imageId);

    const imageBase64 = image.file_path;
    const mimeType = image.mime_type || 'image/jpeg';

    // Step 1: Detect products using Gemini
    let detections;
    try {
      detections = await detectProducts(imageBase64, mimeType);
    } catch (error) {
      await supabase
        .from('branghunt_images')
        .update({ processing_status: 'error_detection' })
        .eq('id', imageId);
      throw error;
    }

    console.log(`Detected ${detections.length} products`);

    // Limit to first 5 products for processing
    const maxProducts = 5;
    const productsToProcess = detections.slice(0, maxProducts);
    console.log(`Processing first ${productsToProcess.length} products (limit: ${maxProducts})`);

    // Process each detection
    for (let i = 0; i < productsToProcess.length; i++) {
      const detection = productsToProcess[i];
      
      // Convert normalized coordinates to bounding box object
      const boundingBox = {
        y0: detection.box_2d[0],
        x0: detection.box_2d[1],
        y1: detection.box_2d[2],
        x1: detection.box_2d[3],
      };

      // Step 2: Extract brand name using Gemini
      let brandName;
      try {
        brandName = await extractBrandName(imageBase64, mimeType, boundingBox);
      } catch (error) {
        console.error(`Failed to extract brand for detection ${i}:`, error);
        brandName = detection.label; // Fallback to label
      }

      // Save detection to database
      const { data: detectionData, error: detectionError } = await supabase
        .from('branghunt_detections')
        .insert({
          image_id: imageId,
          detection_index: i,
          bounding_box: boundingBox,
          confidence_score: null,
          brand_name: brandName,
          brand_extraction_prompt: `Brand extraction for: ${detection.label}`,
          brand_extraction_response: brandName,
        })
        .select()
        .single();

      if (detectionError) {
        console.error('Failed to save detection:', detectionError);
        continue;
      }

      // Step 3: Search FoodGraph for products
      try {
        const searchTerm = brandName !== 'Unknown' ? brandName : detection.label;
        const products = await searchProducts(searchTerm);
        
        console.log(`Found ${products.length} products for "${searchTerm}"`);

        // Save top 50 results (API already limits to 50)
        for (let rank = 0; rank < products.length; rank++) {
          const product = products[rank];
          const frontImageUrl = getFrontImageUrl(product);

          await supabase
            .from('branghunt_foodgraph_results')
            .insert({
              detection_id: detectionData.id,
              search_term: searchTerm,
              result_rank: rank + 1,
              product_gtin: product.gtin || null,
              product_name: product.name || null,
              brand_name: product.brand || null,
              category: product.category || null,
              front_image_url: frontImageUrl,
              full_data: product,
            });
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to search FoodGraph for detection ${i}:`, error);
        continue;
      }
    }

    // Update image status to processed
    await supabase
      .from('branghunt_images')
      .update({ 
        processing_status: 'completed',
        processed: true 
      })
      .eq('id', imageId);

    return NextResponse.json({ 
      success: true,
      detectionsCount: productsToProcess.length,
      totalDetected: detections.length,
      message: `Image processed successfully (${productsToProcess.length} of ${detections.length} products processed)` 
    });
  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json({ 
      error: 'Processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Increase timeout for processing multiple detections
export const maxDuration = 60; // 60 seconds for batch processing

// Explicitly set runtime to nodejs (required for maxDuration > 10s with Fluid Compute)
export const runtime = 'nodejs';

