# FoodGraph API Interface Update

**Date:** November 8, 2025  
**Commit:** TBD

## Overview

Updated the `FoodGraphProduct` TypeScript interface in `lib/foodgraph.ts` to match the complete FoodGraph API response structure. This ensures type safety and enables access to all available product data fields.

## Changes Made

### 1. Enhanced FoodGraphProduct Interface

Added comprehensive field definitions based on actual FoodGraph API response structure:

#### New Description Fields
- `description` - Full product description text
- `descriptionInstructions` - Usage/preparation instructions
- `descriptionWarnings` - Safety warnings

#### Extended Company Information
- `companyBrandOwner` - Brand owner (e.g., "Walmart")
- `companySubBrand` - Sub-brand name (e.g., "Cuties")
- `companyDistributor` - Distributor company
- `companyCountriesOfOrigin` - Array of origin countries (e.g., ["USA", "CAN"])
- `companyAddress` - Company address
- `companyEmail` - Contact email
- `companyPhone` - Contact phone
- `companyWebsiteUrl` - Company website
- `companyIsPrivateLabel` - Boolean flag for private label products
- `companyPrivateLabelType` - Type description (e.g., "store brand")

#### Ingredient Details
- `ingredientsProp65Warning` - California Prop 65 warning flag

#### Product Claims/Certifications
- `claimsGlutenFree` - Gluten-free claim
- `claimsNonGmo` - Non-GMO claim
- `claimsOrganic` - Organic certification
- `claimsVegan` - Vegan claim

#### Allergen Information
- `allergensContainsStatement` - "Contains" allergen statement
- `allergensMayContainStatement` - "May contain" allergen statement

#### Enhanced Keys
Added Walmart-specific identifiers to `keys` object:
- `WALMART_MPN` - Walmart manufacturer part number
- `WALMART_US_ITEM_ID` - Walmart US item identifier
- `WALMART_WIN` - Walmart item number

### 2. Updated FoodGraphQueryResponse Interface

Added `querySearch` field to response interface:
```typescript
querySearch?: {
  updatedAtFrom?: string;
  productFilter?: string;
  search?: string;
  searchIn?: {
    or?: string[];
  };
  fuzzyMatch?: boolean;
}
```

This field contains the actual search parameters used by the API, useful for debugging and logging.

## Example API Response Structure

```json
{
  "success": true,
  "results": [
    {
      "key": "00078742112688",
      "keys": {
        "WALMART_MPN": "6386527",
        "WALMART_US_ITEM_ID": "10448380",
        "WALMART_WIN": "563106689"
      },
      "title": "Great Value Honey Roasted Peanuts, 34.5 oz, Jar",
      "category": ["Snacks", "Cookies & Chips/Nuts", "Trail Mix & Seeds/Nuts"],
      "measures": "34.5 oz, Jar",
      "description": "string",
      "ingredients": "CORN, CORN OIL, SALT.",
      "companyBrand": "Great Value",
      "companyBrandOwner": "Walmart",
      "claimsGlutenFree": true,
      "claimsOrganic": true,
      "images": [
        {
          "id": "bf50cfa4-2398-4bce-9223-ef52b162ab0b",
          "type": "FRONT",
          "urls": {
            "original": "https://images-staging.foodgraph.com/...",
            "desktop": "https://images-staging.foodgraph.com/...",
            "mobile": "https://images-staging.foodgraph.com/..."
          }
        }
      ],
      "_score": 0,
      "_createdAt": 1752163986735,
      "_updatedAt": 1749512982219
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalRetrieved": 100,
    "total": 137
  },
  "querySearch": {
    "search": "organic",
    "searchIn": {"or": ["title", "description"]},
    "fuzzyMatch": false
  }
}
```

## Current Usage

The application currently uses only these essential fields:
- `key` or `keys.GTIN14` → `product_gtin`
- `title` → `product_name`
- `companyBrand` → `brand_name`
- `category` → `category` (joined as string)
- `measures` → used in size comparison
- `images` → `front_image_url` (via `getFrontImageUrl()`)

## Future Enhancement Opportunities

The expanded interface now provides type-safe access to additional valuable data:

### 1. Enhanced Product Display
- Show full descriptions and instructions on results page
- Display allergen information for food safety
- Show certifications/claims (organic, gluten-free, vegan)

### 2. Improved Matching Accuracy
- Use `description` field in text-based pre-filtering
- Match on `companyBrandOwner` for private label detection
- Compare `companyCountriesOfOrigin` if relevant

### 3. Better User Information
- Link to `companyWebsiteUrl` for more product details
- Show complete allergen statements
- Display Prop 65 warnings where applicable

### 4. Retailer-Specific Features
- Use Walmart identifiers (`WALMART_WIN`, etc.) for direct product linking
- Detect private label products with `companyIsPrivateLabel`
- Filter by private label type

## Technical Notes

- All new fields are optional (`?`) to maintain backward compatibility
- The catch-all `[key: string]: unknown` remains for any future API additions
- No changes needed to existing code - transformation logic in `batch-search-and-save/route.ts` still works
- Type safety improved without breaking existing functionality

## Testing

- ✅ No linting errors introduced
- ✅ Existing transformation code still works (maps `title` → `product_name`, etc.)
- ✅ `getFrontImageUrl()` function unchanged
- ✅ Pre-filtering logic compatible with new interface

## Files Modified

- `lib/foodgraph.ts` - Updated `FoodGraphProduct` and `FoodGraphQueryResponse` interfaces

## Related Documentation

- `PREFILTER_STEP.md` - Pre-filtering using brand/size/flavor
- `BATCH_PROCESSING_REFACTOR.md` - Batch search and save workflow
- `FOODGRAPH_ENHANCED_SEARCH.md` - FoodGraph search implementation

