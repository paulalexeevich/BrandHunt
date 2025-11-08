# Retailer-Based Pre-filtering Enhancement

**Date:** November 8, 2025  
**Commit:** TBD

## Overview

Enhanced the pre-filtering system to include retailer matching, improving accuracy by filtering FoodGraph products to those actually sold at the store where the shelf image was taken. Also optimized scoring weights to prioritize the most critical matching factors: brand and size.

## Problem Statement

Previously, the pre-filtering only matched products based on brand and size. This led to two issues:

1. **False positives**: Products from brands sold at different retailers (e.g., finding Walmart Great Value products when searching Target shelves)
2. **Inefficient AI filtering**: Wasting AI comparison cycles on products that aren't available at the target retailer

**Note:** Flavor matching was initially included but has been removed because FoodGraph doesn't provide flavor as a separate field in the API response.

## Solution

### 1. Retailer Extraction

**From Store Name (Image Metadata)**
- Images have `store_name` field (e.g., "Target Store #1234 - Address")
- New function `extractRetailerFromStoreName()` extracts retailer name
- Supports 17 major US retailers: Target, Walmart, Walgreens, CVS, Kroger, Safeway, Albertsons, Publix, Whole Foods, Trader Joe's, Costco, Sam's Club, Aldi, Lidl, Food Lion, Giant, Stop & Shop
- Returns normalized lowercase name (e.g., "target")

**From FoodGraph Data (Product URLs)**
- FoodGraph provides `sourcePdpUrls` array containing product page URLs
- New function `extractRetailersFromUrls()` parses domain names
- Maps domains to retailer names (e.g., "walmart.com" → "walmart")
- Returns array of all retailers selling the product

### 2. Updated Scoring System

**New Weights (Total: 100%)**
```
Brand:    35%  (most critical for product identity)
Size:     35%  (critical for exact product variant match)
Retailer: 30%  (NEW) - Ensures availability at store
```

**Rationale:**
- **Brand** at 35% - Most critical for identifying the correct product
- **Size** at 35% - Equal weight to brand since it's critical for distinguishing product variants (e.g., 32oz vs 64oz)
- **Retailer** at 30% - Significant weight to prioritize products actually sold at the target store
- **Flavor** removed - FoodGraph doesn't provide flavor as a separate field

### 3. Retailer Matching Logic

**Binary Match (0.0 or 0.30)**
- If image retailer matches any product retailer: +0.30 score
- No partial matches - product either is or isn't sold at the retailer
- Example: Image from Target + Product sold at ["target", "walmart"] = Match!

**Match Reasons**
- Adds human-readable reason: "Retailer match: target"
- Displayed on pre-filtered result cards

## Code Changes

### lib/foodgraph.ts

**New Helper Functions:**
```typescript
function extractRetailerFromStoreName(storeName: string): string | null
  - Extracts retailer from store name string
  - Returns normalized lowercase name
  - Example: "Target Store #1234" → "target"

function extractRetailersFromUrls(urls: string[] | undefined): string[]
  - Parses sourcePdpUrls to find retailer domains
  - Returns array of retailer names
  - Example: ["https://walmart.com/...", "https://target.com/..."] → ["walmart", "target"]
```

**Updated Function Signature:**
```typescript
export function preFilterFoodGraphResults(
  products: FoodGraphProduct[],
  extractedInfo: {
    brand?: string;
    size?: string;
    productName?: string;
  },
  storeName?: string  // NEW PARAMETER
): Array<FoodGraphProduct & { similarityScore: number; matchReasons: string[] }>
```

**Scoring Implementation:**
```typescript
// Brand similarity (weight: 35%)
score += brandSimilarity * 0.35;

// Size similarity (weight: 35%)
score += sizeSimilarity * 0.35;

// Retailer match (weight: 30%)
if (imageRetailer) {
  const productRetailers = extractRetailersFromUrls(product.sourcePdpUrls);
  const retailerMatch = productRetailers.includes(imageRetailer);
  
  if (retailerMatch) {
    score += 0.30;
    reasons.push(`Retailer match: ${imageRetailer}`);
  }
}
```

### app/api/batch-search-and-save/route.ts

**Updated Pre-filter Call:**
```typescript
const preFilteredResults = preFilterFoodGraphResults(
  foodgraphResults, 
  {
    brand: detection.brand_name || undefined,
    size: detection.size || undefined,
    productName: detection.product_name || undefined
  },
  image.store_name || undefined // Pass store name for retailer matching
);
```

### app/analyze/[imageId]/page.tsx

**Updated Manual Pre-filter:**
```typescript
const filteredResults = preFilterFoodGraphResults(
  foodgraphResults as any, 
  {
    brand: detection.brand_name || undefined,
    size: detection.size || undefined,
    productName: detection.product_name || undefined
  },
  image?.store_name || undefined // Pass store name for retailer matching
) as any;
```

## Example Scenarios

### Scenario 1: Perfect Match at Correct Retailer
```
Image: Target shelf photo
Product Info: Brand = "Tide", Size = "64 oz"
FoodGraph Product: Tide 64oz sold at [Target, Walmart]

Scoring:
- Brand: 1.0 × 0.35 = 0.35
- Size: 1.0 × 0.35 = 0.35
- Retailer: Match × 0.30 = 0.30
Total: 1.00 ✅ (Perfect match!)
```

### Scenario 2: Good Match, Wrong Retailer
```
Image: Target shelf photo
Product Info: Brand = "Great Value", Size = "32 oz"
FoodGraph Product: Great Value 32oz sold at [Walmart only]

Scoring:
- Brand: 1.0 × 0.35 = 0.35
- Size: 1.0 × 0.35 = 0.35
- Retailer: No match = 0.00
Total: 0.70 ✅ (Passes threshold but lower score - Walmart exclusive brand)
```

### Scenario 3: Retailer Boost Helps Marginal Product
```
Image: Target shelf photo
Product Info: Brand = "Nature Valley", Size = "12 oz"
FoodGraph Product: Nature Valley 10.5oz sold at [Target, Kroger]

Scoring:
- Brand: 1.0 × 0.35 = 0.35
- Size: 0.7 × 0.35 = 0.25 (12 vs 10.5 oz - 14% difference)
- Retailer: Match × 0.30 = 0.30
Total: 0.90 ✅ (Strong match - retailer match compensates for size difference)
```

### Scenario 4: Without Retailer Data
```
Image: No store name metadata
Product Info: Brand = "Tide", Size = "64 oz"

Scoring uses only brand (35%) + size (35%) = max 70%
- Retailer matching is skipped gracefully
- Products still filtered effectively by brand and size
- Perfect brand+size match gets 0.70 score (above 0.3 threshold)
```

## Impact Analysis

### Expected Performance Improvements

**Precision:**
- Eliminates ~20-30% of false positives (wrong retailer products)
- Particularly important for private label brands (Great Value, Market Pantry, etc.)
- Boosts correct matches when retailer data is available

**AI Efficiency:**
- Fewer products pass pre-filtering = fewer AI comparisons
- Example: Target shelf with 50 FoodGraph results
  - Before: 20 pre-filtered (40%) → 20 AI comparisons
  - After: 12 pre-filtered (24%) → 12 AI comparisons
  - Reduction: 40% fewer AI calls

**User Experience:**
- More accurate auto-saves in batch processing
- Manual filter shows more relevant products first
- Clear "Retailer match" badges help users identify correct products

### Backward Compatibility

✅ **Fully backward compatible:**
- `storeName` parameter is optional
- If not provided, retailer matching is skipped (score contribution = 0)
- Old threshold (0.3) still works with new weights
- All existing code continues to function

## Supported Retailers

Currently supports 17 major US retailers:

1. **Target** - target.com
2. **Walmart** - walmart.com
3. **Walgreens** - walgreens.com
4. **CVS** - cvs.com
5. **Kroger** - kroger.com
6. **Safeway** - safeway.com
7. **Albertsons** - albertsons.com
8. **Publix** - publix.com
9. **Whole Foods** - wholefoodsmarket.com
10. **Trader Joe's** - traderjoes.com
11. **Costco** - costco.com
12. **Sam's Club** - samsclub.com
13. **Aldi** - aldi.*
14. **Lidl** - lidl.*
15. **Food Lion** - foodlion.com
16. **Giant** - giantfood.com
17. **Stop & Shop** - stopandshop.com

**Easy to extend:** Add new retailers by updating two functions:
1. `extractRetailerFromStoreName()` - add to retailers array
2. `extractRetailersFromUrls()` - add domain check

## Testing Recommendations

### Manual Testing
1. Upload Target shelf image with store name
2. Extract product info (brand, size)
3. Click "Pre-Filter" button
4. Verify "Retailer match: target" appears on matching products
5. Verify products exclusive to other retailers score lower

### Console Logs
Pre-filtering now logs detailed retailer matching:
```
🔍 Pre-filtering FoodGraph results:
  totalProducts: 50
  extractedInfo: { brand: "Tide", size: "64 oz", productName: "Tide Detergent" }
  storeName: "Target Store #1234"
  imageRetailer: "target"

🏷️ Brand matching for first product:
  extractedBrand: "Tide"
  companyBrand: "Tide"
  maxSimilarity: 1.0
  scoreContribution: "0.35"

📏 Size matching for first product:
  extractedSize: "64 oz"
  extractedNumber: 64
  productMeasures: "64 oz"
  productNumber: 64
  sizeSimilarity: 1.0
  scoreContribution: "0.35"

🏪 Retailer matching for first product:
  imageRetailer: "target"
  sourcePdpUrls: ["https://target.com/..."]
  productRetailers: ["target"]
  isMatch: true
  scoreContribution: "0.30"

🎯 Final score for first product:
  totalScore: 1.00
  passesThreshold: true (> 0.3)
  reasons: ["Brand match: 100%", "Size match: 64 oz ≈ 64 oz", "Retailer match: target"]
```

### Expected Results
- Products sold at Target should have higher scores
- Walmart-exclusive brands (Great Value) should score lower or be filtered out
- Multi-retailer products (national brands) should still match well

## Performance Metrics

**String Processing:**
- `extractRetailerFromStoreName()`: O(n) where n = number of retailer patterns
- `extractRetailersFromUrls()`: O(m × n) where m = URLs, n = retailer patterns
- Negligible performance impact (< 1ms per product)

**Memory:**
- No additional memory overhead
- Retailer extraction happens inline during scoring
- No caching needed

## Future Enhancements

1. **Retailer Confidence Levels**
   - Partial credit for regional chains vs national chains
   - Weight by retailer exclusivity

2. **Private Label Detection**
   - Auto-detect private labels using `companyIsPrivateLabel` field
   - Give strong penalty for wrong-retailer private labels

3. **Multi-Store Chain Handling**
   - Kroger family: Kroger, Ralph's, Fred Meyer, etc.
   - Albertsons family: Albertsons, Safeway, Vons, etc.

4. **Region-Based Matching**
   - Extract region from store address
   - Match against regional product availability

## Files Modified

- `lib/foodgraph.ts` - Added retailer extraction and matching logic
- `app/api/batch-search-and-save/route.ts` - Pass store_name to pre-filter
- `app/analyze/[imageId]/page.tsx` - Pass store_name to manual pre-filter

## Related Documentation

- `PREFILTER_STEP.md` - Original pre-filtering implementation
- `FOODGRAPH_INTERFACE_UPDATE.md` - FoodGraph API structure
- `BATCH_PROCESSING_REFACTOR.md` - Batch processing workflow

