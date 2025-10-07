/**
 * FoodGraph API Integration
 * Documentation: https://api.foodgraph.com/api
 */

interface FoodGraphAuthResponse {
  token: string;
  expiresIn: number;
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

interface FoodGraphSearchResponse {
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

  const response = await fetch('https://api.foodgraph.com/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`FoodGraph authentication failed: ${response.statusText}`);
  }

  const data = await response.json() as FoodGraphAuthResponse;
  cachedToken = data.token;
  // Set expiry to 50 minutes (token typically expires in 60 minutes)
  tokenExpiry = Date.now() + (50 * 60 * 1000);

  return cachedToken;
}

/**
 * Search FoodGraph catalog for products matching a search term
 * Returns top 50 results
 */
export async function searchProducts(searchTerm: string): Promise<FoodGraphProduct[]> {
  const token = await authenticate();

  const response = await fetch(
    `https://api.foodgraph.com/api/v1/catalog/products/search/terms?searchTerm=${encodeURIComponent(searchTerm)}&limit=50`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`FoodGraph search failed: ${response.statusText}`);
  }

  const data = await response.json() as FoodGraphSearchResponse;
  return data.products || [];
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

