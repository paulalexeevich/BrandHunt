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
 * Returns first 50 results with fuzzy matching enabled
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
): Promise<{ products: FoodGraphProduct[]; searchTerm: string }> {
  const token = await authenticate();

  // Build comprehensive search term by combining all available fields
  // Priority: brand + productName + flavor + size (all combined into one string)
  let enhancedSearchTerm = searchTerm;
  if (options) {
    const parts = [
      options.brand, 
      options.productName, 
      options.flavor, 
      options.size
    ].filter(Boolean);
    
    if (parts.length > 0) {
      // Combine all parts into single comprehensive search string
      enhancedSearchTerm = parts.join(' ').trim();
    }
  }
  
  console.log('Building FoodGraph search term:', {
    original: searchTerm,
    brand: options?.brand,
    productName: options?.productName,
    flavor: options?.flavor,
    size: options?.size,
    combined: enhancedSearchTerm
  });

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
  
  // Return first 50 products along with the actual search term used
  return {
    products: (data.results || []).slice(0, 50),
    searchTerm: enhancedSearchTerm
  };
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

/**
 * Calculate similarity score between two strings (0-1 scale)
 * Uses simple case-insensitive comparison and substring matching
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Check word overlap
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w) && w.length > 2);
  
  if (commonWords.length > 0) {
    const overlapScore = commonWords.length / Math.max(words1.length, words2.length);
    return 0.5 + (overlapScore * 0.3); // 0.5-0.8 range for word overlap
  }
  
  return 0;
}

/**
 * Extract size numbers from string for comparison (e.g., "8 oz" -> 8, "2.5 lbs" -> 2.5)
 */
function extractSizeNumber(sizeStr: string): number | null {
  if (!sizeStr || sizeStr === 'Unknown') return null;
  
  // Match numbers including decimals
  const match = sizeStr.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Pre-filter FoodGraph results based on text similarity with extracted product info
 * Filters by brand, size, and flavor similarity before AI comparison
 * 
 * @param products - FoodGraph search results to filter
 * @param extractedInfo - Product information extracted from the shelf image
 * @returns Filtered products with similarity scores
 */
export function preFilterFoodGraphResults(
  products: FoodGraphProduct[],
  extractedInfo: {
    brand?: string;
    size?: string;
    flavor?: string;
    productName?: string;
  }
): Array<FoodGraphProduct & { similarityScore: number; matchReasons: string[] }> {
  console.log('🔍 Pre-filtering FoodGraph results:', {
    totalProducts: products.length,
    extractedInfo
  });

  const results = products.map(product => {
    let score = 0;
    const reasons: string[] = [];
    
    // Brand similarity (weight: 40%)
    if (extractedInfo.brand && extractedInfo.brand !== 'Unknown') {
      const brandSimilarity = Math.max(
        calculateStringSimilarity(extractedInfo.brand, product.companyBrand || ''),
        calculateStringSimilarity(extractedInfo.brand, product.companyManufacturer || ''),
        calculateStringSimilarity(extractedInfo.brand, product.title || '')
      );
      score += brandSimilarity * 0.4;
      if (brandSimilarity > 0.5) {
        reasons.push(`Brand match: ${(brandSimilarity * 100).toFixed(0)}%`);
      }
    }
    
    // Size similarity (weight: 30%)
    if (extractedInfo.size && extractedInfo.size !== 'Unknown') {
      const extractedSize = extractSizeNumber(extractedInfo.size);
      const productSize = extractSizeNumber(product.measures || '');
      
      if (extractedSize !== null && productSize !== null) {
        // Consider sizes similar if within 20% of each other
        const sizeDiff = Math.abs(extractedSize - productSize) / Math.max(extractedSize, productSize);
        const sizeSimilarity = Math.max(0, 1 - sizeDiff * 5); // 0-20% diff maps to 1.0-0.0
        score += sizeSimilarity * 0.3;
        if (sizeSimilarity > 0.5) {
          reasons.push(`Size match: ${extractedInfo.size} ≈ ${product.measures}`);
        }
      } else if (product.measures && 
                 (extractedInfo.size.toLowerCase().includes(product.measures.toLowerCase()) ||
                  product.measures.toLowerCase().includes(extractedInfo.size.toLowerCase()))) {
        // Text-based size matching as fallback
        score += 0.2;
        reasons.push(`Size text match`);
      }
    }
    
    // Flavor similarity (weight: 30%)
    if (extractedInfo.flavor && extractedInfo.flavor !== 'Unknown') {
      const flavorSimilarity = Math.max(
        calculateStringSimilarity(extractedInfo.flavor, product.title || ''),
        product.ingredients ? (product.ingredients.toLowerCase().includes(extractedInfo.flavor.toLowerCase()) ? 0.6 : 0) : 0
      );
      score += flavorSimilarity * 0.3;
      if (flavorSimilarity > 0.5) {
        reasons.push(`Flavor match: ${(flavorSimilarity * 100).toFixed(0)}%`);
      }
    }
    
    return {
      ...product,
      similarityScore: score,
      matchReasons: reasons
    };
  });

  // Filter products with similarity score > 0.3 (30% threshold)
  const filtered = results
    .filter(r => r.similarityScore > 0.3)
    .sort((a, b) => b.similarityScore - a.similarityScore);

  console.log('✅ Pre-filter results:', {
    originalCount: products.length,
    filteredCount: filtered.length,
    topScores: filtered.slice(0, 5).map(r => ({
      title: r.title,
      score: r.similarityScore.toFixed(2),
      reasons: r.matchReasons
    }))
  });

  return filtered;
}
