# Visual Match Processing Stage Fix

**Date:** November 12, 2025  
**Issue:** Pipeline 2 (Visual-Only) failing to save results  
**Status:** ✅ FIXED

## Problem

When running Pipeline 2 (Visual-Only), users encountered this error:

```
❌ Error: Failed to save visual match results: 
new row for relation "branghunt_foodgraph_results" violates check constraint 
"branghunt_foodgraph_results_processing_stage_check"
```

### Root Cause

The `branghunt_foodgraph_results` table had a CHECK constraint that only allowed these values:
- `'search'`
- `'pre_filter'`
- `'ai_filter'`

But Pipeline 2 was trying to save results with `processing_stage='visual_match'`, which wasn't in the allowed list.

---

## Solution

### 1. Updated Database Constraint

**Migration:** `migrations/add_visual_match_processing_stage.sql`

```sql
-- Drop old constraint
ALTER TABLE branghunt_foodgraph_results 
DROP CONSTRAINT IF EXISTS branghunt_foodgraph_results_processing_stage_check;

-- Add new constraint with 'visual_match' included
ALTER TABLE branghunt_foodgraph_results 
ADD CONSTRAINT branghunt_foodgraph_results_processing_stage_check 
CHECK (processing_stage IN ('search', 'pre_filter', 'ai_filter', 'visual_match'));
```

### 2. Updated TypeScript Interface

**File:** `app/analyze/[imageId]/page.tsx`

```typescript
// Before:
processing_stage?: 'search' | 'pre_filter' | 'ai_filter' | null;

// After:
processing_stage?: 'search' | 'pre_filter' | 'ai_filter' | 'visual_match' | null;
```

---

## Processing Stage Values

Now the system supports **4 processing stages**:

| Stage | Used By | Description |
|-------|---------|-------------|
| `search` | Both pipelines | Raw FoodGraph search results |
| `pre_filter` | Both pipelines | Passed text-based filtering |
| `ai_filter` | Pipeline 1 only | Passed AI comparison |
| `visual_match` | Pipeline 2 only | Visual matching results |

---

## Pipeline Differences

### Pipeline 1: With AI Filter
```
Search → Pre-filter → AI Filter → Visual Match (if 2+) → Save
└─ search  └─ pre_filter  └─ ai_filter    └─ ai_filter
```
*Uses 'ai_filter' stage even for visual matching results*

### Pipeline 2: Visual-Only
```
Search → Pre-filter → Visual Match → Save
└─ search  └─ pre_filter  └─ visual_match
```
*Uses new 'visual_match' stage for its results*

---

## Verification

Check that the constraint was updated:

```sql
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'branghunt_foodgraph_results_processing_stage_check';
```

**Expected Result:**
```
CHECK ((processing_stage = ANY (ARRAY['search'::text, 'pre_filter'::text, 'ai_filter'::text, 'visual_match'::text])))
```

✅ **Verified:** Constraint now includes all 4 values

---

## Impact

### Before Fix:
- ❌ Pipeline 2 failed with constraint violation
- ❌ No results saved for visual-only matching
- ❌ Users saw error messages for all products

### After Fix:
- ✅ Pipeline 2 works correctly
- ✅ Results saved with `processing_stage='visual_match'`
- ✅ Users can successfully process products

---

## Testing

### Test Pipeline 2:

1. Go to photo analysis page
2. Click **🎯 Pipeline 2: Visual-Only**
3. Select any concurrency (e.g., ⚡ 3)
4. Verify no constraint errors
5. Check results are saved

### Verify Database:

```sql
-- Check for visual_match results
SELECT 
  processing_stage,
  COUNT(*) as count
FROM branghunt_foodgraph_results
GROUP BY processing_stage
ORDER BY processing_stage;
```

You should now see rows with `processing_stage='visual_match'`.

---

## Related Files

**Database:**
- `migrations/add_processing_stage_column.sql` - Original constraint (3 values)
- `migrations/add_visual_match_processing_stage.sql` - Updated constraint (4 values)

**Backend:**
- `app/api/batch-search-and-save/route.ts` - Pipeline 1 (uses ai_filter)
- `app/api/batch-search-visual/route.ts` - Pipeline 2 (uses visual_match)

**Frontend:**
- `app/analyze/[imageId]/page.tsx` - TypeScript interface updated

**Documentation:**
- `TWO_PIPELINE_APPROACH.md` - Full pipeline documentation
- `PIPELINE_QUICK_START.md` - Quick reference

---

## Prevention

To avoid similar issues in the future:

1. **When adding new enum values**, update:
   - ✅ Database constraints (CHECK or ENUM)
   - ✅ TypeScript interfaces
   - ✅ Documentation

2. **Test new stages immediately**:
   - Run migration in dev environment
   - Test with sample data
   - Verify no constraint violations

3. **Document all valid values**:
   - Keep list of allowed stages in documentation
   - Update when adding new pipelines/stages

---

## Summary

**Problem:** Pipeline 2 couldn't save results due to missing `'visual_match'` in database constraint.

**Solution:** Updated constraint to include all 4 stages: `search`, `pre_filter`, `ai_filter`, `visual_match`.

**Status:** ✅ Fixed and deployed. Pipeline 2 now works correctly!

---

**Migration Applied:** November 12, 2025  
**Verified:** ✅ Constraint updated  
**Tested:** ✅ Pipeline 2 working  
**Committed:** Git commit c7b9229

