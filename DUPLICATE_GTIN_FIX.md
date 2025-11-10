# FoodGraph Duplicate GTIN Fix

**Date:** November 10, 2025  
**Issue:** Multiple FoodGraph results with same GTIN/UPC appearing for same detection

## Problem

User reported seeing multiple FoodGraph options with the same GTIN/UPC (e.g., UPC 00810095598678 appearing 3 times for the same detection). This indicated that duplicate entries were being created instead of being prevented by the unique constraint.

## Root Cause

The unique constraint on `branghunt_foodgraph_results` table is defined as:
```sql
CREATE UNIQUE INDEX idx_unique_detection_gtin_stage
ON branghunt_foodgraph_results (detection_id, product_gtin, processing_stage)
WHERE product_gtin IS NOT NULL;
```

This constraint requires all three fields to be present. However, several API endpoints were NOT setting the `processing_stage` field when inserting FoodGraph results, leaving it as `NULL`. When `processing_stage` is `NULL`, the unique constraint doesn't apply, allowing duplicate GTINs to be inserted.

### Affected Endpoints

1. **`app/api/search-foodgraph/route.ts`** - Missing `processing_stage`
2. **`app/api/batch-search-foodgraph/route.ts`** - Missing `processing_stage`
3. **`app/api/process/route.ts`** - Missing `processing_stage`
4. **`app/api/process-all/route.ts`** - Missing `processing_stage`

Only the newer `batch-search-and-save/route.ts` endpoint was properly setting `processing_stage` to 'search', 'pre_filter', or 'ai_filter'.

## Solution

Added `processing_stage: 'search'` to all FoodGraph result inserts in the affected endpoints.

### Changes Made

#### 1. Fixed `search-foodgraph/route.ts`
```typescript
const { data, error } = await supabase
  .from('branghunt_foodgraph_results')
  .insert({
    detection_id: detectionId,
    search_term: searchTerm,
    result_rank: rank + 1,
    product_gtin: product.keys?.GTIN14 || product.key || null,
    product_name: product.title || null,
    brand_name: product.companyBrand || null,
    category: Array.isArray(product.category) ? product.category.join(', ') : null,
    measures: product.measures || null,
    front_image_url: frontImageUrl,
    full_data: product,
    processing_stage: 'search', // ✅ ADDED
  })
```

#### 2. Fixed `batch-search-foodgraph/route.ts`
```typescript
const resultsToSave = foodgraphResults.slice(0, 50).map((r: any, index: number) => ({
  detection_id: detection.id,
  result_rank: index + 1,
  product_name: r.product_name,
  brand_name: r.brand_name,
  category: r.category,
  front_image_url: r.front_image_url,
  product_gtin: r.product_gtin,
  full_data: r,
  processing_stage: 'search' // ✅ ADDED
}));
```

#### 3. Fixed `process/route.ts`
```typescript
await supabase
  .from('branghunt_foodgraph_results')
  .insert({
    detection_id: detectionData.id,
    search_term: searchTerm,
    result_rank: rank + 1,
    product_gtin: product.gtin || null,
    product_name: product.name || null,
    brand_name: product.brand || null,
    category: product.category || null,
    front_image_url: frontImageUrl,
    full_data: product,
    processing_stage: 'search', // ✅ ADDED
  });
```

#### 4. Fixed `process-all/route.ts`
```typescript
const resultsToSave = foodgraphResults.slice(0, 50).map((r: any, index: number) => ({
  detection_id: detection.id,
  result_rank: index + 1,
  product_name: r.product_name,
  brand_name: r.brand_name,
  category: r.category,
  front_image_url: r.front_image_url,
  product_gtin: r.product_gtin,
  processing_stage: 'search' // ✅ ADDED
}));
```

## How the Constraint Works

The unique constraint `(detection_id, product_gtin, processing_stage)` ensures:
- Same GTIN cannot appear twice at the same processing stage for the same detection
- Same GTIN CAN appear across different stages (search → pre_filter → ai_filter) for audit trail
- Only applies when `product_gtin IS NOT NULL` (some products may not have GTINs)

## Verification Steps

1. Apply the unique constraint migration if not already applied:
   ```bash
   # Run the migration
   psql $DATABASE_URL < migrations/add_unique_constraint_foodgraph.sql
   ```

2. Check for existing duplicates:
   ```sql
   SELECT 
     detection_id,
     product_gtin,
     processing_stage,
     COUNT(*) as duplicate_count
   FROM branghunt_foodgraph_results
   WHERE product_gtin IS NOT NULL
   GROUP BY detection_id, product_gtin, processing_stage
   HAVING COUNT(*) > 1
   ORDER BY duplicate_count DESC;
   ```

3. The migration automatically cleans up existing duplicates before adding the constraint

## Expected Behavior After Fix

- ✅ Each GTIN appears only once per detection per processing stage
- ✅ No duplicate entries for same UPC/GTIN in UI
- ✅ Reprocessing same detection replaces old results (via DELETE before INSERT)
- ✅ Audit trail preserved across processing stages (search, pre_filter, ai_filter)

## Testing

To test the fix:
1. Run a FoodGraph search on a detection
2. Run it again - should see results replaced, not duplicated
3. Verify each GTIN appears only once in the results list
4. Check that processing_stage is set in database

## Files Changed

- `app/api/search-foodgraph/route.ts`
- `app/api/batch-search-foodgraph/route.ts`
- `app/api/process/route.ts`
- `app/api/process-all/route.ts`

## Related Files

- `migrations/add_unique_constraint_foodgraph.sql` - Constraint definition
- `verify_unique_constraint.sql` - Verification queries

