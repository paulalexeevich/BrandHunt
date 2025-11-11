# FoodGraph Duplicates: UPSERT Solution

**Date:** November 11, 2025  
**Problem:** Same products appear multiple times (3x) in FoodGraph results UI

---

## Problem Analysis

### Current Behavior
Each product appears **3 times** in the results with different `processing_stage` values:
- Once with `processing_stage: 'search'`
- Once with `processing_stage: 'pre_filter'`
- Once with `processing_stage: 'ai_filter'`

### Root Cause
**File:** `app/api/batch-search-and-save/route.ts`

The batch processing API inserts the same GTINs multiple times:
```typescript
// Line 243: INSERT search results
.insert(searchInserts)  // processing_stage: 'search'

// Line 298: INSERT pre-filter results
.insert(preFilterInserts)  // processing_stage: 'pre_filter'

// Line 473: INSERT AI filter results
.insert(aiFilterInserts)  // processing_stage: 'ai_filter'
```

**Current Unique Constraint:**
```sql
(detection_id, product_gtin, processing_stage)
```
This **allows duplicates** because the same GTIN can exist with different `processing_stage` values.

---

## Optimal Solution for Batch Processing

### Strategy: UPSERT Pattern (One Row Per GTIN)

Since batch processing runs all stages automatically in sequence, we should:

✅ **One row per GTIN per detection**  
✅ **Update row as it progresses through stages**  
✅ **No duplicates in UI**  
✅ **Less storage, faster queries**  
✅ **Still track latest stage reached**  

### Why This is Better

**Before (Current):**
- 3 rows per product × 30 products = 90 rows
- User sees 3 identical entries in UI
- Complex queries to filter by stage
- Wasted storage

**After (UPSERT):**
- 1 row per product × 30 products = 30 rows
- User sees 1 entry per product
- Simple queries, clean UI
- 67% less storage

---

## Implementation Plan

### Step 1: Database Migration ✅

**File:** `migrations/fix_foodgraph_duplicates_upsert.sql`

```sql
-- Remove duplicates, keep latest stage (ai_filter > pre_filter > search)
-- Change unique constraint to (detection_id, product_gtin) only
-- Drop old constraint, create new one
```

**Actions:**
1. Delete duplicate rows (keep highest stage)
2. Drop `idx_unique_detection_gtin_stage`
3. Create `idx_unique_detection_gtin` (without processing_stage)

### Step 2: Update Batch API to Use UPSERT

**File:** `app/api/batch-search-and-save/route.ts`

**Changes needed:**

#### Change 1: Search Stage (Line 241-243)
```typescript
// BEFORE: Plain INSERT
const { error: searchInsertError } = await supabase
  .from('branghunt_foodgraph_results')
  .insert(searchInserts);

// AFTER: UPSERT
const { error: searchInsertError } = await supabase
  .from('branghunt_foodgraph_results')
  .upsert(searchInserts, {
    onConflict: 'detection_id,product_gtin',
    ignoreDuplicates: false  // Update existing rows
  });
```

#### Change 2: Pre-Filter Stage (Line 296-298)
```typescript
// BEFORE: Plain INSERT
const { error: preFilterInsertError } = await supabase
  .from('branghunt_foodgraph_results')
  .insert(preFilterInserts);

// AFTER: UPSERT
const { error: preFilterInsertError } = await supabase
  .from('branghunt_foodgraph_results')
  .upsert(preFilterInserts, {
    onConflict: 'detection_id,product_gtin',
    ignoreDuplicates: false
  });
```

#### Change 3: AI Filter Stage (Line 471-473)
```typescript
// BEFORE: Plain INSERT
const { error: aiFilterInsertError } = await supabase
  .from('branghunt_foodgraph_results')
  .insert(aiFilterInserts)
  .select();

// AFTER: UPSERT
const { error: aiFilterInsertError, data: aiFilterInsertData } = await supabase
  .from('branghunt_foodgraph_results')
  .upsert(aiFilterInserts, {
    onConflict: 'detection_id,product_gtin',
    ignoreDuplicates: false
  })
  .select();
```

### Step 3: Update Other APIs (if any use INSERT)

Check these files:
- `app/api/batch-search-foodgraph/route.ts` (Line 133-135)
- `app/api/search-foodgraph/route.ts`
- `app/api/filter-foodgraph/route.ts`

Replace `.insert()` with `.upsert()` using same pattern.

---

## How UPSERT Works

PostgreSQL's `ON CONFLICT ... DO UPDATE` (Supabase calls it `upsert()`):

```typescript
.upsert(data, {
  onConflict: 'detection_id,product_gtin',  // Match on these columns
  ignoreDuplicates: false  // false = UPDATE, true = IGNORE
})
```

**Behavior:**
- If row exists with same `(detection_id, product_gtin)` → UPDATE it
- If no row exists → INSERT new row

**Result:**
- Search stage: INSERTs new rows with processing_stage='search'
- Pre-filter stage: UPDATEs same rows to processing_stage='pre_filter'
- AI filter stage: UPDATEs same rows to processing_stage='ai_filter'
- **Final: 1 row per GTIN with latest stage and data**

---

## Testing Plan

### Before Migration
1. Check current duplicate count:
```sql
SELECT 
  detection_id,
  product_gtin,
  COUNT(*) as count,
  ARRAY_AGG(processing_stage) as stages
FROM branghunt_foodgraph_results
WHERE product_gtin IS NOT NULL
GROUP BY detection_id, product_gtin
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 10;
```

### Run Migration
```bash
psql -d branghunt -f migrations/fix_foodgraph_duplicates_upsert.sql
```

### After Migration
1. Verify no duplicates:
```sql
SELECT 
  detection_id,
  product_gtin,
  COUNT(*) as count
FROM branghunt_foodgraph_results
WHERE product_gtin IS NOT NULL
GROUP BY detection_id, product_gtin
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

2. Check stage distribution:
```sql
SELECT 
  processing_stage,
  COUNT(*) as count
FROM branghunt_foodgraph_results
GROUP BY processing_stage
ORDER BY processing_stage;
```

### Test Batch Processing
1. Upload new image with products
2. Run batch processing
3. Check results UI - should show 1 entry per product
4. Verify `processing_stage` updates through stages
5. Confirm no duplicates in database

---

## Deployment Steps

### 1. Apply Migration
```bash
# Connect to Supabase database
# Run migration script
psql -d <database> -f migrations/fix_foodgraph_duplicates_upsert.sql
```

### 2. Update API Code
- Modify `batch-search-and-save/route.ts`
- Replace `.insert()` with `.upsert()`
- Test locally first

### 3. Commit & Deploy
```bash
git add migrations/ app/api/
git commit -m "Fix: Use UPSERT to eliminate FoodGraph duplicates"
git push origin main
```

### 4. Verify Production
- Process new images
- Check for duplicates in UI
- Monitor database row counts

---

## Rollback Plan

If issues occur:

1. **Revert code changes:**
```bash
git revert <commit-hash>
git push origin main
```

2. **Restore old constraint:**
```sql
DROP INDEX IF EXISTS idx_unique_detection_gtin;
CREATE UNIQUE INDEX idx_unique_detection_gtin_stage
ON branghunt_foodgraph_results (detection_id, product_gtin, processing_stage)
WHERE product_gtin IS NOT NULL;
```

---

## Benefits Summary

### User Experience
- ✅ No duplicate products in results list
- ✅ Cleaner, easier to understand UI
- ✅ Faster page loads (less data to fetch)

### System Performance
- ✅ 67% reduction in table rows
- ✅ Faster queries (less data to scan)
- ✅ Less storage usage
- ✅ Simpler data model

### Data Integrity
- ✅ One source of truth per GTIN
- ✅ Still tracks processing stage progression
- ✅ Prevents duplicates at database level
- ✅ Works perfectly with parallel batch processing

---

## Related Memories

- **Duplicate Prevention:** [[memory:11047413]] - Always set processing_stage field
- **Empty Results Display:** [[memory:11082617]] - Handle 0 results properly in UI

---

## Questions Answered

**Q: Won't we lose historical data about which stage a product was in?**  
A: No. The `processing_stage` column tracks the latest stage reached. For batch processing, we only care about the final result. If audit trail is needed, add a `stage_history` JSONB column.

**Q: What about parallel processing race conditions?**  
A: UPSERT is atomic. PostgreSQL handles concurrent UPSERT safely. Last write wins.

**Q: What if search finds 50 results but pre-filter narrows to 10?**  
A: That's the point! UPSERT updates the 10 that passed pre-filter to the new stage. The other 40 remain at 'search' stage or can be deleted if not needed.

Actually, looking at the code more carefully, each stage seems to insert THE SAME products again (not a filtered subset). So UPSERT makes even more sense - just update the same rows as they progress.

**Q: Why not just query and filter by processing_stage in the UI?**  
A: That's a workaround, not a solution. The database should enforce data integrity. Plus it adds complexity to every query.

---

## Next Steps

1. ✅ Review this document
2. ⬜ Apply database migration
3. ⬜ Update batch-search-and-save API
4. ⬜ Update other search APIs if needed
5. ⬜ Test locally with sample data
6. ⬜ Deploy to production
7. ⬜ Monitor for issues
8. ⬜ Document results

