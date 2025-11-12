import { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getImageBase64ForProcessing, getImageMimeType } from '@/lib/image-processor';

// Enable Node.js runtime for streaming support
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for batch processing

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

interface BoundingBox {
  y0: number;
  x0: number;
  y1: number;
  x1: number;
}

interface Detection {
  id: string;
  image_id: string;
  detection_index: number;
  bounding_box: BoundingBox;
  brand_name: string | null;
  brand_confidence: number | null;
  product_name: string | null;
  size: string | null;
  size_confidence: number | null;
  is_product: boolean | null;
}

/**
 * Find neighboring detections on the same shelf
 */
function findNeighbors(
  targetDetection: Detection,
  allDetections: Detection[]
): { left: Detection[]; right: Detection[] } {
  const targetBox = targetDetection.bounding_box;
  const targetCenterY = (targetBox.y0 + targetBox.y1) / 2;
  const targetHeight = targetBox.y1 - targetBox.y0;
  const yTolerance = targetHeight * 0.3;
  const maxHorizontalDistance = 500;
  
  const neighbors = allDetections
    .filter(det => det.id !== targetDetection.id)
    .filter(det => {
      const centerY = (det.bounding_box.y0 + det.bounding_box.y1) / 2;
      return Math.abs(centerY - targetCenterY) <= yTolerance;
    });
  
  const left = neighbors
    .filter(det => det.bounding_box.x1 <= targetBox.x0)
    .filter(det => targetBox.x0 - det.bounding_box.x1 <= maxHorizontalDistance)
    .sort((a, b) => b.bounding_box.x1 - a.bounding_box.x1)
    .slice(0, 3);
  
  const right = neighbors
    .filter(det => det.bounding_box.x0 >= targetBox.x1)
    .filter(det => det.bounding_box.x0 - targetBox.x1 <= maxHorizontalDistance)
    .sort((a, b) => a.bounding_box.x0 - b.bounding_box.x0)
    .slice(0, 3);
  
  return { left, right };
}

/**
 * Calculate expanded bounding box
 */
function calculateExpandedBox(
  targetBox: BoundingBox,
  leftNeighbors: Detection[],
  rightNeighbors: Detection[]
): BoundingBox {
  const boxes = [
    targetBox,
    ...leftNeighbors.map(d => d.bounding_box),
    ...rightNeighbors.map(d => d.bounding_box),
  ];
  
  return {
    y0: Math.min(...boxes.map(b => b.y0)),
    x0: Math.min(...boxes.map(b => b.x0)),
    y1: Math.max(...boxes.map(b => b.y1)),
    x1: Math.max(...boxes.map(b => b.x1)),
  };
}

/**
 * Extract crop from image (server-side using sharp)
 */
async function extractExpandedCrop(
  imageBase64: string,
  expandedBox: BoundingBox
): Promise<string> {
  const sharp = (await import('sharp')).default;
  
  // Convert base64 to buffer
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  
  // Get image metadata
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  
  // Convert normalized coordinates (0-1000) to actual pixels
  const left = Math.floor((expandedBox.x0 / 1000) * width);
  const top = Math.floor((expandedBox.y0 / 1000) * height);
  const cropWidth = Math.floor(((expandedBox.x1 - expandedBox.x0) / 1000) * width);
  const cropHeight = Math.floor(((expandedBox.y1 - expandedBox.y0) / 1000) * height);
  
  // Ensure coordinates are within bounds
  const safeLeft = Math.max(0, Math.min(left, width - 1));
  const safeTop = Math.max(0, Math.min(top, height - 1));
  const safeWidth = Math.min(cropWidth, width - safeLeft);
  const safeHeight = Math.min(cropHeight, height - safeTop);
  
  // Extract and convert to base64
  const croppedBuffer = await sharp(imageBuffer)
    .extract({
      left: safeLeft,
      top: safeTop,
      width: safeWidth,
      height: safeHeight
    })
    .jpeg()
    .toBuffer();
  
  return croppedBuffer.toString('base64');
}

/**
 * Run contextual analysis using Gemini (V1 prompt only)
 */
async function analyzeWithContext(
  expandedCropBase64: string,
  targetDetection: Detection,
  leftNeighbors: Detection[],
  rightNeighbors: Detection[]
): Promise<any> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured');
  }
  
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  // Build context about neighbors
  const leftContext = leftNeighbors.slice(0, 3).map((det, i) => 
    `${i + 1}. Brand: ${det.brand_name || 'unknown'}, Size: ${det.size || 'unknown'}`
  ).join('\n  ');
  
  const rightContext = rightNeighbors.slice(0, 3).map((det, i) => 
    `${i + 1}. Brand: ${det.brand_name || 'unknown'}, Size: ${det.size || 'unknown'}`
  ).join('\n  ');
  
  // Use V1 prompt (most detailed)
  const prompt = `You are analyzing a retail shelf image. The image shows multiple products arranged horizontally on a shelf.

The MIDDLE/CENTER product (the one we're trying to identify) has these known attributes:
- Brand: ${targetDetection.brand_name || 'UNKNOWN or partially hidden'}
- Product Name: ${targetDetection.product_name || 'UNKNOWN'}
- Size: ${targetDetection.size || 'UNKNOWN'}

Products to the LEFT of the target:
  ${leftContext || 'None visible'}

Products to the RIGHT of the target:
  ${rightContext || 'None visible'}

TASK: Analyze the CENTER/MIDDLE product in the image and use the context of neighboring products to infer:
1. **Brand**: Look for visual patterns (logos, colors, packaging style) similar to neighbors. If brand X is on both sides, there's a high probability the center product is also brand X.
2. **Size**: If neighboring products have the same physical dimensions and form factor, they likely have the same size.
3. **Visual Similarity**: Describe how the center product compares visually to its neighbors (packaging style, colors, shape).

Return your analysis in JSON format:
{
  "inferred_brand": "Brand name based on context and visual analysis",
  "brand_confidence": 0.0-1.0,
  "brand_reasoning": "Why you think this is the brand",
  "inferred_size": "Size/measure based on neighbors or visual estimation",
  "size_confidence": 0.0-1.0,
  "size_reasoning": "Why you think this is the size",
  "visual_similarity": {
    "left_similarity": 0.0-1.0,
    "right_similarity": 0.0-1.0,
    "description": "How visually similar is the center product to its neighbors"
  },
  "overall_confidence": 0.0-1.0,
  "notes": "Any additional observations"
}`;
  
  const imagePart = {
    inlineData: {
      data: expandedCropBase64,
      mimeType: 'image/jpeg',
    },
  };
  
  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const text = response.text();
  
  // Parse JSON from response
  try {
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonText);
  } catch (e) {
    console.error('❌ JSON parse error:', e instanceof Error ? e.message : e);
    console.error('   Raw response (first 500 chars):', text.substring(0, 500));
    return { raw_response: text, parse_error: true };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, concurrency = 10 } = await request.json();

    if (!projectId) {
      const encoder = new TextEncoder();
      return new Response(
        encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Missing projectId parameter' })}\n\n`),
        { status: 400, headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

    console.log(`🔬 Starting DETECTION-LEVEL batch contextual analysis for project ${projectId} with concurrency ${concurrency}...`);

    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch all images in the project
    const { data: images, error: imagesError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');

    if (imagesError || !images || images.length === 0) {
      const encoder = new TextEncoder();
      return new Response(
        encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'No images found in project' })}\n\n`),
        { status: 404, headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

    console.log(`📸 Found ${images.length} images in project`);

    // Fetch ALL detections from ALL images
    const { data: allDetections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .in('image_id', images.map(img => img.id))
      .not('brand_name', 'is', null)  // Must have brand_name (extraction completed)
      .order('image_id', { ascending: true })
      .order('detection_index', { ascending: true });

    if (detectionsError) {
      const encoder = new TextEncoder();
      return new Response(
        encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Failed to fetch detections' })}\n\n`),
        { status: 500, headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

    if (!allDetections || allDetections.length === 0) {
      const encoder = new TextEncoder();
      return new Response(
        encoder.encode(`data: ${JSON.stringify({ type: 'complete', message: 'No detections with extracted info found' })}\n\n`),
        { headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

    // Filter detections that need contextual analysis
    const detectionsToProcess = allDetections.filter(det => {
      if (det.is_product === false) return false;
      
      const brandUnknown = det.brand_name?.toLowerCase() === 'unknown';
      const lowConfidence = det.brand_confidence !== null && det.brand_confidence < 0.91;
      
      return brandUnknown || lowConfidence;
    });

    const totalToProcess = detectionsToProcess.length;
    console.log(`📊 Total detections to analyze: ${totalToProcess} (out of ${allDetections.length} total)`);
    console.log(`   - Unknown brand: ${detectionsToProcess.filter(d => d.brand_name?.toLowerCase() === 'unknown').length}`);
    console.log(`   - Low confidence (<91%): ${detectionsToProcess.filter(d => d.brand_confidence !== null && d.brand_confidence < 0.91 && d.brand_name?.toLowerCase() !== 'unknown').length}`);

    // Create streaming response
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
            totalDetections: totalToProcess,
            processedDetections: 0,
            message: `Starting contextual analysis for ${totalToProcess} detections across ${images.length} images...`
          });

          if (totalToProcess === 0) {
            sendProgress({
              type: 'complete',
              totalDetections: 0,
              processedDetections: 0,
              summary: { successful: 0, skipped: 0, failed: 0 },
              message: 'All products have high-confidence brands (≥91%)'
            });
            controller.close();
            return;
          }

          // Create image lookup map
          const imageMap = new Map(images.map(img => [img.id, img]));
          
          // Create detections-by-image map for neighbor lookup
          const detectionsByImage = new Map<string, Detection[]>();
          allDetections.forEach(det => {
            if (!detectionsByImage.has(det.image_id)) {
              detectionsByImage.set(det.image_id, []);
            }
            detectionsByImage.get(det.image_id)!.push(det);
          });

          // PRE-LOAD all image data to avoid loading same image multiple times
          console.log('📸 Pre-loading image data for all images...');
          const imageDataCache = new Map<string, string>();
          for (const image of images) {
            try {
              const imageBase64 = await getImageBase64ForProcessing(image);
              imageDataCache.set(image.id, imageBase64);
            } catch (error) {
              console.error(`❌ Failed to load image ${image.id}:`, error);
            }
          }
          console.log(`✅ Loaded ${imageDataCache.size}/${images.length} images into cache`);

          let processedCount = 0;
          let correctedCount = 0;
          let skippedCount = 0;
          let errorCount = 0;

          // Process detections with concurrency
          for (let i = 0; i < detectionsToProcess.length; i += concurrency) {
            const batch = detectionsToProcess.slice(i, i + concurrency);
            const batchNum = Math.floor(i/concurrency) + 1;
            const totalBatches = Math.ceil(detectionsToProcess.length/concurrency);
            
            console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} detections)...`);
            
            // Start all detections in batch in parallel
            const batchPromises = batch.map(async (detection) => {
              console.log(`🔍 [#${detection.detection_index}] Starting detection ${detection.id}`);
              
              const image = imageMap.get(detection.image_id);
              if (!image) {
                console.error(`❌ [#${detection.detection_index}] Image not found for detection ${detection.id}`);
                return { success: false, skipped: false, error: 'Image not found' };
              }
              console.log(`   ✓ Image found`);

              try {
                // Get all detections for this image (for neighbors)
                const imageDetections = detectionsByImage.get(detection.image_id) || [];
                console.log(`   ✓ Found ${imageDetections.length} detections for image`);
                
                // Find neighbors
                const { left, right } = findNeighbors(detection, imageDetections);
                console.log(`   ✓ Found ${left.length} left, ${right.length} right neighbors`);
                
                if (left.length === 0 && right.length === 0) {
                  console.log(`   ⚠️ No neighbors, skipping`);
                  return { success: false, skipped: true };
                }

                // Get image data from cache
                const imageBase64 = imageDataCache.get(detection.image_id);
                if (!imageBase64) {
                  console.error(`❌ [#${detection.detection_index}] Image data not in cache for detection ${detection.id}`);
                  return { success: false, skipped: false, error: 'Image data not loaded' };
                }
                console.log(`   ✓ Image data retrieved from cache (${Math.round(imageBase64.length / 1024)}KB)`);
                
                // Calculate expanded box
                const expandedBox = calculateExpandedBox(detection.bounding_box, left, right);
                console.log(`   ✓ Expanded box calculated: ${JSON.stringify(expandedBox)}`);
                
                // Extract expanded crop
                let expandedCropBase64;
                try {
                  console.log(`   🖼️  Extracting crop...`);
                  expandedCropBase64 = await extractExpandedCrop(imageBase64, expandedBox);
                  console.log(`   ✓ Crop extracted (${Math.round(expandedCropBase64.length / 1024)}KB)`);
                } catch (cropError) {
                  console.error(`❌ [#${detection.detection_index}] Crop extraction failed:`, cropError instanceof Error ? cropError.message : cropError);
                  console.error(`   Detection box:`, detection.bounding_box);
                  console.error(`   Expanded box:`, expandedBox);
                  return { success: false, skipped: false, error: 'Crop extraction failed' };
                }
                
                // Run contextual analysis
                let analysis;
                try {
                  console.log(`   🤖 Calling Gemini API...`);
                  analysis = await analyzeWithContext(expandedCropBase64, detection, left, right);
                  console.log(`   ✓ Gemini response received`);
                } catch (geminiError) {
                  console.error(`❌ [#${detection.detection_index}] Gemini API failed:`, geminiError instanceof Error ? geminiError.message : geminiError);
                  return { success: false, skipped: false, error: 'Gemini API failed' };
                }
                
                if (analysis.parse_error) {
                  console.error(`❌ [#${detection.detection_index}] Parse error:`, analysis.raw_response?.substring(0, 200));
                  return { success: false, skipped: false, error: 'Parse error' };
                }
                console.log(`   ✓ Analysis parsed: ${analysis.inferred_brand} (${Math.round((analysis.brand_confidence || 0) * 100)}%)`);


                // ALWAYS overwrite brand and size
                const updateData: any = {
                  contextual_brand: analysis.inferred_brand,
                  contextual_brand_confidence: analysis.brand_confidence,
                  contextual_brand_reasoning: analysis.brand_reasoning,
                  contextual_size: analysis.inferred_size,
                  contextual_size_confidence: analysis.size_confidence,
                  contextual_size_reasoning: analysis.size_reasoning,
                  contextual_overall_confidence: analysis.overall_confidence,
                  contextual_notes: analysis.notes,
                  contextual_prompt_version: 'v1',
                  contextual_analyzed_at: new Date().toISOString(),
                  contextual_left_neighbor_count: left.length,
                  contextual_right_neighbor_count: right.length,
                  corrected_by_contextual: true,
                  contextual_correction_notes: `Brand: "${detection.brand_name}" (${Math.round((detection.brand_confidence || 0) * 100)}%) → "${analysis.inferred_brand}" (${Math.round((analysis.brand_confidence || 0) * 100)}%); Size: "${detection.size || 'Unknown'}" → "${analysis.inferred_size}"`,
                  brand_name: analysis.inferred_brand,
                  brand_confidence: analysis.brand_confidence,
                  size: analysis.inferred_size,
                  size_confidence: analysis.size_confidence,
                };

                console.log(`   💾 Saving to database...`);
                const { error: updateError } = await supabase
                  .from('branghunt_detections')
                  .update(updateData)
                  .eq('id', detection.id);

                if (updateError) {
                  console.error(`❌ [#${detection.detection_index}] Database update failed:`, updateError.message);
                  console.error(`   Update data keys:`, Object.keys(updateData));
                  throw new Error(`Database update failed: ${updateError.message}`);
                }

                console.log(`   ✅ SUCCESS: Detection #${detection.detection_index} completed\n`);
                return { success: true, skipped: false };

              } catch (error) {
                console.error(`❌ Detection ${detection.id} (#${detection.detection_index}) error:`, error instanceof Error ? error.message : error);
                return { success: false, skipped: false, error: error instanceof Error ? error.message : 'Unknown error' };
              }
            });

            // Await each detection sequentially to send progress updates
            for (const promise of batchPromises) {
              const result = await promise;
              processedCount++;
              
              if (result.success) {
                correctedCount++;
              } else if (result.skipped) {
                skippedCount++;
              } else {
                errorCount++;
              }

              // Send progress update after EACH detection
              sendProgress({
                type: 'progress',
                totalDetections: totalToProcess,
                processedDetections: processedCount,
                corrected: correctedCount,
                skipped: skippedCount,
                failed: errorCount,
                message: `Analyzing: ${processedCount}/${totalToProcess} detections (${correctedCount} corrected, ${skippedCount} skipped, ${errorCount} errors)`
              });
            }
          }

          console.log(`\n✅ Batch contextual analysis complete: ${correctedCount} corrected, ${skippedCount} skipped, ${errorCount} errors`);

          // Send completion message
          sendProgress({
            type: 'complete',
            totalDetections: totalToProcess,
            processedDetections: processedCount,
            summary: {
              successful: correctedCount,
              skipped: skippedCount,
              failed: errorCount
            },
            message: `Completed: ${correctedCount}/${processedCount} brands corrected (${skippedCount} skipped, ${errorCount} errors)`
          });

          controller.close();
        } catch (error) {
          console.error('Error in batch contextual analysis:', error);
          sendProgress({
            type: 'error',
            error: 'Batch contextual analysis failed',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Batch contextual analysis error:', error);
    const encoder = new TextEncoder();
    return new Response(
      encoder.encode(`data: ${JSON.stringify({ 
        type: 'error',
        error: 'Batch contextual analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      })}\n\n`),
      { 
        status: 500,
        headers: { 'Content-Type': 'text/event-stream' }
      }
    );
  }
}

