import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { extractProductInfo } from '@/lib/gemini';
import { getImageBase64ForProcessing, getImageMimeType } from '@/lib/image-processor';

export const maxDuration = 300; // 5 minutes for batch processing

interface ExtractionResult {
  imageId: string;
  originalFilename: string;
  status: 'success' | 'error';
  processedDetections?: number;
  error?: string;
}

/**
 * POST /api/batch-extract-project
 * Extract product info (brand, name, description) from detected products across multiple images
 * Processes images in parallel with configurable concurrency
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, concurrency = 15 } = await request.json();

    if (!projectId) {
      return NextResponse.json({ 
        error: 'Missing projectId parameter' 
      }, { status: 400 });
    }

    console.log(`📋 Starting batch info extraction for project ${projectId} with concurrency ${concurrency}...`);

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch all images that have detections but haven't had info extracted yet
    const { data: images, error: imagesError } = await supabase
      .from('branghunt_images')
      .select(`
        id,
        original_filename,
        file_path,
        s3_url,
        storage_type,
        mime_type
      `)
      .eq('project_id', projectId)
      .eq('detection_completed', true)
      .order('created_at');

    if (imagesError) {
      console.error('❌ Error fetching images:', imagesError);
      return NextResponse.json({ 
        error: 'Failed to fetch images',
        details: imagesError.message 
      }, { status: 500 });
    }

    if (!images || images.length === 0) {
      console.log(`⚠️  No images found for project ${projectId} with detection_completed=true`);
      return NextResponse.json({
        message: 'No images with detections found',
        processed: 0,
        results: []
      });
    }

    console.log(`📸 Found ${images.length} images with detections for project ${projectId}`);

    // Process images with controlled concurrency
    const results: ExtractionResult[] = [];
    
    for (let i = 0; i < images.length; i += concurrency) {
      const batch = images.slice(i, i + concurrency);
      console.log(`\n📦 Processing batch ${Math.floor(i/concurrency) + 1}/${Math.ceil(images.length/concurrency)} (${batch.length} images)...`);
      
      const batchResults = await Promise.all(
        batch.map(async (image) => {
          const result: ExtractionResult = {
            imageId: image.id,
            originalFilename: image.original_filename,
            status: 'error'
          };

          try {
            console.log(`  📋 Extracting info from ${image.original_filename} (image_id: ${image.id})...`);

            // Fetch detections that don't have brand info yet
            const { data: detections, error: detectionsError } = await supabase
              .from('branghunt_detections')
              .select('*')
              .eq('image_id', image.id)
              .is('brand_name', null)
              .order('detection_index');

            if (detectionsError) {
              console.error(`  ❌ Error fetching detections:`, detectionsError);
              throw new Error(`Failed to fetch detections: ${detectionsError.message}`);
            }

            console.log(`  🔍 Found ${detections?.length || 0} detections needing extraction for ${image.original_filename}`);

            if (!detections || detections.length === 0) {
              console.log(`  ℹ️  No unprocessed detections in ${image.original_filename} (all already have brand_name)`);
              result.status = 'success';
              result.processedDetections = 0;
              return result;
            }

            console.log(`  📦 Extracting info for ${detections.length} detections in parallel...`);

            // Get image data once (handles both S3 URLs and base64 storage)
            const imageBase64 = await getImageBase64ForProcessing(image);
            const mimeType = getImageMimeType(image);

            // Process all detections in parallel for this image
            let successCount = 0;
            let extractionErrors = 0;
            let dbUpdateErrors = 0;
            
            await Promise.all(
              detections.map(async (detection, idx) => {
                try {
                  // Call Gemini API to extract product info
                  const productInfo = await extractProductInfo(
                    imageBase64,
                    mimeType,
                    detection.bounding_box
                  );

                  // Save to database
                  const { error: updateError } = await supabase
                    .from('branghunt_detections')
                    .update({
                      brand_name: productInfo.brand || null,
                      product_name: productInfo.productName || null,
                      product_description: productInfo.description || null,
                      brand_extracted: true,
                      brand_extracted_at: new Date().toISOString(),
                      brand_confidence: productInfo.brandConfidence,
                      product_name_confidence: productInfo.productNameConfidence,
                      description_confidence: productInfo.descriptionConfidence,
                    })
                    .eq('id', detection.id);

                  if (updateError) {
                    console.error(`    ❌ DB update failed for detection ${detection.detection_index}:`, updateError.message);
                    dbUpdateErrors++;
                  } else {
                    successCount++;
                  }
                } catch (error) {
                  console.error(`    ❌ Extraction failed for detection ${detection.detection_index}:`, error instanceof Error ? error.message : 'Unknown error');
                  extractionErrors++;
                }
              })
            );

            console.log(`  ✅ Extracted info for ${successCount}/${detections.length} detections in ${image.original_filename} (${extractionErrors} Gemini errors, ${dbUpdateErrors} DB errors)`);
            
            result.status = 'success';
            result.processedDetections = successCount;
            return result;

          } catch (error) {
            console.error(`  ❌ Error processing ${image.original_filename}:`, error);
            result.error = error instanceof Error ? error.message : 'Unknown error';
            return result;
          }
        })
      );

      results.push(...batchResults);
    }

    // Calculate summary
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    const totalDetections = results.reduce((sum, r) => sum + (r.processedDetections || 0), 0);

    console.log(`\n✅ Batch extraction complete: ${successful}/${results.length} images successful, ${failed} failed, ${totalDetections} total detections processed`);
    console.log(`   Project: ${projectId}, Concurrency: ${concurrency}`);

    return NextResponse.json({
      message: `Processed ${results.length} images`,
      summary: {
        total: results.length,
        successful,
        failed,
        totalDetections
      },
      results
    });

  } catch (error) {
    console.error('Error in batch extraction:', error);
    return NextResponse.json({ 
      error: 'Batch extraction failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

