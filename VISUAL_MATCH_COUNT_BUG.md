# Visual Match Count Bug Analysis
**Date:** November 13, 2025
**Status:** 🔴 BUG IDENTIFIED

## Problem
User ran Visual-Only Pipeline (Pipeline 2) successfully and products were matched, but Visual Match filter button shows **(0)** instead of showing the actual count of matched products.

## Root Cause Analysis

### The Bug Location
File: `components/FoodGraphResultsList.tsx` lines 56-61

```typescript
const hasVisualMatchData = visualMatchStageCount > 0 || 
                           aiFilterCandidates >= 2 || 
                           detection.selection_method === 'visual_matching';
const visualMatchCount = hasVisualMatchData 
  ? (visualMatchStageCount > 0 ? visualMatchStageCount : aiMatchesCount)
  : 0;
```

### Why It Fails

**Pipeline 2 (Visual-Only) Flow:**
1. Search → Pre-filter → **Visual Match** (skips AI Filter) → Save
2. Results are saved with `processing_stage='visual_match'`
3. **AI Filter never runs** in Pipeline 2

**The Bug:**
- Line 40: `visualMatchStageCount` counts results with `processing_stage='visual_match'` ✓ (should work)
- Line 60: When `visualMatchStageCount === 0`, it falls back to `aiMatchesCount`
- But `aiMatchesCount` (line 43-47) counts results from `processing_stage='ai_filter'`
- **Pipeline 2 never creates 'ai_filter' results, so both counts are 0!**

### Expected vs Actual

**Expected:** Visual Match button shows (1) or more for matched products from Pipeline 2

**Actual:** Visual Match button shows (0) even though:
- Product is matched and saved
- FoodGraph Match displays correctly
- Database has records with `processing_stage='visual_match'`

## Why FoodGraph Results Aren't Loading

Based on the code flow:
1. Pipeline completes → calls `fetchImage(true)` ✓ (lines 1162, 1274)
2. Detection object should have `foodgraph_results` array populated
3. When detection is selected, useEffect (lines 131-201) should load results

**Possible Issues:**
1. ❌ `fetchImage(true)` might not be populating `detection.foodgraph_results` correctly
2. ❌ API `/api/results/${imageId}?includeFoodGraphResults=true` might not be including visual_match results
3. ❌ On-demand fetch `/api/foodgraph-results/${detectionId}` might not be returning visual_match results

## Diagnosis Steps

### Step 1: Check Browser Console
User should open browser console and look for:
```
🔄 useEffect - Selected detection changed
📦 Loaded X FoodGraph results from cache
```

If seeing `🔄 useEffect - No FoodGraph results, clearing state`, then `detection.foodgraph_results` is empty/undefined.

### Step 2: Check API Response
Open Network tab and check:
- Request: `GET /api/results/[imageId]?includeFoodGraphResults=true`
- Response: Does `detections[].foodgraph_results` array exist and have data?

### Step 3: Check Database
Query to verify data exists:
```sql
SELECT processing_stage, match_status, COUNT(*) 
FROM branghunt_foodgraph_results 
WHERE detection_id = '[detection-id]'
GROUP BY processing_stage, match_status;
```

## Solution Strategy

### Fix 1: Correct the Count Logic
Update line 60 to properly handle Pipeline 2 results:

```typescript
const visualMatchCount = hasVisualMatchData 
  ? (visualMatchStageCount > 0 ? visualMatchStageCount : aiFilterCandidates)
  : 0;
```

**Rationale:** Use `aiFilterCandidates` (which counts candidates from ANY stage) instead of `aiMatchesCount` (which only counts ai_filter stage results).

### Fix 2: Verify API Returns Visual Match Results
Check `/api/results/[imageId]/route.ts` to ensure query includes visual_match stage:
```typescript
.select('*, foodgraph_results(*)')
```

Should return ALL processing_stages including 'visual_match'.

### Fix 3: Verify On-Demand Loading
Check `/api/foodgraph-results/[detectionId]/route.ts` includes visual_match results.

## Testing Plan

1. ✅ Run Visual-Only Pipeline on an image
2. ✅ Verify products are matched and saved
3. ✅ Check Visual Match button shows correct count (not 0)
4. ✅ Click Visual Match button to filter results
5. ✅ Verify matched products appear with SELECTED badge
6. ✅ Verify visual similarity scores display

## Files to Check/Fix
- `components/FoodGraphResultsList.tsx` (count logic)
- `app/api/results/[imageId]/route.ts` (verify includes visual_match)
- `app/api/foodgraph-results/[detectionId]/route.ts` (verify includes visual_match)
- `app/analyze/[imageId]/page.tsx` (useEffect loading logic)

## Status
🔴 **BUG CONFIRMED** - Visual Match count logic fails for Pipeline 2 because it falls back to AI Filter counts which don't exist in Pipeline 2.

