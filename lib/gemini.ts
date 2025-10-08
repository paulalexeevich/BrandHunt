import { GoogleGenerativeAI } from '@google/generative-ai';

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
    return detections;
  } catch (error) {
    console.error('Failed to parse Gemini response:', cleanedText);
    throw new Error('Failed to parse product detection results');
  }
}

/**
 * Extract brand name and category from a product detection
 * Takes an image and bounding box, returns brand and category
 */
export async function extractProductInfo(
  imageBase64: string, 
  mimeType: string,
  boundingBox: { y0: number; x0: number; y1: number; x1: number }
): Promise<ProductInfo> {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    }
  });

  const prompt = `
CRITICAL: This image contains MULTIPLE products. You MUST extract information from ONLY THE SPECIFIC PRODUCT within the bounding box coordinates provided below. IGNORE all other products in the image.

TARGET PRODUCT BOUNDING BOX (normalized 0-1000 scale):
- Top edge (y0): ${boundingBox.y0}
- Left edge (x0): ${boundingBox.x0}
- Bottom edge (y1): ${boundingBox.y1}
- Right edge (x1): ${boundingBox.x1}

INSTRUCTIONS:
1. Locate the product within these exact coordinates
2. Read ONLY the text/branding visible on THIS SPECIFIC PRODUCT
3. Extract ALL visible information from THIS PRODUCT only

Extract the following information about THIS SPECIFIC PRODUCT:
1. Brand name (manufacturer/brand, e.g., "Tru Fru", "Reese's", "bettergoods")
2. Product name (full product name as written on package, e.g., "Frozen Fruit Strawberries", "Peanut Butter Cups")
3. Category (e.g., "Frozen Food", "Dairy", "Snacks", "Candy")
4. Flavor/Variant (e.g., "Strawberry", "Raspberry", "Chocolate", "Original")
5. Size/Weight (e.g., "8 oz", "16 oz", "2 lbs", "500g")
6. Description (brief product description from package, e.g., "Dark Chocolate Covered Strawberries")
7. SKU/Barcode (any product code, UPC, or barcode visible)

IMPORTANT: If you see "Reese's" but the target product shows "Tru Fru", extract "Tru Fru". 
If you see "bettergoods" but the target shows "Hershey's", extract "Hershey's".
Only extract information from within the specified bounding box region.

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
      data: imageBase64,
      mimeType: mimeType,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
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
