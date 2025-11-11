import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { getImageBase64ForProcessing } from '@/lib/image-processor';
import Jimp from 'jimp';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
  product_name: string | null;
  size: string | null;
}

/**
 * Find neighboring detections on the same shelf
 * A "neighbor" is a detection that:
 * 1. Has overlapping Y coordinates (same shelf)
 * 2. Is within reasonable horizontal distance
 */
function findNeighbors(
  targetDetection: Detection,
  allDetections: Detection[],
  maxHorizontalDistance: number = 500 // normalized units
): { left: Detection[]; right: Detection[] } {
  const targetBox = targetDetection.bounding_box;
  const targetCenterY = (targetBox.y0 + targetBox.y1) / 2;
  const targetHeight = targetBox.y1 - targetBox.y0;
  
  // Consider detections on the same shelf if their Y centers are within 30% of target height
  const yTolerance = targetHeight * 0.3;
  
  const neighbors = allDetections
    .filter(det => det.id !== targetDetection.id)
    .filter(det => {
      const centerY = (det.bounding_box.y0 + det.bounding_box.y1) / 2;
      return Math.abs(centerY - targetCenterY) <= yTolerance;
    });
  
  // Separate into left and right neighbors
  const left = neighbors
    .filter(det => det.bounding_box.x1 <= targetBox.x0)
    .filter(det => targetBox.x0 - det.bounding_box.x1 <= maxHorizontalDistance)
    .sort((a, b) => b.bounding_box.x1 - a.bounding_box.x1); // Closest first
  
  const right = neighbors
    .filter(det => det.bounding_box.x0 >= targetBox.x1)
    .filter(det => det.bounding_box.x0 - targetBox.x1 <= maxHorizontalDistance)
    .sort((a, b) => a.bounding_box.x0 - b.bounding_box.x0); // Closest first
  
  return { left, right };
}

/**
 * Calculate expanded bounding box that includes target and neighbors
 */
function calculateExpandedBox(
  targetBox: BoundingBox,
  leftNeighbors: Detection[],
  rightNeighbors: Detection[],
  minNeighborsPerSide: number = 3
): BoundingBox {
  const boxes = [
    targetBox,
    ...leftNeighbors.slice(0, minNeighborsPerSide).map(d => d.bounding_box),
    ...rightNeighbors.slice(0, minNeighborsPerSide).map(d => d.bounding_box),
  ];
  
  return {
    y0: Math.min(...boxes.map(b => b.y0)),
    x0: Math.min(...boxes.map(b => b.x0)),
    y1: Math.max(...boxes.map(b => b.y1)),
    x1: Math.max(...boxes.map(b => b.x1)),
  };
}

/**
 * Extract a crop from the image using Jimp
 */
async function extractCrop(
  imageBase64: string,
  mimeType: string,
  boundingBox: BoundingBox
): Promise<string> {
  // Convert base64 to buffer
  const imageBuffer = Buffer.from(
    imageBase64.replace(/^data:image\/\w+;base64,/, ''),
    'base64'
  );
  
  const image = await Jimp.read(imageBuffer);
  const width = image.getWidth();
  const height = image.getHeight();
  
  // Convert normalized coordinates (0-1000) to actual pixels
  const x = Math.floor((boundingBox.x0 / 1000) * width);
  const y = Math.floor((boundingBox.y0 / 1000) * height);
  const cropWidth = Math.floor(((boundingBox.x1 - boundingBox.x0) / 1000) * width);
  const cropHeight = Math.floor(((boundingBox.y1 - boundingBox.y0) / 1000) * height);
  
  // Ensure coordinates are within bounds
  const safeX = Math.max(0, Math.min(x, width - 1));
  const safeY = Math.max(0, Math.min(y, height - 1));
  const safeWidth = Math.min(cropWidth, width - safeX);
  const safeHeight = Math.min(cropHeight, height - safeY);
  
  // Crop the image
  const cropped = image.crop(safeX, safeY, safeWidth, safeHeight);
  
  // Convert to base64
  const croppedBase64 = await cropped.getBase64Async(mimeType || Jimp.MIME_JPEG);
  
  return croppedBase64;
}

/**
 * Call Gemini API to analyze product with context
 */
async function analyzeWithContext(
  expandedCropBase64: string,
  targetDetection: Detection,
  leftNeighbors: Detection[],
  rightNeighbors: Detection[],
  promptVersion: string = 'v1'
): Promise<any> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  // Build context about neighbors
  const leftContext = leftNeighbors.slice(0, 3).map((det, i) => 
    `${i + 1}. Brand: ${det.brand_name || 'unknown'}, Size: ${det.size || 'unknown'}`
  ).join('\n  ');
  
  const rightContext = rightNeighbors.slice(0, 3).map((det, i) => 
    `${i + 1}. Brand: ${det.brand_name || 'unknown'}, Size: ${det.size || 'unknown'}`
  ).join('\n  ');
  
  // Different prompt variations to test
  const prompts: Record<string, string> = {
    v1: `You are analyzing a retail shelf image. The image shows multiple products arranged horizontally on a shelf.

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
}`,
    
    v2: `Shelf Context Analysis Task:

You're looking at a retail shelf with multiple products. Focus on the CENTER/MIDDLE product.

Current data for CENTER product:
- Brand: ${targetDetection.brand_name || 'Hidden/Unclear'}  
- Size: ${targetDetection.size || 'Unknown'}

Left neighbors: ${leftContext || 'None'}
Right neighbors: ${rightContext || 'None'}

Analyze using these strategies:
1. **Brand Pattern Recognition**: Shelf products are often grouped by brand. If you see the same brand on both sides, the center is likely that brand too.
2. **Package Visual Matching**: Compare colors, logo styles, package shapes. Similar packaging = likely same brand.
3. **Size Estimation**: Products with identical physical dimensions and shapes typically have the same size specification.

Provide JSON response:
{
  "brand": "Inferred brand name",
  "brand_confidence": 0.0-1.0,
  "brand_method": "How you determined this (pattern/visual/neighbors)",
  "size": "Inferred size",
  "size_confidence": 0.0-1.0,
  "size_method": "How you determined this",
  "match_with_left": "Brand match? Yes/No/Partial",
  "match_with_right": "Brand match? Yes/No/Partial",
  "reasoning": "Overall explanation"
}`,
    
    v3: `IMAGE CONTEXT: Retail shelf with products arranged left-to-right.

TARGET: The product in the MIDDLE/CENTER position.

KNOWN INFO:
- Current brand extraction: ${targetDetection.brand_name || 'INCOMPLETE/HIDDEN'}
- Current size: ${targetDetection.size || 'UNKNOWN'}

NEIGHBORS:
Left side: ${leftContext || 'Edge of shelf'}
Right side: ${rightContext || 'Edge of shelf'}

INSTRUCTIONS:
Look at the CENTER product. Use neighbor context and visual analysis to predict:
1. Brand (especially useful if brand label is partially hidden)
2. Size (especially useful if products have same form factor)

Consider:
- Retail shelves group same brands together
- Adjacent products often share visual design language  
- Same size bottles/packages placed together

Return JSON only:
{
  "brand": "string",
  "brand_confidence": number,
  "size": "string", 
  "size_confidence": number,
  "left_neighbor_similarity": number,
  "right_neighbor_similarity": number,
  "explanation": "string"
}`
  };
  
  const prompt = prompts[promptVersion] || prompts.v1;
  
  // Remove data URI prefix if present
  const base64Data = expandedCropBase64.replace(/^data:image\/\w+;base64,/, '');
  
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data,
      },
    },
    prompt,
  ]);
  
  const response = result.response;
  const text = response.text();
  
  // Try to parse JSON from response
  try {
    // Remove markdown code blocks if present
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonText);
  } catch (e) {
    // If parsing fails, return the raw text
    return { raw_response: text, parse_error: true };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { detectionId, promptVersion = 'v1', minNeighbors = 3 } = body;
    
    if (!detectionId) {
      return NextResponse.json({ error: 'Detection ID is required' }, { status: 400 });
    }
    
    const supabase = await createAuthenticatedSupabaseClient();
    
    // Get the detection
    const { data: detection, error: detectionError } = await supabase
      .from('branghunt_detections')
      .select('*')
      .eq('id', detectionId)
      .single();
    
    if (detectionError || !detection) {
      return NextResponse.json({ error: 'Detection not found' }, { status: 404 });
    }
    
    // Get all detections for this image (to find neighbors)
    const { data: allDetections, error: allDetectionsError } = await supabase
      .from('branghunt_detections')
      .select('id, detection_index, bounding_box, brand_name, product_name, size')
      .eq('image_id', detection.image_id)
      .order('detection_index');
    
    if (allDetectionsError || !allDetections) {
      return NextResponse.json({ error: 'Failed to fetch detections' }, { status: 500 });
    }
    
    // Find neighbors
    const { left, right } = findNeighbors(detection, allDetections);
    
    console.log(`[Contextual Analysis] Found ${left.length} left neighbors, ${right.length} right neighbors`);
    
    // Calculate expanded bounding box
    const expandedBox = calculateExpandedBox(
      detection.bounding_box,
      left,
      right,
      minNeighbors
    );
    
    console.log('[Contextual Analysis] Expanded box:', expandedBox);
    
    // Get the image
    const { data: image, error: imageError } = await supabase
      .from('branghunt_images')
      .select('*')
      .eq('id', detection.image_id)
      .single();
    
    if (imageError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    
    // Get image data
    const { base64Data, mimeType } = await getImageBase64ForProcessing(image);
    
    // Extract expanded crop
    const expandedCrop = await extractCrop(base64Data, mimeType, expandedBox);
    
    console.log('[Contextual Analysis] Extracted expanded crop');
    
    // Analyze with Gemini
    const analysis = await analyzeWithContext(
      expandedCrop,
      detection,
      left,
      right,
      promptVersion
    );
    
    console.log('[Contextual Analysis] Gemini response:', analysis);
    
    return NextResponse.json({
      success: true,
      detection: {
        id: detection.id,
        detection_index: detection.detection_index,
        current_brand: detection.brand_name,
        current_size: detection.size,
      },
      neighbors: {
        left: left.slice(0, minNeighbors).map(d => ({
          id: d.id,
          index: d.detection_index,
          brand: d.brand_name,
          size: d.size,
        })),
        right: right.slice(0, minNeighbors).map(d => ({
          id: d.id,
          index: d.detection_index,
          brand: d.brand_name,
          size: d.size,
        })),
      },
      expanded_box: expandedBox,
      expanded_crop_preview: expandedCrop,
      analysis,
      prompt_version: promptVersion,
    });
    
  } catch (error) {
    console.error('[Contextual Analysis] Error:', error);
    return NextResponse.json(
      { 
        error: 'Contextual analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;

