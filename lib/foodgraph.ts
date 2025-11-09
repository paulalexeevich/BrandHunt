/**
 * FoodGraph API Integration
 * Documentation: https://api.foodgraph.com/api
 */

interface FoodGraphAuthResponse {
  accessToken: string;
  refreshToken?: string;
}

interface FoodGraphProduct {
  key: string; // Primary GTIN/barcode
  keys?: {
    FDC_ID?: string;
    AMAZON_ASIN?: string;
    GTIN14?: string;
    WALMART_MPN?: string;
    WALMART_US_ITEM_ID?: string;
    WALMART_WIN?: string;
    [key: string]: string | undefined;
  };
  title: string;
  category?: string[];
  measures?: string; // e.g., "34.5 oz, Jar"
  sourcePdpUrls?: string[];
  
  // Descriptions
  description?: string;
  descriptionInstructions?: string;
  descriptionWarnings?: string;
  
  // Ingredients
  ingredients?: string;
  ingredientsProp65Warning?: boolean;
  
  // Company Information
  companyBrand?: string;
  companyBrandOwner?: string;
  companySubBrand?: string;
  companyManufacturer?: string;
  companyDistributor?: string;
  companyCountriesOfOrigin?: string[];
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyWebsiteUrl?: string;
  companyIsPrivateLabel?: boolean;
  companyPrivateLabelType?: string; // e.g., "store brand"
  
  // Claims
  claimsGlutenFree?: boolean;
  claimsNonGmo?: boolean;
  claimsOrganic?: boolean;
  claimsVegan?: boolean;
  
  // Allergens
  allergensContainsStatement?: string;
  allergensMayContainStatement?: string;
  
  // Images
  images?: Array<{
    id: string;
    type: string; // e.g., "FRONT", "BACK", "NUTRITION"
    urls: {
      original?: string;
      desktop?: string;
      mobile?: string;
    };
  }>;
  
  // Metadata
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
    nextPageUrl?: string;
    traceId?: string;
  };
  results: FoodGraphProduct[];
  querySearch?: {
    updatedAtFrom?: string;
    productFilter?: string;
    search?: string;
    searchIn?: {
      or?: string[];
    };
    fuzzyMatch?: boolean;
  };
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
 * Returns first 100 results with fuzzy matching enabled
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
  
  // Return first 100 products along with the actual search term used
  return {
    products: (data.results || []).slice(0, 100),
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
 * Extract retailer name from store name string
 * Examples: "Target Store #1234" -> "target", "Walgreens Store #6105 - Address" -> "walgreens"
 */
function extractRetailerFromStoreName(storeName: string): string | null {
  if (!storeName) return null;
  
  const normalized = storeName.toLowerCase().trim();
  
  // Common retailers
  const retailers = ['target', 'walmart', 'walgreens', 'cvs', 'kroger', 'safeway', 
                     'albertsons', 'publix', 'whole foods', 'trader joe', 'costco', 
                     'sam\'s club', 'aldi', 'lidl', 'food lion', 'giant', 'stop & shop'];
  
  for (const retailer of retailers) {
    if (normalized.includes(retailer)) {
      return retailer;
    }
  }
  
  // Extract first word as fallback (e.g., "Meijer Store" -> "meijer")
  const firstWord = normalized.split(/\s+/)[0];
  return firstWord || null;
}

/**
 * Extract retailers from FoodGraph sourcePdpUrls
 * Returns array of retailer names found in URLs (e.g., ["walmart", "target"])
 */
function extractRetailersFromUrls(urls: string[] | undefined): string[] {
  if (!urls || urls.length === 0) return [];
  
  const retailers = new Set<string>();
  
  for (const url of urls) {
    const urlLower = url.toLowerCase();
    
    // Extract domain-based retailers
    if (urlLower.includes('walmart.com')) retailers.add('walmart');
    if (urlLower.includes('target.com')) retailers.add('target');
    if (urlLower.includes('walgreens.com')) retailers.add('walgreens');
    if (urlLower.includes('cvs.com')) retailers.add('cvs');
    if (urlLower.includes('kroger.com')) retailers.add('kroger');
    if (urlLower.includes('safeway.com')) retailers.add('safeway');
    if (urlLower.includes('albertsons.com')) retailers.add('albertsons');
    if (urlLower.includes('publix.com')) retailers.add('publix');
    if (urlLower.includes('wholefoodsmarket.com')) retailers.add('whole foods');
    if (urlLower.includes('traderjoes.com')) retailers.add('trader joe');
    if (urlLower.includes('costco.com')) retailers.add('costco');
    if (urlLower.includes('samsclub.com')) retailers.add('sam\'s club');
    if (urlLower.includes('aldi.')) retailers.add('aldi');
    if (urlLower.includes('lidl.')) retailers.add('lidl');
    if (urlLower.includes('foodlion.com')) retailers.add('food lion');
    if (urlLower.includes('giantfood.com')) retailers.add('giant');
    if (urlLower.includes('stopandshop.com')) retailers.add('stop & shop');
  }
  
  return Array.from(retailers);
}

/**
 * Pre-filter FoodGraph results based on text similarity with extracted product info
 * Filters by brand, size, and retailer similarity before AI comparison
 * 
 * Scoring weights:
 * - Brand: 35% (most critical for product identity)
 * - Size: 35% (critical for exact product variant match)
 * - Retailer: 30% (ensures product is available at the store)
 * 
 * Threshold: Only products with ≥85% similarity score are returned
 * This ensures only high-confidence matches proceed to expensive AI image comparison
 * 
 * Note: Flavor is excluded because FoodGraph doesn't provide it as a separate field.
 * 
 * @param products - FoodGraph search results to filter
 * @param extractedInfo - Product information extracted from the shelf image
 * @param storeName - Optional store/retailer name from image metadata (e.g., "Target Store #1234")
 * @returns Filtered products with similarity scores ≥85%
 */
export function preFilterFoodGraphResults(
  products: FoodGraphProduct[],
  extractedInfo: {
    brand?: string;
    size?: string;
    productName?: string;
  },
  storeName?: string
): Array<FoodGraphProduct & { similarityScore: number; matchReasons: string[] }> {
  // Extract retailer from store name
  const imageRetailer = storeName ? extractRetailerFromStoreName(storeName) : null;
  
  console.log('🔍 Pre-filtering FoodGraph results:', {
    totalProducts: products.length,
    extractedInfo,
    storeName,
    imageRetailer
  });

  const results = products.map((product, index) => {
    let score = 0;
    const reasons: string[] = [];
    
    // Debug first product to see actual data structure
    if (index === 0) {
      console.log('📦 First product data structure:', {
        title: product.title,
        companyBrand: product.companyBrand,
        companyManufacturer: product.companyManufacturer,
        measures: product.measures,
        category: product.category,
        sourcePdpUrls: product.sourcePdpUrls,
        ingredients: product.ingredients ? 'Present' : 'Missing'
      });
    }
    
    // Brand similarity (weight: 35%)
    if (extractedInfo.brand && extractedInfo.brand !== 'Unknown') {
      const brandSimilarities = [
        calculateStringSimilarity(extractedInfo.brand, product.companyBrand || ''),
        calculateStringSimilarity(extractedInfo.brand, product.companyManufacturer || ''),
        calculateStringSimilarity(extractedInfo.brand, product.title || '')
      ];
      const brandSimilarity = Math.max(...brandSimilarities);
      
      // Debug first product brand matching
      if (index === 0) {
        console.log('🏷️  Brand matching for first product:', {
          extractedBrand: extractedInfo.brand,
          companyBrand: product.companyBrand,
          companyManufacturer: product.companyManufacturer,
          similarities: {
            companyBrand: brandSimilarities[0],
            companyManufacturer: brandSimilarities[1],
            title: brandSimilarities[2]
          },
          maxSimilarity: brandSimilarity,
          scoreContribution: (brandSimilarity * 0.35).toFixed(2)
        });
      }
      
      score += brandSimilarity * 0.35;
      if (brandSimilarity > 0.5) {
        reasons.push(`Brand match: ${(brandSimilarity * 100).toFixed(0)}%`);
      }
    }
    
    // Size similarity (weight: 35%)
    if (extractedInfo.size && extractedInfo.size !== 'Unknown') {
      const extractedSize = extractSizeNumber(extractedInfo.size);
      const productSize = extractSizeNumber(product.measures || '');
      
      if (index === 0) {
        console.log('📏 Size matching for first product:', {
          extractedSize: extractedInfo.size,
          extractedNumber: extractedSize,
          productMeasures: product.measures,
          productNumber: productSize
        });
      }
      
      if (extractedSize !== null && productSize !== null) {
        // Consider sizes similar if within 20% of each other
        const sizeDiff = Math.abs(extractedSize - productSize) / Math.max(extractedSize, productSize);
        const sizeSimilarity = Math.max(0, 1 - sizeDiff * 5); // 0-20% diff maps to 1.0-0.0
        
        if (index === 0) {
          console.log('   Size numeric comparison:', {
            sizeDiff: sizeDiff.toFixed(2),
            sizeSimilarity: sizeSimilarity.toFixed(2),
            scoreContribution: (sizeSimilarity * 0.35).toFixed(2)
          });
        }
        
        score += sizeSimilarity * 0.35;
        if (sizeSimilarity > 0.5) {
          reasons.push(`Size match: ${extractedInfo.size} ≈ ${product.measures}`);
        }
      } else if (product.measures && 
                 (extractedInfo.size.toLowerCase().includes(product.measures.toLowerCase()) ||
                  product.measures.toLowerCase().includes(extractedInfo.size.toLowerCase()))) {
        // Text-based size matching as fallback
        score += 0.23; // 35% * 0.65 (partial credit for text match)
        reasons.push(`Size text match`);
        
        if (index === 0) {
          console.log('   Size text match: +0.23');
        }
      }
    }
    
    // Retailer match (weight: 30%)
    if (imageRetailer) {
      const productRetailers = extractRetailersFromUrls(product.sourcePdpUrls);
      const retailerMatch = productRetailers.includes(imageRetailer);
      
      if (index === 0) {
        console.log('🏪 Retailer matching for first product:', {
          imageRetailer,
          sourcePdpUrls: product.sourcePdpUrls,
          productRetailers,
          isMatch: retailerMatch,
          scoreContribution: retailerMatch ? '0.30' : '0.00'
        });
      }
      
      if (retailerMatch) {
        score += 0.30;
        reasons.push(`Retailer match: ${imageRetailer}`);
      }
    }
    
    // Log final score for first product
    if (index === 0) {
      console.log('🎯 Final score for first product:', {
        totalScore: score.toFixed(2),
        passesThreshold: score > 0.3,
        reasons: reasons
      });
    }
    
    return {
      ...product,
      similarityScore: score,
      matchReasons: reasons
    };
  });

  // Filter products with similarity score >= 0.85 (85% threshold for AI filtering)
  // High threshold ensures only strong matches go to expensive AI comparison
  const filtered = results
    .filter(r => r.similarityScore >= 0.85)
    .sort((a, b) => b.similarityScore - a.similarityScore);

  console.log('✅ Pre-filter results:', {
    originalCount: products.length,
    filteredCount: filtered.length,
    threshold: '85%',
    topScores: filtered.slice(0, 5).map(r => ({
      title: r.title,
      score: r.similarityScore.toFixed(2),
      reasons: r.matchReasons
    }))
  });

  return filtered;
}
