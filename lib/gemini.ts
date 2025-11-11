import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase-server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

// Default prompts (used as fallback if no custom prompt is found)
const DEFAULT_EXTRACT_INFO_PROMPT = `
Analyze this image and extract product information.

FIRST, determine classification:
1. Is this actually a product? (vs shelf fixture, price tag, empty space, or non-product item)
2. Are product details clearly visible? (can you read brand, product name, or other text?)

THEN, extract the following information:
1. Brand name (manufacturer/brand, e.g., "Tru Fru", "Reese's", "bettergoods")
2. Product name (full product name as written on package, e.g., "Frozen Fruit Strawberries", "Peanut Butter Cups")
3. Category (e.g., "Frozen Food", "Dairy", "Snacks", "Candy")
4. Flavor/Variant (e.g., "Strawberry", "Raspberry", "Chocolate", "Original")
5. Size/Weight (e.g., "8 oz", "16 oz", "2 lbs", "500g")
6. Description (brief product description from package, e.g., "Dark Chocolate Covered Strawberries")
7. SKU/Barcode (any product code, UPC, or barcode visible)

For EACH extracted field, provide a confidence score from 0.0 to 1.0:
- 1.0 = Completely certain, text is clearly visible and readable
- 0.8 = Very confident, minor uncertainty
- 0.6 = Moderately confident, some guessing involved
- 0.4 = Low confidence, mostly guessing
- 0.2 = Very uncertain
- 0.0 = Unknown/not visible

Return a JSON object with this EXACT structure:
{
  "isProduct": true or false,
  "detailsVisible": true or false,
  "extractionNotes": "Brief note explaining classification or extraction issues (e.g., 'Not a product - price tag only', 'Product too far/blurry', 'Clear view of all details')",
  "brand": "brand name or Unknown",
  "brandConfidence": 0.0 to 1.0,
  "productName": "full product name or Unknown",
  "productNameConfidence": 0.0 to 1.0,
  "category": "category name or Unknown",
  "categoryConfidence": 0.0 to 1.0,
  "flavor": "flavor or variant or Unknown",
  "flavorConfidence": 0.0 to 1.0,
  "size": "size or weight or Unknown",
  "sizeConfidence": 0.0 to 1.0,
  "description": "product description or Unknown",
  "descriptionConfidence": 0.0 to 1.0,
  "sku": "product code/barcode or Unknown",
  "skuConfidence": 0.0 to 1.0
}

Important Guidelines:
- If isProduct = false, set all confidence scores to 0.0 and all fields to "Unknown"
- If detailsVisible = false, you can still set isProduct = true, but confidence scores should be low (0.0-0.4)
- Use Unknown for any field you cannot determine
- Be honest about confidence - lower scores for partially visible or unclear text

Only return the JSON object, nothing else.
`;

const DEFAULT_AI_FILTER_PROMPT = `
Compare these two product images and determine their match status.

Consider these factors:
1. Brand name and logo
2. Product name and type
3. Packaging design and colors
4. Flavor/variant information
5. Size information
6. Overall visual appearance

Return a JSON object with this structure:
{
  "matchStatus": "identical" or "almost_same" or "not_match",
  "confidence": 0.0 to 1.0,
  "visualSimilarity": 0.0 to 1.0,
  "reason": "Brief explanation of the match status"
}

CRITICAL DEFINITIONS:

matchStatus - THREE possible values:

1. "identical" - Both products are EXACTLY the same:
   - Same brand, same product name
   - Same flavor/variant
   - Same size/quantity
   - Same packaging design
   - All details match perfectly
   
2. "almost_same" - Same EXACT product with minor packaging variations:
   - MUST match: brand, product name, flavor/variant, package type
   - Very close or same size (within similar range, even if unclear/blurry)
   - Almost identical visual design
   - Same meaning in claims/benefits (wording may differ)
   - Only differences: packaging refresh, claim text updates, regional variations
   - Example: Same product with "Doctor Recommended" vs "Spray Protection" claim
   
3. "not_match" - Different products:
   - Different flavor/variant (e.g., "Complete Clean" vs "Light & Fresh") = NOT_MATCH
   - Significantly different size (e.g., 3.8oz vs 10oz) = NOT_MATCH
   - Different product types/lines = NOT_MATCH
   - Different brands = NOT_MATCH

confidence: How certain you are about the matchStatus decision (0.0 = uncertain, 1.0 = very certain)

visualSimilarity: How similar the images LOOK overall (0.0 = completely different, 1.0 = nearly identical)
  * Identical products = 0.9-1.0
  * Almost same (packaging updates) = 0.7-0.9
  * Same brand, different variant = 0.3-0.6
  * Different brands = 0.0-0.3

Examples:
- Exact same: {matchStatus: "identical", confidence: 0.95, visualSimilarity: 0.95, reason: "Same brand, product, size, and flavor"}
- Packaging refresh: {matchStatus: "almost_same", confidence: 0.9, visualSimilarity: 0.85, reason: "Same Secret Complete Clean 3.8oz, minor claim text difference"}
- Different variant: {matchStatus: "not_match", confidence: 0.95, visualSimilarity: 0.7, reason: "Same brand/size but different scent: Fresh vs Powder"}
- Different size: {matchStatus: "not_match", confidence: 0.95, visualSimilarity: 0.75, reason: "Same Tide detergent flavor, but 50oz vs 100oz"}
- Different brands: {matchStatus: "not_match", confidence: 1.0, visualSimilarity: 0.2, reason: "Different brands entirely"}
`;

/**
 * Fetch the active prompt template for a given project and step
 * Returns the custom prompt if found, otherwise returns the default prompt
 */
export async function getPromptTemplate(projectId: string | null, stepName: string): Promise<string> {
  // If no project ID, return default
  if (!projectId) {
    console.log(`No project ID provided for ${stepName}, using default prompt`);
    return stepName === 'extract_info' ? DEFAULT_EXTRACT_INFO_PROMPT : DEFAULT_AI_FILTER_PROMPT;
  }

  try {
    const supabase = await createClient();
    
    const { data: template, error } = await supabase
      .from('branghunt_prompt_templates')
      .select('prompt_template')
      .eq('project_id', projectId)
      .eq('step_name', stepName)
      .eq('is_active', true)
      .single();

    if (error || !template) {
      console.log(`No custom prompt found for project ${projectId}, step ${stepName}, using default`);
      return stepName === 'extract_info' ? DEFAULT_EXTRACT_INFO_PROMPT : DEFAULT_AI_FILTER_PROMPT;
    }

    console.log(`Using custom prompt for project ${projectId}, step ${stepName}`);
    return template.prompt_template;
  } catch (error) {
    console.error(`Error fetching prompt template:`, error);
    return stepName === 'extract_info' ? DEFAULT_EXTRACT_INFO_PROMPT : DEFAULT_AI_FILTER_PROMPT;
  }
}

export interface DetectedProduct {
  box_2d: [number, number, number, number]; // [y0, x0, y1, x1] normalized coordinates
  label: string;
}

export interface ProductInfo {
  // Classification fields
  isProduct: boolean;
  detailsVisible: boolean;
  extractionNotes?: string;
  
  // Product fields
  brand: string;
  productName: string;
  category: string;
  flavor: string;
  size: string;
  description: string;
  sku: string;
  
  // Confidence scores (0.0 to 1.0)
  brandConfidence: number;
  productNameConfidence: number;
  categoryConfidence: number;
  flavorConfidence: number;
  sizeConfidence: number;
  descriptionConfidence: number;
  skuConfidence: number;
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
      detailsVisible: false,
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
      sizeConfidence: 0,
      description: 'Unknown',
      descriptionConfidence: 0,
      sku: 'Unknown',
      skuConfidence: 0
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
