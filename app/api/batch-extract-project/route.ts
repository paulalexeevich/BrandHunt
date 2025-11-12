import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { extractProductInfo } from '@/lib/gemini';
import { getImageBase64ForProcessing, getImageMimeType } from '@/lib/image-processor';
import { createSSEResponse, BatchProcessor, CumulativeStats, validateConcurrency } from '@/lib/batch-processor';
import { fetchDetectionsByProject, fetchImagesForDetections } from '@/lib/batch-queries';

// Enable Node.js runtime for streaming support
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for batch processing

const MAX_CONCURRENCY = 300;
const DEFAULT_CONCURRENCY = 150;

interface DetectionResult {
  success: boolean;
  detectionId: string;
  imageId: string;
  detectionIndex: number;
  error?: string;
}

/**
 * POST /api/batch-extract-project
 * Extract product info (brand, name, description) from detected products across multiple images
 * 
 * REFACTORED to use Phase 1 utilities:
 * - createSSEResponse() for streaming
 * - BatchProcessor for concurrent processing
 * - fetchDetectionsByProject() for queries
 * - CumulativeStats for tracking
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, concurrency } = await request.json();

    if (!projectId) {
      return NextResponse.json({ 
        error: 'Missing projectId parameter' 
      }, { status: 400 });
    }

    const effectiveConcurrency = validateConcurrency(concurrency, DEFAULT_CONCURRENCY, MAX_CONCURRENCY);
    console.log(`📋 Starting batch extraction for project ${projectId} (concurrency: ${effectiveConcurrency})`);

    const supabase = await createAuthenticatedSupabaseClient();

    // Use utility to fetch detections
    const { detections, imageMap, imageIds } = await fetchDetectionsByProject(
      supabase,
      projectId,
      {
        isProduct: true,  // Include NULL (unclassified) and TRUE (products)
        hasExtractedInfo: false  // Only detections without brand_name
      }
    );

    if (detections.length === 0) {
      return NextResponse.json({
        message: 'No detections to process',
        processed: 0,
        results: []
      });
    }

    // Fetch image data for processing
    const images = await fetchImagesForDetections(supabase, imageIds);

    console.log(`📊 Found ${detections.length} detections across ${imageIds.length} images`);

    // Use SSE utility for streaming response
    return createSSEResponse(async (sendProgress) => {
      const stats = new CumulativeStats();

      sendProgress({
        type: 'start',
        totalDetections: detections.length,
        message: `Starting extraction for ${detections.length} detections...`
      });

      // Use BatchProcessor for concurrent processing
      const processor = new BatchProcessor<any, DetectionResult>({
        concurrency: effectiveConcurrency,
        onProgress: (result, processed, total) => {
          // Update stats
          if (result.success) stats.increment('success');
          else stats.increment('errors');

          const currentStats = stats.get();
          sendProgress({
            type: 'progress',
            totalDetections: total,
            processedDetections: processed,
            successful: currentStats.success,
            failed: currentStats.errors,
            message: `Processed ${processed}/${total} (${currentStats.success} successful, ${currentStats.errors} failed)`
          });
        }
      });

      // Process all detections
      await processor.process(detections, async (detection) => {
        return await processDetection(detection, images, supabase, projectId);
      });

      // Send completion
      const finalStats = stats.get();
      sendProgress({
        type: 'complete',
        totalDetections: detections.length,
        processedDetections: detections.length,
        summary: {
          totalDetections: detections.length,
          successful: finalStats.success,
          failed: finalStats.errors
        },
        message: `Completed: ${finalStats.success}/${detections.length} successful (${finalStats.errors} failed)`
      });

      console.log(`✅ Batch extraction complete: ${finalStats.success} successful, ${finalStats.errors} failed`);
    });

  } catch (error) {
    console.error('Error in batch extraction:', error);
    return NextResponse.json({ 
      error: 'Batch extraction failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Process a single detection
 * Extracted for clarity and testability
 */
async function processDetection(
  detection: any,
  imageMap: Map<string, any>,
  supabase: any,
  projectId: string
): Promise<DetectionResult> {
  const result: DetectionResult = {
    success: false,
    detectionId: detection.id,
    imageId: detection.image_id,
    detectionIndex: detection.detection_index
  };

  try {
    const image = imageMap.get(detection.image_id);
    if (!image) {
      throw new Error(`Image not found for detection ${detection.id}`);
    }

    // Get image data
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

    result.success = true;
    return result;

  } catch (error) {
    console.error(`❌ Detection ${detection.id} error:`, error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

