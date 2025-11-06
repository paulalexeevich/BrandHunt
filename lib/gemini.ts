import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export interface DetectedProduct {
  box_2d: [number, number, number, number]; // [y0, x0, y1, x1] normalized coordinates
  label: string;
}

export interface ProductInfo {
  brand: string;
  category: string;
  sku: string;
  productName: string;
  description: string;
  flavor: string;
  size: string;
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
  boundingBox: { y0: number; x0: number; y1: number; x1: number }
): Promise<ProductInfo> {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.error('❌ GOOGLE_GEMINI_API_KEY is not set');
    throw new Error('Gemini API key is not configured');
  }
  
  // First, crop the image to just the bounding box area
  const { croppedBase64, width, height } = await cropImageToBoundingBox(imageBase64, boundingBox);
  
  console.log(`✂️ Cropped image to ${width}x${height}px for product extraction`);
  
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    }
  });

  const prompt = `
Analyze this product image and extract ALL visible information.

Extract the following information:
1. Brand name (manufacturer/brand, e.g., "Tru Fru", "Reese's", "bettergoods")
2. Product name (full product name as written on package, e.g., "Frozen Fruit Strawberries", "Peanut Butter Cups")
3. Category (e.g., "Frozen Food", "Dairy", "Snacks", "Candy")
4. Flavor/Variant (e.g., "Strawberry", "Raspberry", "Chocolate", "Original")
5. Size/Weight (e.g., "8 oz", "16 oz", "2 lbs", "500g")
6. Description (brief product description from package, e.g., "Dark Chocolate Covered Strawberries")
7. SKU/Barcode (any product code, UPC, or barcode visible)

Return a JSON object with this exact structure:
{
  "brand": "brand name",
  "productName": "full product name",
  "category": "category name",
  "flavor": "flavor or variant",
  "size": "size or weight",
  "description": "product description",
  "sku": "product code or barcode"
}

If you cannot determine any field, use "Unknown" for that field.
Only return the JSON object, nothing else.
`;

  const imagePart = {
    inlineData: {
      data: croppedBase64,  // Use cropped image instead of full image
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
    const productInfo = JSON.parse(cleanedText) as ProductInfo;
    console.log('✅ Gemini extractProductInfo returned:', JSON.stringify(productInfo, null, 2));
    return productInfo;
  } catch (error) {
    console.error('Failed to parse Gemini response:', cleanedText);
    // Fallback to simple extraction
    return {
      brand: 'Unknown',
      category: 'Unknown',
      sku: 'Unknown',
      productName: 'Unknown',
      description: 'Unknown',
      flavor: 'Unknown',
      size: 'Unknown'
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
export async function compareProductImages(
  originalImageBase64: string,
  foodgraphImageUrl: string
): Promise<boolean> {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    }
  });

  const prompt = `
Compare these two product images and determine if they show the SAME product.

Consider these factors:
1. Brand name and logo
2. Product name and type
3. Packaging design and colors
4. Flavor/variant information
5. Overall visual appearance

Return a JSON object with this structure:
{
  "isMatch": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation of why they match or don't match"
}

Important: Only return true if you are confident these are the SAME product (same brand, same product, same variant). Different flavors or sizes of the same brand should return false.
`;

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

    const comparison = JSON.parse(cleanedText) as { isMatch: boolean; confidence: number; reason: string };
    console.log(`🔍 Image comparison: ${comparison.isMatch ? 'MATCH' : 'NO MATCH'} (confidence: ${comparison.confidence}) - ${comparison.reason}`);
    
    // Return true if it's a match with high confidence (>= 0.7)
    return comparison.isMatch && comparison.confidence >= 0.7;
  } catch (error) {
    console.error('Failed to compare images:', error);
    // On error, don't filter out the product
    return true;
  }
}
