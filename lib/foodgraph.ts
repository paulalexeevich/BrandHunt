/**
 * FoodGraph API Integration
 * Documentation: https://api.foodgraph.com/api
 */

interface FoodGraphAuthResponse {
  accessToken: string;
  refreshToken?: string;
}

interface FoodGraphProduct {
  gtin?: string;
  name?: string;
  brand?: string;
  category?: string;
  images?: Array<{
    urls?: {
      mobile?: string;
      desktop?: string;
    };
    perspective?: string;
  }>;
  [key: string]: unknown;
}

interface FoodGraphQueryResponse {
  products: FoodGraphProduct[];
  totalCount: number;
}

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Authenticate with FoodGraph API
 */
async function authenticate(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const email = process.env.FOODGRAPH_EMAIL;
  const password = process.env.FOODGRAPH_PASSWORD;

  if (!email || !password) {
    throw new Error('FoodGraph credentials not configured');
  }

  const response = await fetch('https://api.foodgraph.com/v1/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      email, 
      password,
      includeRefreshToken: true 
    }),
  });

  if (!response.ok) {
    throw new Error(`FoodGraph authentication failed: ${response.statusText}`);
  }

  const data = await response.json() as FoodGraphAuthResponse;
  cachedToken = data.accessToken;
  // JWT tokens typically expire in 24 hours, set expiry to 23 hours for safety
  tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);

  return cachedToken;
}

/**
 * Search FoodGraph catalog for products using query endpoint
 * Returns first 5 results with fuzzy matching enabled
 */
export async function searchProducts(searchTerm: string): Promise<FoodGraphProduct[]> {
  const token = await authenticate();

  const requestBody = {
    updatedAtFrom: "2025-07-01T00:00:00Z",
    productFilter: "CORE_FIELDS",
    search: searchTerm,
    searchIn: {
      or: [
        "title"
      ]
    },
    fuzzyMatch: true
  };

  console.log('FoodGraph Request:', {
    url: 'https://api.foodgraph.com/v1/catalog/products/search/query',
    body: requestBody
  });

  const response = await fetch(
    'https://api.foodgraph.com/v1/catalog/products/search/query',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  console.log('FoodGraph Response Status:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('FoodGraph API Error Response:', errorText);
    console.error('Request Body was:', JSON.stringify(requestBody, null, 2));
    throw new Error(`FoodGraph search failed: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json() as FoodGraphQueryResponse;
  console.log('FoodGraph Success:', {
    productsFound: data.products?.length || 0,
    totalCount: data.totalCount
  });
  
  // Return only first 5 products
  return (data.products || []).slice(0, 5);
}

/**
 * Extract front image URL from FoodGraph product data
 */
export function getFrontImageUrl(product: FoodGraphProduct): string | null {
  if (!product.images || product.images.length === 0) {
    return null;
  }

  // Look for front perspective image first
  const frontImage = product.images.find(img => img.perspective === 'front');
  if (frontImage?.urls?.desktop || frontImage?.urls?.mobile) {
    return frontImage.urls.desktop || frontImage.urls.mobile || null;
  }

  // Fall back to first image with URLs
  const firstImageWithUrl = product.images.find(img => img.urls?.desktop || img.urls?.mobile);
  if (firstImageWithUrl?.urls?.desktop || firstImageWithUrl?.urls?.mobile) {
    return firstImageWithUrl.urls.desktop || firstImageWithUrl.urls.mobile || null;
  }

  return null;
}
