import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getImageBase64ForProcessing, getImageMimeType } from '@/lib/image-processor';

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
  detection_index: number;
  bounding_box: BoundingBox;
  brand_name: string | null;
  brand_confidence: number | null;
  product_name: string | null;
  size: string | null;
  size_confidence: number | null;
}

interface ContextualResult {
  detectionId: string;
  detectionIndex: number;
  status: 'success' | 'error' | 'skipped' | 'no_improvement';
  originalBrand?: string | null;
  originalBrandConfidence?: number | null;
  contextualBrand?: string;
  contextualBrandConfidence?: number;
  originalSize?: string | null;
  originalSizeConfidence?: number | null;
  contextualSize?: string;
  contextualSizeConfidence?: number;
  corrected?: boolean;
  correctionNotes?: string;
  error?: string;
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
    return { raw_response: text, parse_error: true };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { imageId } = await request.json();

    if (!imageId) {
      return NextResponse.json({ 
        error: 'Missing imageId parameter' 
      }, { status: 400 });
    }

    console.log(`🔬 Starting batch contextual analysis for image ${imageId}...`);

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

    // Fetch ALL detections for neighbor context
    const { data: allDetections, error: allDetectionsError } = await supabase
      .from('branghunt_detections')
      .select('id, detection_index, bounding_box, brand_name, brand_confidence, product_name, size, size_confidence')
      .eq('image_id', imageId)
      .order('detection_index');

    if (allDetectionsError || !allDetections) {
      return NextResponse.json({ 
        error: 'Failed to fetch detections',
        details: allDetectionsError?.message 
      }, { status: 500 });
    }

    // Filter detections that need contextual analysis:
    // - brand_name is 'Unknown' OR
    // - brand_confidence <= 90%
    const detectionsToProcess = allDetections.filter(det => {
      const brandUnknown = !det.brand_name || det.brand_name.toLowerCase() === 'unknown';
      const lowConfidence = det.brand_confidence !== null && det.brand_confidence <= 0.90;
      return brandUnknown || lowConfidence;
    });

    console.log(`📊 Found ${detectionsToProcess.length} detections needing contextual analysis (out of ${allDetections.length} total)`);
    console.log(`   - Low confidence (<=90%): ${detectionsToProcess.filter(d => d.brand_confidence !== null && d.brand_confidence <= 0.90).length}`);
    console.log(`   - Unknown brand: ${detectionsToProcess.filter(d => !d.brand_name || d.brand_name.toLowerCase() === 'unknown').length}`);

    if (detectionsToProcess.length === 0) {
      return NextResponse.json({
        message: 'No products need contextual analysis (all have high-confidence brands)',
        processed: 0,
        results: []
      });
    }

    // Get image data once for all detections
    const imageBase64 = await getImageBase64ForProcessing(image);
    const mimeType = getImageMimeType(image);

    // Process all detections in parallel
    const results: ContextualResult[] = await Promise.all(
      detectionsToProcess.map(async (detection) => {
        const result: ContextualResult = {
          detectionId: detection.id,
          detectionIndex: detection.detection_index,
          status: 'error',
          originalBrand: detection.brand_name,
          originalBrandConfidence: detection.brand_confidence,
          originalSize: detection.size,
          originalSizeConfidence: detection.size_confidence,
        };

        try {
          console.log(`  [${detection.detection_index}] Running contextual analysis...`);

          // Find neighbors
          const { left, right } = findNeighbors(detection, allDetections);
          
          if (left.length === 0 && right.length === 0) {
            console.log(`    [${detection.detection_index}] ⚠️ No neighbors found, skipping`);
            result.status = 'skipped';
            result.error = 'No neighbors found for context';
            return result;
          }

          console.log(`    [${detection.detection_index}] Found ${left.length} left, ${right.length} right neighbors`);

          // Calculate expanded box
          const expandedBox = calculateExpandedBox(
            detection.bounding_box,
            left,
            right
          );

          // Extract expanded crop
          const expandedCropBase64 = await extractExpandedCrop(imageBase64, expandedBox);

          // Run contextual analysis with Gemini
          const analysis = await analyzeWithContext(
            expandedCropBase64,
            detection,
            left,
            right
          );

          if (analysis.parse_error) {
            result.status = 'error';
            result.error = 'Failed to parse Gemini response';
            return result;
          }

          // Store contextual results
          result.contextualBrand = analysis.inferred_brand;
          result.contextualBrandConfidence = analysis.brand_confidence;
          result.contextualSize = analysis.inferred_size;
          result.contextualSizeConfidence = analysis.size_confidence;

          // Decide if we should overwrite
          let shouldCorrect = false;
          const correctionDetails: string[] = [];

          // Check brand
          if (result.contextualBrand && result.contextualBrandConfidence) {
            const originalConf = result.originalBrandConfidence || 0;
            const contextualConf = result.contextualBrandConfidence;
            
            if (contextualConf > originalConf) {
              shouldCorrect = true;
              correctionDetails.push(
                `Brand: "${result.originalBrand || 'Unknown'}" (${Math.round(originalConf * 100)}%) → "${result.contextualBrand}" (${Math.round(contextualConf * 100)}%)`
              );
            }
          }

          // Check size
          if (result.contextualSize && result.contextualSizeConfidence) {
            const originalConf = result.originalSizeConfidence || 0;
            const contextualConf = result.contextualSizeConfidence;
            
            if (contextualConf > originalConf && result.contextualSize !== result.originalSize) {
              shouldCorrect = true;
              correctionDetails.push(
                `Size: "${result.originalSize || 'Unknown'}" (${Math.round(originalConf * 100)}%) → "${result.contextualSize}" (${Math.round(contextualConf * 100)}%)`
              );
            }
          }

          if (shouldCorrect) {
            // Update detection with contextual data
            const updateData: any = {
              contextual_brand: result.contextualBrand,
              contextual_brand_confidence: result.contextualBrandConfidence,
              contextual_brand_reasoning: analysis.brand_reasoning,
              contextual_size: result.contextualSize,
              contextual_size_confidence: result.contextualSizeConfidence,
              contextual_size_reasoning: analysis.size_reasoning,
              contextual_overall_confidence: analysis.overall_confidence,
              contextual_notes: analysis.notes,
              contextual_prompt_version: 'v1',
              contextual_analyzed_at: new Date().toISOString(),
              contextual_left_neighbor_count: left.length,
              contextual_right_neighbor_count: right.length,
              corrected_by_contextual: true,
              contextual_correction_notes: correctionDetails.join('; '),
            };

            // Overwrite brand and size if contextual confidence is higher
            if (result.contextualBrandConfidence && result.contextualBrandConfidence > (result.originalBrandConfidence || 0)) {
              updateData.brand_name = result.contextualBrand;
              updateData.brand_confidence = result.contextualBrandConfidence;
            }
            
            if (result.contextualSizeConfidence && result.contextualSizeConfidence > (result.originalSizeConfidence || 0)) {
              updateData.size = result.contextualSize;
              updateData.size_confidence = result.contextualSizeConfidence;
            }

            const { error: updateError } = await supabase
              .from('branghunt_detections')
              .update(updateData)
              .eq('id', detection.id);

            if (updateError) {
              console.error(`    [${detection.detection_index}] ❌ Failed to save:`, updateError);
              result.status = 'error';
              result.error = updateError.message;
            } else {
              console.log(`    [${detection.detection_index}] ✅ Corrected:`, correctionDetails.join('; '));
              result.status = 'success';
              result.corrected = true;
              result.correctionNotes = correctionDetails.join('; ');
            }
          } else {
            // Save contextual data but don't overwrite
            const updateData: any = {
              contextual_brand: result.contextualBrand,
              contextual_brand_confidence: result.contextualBrandConfidence,
              contextual_brand_reasoning: analysis.brand_reasoning,
              contextual_size: result.contextualSize,
              contextual_size_confidence: result.contextualSizeConfidence,
              contextual_size_reasoning: analysis.size_reasoning,
              contextual_overall_confidence: analysis.overall_confidence,
              contextual_notes: analysis.notes,
              contextual_prompt_version: 'v1',
              contextual_analyzed_at: new Date().toISOString(),
              contextual_left_neighbor_count: left.length,
              contextual_right_neighbor_count: right.length,
            };

            await supabase
              .from('branghunt_detections')
              .update(updateData)
              .eq('id', detection.id);

            console.log(`    [${detection.detection_index}] ℹ️ Contextual confidence not better, no correction applied`);
            result.status = 'no_improvement';
            result.corrected = false;
          }

        } catch (error) {
          console.error(`    [${detection.detection_index}] ❌ Error:`, error);
          result.status = 'error';
          result.error = error instanceof Error ? error.message : 'Unknown error';
        }

        return result;
      })
    );

    const successCount = results.filter(r => r.status === 'success').length;
    const correctedCount = results.filter(r => r.corrected).length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const noImprovementCount = results.filter(r => r.status === 'no_improvement').length;

    console.log(`✅ Batch contextual analysis complete:`);
    console.log(`   - Processed: ${results.length}`);
    console.log(`   - Corrected: ${correctedCount}`);
    console.log(`   - No improvement: ${noImprovementCount}`);
    console.log(`   - Skipped (no neighbors): ${skippedCount}`);
    console.log(`   - Errors: ${errorCount}`);

    return NextResponse.json({
      message: `Processed ${results.length} detections, corrected ${correctedCount}`,
      processed: results.length,
      corrected: correctedCount,
      noImprovement: noImprovementCount,
      skipped: skippedCount,
      errors: errorCount,
      results
    });

  } catch (error) {
    console.error('Batch contextual analysis error:', error);
    return NextResponse.json({ 
      error: 'Batch contextual analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export const maxDuration = 300; // 5 minutes for batch processing

