# Visual Match Count Fix - November 13, 2025

## Problem
After running Visual-Only Pipeline (Pipeline 2), the Visual Match filter button showed **(0)** even though products were successfully matched and the "FoodGraph Match" section displayed correctly. Users couldn't access the visual match results through the filter button.

## Root Cause Analysis

### The Issue
**TWO PROBLEMS identified:**

1. **Count Logic Bug** (components/FoodGraphResultsList.tsx lines 59-61)
   - When `foodgraphResults` array was empty (not loaded yet), `visualMatchStageCount = 0`
   - Fallback used `aiMatchesCount` which was also 0 for Pipeline 2 (skips AI Filter stage)
   - Result: Visual Match button showed (0) even when `detection.selection_method === 'visual_matching'` was true

2. **On-Demand Loading Gap** (app/analyze/[imageId]/page.tsx line 161)
   - Condition only checked `detection.fully_analyzed`
   - Didn't check for `detection.selection_method === 'visual_matching'`
   - If detection had visual match but fully_analyzed wasn't set, results wouldn't load

### Why It Mattered
- Product #13 showed as "Matched" with UPC displayed (detection fields populated ✓)
- But clicking Visual Match button showed nothing (foodgraphResults array empty ✗)
- Data existed in database but UI couldn't access it

## The Fix

### Fix 1: Improved Count Logic (FoodGraphResultsList.tsx)

**Location:** `components/FoodGraphResultsList.tsx`

**Before (lines 59-61):**
```typescript
const visualMatchCount = hasVisualMatchData 
  ? (visualMatchStageCount > 0 ? visualMatchStageCount : aiMatchesCount)
  : 0;
```

**After (lines 60-75):**
```typescript
// Calculate visual match count with proper fallback for Pipeline 2
let visualMatchCount = 0;
if (visualMatchStageCount > 0) {
  // Results are loaded - use actual count
  visualMatchCount = visualMatchStageCount;
} else if (hasVisualMatchData) {
  // Results not loaded yet, but we know visual matching was done
  // Check if detection has a selected match (indicates at least 1 result exists)
  if (detection.selected_foodgraph_result_id || detection.selection_method === 'visual_matching') {
    // Use AI matches count if available (Pipeline 1), or fallback to 1 (Pipeline 2)
    visualMatchCount = aiMatchesCount > 0 ? aiMatchesCount : 1;
  } else {
    // Has candidates but no selection yet - use candidates count
    visualMatchCount = aiFilterCandidates > 0 ? aiFilterCandidates : 0;
  }
}
```

**Benefits:**
- Shows at least (1) when `detection.selection_method === 'visual_matching'` is true
- Works even when `foodgraphResults` array is empty (not loaded yet)
- Properly handles both Pipeline 1 (AI Filter) and Pipeline 2 (Visual-Only)
- Provides accurate counts based on available data

### Fix 2: Enhanced On-Demand Loading Trigger (page.tsx)

**Location:** `app/analyze/[imageId]/page.tsx`

**Before (line 161):**
```typescript
} else if (detection && detection.fully_analyzed && !loadedDetectionIds.has(detection.id)) {
```

**After (line 161):**
```typescript
} else if (detection && (detection.fully_analyzed || detection.selection_method === 'visual_matching') && !loadedDetectionIds.has(detection.id)) {
```

**Benefits:**
- Triggers on-demand load when `selection_method === 'visual_matching'` even if `fully_analyzed` isn't set
- Ensures visual match results are always loaded when they exist
- Added debug logging showing both flags
- Covers edge cases where pipeline sets selection_method before fully_analyzed

### Fix 3: On-Demand Loading When Filter Clicked (FoodGraphResultsList.tsx)

**Location:** `components/FoodGraphResultsList.tsx` lines 192-200

**Added:**
- Optional `onLoadResults` callback prop to component interface
- Async onClick handler for Visual Match button
- Auto-triggers loading when: count > 0 BUT results not loaded yet

**Implementation:**
```typescript
<button
  onClick={async () => {
    setStageFilter('visual_match');
    // If count shows results but they're not loaded yet, trigger loading
    if (visualMatchCount > 0 && visualMatchStageCount === 0 && onLoadResults) {
      console.log('🎯 Visual Match clicked - triggering on-demand load...');
      await onLoadResults();
    }
  }}
  disabled={visualMatchCount === 0}
>
  🎯 Visual Match ({stageStats.visual_match})
</button>
```

**In page.tsx (lines 2213-2216):**
```typescript
<FoodGraphResultsList
  {...other props}
  onLoadResults={async () => {
    console.log('📥 Loading FoodGraph results on-demand...');
    await fetchImage(true);
  }}
/>
```

**Benefits:**
- Results load automatically when Visual Match button clicked
- No need for manual refresh or separate load button
- Seamless user experience - click button, see results immediately
- Works even if useEffect didn't trigger load initially

## Technical Details

### Data Flow
1. **Pipeline Completes:**
   - Saves results to `branghunt_foodgraph_results` with `processing_stage='visual_match'` ✓
   - Updates detection with `selection_method='visual_matching'` ✓
   - Calls `fetchImage(true)` to reload with `includeFoodGraphResults=true` ✓

2. **User Clicks Product:**
   - useEffect triggers (line 130)
   - Checks if `detection.foodgraph_results` exists:
     - **If yes:** Loads from cache (line 141)
     - **If no:** Triggers on-demand fetch (line 161) ✓ NOW INCLUDES visual_matching check

3. **Count Calculation:**
   - `visualMatchStageCount` counts actual loaded results
   - Falls back to minimum 1 if `selection_method === 'visual_matching'` ✓ FIXED
   - Button shows correct count even before results load

### Pipeline Compatibility
- **Pipeline 1 (AI Filter):** Works as before, uses `aiMatchesCount` when loaded
- **Pipeline 2 (Visual-Only):** Now shows (1) minimum, triggers on-demand load correctly

## Testing Performed

### Test Case 1: Fresh Visual-Only Pipeline Run
1. ✅ Run Visual-Only Pipeline on image with 10 products
2. ✅ All products matched and saved
3. ✅ Visual Match button shows (10) not (0)
4. ✅ Click button to see all matched results
5. ✅ Results display with SELECTED badge and visual similarity scores

### Test Case 2: Page Refresh After Match
1. ✅ Run pipeline and match products
2. ✅ Refresh page (foodgraphResults cleared from memory)
3. ✅ Click on product #5
4. ✅ Visual Match button shows (1) immediately (fallback count)
5. ✅ On-demand fetch loads actual results
6. ✅ Count updates to actual result count

### Test Case 3: Navigate Between Products
1. ✅ Match product #1 with Visual-Only Pipeline
2. ✅ Click product #2 (no match)
3. ✅ Click back to product #1
4. ✅ Visual Match button shows correct count
5. ✅ Click button shows matched result

## Files Changed
1. `components/FoodGraphResultsList.tsx` (25 lines changed)
   - Enhanced visual match count calculation (lines 60-75)
   - Added proper fallback for Pipeline 2
   - Improved logic clarity with if-else blocks
   - Added `onLoadResults` optional callback prop (line 21)
   - Updated Visual Match button with async onClick (lines 192-200)
   - Auto-triggers on-demand loading when clicked

2. `app/analyze/[imageId]/page.tsx` (7 lines changed)
   - Added `selection_method === 'visual_matching'` check to on-demand loading (line 161)
   - Enhanced debug logging
   - Added onLoadResults callback to FoodGraphResultsList (lines 2213-2216)
   - Callback triggers fetchImage(true) to load results with FoodGraph data

## Verification

### Browser Console Checks
Look for these log messages after fix:
```
📥 Fetching FoodGraph results on-demand for detection [id] (fully_analyzed=true, selection_method=visual_matching)
📦 Loaded X FoodGraph results on-demand
```

### Visual Verification
- Visual Match button shows **(X)** where X > 0 for matched products
- Button is enabled (not greyed out)
- Clicking button displays results with SELECTED badge
- Visual similarity percentages appear

### Database Verification
```sql
SELECT 
  d.detection_index,
  d.brand_name,
  d.selection_method,
  d.fully_analyzed,
  d.selected_foodgraph_result_id,
  COUNT(fgr.id) as foodgraph_count,
  STRING_AGG(DISTINCT fgr.processing_stage, ', ') as stages
FROM branghunt_detections d
LEFT JOIN branghunt_foodgraph_results fgr ON d.id = fgr.detection_id
WHERE d.selection_method = 'visual_matching'
GROUP BY d.id
ORDER BY d.detection_index;
```

Should show:
- `selection_method = 'visual_matching'` ✓
- `foodgraph_count > 0` ✓
- `stages` includes `'visual_match'` ✓
- `selected_foodgraph_result_id` is not null ✓

## Impact
- ✅ Visual Match results now accessible via filter button
- ✅ Accurate counts displayed for both pipelines
- ✅ On-demand loading covers all scenarios
- ✅ No performance impact (same API calls)
- ✅ Backward compatible with Pipeline 1
- ✅ User experience significantly improved

## Prevention
To avoid similar issues:
1. Always consider "data not loaded yet" scenarios when calculating counts
2. Use detection-level flags (like `selection_method`) as fallback indicators
3. Test both "just completed" and "page refreshed" scenarios
4. Ensure on-demand loading covers all completion methods
5. Add debug logging showing which conditions triggered

## Related Issues
- Initial issue: Memory ID 11176597 (Visual similarity badges not displaying)
  - Was about badges, but root cause was same (results not loading)
  - That fix handled pipeline completion, this handles post-refresh scenarios

## Status
✅ **FIXED** - Visual Match button now shows correct count and results are accessible

**Committed:** [To be committed]
**Tested:** Local dev environment
**Production:** Ready to deploy

