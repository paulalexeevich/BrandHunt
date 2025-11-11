import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { extractProductInfo } from '@/lib/gemini';
import { getImageBase64ForProcessing, getImageMimeType } from '@/lib/image-processor';

// Enable Node.js runtime for streaming support
export const runtime = 'nodejs';
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
 * Returns streaming progress updates
 */
interface DetectionWithImage {
  detection: any;
  imageData: {
    id: string;
    file_path: string | null;
    s3_url: string | null;
    storage_type: string;
    mime_type: string | null;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, concurrency = 300 } = await request.json();  // Testing 300 concurrent detections (~3000 RPM - pushing limits!)

    if (!projectId) {
      return NextResponse.json({ 
        error: 'Missing projectId parameter' 
      }, { status: 400 });
    }

    console.log(`📋 Starting DETECTION-LEVEL batch extraction for project ${projectId} with concurrency ${concurrency}...`);

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch all images that have detections
    const { data: images, error: imagesError } = await supabase
      .from('branghunt_images')
      .select('*')
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

    // Fetch ALL detections from ALL images that need extraction
    console.log(`🔍 Fetching all detections needing extraction...`);
    const { data: allDetections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .in('image_id', images.map(img => img.id))
      .is('brand_name', null)
      .or('is_product.is.null,is_product.eq.true')
      .order('image_id', { ascending: true })
      .order('detection_index', { ascending: true });

    if (detectionsError) {
      console.error('❌ Error fetching detections:', detectionsError);
      return NextResponse.json({ 
        error: 'Failed to fetch detections',
        details: detectionsError.message 
      }, { status: 500 });
    }

    if (!allDetections || allDetections.length === 0) {
      console.log(`ℹ️  No detections need extraction`);
      return NextResponse.json({
        message: 'No detections to process',
        processed: 0,
        results: []
      });
    }

    const totalDetectionsToExtract = allDetections.length;
    console.log(`📊 Total detections to extract: ${totalDetectionsToExtract}`);

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Send initial progress
          sendProgress({
            type: 'start',
            totalDetections: totalDetectionsToExtract,
            processedDetections: 0,
            message: `Starting extraction for ${totalDetectionsToExtract} detections across ${images.length} images...`
          });

          // Create image lookup map for fast access
          const imageMap = new Map(images.map(img => [img.id, img]));

          // Process detections with high concurrency (detection-level parallelism)
          let processedDetectionsCount = 0;
          let successfulDetections = 0;
          let failedDetections = 0;
          
          // Process all detections in batches with high concurrency
          for (let i = 0; i < allDetections.length; i += concurrency) {
            const batch = allDetections.slice(i, i + concurrency);
            const batchNum = Math.floor(i/concurrency) + 1;
            const totalBatches = Math.ceil(allDetections.length/concurrency);
            
            console.log(`\n📦 Processing detection batch ${batchNum}/${totalBatches} (${batch.length} detections)...`);
            
            // Start all detections in batch processing in parallel
            const batchPromises = batch.map(async (detection) => {
              const image = imageMap.get(detection.image_id);
              if (!image) {
                console.error(`❌ Image not found for detection ${detection.id}`);
                return { success: false, detection_id: detection.id };
              }

              try {
                // Get image data (cached in memory if same image)
                const { getImageBase64ForProcessing, getImageMimeType } = await import('@/lib/image-processor');
                const imageBase64 = await getImageBase64ForProcessing(image);
                const mimeType = getImageMimeType(image);
                
                // Extract product info using Gemini
                const productInfo = await extractProductInfo(
                  imageBase64,
                  mimeType,
                  detection.bounding_box,
                  projectId
                );

                // Save to database
                const { error: updateError } = await supabase
                  .from('branghunt_detections')
                  .update({
                    is_product: productInfo.isProduct,
                    extraction_notes: productInfo.extractionNotes || null,
                    brand_name: productInfo.brand,
                    product_name: productInfo.productName,
                    category: productInfo.category,
                    flavor: productInfo.flavor,
                    size: productInfo.size,
                    brand_confidence: productInfo.brandConfidence,
                    product_name_confidence: productInfo.productNameConfidence,
                    category_confidence: productInfo.categoryConfidence,
                    flavor_confidence: productInfo.flavorConfidence,
                    size_confidence: productInfo.sizeConfidence,
                    brand_extraction_response: JSON.stringify(productInfo),
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', detection.id);

                if (updateError) {
                  throw new Error(`Database update failed: ${updateError.message}`);
                }

                return { 
                  success: true, 
                  detection_id: detection.id,
                  image_id: detection.image_id,
                  detection_index: detection.detection_index
                };

              } catch (error) {
                console.error(`❌ Detection ${detection.id} error:`, error);
                return { 
                  success: false, 
                  detection_id: detection.id,
                  error: error instanceof Error ? error.message : 'Unknown error'
                };
              }
            });

            // Await each detection sequentially to send progress updates
            for (const promise of batchPromises) {
              const result = await promise;
              processedDetectionsCount++;
              
              if (result.success) {
                successfulDetections++;
              } else {
                failedDetections++;
              }

              // Send progress update after EACH detection
              sendProgress({
                type: 'progress',
                totalDetections: totalDetectionsToExtract,
                processedDetections: processedDetectionsCount,
                successful: successfulDetections,
                failed: failedDetections,
                message: `Processed ${processedDetectionsCount}/${totalDetectionsToExtract} detections (${successfulDetections} successful, ${failedDetections} failed)`
              });
            }
          }

          console.log(`\n✅ Detection-level batch extraction complete: ${successfulDetections} successful, ${failedDetections} failed, ${processedDetectionsCount} total processed`);
          console.log(`   Project: ${projectId}, Concurrency: ${concurrency}, Rate: ~${Math.round(concurrency * 60 / 2)} RPM`);

          // Send completion message
          sendProgress({
            type: 'complete',
            totalDetections: totalDetectionsToExtract,
            processedDetections: processedDetectionsCount,
            summary: {
              totalDetections: processedDetectionsCount,
              successful: successfulDetections,
              failed: failedDetections
            },
            message: `Completed: ${successfulDetections}/${processedDetectionsCount} detections successful (${failedDetections} failed)`
          });

          controller.close();
        } catch (error) {
          console.error('Error in batch extraction:', error);
          sendProgress({
            type: 'error',
            error: 'Batch extraction failed',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in batch extraction:', error);
    return NextResponse.json({ 
      error: 'Batch extraction failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

