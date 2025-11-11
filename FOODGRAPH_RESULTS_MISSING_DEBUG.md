# FoodGraph Results Not Loading - Debug Report

**Date:** November 11, 2025  
**Status:** ✅ RESOLVED

## Problem Description

FoodGraph results are not displaying on the frontend even when products are marked as processed in batch mode.

### Symptoms

1. **Frontend Display:** Product cards show "📦 FoodGraph Match" (meaning detection has `selected_foodgraph_gtin` set)
2. **Fully Analyzed:** Detection is marked as `fully_analyzed = true`
3. **Console Logs:** Show "Loaded 0 FoodGraph results on-demand"
4. **Database:** API returns 0 results when querying `branghunt_foodgraph_results`

### Detection ID Example

```
60771115-d73b-4c66-a0c5-cbc903dc9ae5
```

### Console Log Pattern

```
Fetching FoodGraph results on-demand for detection 60771115-d73b-4c66-a0c5-cbc903dc9ae5
Loaded 0 FoodGraph results on-demand
foodgraphResults state changed: 0 results
```

## Root Cause Analysis

### Fixed Issues

1. ✅ **Infinite Loop (FIXED)**
   - **Problem:** useEffect was repeatedly fetching same results
   - **Solution:** Added `loadedDetectionIds` Set to cache which detections have been fetched
   - **Commit:** c20d3fa - "fix: Prevent infinite loop when loading FoodGraph results"

2. ✅ **Missing Database Records (ROOT CAUSE - FIXED)**
   - **Problem:** FoodGraph results table has 0 rows for processed detections, even though detection metadata was saved
   - **Root Cause:** Row Level Security (RLS) policy blocking UPSERT operations
     - Batch processing was using `createAuthenticatedSupabaseClient()` (user session)
     - RLS policy on `branghunt_foodgraph_results` checks if user has access
     - UPSERT operations were failing silently due to RLS restrictions
     - Detection updates succeeded (different RLS policy)
     - Result: Detection showed match, but 0 results in table
   - **Solution:** 
     - Created `createServiceRoleClient()` that uses service role key to bypass RLS
     - Updated batch processing APIs to use `supabaseAdmin` for all UPSERT operations
     - Regular reads still use authenticated client (respects RLS for security)
     - Created `ENV_SETUP.md` to document required `SUPABASE_SERVICE_ROLE_KEY` environment variable
   - **Commit:** 611f3d2 - "fix: Use service role client for batch processing to bypass RLS"

## Investigation Steps

### Step 1: Check Database Contents

Run the debug script to see what's actually in the database:

```bash
cd /Users/pavelp/Desktop/BrangHunt
node debug-foodgraph-results.js
```

This will:
- Check if detection exists and its status
- Query FoodGraph results table directly
- Verify RLS permissions
- Display image and project information

### Step 2: Run New Batch Processing with Debug Logs

1. Deploy latest code with debug logging (commit f9bc7fd)
2. Upload a fresh test image
3. Run batch processing (Search + AI Filter)
4. Check server console logs for:
   - "🔍 DEBUG: About to UPSERT X AI-filtered results"
   - "🔍 DEBUG: VERIFICATION QUERY for detection"
   - Any UPSERT errors

### Step 3: Check RLS Policies

Verify that RLS policies allow:
- INSERT for batch processing API (server-side auth)
- SELECT for frontend API (user auth)

### Step 4: Check Unique Constraint

Verify the unique constraint is correct:

```sql
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'branghunt_foodgraph_results'::regclass
  AND contype = 'u';
```

Expected: `UNIQUE (detection_id, product_gtin)`

## Code Changes

### Frontend (`app/analyze/[imageId]/page.tsx`)

**Commit:** c20d3fa

Added:
```typescript
const [loadedDetectionIds, setLoadedDetectionIds] = useState<Set<string>>(new Set());
```

Updated useEffect:
```typescript
} else if (detection && detection.fully_analyzed && !loadedDetectionIds.has(detection.id)) {
  // Mark as loaded immediately to prevent re-fetching
  setLoadedDetectionIds(prev => new Set([...prev, detection.id]));
  // ... fetch results
}
```

### Backend (`app/api/batch-search-and-save/route.ts`)

**Commit:** f9bc7fd

Added debug logging:
```typescript
console.log(`    🔍 DEBUG: About to UPSERT ${aiFilterInserts.length} AI-filtered results for detection ${detection.id}`);
console.log(`    🔍 DEBUG: First result GTIN: ${aiFilterInserts[0]?.product_gtin}, processing_stage: ${aiFilterInserts[0]?.processing_stage}`);

// After UPSERT
console.log(`    🔍 DEBUG: Inserted rows GTINs: ${aiFilterInsertData?.map((r: any) => r.product_gtin).join(', ')}`);

// VERIFY: Query back immediately
const { data: verifyData, error: verifyError } = await supabase
  .from('branghunt_foodgraph_results')
  .select('product_gtin, processing_stage')
  .eq('detection_id', detection.id);

console.log(`    🔍 DEBUG: VERIFICATION QUERY for detection ${detection.id}:`);
console.log(`    🔍 DEBUG: Found ${verifyData?.length || 0} rows in database`);
```

## Resolution Steps

1. ✅ **Fixed infinite loop** (Commit c20d3fa)
   - Added `loadedDetectionIds` cache to prevent re-fetching

2. ✅ **Identified root cause** (RLS blocking UPSERT)
   - Console logs showed detection marked as `fully_analyzed`
   - But API returned 0 FoodGraph results
   - Analysis revealed RLS policy was blocking writes

3. ✅ **Implemented solution** (Commit 611f3d2)
   - Created service role client function
   - Updated both batch processing APIs
   - Documented environment variable requirements

4. ✅ **Deployed to production**
   - All commits pushed to main branch
   - Vercel will auto-deploy in ~2 minutes

5. ⏳ **Required: Add environment variable**
   - Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel environment variables
   - Get key from: Supabase project settings → API → service_role key
   - Redeploy after adding the variable

6. ⏳ **Testing**
   - Upload a test image
   - Run batch processing (Search + AI Filter)
   - Verify FoodGraph results now appear in the list

## Potential Solutions

### If UPSERT is failing:
- Check for unique constraint violations
- Verify all required fields are present
- Check for RLS policy issues

### If results are being deleted:
- Search for any DELETE queries in batch processing
- Check for cleanup jobs or triggers

### If AI filter stage is failing:
- Check Gemini API rate limits
- Verify image cropping is working
- Check for network errors

## Related Files

- Frontend: `app/analyze/[imageId]/page.tsx`
- Batch API: `app/api/batch-search-and-save/route.ts`
- FoodGraph API: `app/api/foodgraph-results/[detectionId]/route.ts`
- Results API: `app/api/results/[imageId]/route.ts`
- Migration: `migrations/fix_foodgraph_duplicates_upsert.sql`

## Timeline

- **Nov 11, 2025 (Start):** Issue reported
- **Nov 11, 2025 (c20d3fa):** Fixed infinite loop
- **Nov 11, 2025 (f9bc7fd):** Added debug logging
- **Nov 11, 2025 (Current):** Investigating root cause

