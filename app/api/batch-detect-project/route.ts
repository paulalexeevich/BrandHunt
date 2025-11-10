import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { detectProducts } from '@/lib/gemini';
import { getImageBase64ForProcessing, getImageMimeType } from '@/lib/image-processor';

export const maxDuration = 300; // 5 minutes for batch processing

interface DetectionResult {
  imageId: string;
  originalFilename: string;
  status: 'success' | 'error';
  detectionsCount?: number;
  error?: string;
}

/**
 * POST /api/batch-detect-project
 * Run product detection on multiple undetected images in a project
 * Processes images in parallel with configurable concurrency
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, concurrency = 3 } = await request.json();

    if (!projectId) {
      return NextResponse.json({ 
        error: 'Missing projectId parameter' 
      }, { status: 400 });
    }

    console.log(`🚀 Starting batch detection for project ${projectId} with concurrency ${concurrency}...`);

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch all images that haven't been detected yet
    const { data: images, error: imagesError } = await supabase
      .from('branghunt_images')
      .select('id, original_filename, file_path, s3_url, storage_type, mime_type')
      .eq('project_id', projectId)
      .or('detection_completed.is.null,detection_completed.eq.false')
      .order('created_at');

    if (imagesError) {
      console.error('Error fetching images:', imagesError);
      return NextResponse.json({ 
        error: 'Failed to fetch images',
        details: imagesError.message 
      }, { status: 500 });
    }

    if (!images || images.length === 0) {
      return NextResponse.json({
        message: 'No images to detect',
        processed: 0,
        results: []
      });
    }

    console.log(`📸 Found ${images.length} images to process`);

    // Process images with controlled concurrency
    const results: DetectionResult[] = [];
    
    for (let i = 0; i < images.length; i += concurrency) {
      const batch = images.slice(i, i + concurrency);
      console.log(`\n📦 Processing batch ${Math.floor(i/concurrency) + 1}/${Math.ceil(images.length/concurrency)} (${batch.length} images)...`);
      
      const batchResults = await Promise.all(
        batch.map(async (image) => {
          const result: DetectionResult = {
            imageId: image.id,
            originalFilename: image.original_filename,
            status: 'error'
          };

          try {
            console.log(`  🔍 Detecting products in ${image.original_filename}...`);
            
            // Update status to detecting
            await supabase
              .from('branghunt_images')
              .update({ processing_status: 'detecting' })
              .eq('id', image.id);

            // Get image data (handles both S3 URLs and base64 storage)
            const imageBase64 = await getImageBase64ForProcessing(image);
            const mimeType = getImageMimeType(image);

            // Run detection
            const detections = await detectProducts(imageBase64, mimeType);

            if (!detections || detections.length === 0) {
              console.log(`  ℹ️  No products detected in ${image.original_filename}`);
              
              // Mark as completed even with no detections
              await supabase
                .from('branghunt_images')
                .update({ 
                  detection_completed: true,
                  detection_completed_at: new Date().toISOString(),
                  processing_status: 'completed',
                  status: 'detected'
                })
                .eq('id', image.id);

              result.status = 'success';
              result.detectionsCount = 0;
              return result;
            }

            // Save detections to database
            const detectionsToInsert = detections.map((detection, index) => ({
              image_id: image.id,
              detection_index: index,
              label: detection.label,
              bounding_box: detection.bounding_box,
              confidence: detection.confidence,
            }));

            const { error: insertError } = await supabase
              .from('branghunt_detections')
              .insert(detectionsToInsert);

            if (insertError) {
              console.error(`  ❌ Failed to save detections for ${image.original_filename}:`, insertError);
              throw new Error(`Failed to save detections: ${insertError.message}`);
            }

            // Mark detection as completed
            await supabase
              .from('branghunt_images')
              .update({ 
                detection_completed: true,
                detection_completed_at: new Date().toISOString(),
                processing_status: 'completed',
                status: 'detected'
              })
              .eq('id', image.id);

            console.log(`  ✅ Detected ${detections.length} products in ${image.original_filename}`);
            
            result.status = 'success';
            result.detectionsCount = detections.length;
            return result;

          } catch (error) {
            console.error(`  ❌ Error detecting ${image.original_filename}:`, error);
            
            // Update status to error
            await supabase
              .from('branghunt_images')
              .update({ processing_status: 'error' })
              .eq('id', image.id);

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
    const totalDetections = results.reduce((sum, r) => sum + (r.detectionsCount || 0), 0);

    console.log(`\n✅ Batch detection complete: ${successful} successful, ${failed} failed, ${totalDetections} total detections`);

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
    console.error('Error in batch detection:', error);
    return NextResponse.json({ 
      error: 'Batch detection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

