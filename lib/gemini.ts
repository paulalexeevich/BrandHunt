import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export interface DetectedProduct {
  box_2d: [number, number, number, number]; // [y0, x0, y1, x1] normalized coordinates
  label: string;
}

/**
 * Detect products in an image using Gemini 2.5 Flash
 * Returns bounding boxes and labels for detected products
 */
export async function detectProducts(imageBase64: string, mimeType: string): Promise<DetectedProduct[]> {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1,
    }
  });

  const prompt = `
Detect all products in this image. For each product, provide:
1. A 2D bounding box in normalized coordinates [y0, x0, y1, x1] where values are between 0 and 1000
2. A brief label describing the product

Return a JSON array with the following structure:
[
  {
    "box_2d": [y0, x0, y1, x1],
    "label": "product description"
  }
]

Only return the JSON array, no additional text or markdown formatting.
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
 * Extract brand name from a product detection
 * Takes an image and bounding box, returns brand name
 */
export async function extractBrandName(
  imageBase64: string, 
  mimeType: string,
  boundingBox: { y0: number; x0: number; y1: number; x1: number }
): Promise<string> {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1,
    }
  });

  const prompt = `
Focus on the product within the bounding box region (y0=${boundingBox.y0}, x0=${boundingBox.x0}, y1=${boundingBox.y1}, x1=${boundingBox.x1}, normalized 0-1000).

What is the brand name of this product? 

Return ONLY the brand name as plain text, nothing else. If you cannot determine the brand, return "Unknown".
`;

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: mimeType,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const brandName = response.text().trim();

  return brandName || 'Unknown';
}

