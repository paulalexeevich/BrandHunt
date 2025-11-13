import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { DEFAULT_EXTRACT_INFO_PROMPT, DEFAULT_AI_FILTER_PROMPT, DEFAULT_VISUAL_MATCH_PROMPT } from '@/lib/default-prompts';
import type { SupabaseClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

/**
 * Fetch the active prompt template for a given project and step
 * Returns the custom prompt if found, otherwise returns the default prompt
 */
export async function getPromptTemplate(projectId: string | null, stepName: string): Promise<string> {
  // Default prompts based on step name
  const getDefaultPrompt = (step: string): string => {
    switch (step) {
      case 'extract_info':
        return DEFAULT_EXTRACT_INFO_PROMPT;
      case 'ai_filter':
        return DEFAULT_AI_FILTER_PROMPT;
      case 'visual_match':
        return DEFAULT_VISUAL_MATCH_PROMPT;
      default:
        console.warn(`Unknown step name: ${step}, defaulting to extract_info prompt`);
        return DEFAULT_EXTRACT_INFO_PROMPT;
    }
  };

  // If no project ID, return default
  if (!projectId) {
    console.log(`No project ID provided for ${stepName}, using default prompt`);
    return getDefaultPrompt(stepName);
  }

  try {
    const supabase = await createAuthenticatedSupabaseClient();
    
    const { data: template, error } = await supabase
      .from('branghunt_prompt_templates')
      .select('prompt_template')
      .eq('project_id', projectId)
      .eq('step_name', stepName)
      .eq('is_active', true)
      .single();

    if (error || !template) {
      console.log(`No custom prompt found for project ${projectId}, step ${stepName}, using default`);
      return getDefaultPrompt(stepName);
    }

    console.log(`Using custom prompt for project ${projectId}, step ${stepName}`);
    return template.prompt_template;
  } catch (error) {
    console.error(`Error fetching prompt template:`, error);
    return getDefaultPrompt(stepName);
  }
}

export interface DetectedProduct {
  box_2d: [number, number, number, number]; // [y0, x0, y1, x1] normalized coordinates
  label: string;
}

export interface ProductInfo {
  // Classification fields
  isProduct: boolean;
  extractionNotes?: string;
  
  // Product fields
  brand: string;
  productName: string;
  category: string;
  flavor: string;
  size: string;
  
  // Confidence scores (0.0 to 1.0)
  brandConfidence: number;
  productNameConfidence: number;
  categoryConfidence: number;
  flavorConfidence: number;
  sizeConfidence: number;
}

/**
 * Detect products in an image using Gemini 2.5 Flash
 * Returns bounding boxes and labels for detected products
 */
export async function detectProducts(imageBase64: string, mimeType: string): Promise<DetectedProduct[]> {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,  // Set to 0 for more deterministic bounding boxes
      responseMimeType: 'application/json',
    }
  });

  const prompt = `
Detect all visible products/items in this retail image. For each distinct product, provide:
1. A 2D bounding box with normalized coordinates [y0, x0, y1, x1] where:
   - y0: top edge (0 = image top, 1000 = image bottom)
   - x0: left edge (0 = image left, 1000 = image right)
   - y1: bottom edge (0 = image top, 1000 = image bottom)
   - x1: right edge (0 = image left, 1000 = image right)
2. A descriptive label for the product

Return a JSON array with this exact structure:
[
  {
    "box_2d": [y0, x0, y1, x1],
    "label": "product description"
  }
]

Ensure bounding boxes tightly fit each product. Only return the JSON array.
`;

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: mimeType,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const text = response.text();

  // Clean up the response - remove markdown code blocks if present
  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.substring(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.substring(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.substring(0, cleanedText.length - 3);
  }
  cleanedText = cleanedText.trim();

  try {
    const detections = JSON.parse(cleanedText) as DetectedProduct[];
    
    // Debug: Log the raw format to verify coordinate order
    if (detections.length > 0) {
      console.log('🔍 Raw Gemini detection format:', JSON.stringify(detections[0], null, 2));
      console.log(`📊 box_2d[0]=${detections[0].box_2d[0]}, [1]=${detections[0].box_2d[1]}, [2]=${detections[0].box_2d[2]}, [3]=${detections[0].box_2d[3]}`);
    }
    
    return detections;
  } catch (error) {
    console.error('Failed to parse Gemini response:', cleanedText);
    throw new Error('Failed to parse product detection results');
  }
}

/**
 * Crop image to bounding box region
 * Converts normalized coordinates (0-1000) to pixel coordinates and crops
 */
export async function cropImageToBoundingBox(
  imageBase64: string,
  boundingBox: { y0: number; x0: number; y1: number; x1: number }
): Promise<{ croppedBase64: string; width: number; height: number }> {
  // Decode base64 to buffer
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  
  // Get image metadata to find actual dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width!;
  const imageHeight = metadata.height!;
  
  // Convert normalized coordinates (0-1000) to pixel coordinates
  const left = Math.round((boundingBox.x0 / 1000) * imageWidth);
  const top = Math.round((boundingBox.y0 / 1000) * imageHeight);
  const width = Math.round(((boundingBox.x1 - boundingBox.x0) / 1000) * imageWidth);
  const height = Math.round(((boundingBox.y1 - boundingBox.y0) / 1000) * imageHeight);
  
  console.log(`🔍 Cropping image: Original ${imageWidth}x${imageHeight}, Box [${left}, ${top}, ${width}, ${height}]`);
  
  // Crop the image to the bounding box
  const croppedBuffer = await sharp(imageBuffer)
    .extract({ left, top, width, height })
    .toBuffer();
  
  // Convert back to base64
  const croppedBase64 = croppedBuffer.toString('base64');
  
  return { croppedBase64, width, height };
}

/**
 * Extract brand name and category from a product detection
 * Takes an image and bounding box, crops to the specific product, returns brand and category
 */
export async function extractProductInfo(
  imageBase64: string, 
  mimeType: string,
  boundingBox: { y0: number; x0: number; y1: number; x1: number },
  projectId?: string | null
): Promise<ProductInfo> {
  console.log('🔵 extractProductInfo called - START');
  console.log(`   boundingBox:`, boundingBox);
  console.log(`   imageBase64 length: ${imageBase64.length}`);
  console.log(`   mimeType: ${mimeType}`);
  console.log(`   projectId: ${projectId || 'null (using default prompt)'}`);
  
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.error('❌ ❌ ❌ GOOGLE_GEMINI_API_KEY IS NOT SET ❌ ❌ ❌');
    throw new Error('Gemini API key is not configured');
  }
  
  console.log('✅ API key found, proceeding with extraction...');
  
  // First, crop the image to just the bounding box area
  console.log('🔵 Cropping image to bounding box...');
  const { croppedBase64, width, height } = await cropImageToBoundingBox(imageBase64, boundingBox);
  
  console.log(`✂️ Cropped image to ${width}x${height}px for product extraction`);
  console.log('🔵 Fetching prompt template...');
  
  // Fetch custom prompt or use default
  const prompt = await getPromptTemplate(projectId || null, 'extract_info');
  
  console.log('🔵 Calling Gemini API...');
  
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    }
  });

  const imagePart = {
    inlineData: {
      data: croppedBase64,  // Use cropped image instead of full image
      mimeType: mimeType,
    },
  };

  let text: string;
  try {
    console.log('🔵 Sending request to Gemini...');
    const result = await model.generateContent([prompt, imagePart]);
    console.log('🔵 Got response from Gemini, extracting text...');
    const response = await result.response;
    text = response.text();
    console.log(`🔵 Gemini response length: ${text.length} characters`);
    
    if (!text || text.trim().length === 0) {
      console.error('❌ Gemini returned empty response');
      throw new Error('Gemini returned empty response');
    }
  } catch (error) {
    console.error('❌ ❌ ❌ GEMINI API ERROR ❌ ❌ ❌');
    console.error('Error details:', error);
    throw new Error(`Gemini API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Clean up the response
  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.substring(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.substring(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.substring(0, cleanedText.length - 3);
  }
  cleanedText = cleanedText.trim();

  try {
    const productInfo = JSON.parse(cleanedText) as ProductInfo;
    console.log('✅ Gemini extractProductInfo returned:', JSON.stringify(productInfo, null, 2));
    return productInfo;
  } catch (error) {
    console.error('Failed to parse Gemini response:', cleanedText);
    // Fallback when parsing fails
    return {
      isProduct: false,
      extractionNotes: 'Failed to parse AI response',
      brand: 'Unknown',
      brandConfidence: 0,
      productName: 'Unknown',
      productNameConfidence: 0,
      category: 'Unknown',
      categoryConfidence: 0,
      flavor: 'Unknown',
      flavorConfidence: 0,
      size: 'Unknown',
      sizeConfidence: 0
    };
  }
}

// Legacy function for backward compatibility
export async function extractBrandName(
  imageBase64: string, 
  mimeType: string,
  boundingBox: { y0: number; x0: number; y1: number; x1: number }
): Promise<string> {
  const info = await extractProductInfo(imageBase64, mimeType, boundingBox);
  return info.brand;
}

/**
 * Extract price information from the area below a product
 * Expands the bounding box downward to capture price tags
 */
export async function extractPrice(
  imageBase64: string,
  mimeType: string,
  boundingBox: { y0: number; x0: number; y1: number; x1: number },
  productInfo: { brand?: string; productName?: string; label?: string }
): Promise<{ price: string; currency: string; confidence: number }> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.error('❌ GOOGLE_GEMINI_API_KEY is not set');
    throw new Error('Gemini API key is not configured');
  }

  // Expand the bounding box to include the area below the product
  // We'll expand downward by 30% of the product height to capture price tags
  const productHeight = boundingBox.y1 - boundingBox.y0;
  const expandedBox = {
    x0: boundingBox.x0,
    y0: boundingBox.y0,
    x1: boundingBox.x1,
    y1: Math.min(1000, boundingBox.y1 + (productHeight * 0.5)), // Expand down by 50%, max 1000
  };

  console.log(`🏷️ Expanding bounding box for price extraction: [${boundingBox.y0}, ${boundingBox.x0}, ${boundingBox.y1}, ${boundingBox.x1}] -> [${expandedBox.y0}, ${expandedBox.x0}, ${expandedBox.y1}, ${expandedBox.x1}]`);

  // Crop the image to the expanded bounding box area
  const { croppedBase64, width, height } = await cropImageToBoundingBox(imageBase64, expandedBox);
  
  console.log(`✂️ Cropped image to ${width}x${height}px for price extraction`);

  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    }
  });

  const productDescription = productInfo.productName || productInfo.brand || productInfo.label || 'the product';

  const prompt = `
Analyze this retail shelf image and extract the PRICE for "${productDescription}".

The product is located in the upper portion of this image, and the price tag should be BELOW the product.

Extract the following information:
1. Price (numeric value only, e.g., "2.49", "5.99", "12.99")
2. Currency (e.g., "USD", "EUR", "GBP")
3. Confidence (0.0 to 1.0) - how confident you are about this price

Look for:
- Price tags below the product
- Digital displays showing prices
- Paper labels with prices
- Any text indicating price (including $ symbols)

Return a JSON object with this exact structure:
{
  "price": "numeric price as string",
  "currency": "USD",
  "confidence": 0.0 to 1.0
}

If you cannot find a price, return:
{
  "price": "Unknown",
  "currency": "USD",
  "confidence": 0.0
}

Only return the JSON object, nothing else.
`;

  const imagePart = {
    inlineData: {
      data: croppedBase64,
      mimeType: mimeType,
    },
  };

  let text: string;
  try {
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    text = response.text();
    
    if (!text || text.trim().length === 0) {
      console.error('❌ Gemini returned empty response');
      throw new Error('Gemini returned empty response');
    }
  } catch (error) {
    console.error('❌ Gemini API error:', error);
    throw new Error(`Gemini API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Clean up the response
  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.substring(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.substring(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.substring(0, cleanedText.length - 3);
  }
  cleanedText = cleanedText.trim();

  try {
    const priceInfo = JSON.parse(cleanedText) as { price: string; currency: string; confidence: number };
    console.log('✅ Gemini extractPrice returned:', JSON.stringify(priceInfo, null, 2));
    return priceInfo;
  } catch (error) {
    console.error('Failed to parse Gemini response:', cleanedText);
    return {
      price: 'Unknown',
      currency: 'USD',
      confidence: 0
    };
  }
}

/**
 * Validate image quality before processing
 * Checks for blur and estimates product count
 */
export async function validateImageQuality(
  imageBase64: string,
  mimeType: string
): Promise<{
  isBlurry: boolean;
  blurConfidence: number;
  estimatedProductCount: number;
  productCountConfidence: number;
  warnings: string[];
  canProcess: boolean;
}> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.error('❌ GOOGLE_GEMINI_API_KEY is not set');
    throw new Error('Gemini API key is not configured');
  }

  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    }
  });

  const prompt = `
Analyze this retail image and check for quality issues that might affect AI product detection.

Evaluate the following:
1. Image Blur: Is the image blurry or out of focus? (Check for sharpness of text, product edges, and overall clarity)
2. Product Count: Approximately how many distinct products/items are visible in this image?

Return a JSON object with this exact structure:
{
  "isBlurry": true or false,
  "blurConfidence": 0.0 to 1.0,
  "estimatedProductCount": integer number,
  "productCountConfidence": 0.0 to 1.0,
  "imageQualityNotes": "Brief description of image quality"
}

Guidelines:
- For isBlurry: Return true if text is hard to read or product edges are not sharp
- For estimatedProductCount: Count all visible products/items in the image
- For confidence: Return a value between 0.0 (not confident) and 1.0 (very confident)

Only return the JSON object, nothing else.
`;

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: mimeType,
    },
  };

  let text: string;
  try {
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    text = response.text();
    
    if (!text || text.trim().length === 0) {
      console.error('❌ Gemini returned empty response');
      throw new Error('Gemini returned empty response');
    }
  } catch (error) {
    console.error('❌ Gemini API error:', error);
    throw new Error(`Gemini API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Clean up the response
  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.substring(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.substring(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.substring(0, cleanedText.length - 3);
  }
  cleanedText = cleanedText.trim();

  try {
    const validation = JSON.parse(cleanedText) as {
      isBlurry: boolean;
      blurConfidence: number;
      estimatedProductCount: number;
      productCountConfidence: number;
      imageQualityNotes: string;
    };
    
    console.log('✅ Gemini validateImageQuality returned:', JSON.stringify(validation, null, 2));

    // Build warnings and determine if we can process
    const warnings: string[] = [];
    let canProcess = true;

    if (validation.isBlurry && validation.blurConfidence >= 0.6) {
      warnings.push('⚠️ Image appears blurry - detection results may be inaccurate');
    }

    if (validation.estimatedProductCount > 50) {
      warnings.push(`❌ Image contains approximately ${validation.estimatedProductCount} products - Gemini API works best with fewer than 50 products`);
      canProcess = false; // Block processing if too many products
    } else if (validation.estimatedProductCount > 40) {
      warnings.push(`⚠️ Image contains approximately ${validation.estimatedProductCount} products - close to the recommended limit of 50`);
    }

    return {
      isBlurry: validation.isBlurry,
      blurConfidence: validation.blurConfidence,
      estimatedProductCount: validation.estimatedProductCount,
      productCountConfidence: validation.productCountConfidence,
      warnings,
      canProcess,
    };
  } catch (error) {
    console.error('Failed to parse Gemini response:', cleanedText);
    // On parse error, return conservative defaults
    return {
      isBlurry: false,
      blurConfidence: 0,
      estimatedProductCount: 0,
      productCountConfidence: 0,
      warnings: ['⚠️ Could not validate image quality'],
      canProcess: true, // Allow processing on error
    };
  }
}

/**
 * Compare two product images to determine if they are the same product
 * Returns true if the products are visually identical/similar, false otherwise
 */
export type MatchStatus = 'identical' | 'almost_same' | 'not_match';

export interface ProductComparisonDetails {
  matchStatus: MatchStatus;
  confidence: number;
  visualSimilarity: number;
  reason: string;
}

export async function compareProductImages(
  originalImageBase64: string,
  foodgraphImageUrl: string,
  returnDetails?: boolean,
  projectId?: string | null
): Promise<boolean>;
export async function compareProductImages(
  originalImageBase64: string,
  foodgraphImageUrl: string,
  returnDetails: true,
  projectId?: string | null
): Promise<ProductComparisonDetails>;
export async function compareProductImages(
  originalImageBase64: string,
  foodgraphImageUrl: string,
  returnDetails?: boolean,
  projectId?: string | null
): Promise<boolean | ProductComparisonDetails> {
  console.log(`🔍 compareProductImages called - projectId: ${projectId || 'null (using default prompt)'}`);
  
  // Fetch custom prompt or use default
  const prompt = await getPromptTemplate(projectId || null, 'ai_filter');
  
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    }
  });

  try {
    // Fetch the FoodGraph image
    const imageResponse = await fetch(foodgraphImageUrl);
    if (!imageResponse.ok) {
      console.error(`Failed to fetch FoodGraph image: ${foodgraphImageUrl}`);
      return false;
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const foodgraphImageBase64 = Buffer.from(imageBuffer).toString('base64');
    
    const imageParts = [
      {
        inlineData: {
          data: originalImageBase64,
          mimeType: 'image/jpeg',
        },
      },
      {
        inlineData: {
          data: foodgraphImageBase64,
          mimeType: 'image/jpeg',
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    // Clean up the response
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.substring(7);
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.substring(3);
    }
    if (cleanedText.endsWith('```')) {
      cleanedText = cleanedText.substring(0, cleanedText.length - 3);
    }
    cleanedText = cleanedText.trim();

    const comparison = JSON.parse(cleanedText) as { 
      matchStatus: MatchStatus;
      confidence: number; 
      visualSimilarity: number;
      reason: string 
    };
    
    console.log(`🔍 Image comparison: ${comparison.matchStatus.toUpperCase()} (confidence: ${comparison.confidence}, visual similarity: ${comparison.visualSimilarity}) - ${comparison.reason}`);
    
    // If returnDetails is true, return the full comparison object
    if (returnDetails) {
      return {
        matchStatus: comparison.matchStatus,
        confidence: comparison.confidence,
        visualSimilarity: comparison.visualSimilarity || 0,
        reason: comparison.reason
      };
    }
    
    // For backward compatibility: return true only for 'identical' matches with high confidence
    return comparison.matchStatus === 'identical' && comparison.confidence >= 0.7;
  } catch (error) {
    console.error('Failed to compare images:', error);
    // On error, don't filter out the product - treat as 'almost_same' to allow manual review
    if (returnDetails) {
      return {
        matchStatus: 'almost_same',
        confidence: 0.0,
        visualSimilarity: 0.0,
        reason: 'Error during comparison'
      };
    }
    return true;
  }
}

/**
 * Visual Matching Selection - Selects the best match from multiple similar candidates
 * This is used after AI Filter when there are 2+ identical or almost_same matches
 * 
 * @param croppedProductBase64 - Base64 of the cropped product from shelf
 * @param extractedInfo - Extracted product info (brand, size, flavor, etc.)
 * @param candidates - Array of FoodGraph results that passed AI filter
 * @param projectId - Optional project ID for custom prompts
 * @returns The selected match with reasoning, or null if no good match found
 */
export interface VisualMatchCandidate {
  id: string;
  gtin: string;
  productName: string;
  brandName: string;
  size: string;
  category?: string;
  ingredients?: string;
  imageUrl: string;
  matchStatus: MatchStatus; // From AI filter: 'identical' or 'almost_same'
}

export interface CandidateScore {
  candidateIndex: number;
  candidateId: string;
  candidateGtin: string;
  visualSimilarity: number;
  passedThreshold: boolean;
}

export interface VisualMatchSelection {
  selectedCandidateId: string | null; // null if no good match found
  selectedGtin: string | null;
  confidence: number; // 0.0-1.0
  reasoning: string; // Explanation of why this was selected
  visualSimilarityScore: number; // 0.0-1.0 for selected candidate
  brandMatch: boolean;
  sizeMatch: boolean;
  flavorMatch: boolean;
  candidateScores: CandidateScore[]; // Visual similarity scores for ALL candidates
}

export async function selectBestMatchFromMultiple(
  croppedProductBase64: string,
  extractedInfo: {
    brand: string;
    productName: string;
    size: string;
    flavor: string;
    category: string;
  },
  candidates: VisualMatchCandidate[],
  projectId?: string | null
): Promise<VisualMatchSelection> {
  console.log(`🎯 Visual Matching Selection: Analyzing ${candidates.length} candidates for best match`);
  console.log(`   Extracted Info: ${extractedInfo.brand} - ${extractedInfo.productName} (${extractedInfo.size})`);
  
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.error('❌ GOOGLE_GEMINI_API_KEY is not set');
    throw new Error('Gemini API key is not configured');
  }

  if (candidates.length === 0) {
    return {
      selectedCandidateId: null,
      selectedGtin: null,
      confidence: 0,
      reasoning: 'No candidates provided',
      visualSimilarityScore: 0,
      brandMatch: false,
      sizeMatch: false,
      flavorMatch: false,
      candidateScores: []
    };
  }

  // If only one candidate, return it directly
  if (candidates.length === 1) {
    return {
      selectedCandidateId: candidates[0].id,
      selectedGtin: candidates[0].gtin,
      confidence: 0.95,
      reasoning: 'Only one candidate available - auto-selected',
      visualSimilarityScore: 0.95,
      brandMatch: true,
      sizeMatch: true,
      flavorMatch: true,
      candidateScores: [{
        candidateIndex: 1,
        candidateId: candidates[0].id,
        candidateGtin: candidates[0].gtin,
        visualSimilarity: 0.95,
        passedThreshold: true
      }]
    };
  }

  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    }
  });

  // Fetch all candidate images
  const candidateImages: Array<{ id: string; gtin: string; base64: string }> = [];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.imageUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        candidateImages.push({ id: candidate.id, gtin: candidate.gtin, base64 });
      } else {
        console.warn(`⚠️ Failed to fetch candidate image: ${candidate.imageUrl}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching candidate ${candidate.gtin}:`, error);
    }
  }

  if (candidateImages.length === 0) {
    return {
      selectedCandidateId: null,
      selectedGtin: null,
      confidence: 0,
      reasoning: 'Failed to fetch any candidate images',
      visualSimilarityScore: 0,
      brandMatch: false,
      sizeMatch: false,
      flavorMatch: false,
      candidateScores: candidates.map((c, idx) => ({
        candidateIndex: idx + 1,
        candidateId: c.id,
        candidateGtin: c.gtin,
        visualSimilarity: 0,
        passedThreshold: false
      }))
    };
  }

  // Fetch the custom prompt template or use default
  console.log(`🎯 Fetching visual match prompt template for projectId: ${projectId || 'null (using default)'}`);
  const promptTemplate = await getPromptTemplate(projectId || null, 'visual_match');
  
  // Build the candidate descriptions
  const candidateDescriptions = candidates.map((c, idx) => 
    `Candidate ${idx + 1} (GTIN: ${c.gtin}):
- Product Name: ${c.productName}
- Brand: ${c.brandName}
- Size: ${c.size}
- Category: ${c.category || 'N/A'}
- Match Status from AI Filter: ${c.matchStatus}
${c.ingredients ? `- Ingredients: ${c.ingredients.substring(0, 200)}...` : ''}`
  ).join('\n\n');

  // Replace placeholders in the prompt template
  const prompt = promptTemplate
    .replace(/\{\{brand\}\}/g, extractedInfo.brand)
    .replace(/\{\{productName\}\}/g, extractedInfo.productName)
    .replace(/\{\{size\}\}/g, extractedInfo.size)
    .replace(/\{\{flavor\}\}/g, extractedInfo.flavor)
    .replace(/\{\{category\}\}/g, extractedInfo.category)
    .replace(/\{\{candidateCount\}\}/g, candidates.length.toString())
    .replace(/\{\{candidateDescriptions\}\}/g, candidateDescriptions)
    .replace(/\{\{candidateImageCount\}\}/g, (candidateImages.length + 1).toString());

  // Build image parts: cropped product + all candidates
  const imageParts = [
    {
      inlineData: {
        data: croppedProductBase64,
        mimeType: 'image/jpeg',
      },
    },
    ...candidateImages.map(img => ({
      inlineData: {
        data: img.base64,
        mimeType: 'image/jpeg',
      },
    }))
  ];

  try {
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    let text = response.text();

    // Clean up the response
    text = text.trim();
    if (text.startsWith('```json')) {
      text = text.substring(7);
    } else if (text.startsWith('```')) {
      text = text.substring(3);
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    const selection = JSON.parse(text) as {
      selectedCandidateIndex: number | null;
      confidence: number;
      reasoning: string;
      visualSimilarityScore: number;
      brandMatch: boolean;
      sizeMatch: boolean;
      flavorMatch: boolean;
      candidateScores: Array<{
        candidateIndex: number;
        candidateId: string;
        visualSimilarity: number;
        passedThreshold: boolean;
      }>;
    };

    // Convert candidate index to candidate ID
    let selectedCandidateId: string | null = null;
    let selectedGtin: string | null = null;
    
    if (selection.selectedCandidateIndex !== null && 
        selection.selectedCandidateIndex >= 1 && 
        selection.selectedCandidateIndex <= candidates.length) {
      const selectedCandidate = candidates[selection.selectedCandidateIndex - 1];
      selectedCandidateId = selectedCandidate.id;
      selectedGtin = selectedCandidate.gtin;
      console.log(`✅ Visual Match Selected: Candidate ${selection.selectedCandidateIndex} - ${selectedCandidate.productName} (${selectedGtin})`);
      console.log(`   Confidence: ${Math.round(selection.confidence * 100)}% | Visual: ${Math.round(selection.visualSimilarityScore * 100)}%`);
      console.log(`   Reasoning: ${selection.reasoning}`);
    } else {
      console.log(`❌ No match selected - ${selection.reasoning}`);
    }

    // Enrich candidate scores with GTIN (Gemini doesn't have access to it)
    const enrichedCandidateScores: CandidateScore[] = selection.candidateScores.map(score => {
      const candidate = candidates.find(c => c.id === score.candidateId);
      return {
        candidateIndex: score.candidateIndex,
        candidateId: score.candidateId,
        candidateGtin: candidate?.gtin || 'Unknown',
        visualSimilarity: score.visualSimilarity,
        passedThreshold: score.passedThreshold
      };
    });

    console.log(`📊 Visual Similarity Scores:`);
    enrichedCandidateScores.forEach(score => {
      const passedIcon = score.passedThreshold ? '✅' : '❌';
      console.log(`   ${passedIcon} Candidate ${score.candidateIndex}: ${(score.visualSimilarity * 100).toFixed(1)}% (${score.candidateGtin})`);
    });

    return {
      selectedCandidateId,
      selectedGtin,
      confidence: selection.confidence,
      reasoning: selection.reasoning,
      visualSimilarityScore: selection.visualSimilarityScore,
      brandMatch: selection.brandMatch,
      sizeMatch: selection.sizeMatch,
      flavorMatch: selection.flavorMatch,
      candidateScores: enrichedCandidateScores
    };

  } catch (error) {
    console.error('❌ Visual matching selection error:', error);
    return {
      selectedCandidateId: null,
      selectedGtin: null,
      confidence: 0,
      reasoning: `Error during visual matching: ${error instanceof Error ? error.message : 'Unknown error'}`,
      visualSimilarityScore: 0,
      brandMatch: false,
      sizeMatch: false,
      flavorMatch: false,
      candidateScores: candidates.map((c, idx) => ({
        candidateIndex: idx + 1,
        candidateId: c.id,
        candidateGtin: c.gtin,
        visualSimilarity: 0,
        passedThreshold: false
      }))
    };
  }
}

/**
 * Save visual match results to database
 * - Saves ALL candidates that passed visual similarity threshold (≥0.7) as 'almost_same'
 * - Saves the final selected candidate as 'identical' (if selected)
 * - Stores visual similarity scores for each candidate
 * 
 * @param supabase - Authenticated Supabase client
 * @param detectionId - Detection ID to save results for
 * @param visualMatchResult - Result from selectBestMatchFromMultiple
 * @param allCandidates - All candidates that were evaluated
 * @param searchTerm - Search term used to find candidates
 * @returns Success status and details
 */
export async function saveVisualMatchResults(
  supabase: SupabaseClient,
  detectionId: string,
  visualMatchResult: VisualMatchSelection,
  allCandidates: VisualMatchCandidate[],
  searchTerm: string
): Promise<{ success: boolean; savedCount: number; selectedGtin: string | null; error?: string }> {
  try {
    console.log(`💾 Saving visual match results for detection ${detectionId}`);
    console.log(`   Total candidates: ${visualMatchResult.candidateScores.length}`);
    console.log(`   Passed threshold: ${visualMatchResult.candidateScores.filter(s => s.passedThreshold).length}`);
    console.log(`   Selected: ${visualMatchResult.selectedGtin || 'None'}`);

    const resultsToSave: Array<{
      detection_id: string;
      search_term: string;
      result_rank: number;
      product_gtin: string;
      product_name: string;
      brand_name: string;
      category: string | null;
      front_image_url: string | null;
      full_data: Record<string, unknown>;
      processing_stage: 'visual_match';
      match_status: 'identical' | 'almost_same';
      visual_similarity: number;
      match_reason: string;
    }> = [];

    // Process each candidate score
    for (const score of visualMatchResult.candidateScores) {
      // Find the full candidate info
      const candidate = allCandidates.find(c => c.id === score.candidateId);
      if (!candidate) {
        console.warn(`⚠️ Candidate ${score.candidateId} not found in allCandidates`);
        continue;
      }

      // Only save candidates that passed the threshold OR the selected one
      const isSelected = score.candidateGtin === visualMatchResult.selectedGtin;
      
      if (score.passedThreshold || isSelected) {
        const matchStatus: 'identical' | 'almost_same' = isSelected ? 'identical' : 'almost_same';
        const reason = isSelected 
          ? `Selected as best match. ${visualMatchResult.reasoning}`
          : `Passed visual similarity threshold (${(score.visualSimilarity * 100).toFixed(1)}%)`;

        resultsToSave.push({
          detection_id: detectionId,
          search_term: searchTerm,
          result_rank: score.candidateIndex,
          product_gtin: candidate.gtin,
          product_name: candidate.productName,
          brand_name: candidate.brandName,
          category: candidate.category || null,
          front_image_url: candidate.imageUrl,
          full_data: {
            size: candidate.size,
            ingredients: candidate.ingredients,
            matchStatusFromAI: candidate.matchStatus
          },
          processing_stage: 'visual_match',
          match_status: matchStatus,
          visual_similarity: score.visualSimilarity,
          match_reason: reason
        });

        console.log(`   ${isSelected ? '✅' : '➕'} ${matchStatus.toUpperCase()}: ${candidate.productName} - ${(score.visualSimilarity * 100).toFixed(1)}%`);
      }
    }

    // If no candidates passed threshold but we have a selected match, still save it
    if (resultsToSave.length === 0 && visualMatchResult.selectedGtin) {
      console.log(`   ⚠️ No candidates passed threshold, but saving selected match anyway`);
      const selectedCandidate = allCandidates.find(c => c.gtin === visualMatchResult.selectedGtin);
      if (selectedCandidate) {
        const selectedScore = visualMatchResult.candidateScores.find(s => s.candidateGtin === visualMatchResult.selectedGtin);
        resultsToSave.push({
          detection_id: detectionId,
          search_term: searchTerm,
          result_rank: selectedScore?.candidateIndex || 1,
          product_gtin: selectedCandidate.gtin,
          product_name: selectedCandidate.productName,
          brand_name: selectedCandidate.brandName,
          category: selectedCandidate.category || null,
          front_image_url: selectedCandidate.imageUrl,
          full_data: {
            size: selectedCandidate.size,
            ingredients: selectedCandidate.ingredients,
            matchStatusFromAI: selectedCandidate.matchStatus
          },
          processing_stage: 'visual_match',
          match_status: 'identical',
          visual_similarity: selectedScore?.visualSimilarity || 0,
          match_reason: `Selected as best match (below threshold). ${visualMatchResult.reasoning}`
        });
      }
    }
    
    if (resultsToSave.length === 0) {
      console.log(`   ⚠️ No results to save`);
      return {
        success: true,
        savedCount: 0,
        selectedGtin: null
      };
    }

    // Use UPSERT to handle duplicates (detection_id, product_gtin)
    const { error: insertError } = await supabase
      .from('branghunt_foodgraph_results')
      .upsert(resultsToSave, {
        onConflict: 'detection_id,product_gtin',
        ignoreDuplicates: false
      });

    if (insertError) {
      console.error(`❌ Failed to save visual match results:`, insertError);
      return {
        success: false,
        savedCount: 0,
        selectedGtin: null,
        error: insertError.message
      };
    }

    console.log(`✅ Saved ${resultsToSave.length} visual match results`);
    
    return {
      success: true,
      savedCount: resultsToSave.length,
      selectedGtin: visualMatchResult.selectedGtin
    };

  } catch (error) {
    console.error(`❌ Error saving visual match results:`, error);
    return {
      success: false,
      savedCount: 0,
      selectedGtin: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
