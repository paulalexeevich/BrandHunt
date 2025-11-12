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
  is_product: boolean | null;
}

interface ImageResult {
  imageId: string;
  imageName: string;
  processed: number;
  corrected: number;
  skipped: number;
  errors: number;
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

/**
 * Process single image: find and correct low-confidence brands
 */
async function processImage(
  imageId: string,
  imageName: string,
  supabase: any
): Promise<ImageResult> {
  console.log(`\n🖼️  Processing image: ${imageName} (${imageId})`);

  const result: ImageResult = {
    imageId,
    imageName,
    processed: 0,
    corrected: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Fetch the image data
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      console.error(`   ❌ Image not found`);
      result.errors = 1;
      return result;
    }

    // Fetch ALL detections for neighbor context
    const { data: allDetections, error: allDetectionsError } = await supabase
      .from('branghunt_detections')
      .select('id, detection_index, bounding_box, brand_name, brand_confidence, product_name, size, size_confidence, is_product')
      .eq('image_id', imageId)
      .order('detection_index');

    if (allDetectionsError || !allDetections) {
      console.error(`   ❌ Failed to fetch detections`);
      result.errors = 1;
      return result;
    }

    // Filter detections that need contextual analysis:
    // - Have been through info extraction (brand_name is not null)
    // - brand_name is 'Unknown' OR brand_confidence < 0.91
    // - SKIP products marked as is_product = false (not actual products)
    const detectionsToProcess = allDetections.filter(det => {
      // Skip non-products
      if (det.is_product === false) return false;
      
      // Must have brand_name (info extraction completed)
      if (!det.brand_name) return false;
      
      // Filter: Unknown OR confidence < 91%
      const brandUnknown = det.brand_name.toLowerCase() === 'unknown';
      const lowConfidence = det.brand_confidence !== null && det.brand_confidence < 0.91;
      
      return brandUnknown || lowConfidence;
    });

    console.log(`   📊 Found ${detectionsToProcess.length} detections needing contextual analysis (out of ${allDetections.length} total)`);
    console.log(`      - Unknown brand: ${detectionsToProcess.filter(d => d.brand_name?.toLowerCase() === 'unknown').length}`);
    console.log(`      - Low confidence (<91%): ${detectionsToProcess.filter(d => d.brand_confidence !== null && d.brand_confidence < 0.91 && d.brand_name?.toLowerCase() !== 'unknown').length}`);

    if (detectionsToProcess.length === 0) {
      console.log(`   ✅ All products have high-confidence brands (≥91%)`);
      return result;
    }

    // Get image data once for all detections
    const imageBase64 = await getImageBase64ForProcessing(image);

    // Process all detections in parallel
    const processResults = await Promise.all(
      detectionsToProcess.map(async (detection) => {
        try {
          console.log(`      [#${detection.detection_index}] Analyzing...`);

          // Find neighbors
          const { left, right } = findNeighbors(detection, allDetections);
          
          if (left.length === 0 && right.length === 0) {
            console.log(`         ⚠️ No neighbors found, skipping`);
            return { status: 'skipped' };
          }

          console.log(`         Found ${left.length} left, ${right.length} right neighbors`);

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
            console.log(`         ❌ Failed to parse Gemini response`);
            return { status: 'error' };
          }

          // ALWAYS overwrite brand and size with contextual results
          const updateData: any = {
            // Store contextual data
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
          };

          // ALWAYS overwrite brand and size (no confidence comparison)
          updateData.brand_name = analysis.inferred_brand;
          updateData.brand_confidence = analysis.brand_confidence;
          updateData.size = analysis.inferred_size;
          updateData.size_confidence = analysis.size_confidence;

          const { error: updateError } = await supabase
            .from('branghunt_detections')
            .update(updateData)
            .eq('id', detection.id);

          if (updateError) {
            console.error(`         ❌ Failed to save:`, updateError);
            return { status: 'error' };
          }

          console.log(`         ✅ Corrected: ${analysis.inferred_brand} (${Math.round((analysis.brand_confidence || 0) * 100)}%)`);
          return { status: 'corrected' };

        } catch (error) {
          console.error(`         ❌ Error:`, error);
          return { status: 'error' };
        }
      })
    );

    // Count results
    result.processed = processResults.length;
    result.corrected = processResults.filter(r => r.status === 'corrected').length;
    result.skipped = processResults.filter(r => r.status === 'skipped').length;
    result.errors = processResults.filter(r => r.status === 'error').length;

    console.log(`   ✅ Image complete: ${result.corrected} corrected, ${result.skipped} skipped, ${result.errors} errors`);

  } catch (error) {
    console.error(`   ❌ Image processing error:`, error);
    result.errors = 1;
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json({ 
        error: 'Missing projectId parameter' 
      }, { status: 400 });
    }

    console.log(`🔬 Starting automated batch contextual analysis for project ${projectId}...`);

    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch all images in the project
    const { data: images, error: imagesError } = await supabase
      .from('branghunt_images')
      .select('id, original_filename')
      .eq('project_id', projectId)
      .order('created_at');

    if (imagesError || !images || images.length === 0) {
      return NextResponse.json({ 
        error: 'No images found in project',
        details: imagesError?.message 
      }, { status: 404 });
    }

    console.log(`📊 Found ${images.length} images in project`);

    // Process each image sequentially (to avoid overwhelming Gemini API)
    const imageResults: ImageResult[] = [];
    
    for (const image of images) {
      const result = await processImage(image.id, image.original_filename, supabase);
      imageResults.push(result);
    }

    // Calculate totals
    const totalProcessed = imageResults.reduce((sum, r) => sum + r.processed, 0);
    const totalCorrected = imageResults.reduce((sum, r) => sum + r.corrected, 0);
    const totalSkipped = imageResults.reduce((sum, r) => sum + r.skipped, 0);
    const totalErrors = imageResults.reduce((sum, r) => sum + r.errors, 0);

    console.log(`\n✅ Batch contextual analysis complete for project:`);
    console.log(`   Images processed: ${images.length}`);
    console.log(`   Products analyzed: ${totalProcessed}`);
    console.log(`   Brands corrected: ${totalCorrected}`);
    console.log(`   Skipped (no neighbors): ${totalSkipped}`);
    console.log(`   Errors: ${totalErrors}`);

    return NextResponse.json({
      message: `Processed ${images.length} images, corrected ${totalCorrected} products`,
      imagesProcessed: images.length,
      totalProcessed,
      totalCorrected,
      totalSkipped,
      totalErrors,
      imageResults
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

