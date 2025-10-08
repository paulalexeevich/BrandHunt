/**
 * FoodGraph API Integration
 * Documentation: https://api.foodgraph.com/api
 */

interface FoodGraphAuthResponse {
  accessToken: string;
  refreshToken?: string;
}

interface FoodGraphProduct {
  key: string;
  keys?: {
    FDC_ID?: string;
    AMAZON_ASIN?: string;
    GTIN14?: string;
    [key: string]: string | undefined;
  };
  title: string;
  category?: string[];
  measures?: string;
  sourcePdpUrls?: string[];
  ingredients?: string;
  companyBrand?: string;
  companyManufacturer?: string;
  images?: Array<{
    id: string;
    type: string;
    urls: {
      original?: string;
      desktop?: string;
      mobile?: string;
    };
  }>;
  _createdAt?: number;
  _updatedAt?: number;
  _score?: number;
  [key: string]: unknown;
}

interface FoodGraphQueryResponse {
  success: boolean;
  pagination?: {
    currentPage: number;
    totalRetrieved: number;
    maxResults: number;
    currentPageSize: number;
    total: number;
    traceId?: string;
    nextPageUrl?: string;
  };
  results: FoodGraphProduct[];
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
 * 
 * @param searchTerm - Can be a simple brand name or a more detailed product description
 * @param options - Optional additional search parameters
 */
export async function searchProducts(
  searchTerm: string, 
  options?: {
    brand?: string;
    productName?: string;
    flavor?: string;
    size?: string;
  }
): Promise<FoodGraphProduct[]> {
  const token = await authenticate();

  // Build comprehensive search term
  let enhancedSearchTerm = searchTerm;
  if (options) {
    const parts = [options.brand, options.productName, options.flavor, options.size]
      .filter(Boolean);
    if (parts.length > 0) {
      enhancedSearchTerm = parts.join(' ');
    }
  }

  const requestBody = {
    updatedAtFrom: "2025-07-01T00:00:00Z",
    productFilter: "CORE_FIELDS",
    search: enhancedSearchTerm,
    searchIn: {
      or: [
        "title"
      ]
    },
    fuzzyMatch: true
  };

  console.log('FoodGraph Request:', {
    url: 'https://api.foodgraph.com/v1/catalog/products/search/query',
    body: requestBody,
    enhancedSearch: enhancedSearchTerm
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
    productsFound: data.results?.length || 0,
    totalRetrieved: data.pagination?.totalRetrieved,
    total: data.pagination?.total
  });
  
  // Return only first 10 products
  return (data.results || []).slice(0, 10);
}

/**
 * Extract front image URL from FoodGraph product data
 */
export function getFrontImageUrl(product: FoodGraphProduct): string | null {
  if (!product.images || product.images.length === 0) {
    return null;
  }

  // Look for FRONT type image first
  const frontImage = product.images.find(img => img.type === 'FRONT');
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
