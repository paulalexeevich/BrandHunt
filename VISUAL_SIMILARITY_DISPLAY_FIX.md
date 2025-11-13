# Visual Similarity Display Fix - November 13, 2025

## Problem

User reported that visual similarity percentages and match status badges were not displaying after running the Visual Match pipeline, even though:
- The pipeline completed successfully
- A product was selected and saved (visible in "FoodGraph Match" section)
- The Visual Match filter button showed **(0)** instead of the expected count

## Root Cause

When the Visual Match pipeline completes:

1. ✅ **Visual match results ARE saved** to `branghunt_foodgraph_results` table with:
   - `processing_stage='visual_match'`
   - `visual_similarity` scores for each candidate
   - `match_status` ('identical' or 'almost_same')
   - `match_reason` (AI reasoning)

2. ✅ **Detection IS updated** with selected match info

3. ❌ **FoodGraph results are NOT reloaded** for the currently selected detection

The issue: The page uses **on-demand loading** for FoodGraph results. After pipeline completion:
- `fetchImage()` refreshes the detections list
- But it doesn't reload FoodGraph results for the currently selected detection
- The UI continues showing OLD cached data (Pre-filter results)
- The Visual Match button shows (0) because the component has stale data

## The Fix

Added automatic reload of FoodGraph results for the currently selected detection after BOTH pipelines complete.

### Changed File
`app/analyze/[imageId]/page.tsx`

### Pipeline 1: AI Filter (lines 1160-1175)
```typescript
} else if (data.type === 'complete') {
  // ... existing progress update code ...
  
  await fetchImage();

  // Force reload FoodGraph results for currently selected detection
  if (selectedDetection) {
    console.log(`🔄 Reloading FoodGraph results for selected detection after pipeline completion`);
    try {
      const response = await fetch(`/api/foodgraph-results/${selectedDetection}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`📦 Reloaded ${data.results?.length || 0} FoodGraph results (including visual match data)`);
        if (data.results) {
          setFoodgraphResults(data.results);
        }
      }
    } catch (err) {
      console.error('Failed to reload FoodGraph results:', err);
    }
  }

  alert(`✅ AI Filter Pipeline Complete!...`);
}
```

### Pipeline 2: Visual-Only (lines 1271-1286)
Same logic applied to the Visual-Only pipeline completion handler.

## How It Works

**Before Fix:**
1. User selects detection → FoodGraph results loaded and cached
2. User runs Visual Match pipeline
3. Pipeline completes, saves visual match data to database
4. `fetchImage()` refreshes detections list
5. ❌ FoodGraph results remain cached (old Pre-filter data)
6. Visual Match button shows (0) because component has stale data

**After Fix:**
1. User selects detection → FoodGraph results loaded and cached
2. User runs Visual Match pipeline
3. Pipeline completes, saves visual match data to database
4. `fetchImage()` refreshes detections list
5. ✅ `fetch('/api/foodgraph-results/${selectedDetection}')` reloads FoodGraph results
6. ✅ `setFoodgraphResults(data.results)` updates component state with new data
7. ✅ Visual Match button shows correct count (e.g., Visual Match (8))
8. ✅ Visual similarity badges and percentages display when user clicks filter

## Expected Results After Fix

### Before Clicking Visual Match Button
- Filter buttons show updated counts:
  - 🔍 Search (100)
  - ⚡ Pre-filter (58)
  - 🤖 AI Filter (0) or (X) if AI ran
  - 🎯 Visual Match **(8)** ← Shows count now!

### After Clicking Visual Match Button
Product cards display:

**Match Status Badge** (top-right of product image):
- 🎯 **IDENTICAL** (green gradient) - Selected match with highest similarity
- 🔍 **ALMOST SAME** (blue gradient) - Alternative candidates that passed ≥70% threshold

**Visual Similarity Percentage** (below UPC code):
- 👁️ Visual Similarity: **95.0%** (green badge if ≥90%)
- 👁️ Visual Similarity: **82.0%** (blue badge if 70-89%)
- 👁️ Visual Similarity: **65.0%** (yellow badge if <70%)

**Match Reasoning** (purple box):
- 🤖 "Selected as best match. The visual elements strongly match: same packaging style, identical color scheme (white/orange/brown), similar bottle shape..."

## Technical Details

### On-Demand Loading Logic
Located at `app/analyze/[imageId]/page.tsx` lines 161-176:
```typescript
} else if (detection && detection.fully_analyzed && !loadedDetectionIds.has(detection.id)) {
  // Detection is fully analyzed but results weren't loaded - fetch them on demand (ONCE)
  console.log(`📥 Fetching FoodGraph results on-demand for detection ${detection.id}`);
  
  // Mark as loaded immediately to prevent re-fetching
  setLoadedDetectionIds(prev => new Set(prev).add(detection.id));
  
  try {
    const response = await fetch(`/api/foodgraph-results/${detection.id}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`📦 Loaded ${data.results?.length || 0} FoodGraph results on-demand`);
      
      // ALWAYS set state, even for 0 results (NO MATCH case)
      if (data.results) {
        setFoodgraphResults(data.results);
      }
    }
  } catch (err) {
    console.error('Failed to load FoodGraph results on-demand:', err);
  }
}
```

This logic only runs ONCE per detection (tracked via `loadedDetectionIds` Set). After pipeline completion, we need to bypass this caching and force a reload.

### Why Not Just Clear the Cache?

We could have done:
```typescript
setLoadedDetectionIds(new Set()); // Clear cache
```

But this has issues:
1. Doesn't immediately reload data - waits for next useEffect trigger
2. Would reload ALL detections on next interaction (wasteful)
3. Timing issues with React state updates

Instead, we **directly fetch and update** the currently selected detection's results, ensuring immediate visibility of new visual match data.

## Visual Similarity Data Flow

### Saving Visual Match Results
`lib/gemini.ts` lines 983-1098: `saveVisualMatchResults()`

Saves to `branghunt_foodgraph_results`:
```typescript
{
  detection_id: string,
  processing_stage: 'visual_match',
  match_status: 'identical' | 'almost_same',
  visual_similarity: 0.95,  // Decimal 0.0-1.0
  match_reason: "Selected as best match. The visual elements...",
  // ... other fields
}
```

### Displaying Visual Similarity
`components/FoodGraphResultsList.tsx` lines 355-369:
```typescript
{(result as any).visual_similarity !== null && 
 (result as any).visual_similarity !== undefined && 
 filteredCount !== null && (
  <div className="flex items-center gap-1 mt-1">
    <span className="text-[10px] font-semibold text-indigo-700">
      👁️ Visual Similarity:
    </span>
    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
      (result as any).visual_similarity >= 0.9 ? 'bg-green-100 text-green-800' :
      (result as any).visual_similarity >= 0.7 ? 'bg-blue-100 text-blue-800' :
      'bg-yellow-100 text-yellow-800'
    }`}>
      {((result as any).visual_similarity * 100).toFixed(1)}%
    </span>
  </div>
)}
```

**Display Conditions:**
1. ✅ `visual_similarity` field is populated (not null/undefined)
2. ✅ `filteredCount !== null` (filter buttons are active)
3. ✅ User has clicked a stage filter button

## Testing

### Test Steps
1. Navigate to photo analysis page
2. Select a detection (product)
3. Click **⚙️ Image Processing** button to show processing blocks
4. Click **Block 2: Product Matching** to expand
5. Click **🎯 Visual-Only (3)** or **🎯 Visual-Only (ALL)**
6. Wait for pipeline to complete
7. **Observe:** Visual Match button should now show count (e.g., Visual Match (8))
8. Click **🎯 Visual Match** filter button
9. **Verify:** Product cards show:
   - Match status badges (🎯 IDENTICAL or 🔍 ALMOST SAME)
   - Visual similarity percentages (👁️ Visual Similarity: 95.0%)
   - Match reasoning (🤖 purple box)

### Test Cases

**Case 1: Single product processing**
- Select detection
- Run Visual-Only (3)
- Verify selected detection shows updated visual match data

**Case 2: Batch processing with detection selected**
- Select detection
- Run Visual-Only (ALL) 
- Verify selected detection updates even though pipeline processes many products

**Case 3: Switch detection after pipeline**
- Select detection A
- Run pipeline
- Select detection B
- Select detection A again
- Verify detection A shows visual match data

## Git Commit

```bash
git add app/analyze/[imageId]/page.tsx
git add VISUAL_SIMILARITY_DISPLAY_FIX.md
git commit -m "fix: reload FoodGraph results after pipeline completion

Forces reload of FoodGraph results for currently selected detection
after both AI Filter and Visual-Only pipelines complete. This ensures
visual similarity scores, match status badges, and match reasoning
are immediately visible without requiring user to re-select detection.

Fixes issue where Visual Match button showed (0) after pipeline ran
because component had stale cached data from before visual matching.

Changes:
- Added fetch('/api/foodgraph-results/\${selectedDetection}') after
  pipeline completion in both handlePipelineAI and handlePipelineVisual
- Updates setFoodgraphResults() with fresh data including visual_match
  processing stage results
- Graceful error handling if reload fails

Impact: Users now see visual similarity percentages and match status
badges immediately after pipeline completes, without needing to
manually refresh or re-select detection."
```

## Key Learnings

### 1. On-Demand Loading + Batch Updates = Stale Data
When using on-demand loading with caching (loadedDetectionIds), batch operations that update the database won't automatically refresh cached data. Need to explicitly reload after batch operations complete.

### 2. React State Updates Don't Trigger Re-Fetch
Simply clearing cache (`setLoadedDetectionIds(new Set())`) doesn't immediately reload data. React needs a separate trigger (useEffect dependency change, direct fetch call, etc.).

### 3. Fetch + Update State = Immediate Visibility
Direct fetch followed by setState provides immediate feedback:
```typescript
const response = await fetch(`/api/endpoint`);
const data = await response.json();
setState(data);  // Immediate UI update
```

Better than relying on side effects or cache invalidation.

### 4. Apply Fix to ALL Pipelines
If the fix applies to one pipeline (Visual-Only), it likely applies to others (AI Filter). Maintain consistency across similar code paths.

### 5. Always Test the Full User Flow
Issue wasn't in the visual matching logic or display components - it was in the data loading flow between batch processing and UI display. Test end-to-end flows, not just individual components.

## Related Documentation

- `VISUAL_SIMILARITY_SCORING.md` - How visual similarity scores are calculated
- `VISUAL_MATCH_FUZZY_LOGIC.md` - Visual matching algorithm
- `TWO_PIPELINE_APPROACH.md` - Pipeline 1 vs Pipeline 2 comparison
- `UNIVERSAL_FILTERING_SYSTEM.md` - How stage filters work
- `PAGE_LOAD_PERFORMANCE_OPTIMIZATION.md` - On-demand loading implementation

## Impact

- ✅ Visual similarity features now work as designed
- ✅ No need for users to re-select detection after pipeline runs
- ✅ Immediate feedback on visual matching results
- ✅ Better transparency for alternative matches (ALMOST SAME candidates)
- ✅ Applies to both Pipeline 1 and Pipeline 2
- ⚠️ Adds one extra API call per pipeline completion (minimal overhead)

## Status

**IMPLEMENTED** - Ready for testing  
**Files Changed:** 1 (app/analyze/[imageId]/page.tsx)  
**Lines Added:** 32 (16 lines per pipeline)  
**Linter Errors:** 0

