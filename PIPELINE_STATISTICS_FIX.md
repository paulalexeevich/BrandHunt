# Pipeline Statistics Fix

**Date:** November 11, 2025  
**Status:** DEPLOYED  
**Issue:** Incorrect pipeline statistics after UPSERT implementation

---

## Problem

After implementing UPSERT to eliminate duplicates, the pipeline statistics became confusing and incorrect.

### Examples from User Screenshots

**Example 1:**
- Showed: "FoodGraph returned 98 → Pre-filter selected 0 (≥85%) → AI analyzed 2"
- Reality: Pre-filter actually selected 2, AI analyzed 2
- User saw: All (100), Search (98), Pre-filter (0), AI Filter (2)

**Example 2:**
- Showed: "FoodGraph returned 36 → Pre-filter selected 0 (≥85%) → AI analyzed 64"  
- Reality: Pre-filter actually selected 64, AI analyzed 64
- User saw: All (100), Search (36), Pre-filter (0), AI Filter (64)

**The Confusion:**
- Pipeline text said "Pre-filter selected 0" but clearly many results passed pre-filter
- Users couldn't understand the actual flow: FoodGraph → Pre-filter → AI

---

## Root Cause

### How UPSERT Works with Processing Stages

With the UPSERT pattern implemented for duplicate elimination:

1. **Search stage:** INSERTs new rows with `processing_stage = 'search'`
2. **Pre-filter stage:** UPDATEs rows to `processing_stage = 'pre_filter'` (for those that pass ≥85% similarity)
3. **AI filter stage:** UPDATEs rows to `processing_stage = 'ai_filter'` (for those that pass AI matching)

**Key Point:** Results **MOVE** through stages by updating the `processing_stage` field.

### Old Calculation Logic

```typescript
const stageStats = {
  search: foodgraphResults.filter(r => r.processing_stage === 'search').length,
  pre_filter: foodgraphResults.filter(r => r.processing_stage === 'pre_filter').length,
  ai_filter: foodgraphResults.filter(r => r.processing_stage === 'ai_filter').length
};

// Pipeline text:
Pipeline: FoodGraph returned {stageStats.search} → 
          Pre-filter selected {stageStats.pre_filter} → 
          AI analyzed {stageStats.ai_filter}
```

**Problem:** This counts results **AT** each stage, not results that **PASSED** each stage.

### Why This Was Wrong

**Example 1 breakdown:**
- Search (98): Results still at 'search' stage (didn't pass pre-filter)
- Pre-filter (0): Results at 'pre_filter' stage (passed pre-filter but not AI yet)
- AI Filter (2): Results at 'ai_filter' stage (passed both pre-filter and AI)

**What the pipeline text showed:**
- "FoodGraph returned 98" ❌ (Wrong - should be 100 total)
- "Pre-filter selected 0" ❌ (Wrong - 2 passed pre-filter, they just moved to AI stage)
- "AI analyzed 2" ✓ (Correct)

---

## Solution

### New Calculation Logic

**File:** `app/analyze/[imageId]/page.tsx` (lines 1955-1974)

```typescript
// Count results at each current stage
const searchCount = foodgraphResults.filter(r => r.processing_stage === 'search').length;
const preFilterCount = foodgraphResults.filter(r => r.processing_stage === 'pre_filter').length;
const aiFilterCount = foodgraphResults.filter(r => r.processing_stage === 'ai_filter').length;

// For filter buttons: show current distribution
const stageStats = {
  all: foodgraphResults.length,
  search: searchCount,      // Results still at search stage
  pre_filter: preFilterCount,  // Results at pre-filter stage
  ai_filter: aiFilterCount   // Results at AI filter stage
};

// For pipeline display: show cumulative progress
const pipelineStats = {
  returned: searchCount + preFilterCount + aiFilterCount,  // Total initial results
  preFiltered: preFilterCount + aiFilterCount,  // All that passed pre-filter (≥85%)
  aiAnalyzed: aiFilterCount  // All that passed AI filter
};
```

**Pipeline text:**
```typescript
Pipeline: FoodGraph returned {pipelineStats.returned} → 
          Pre-filter selected {pipelineStats.preFiltered} (≥85%) → 
          AI analyzed {pipelineStats.aiAnalyzed}
```

### Why This Is Correct

**Example 1 with new logic:**
- searchCount = 98, preFilterCount = 0, aiFilterCount = 2
- pipelineStats.returned = 98 + 0 + 2 = **100** ✓
- pipelineStats.preFiltered = 0 + 2 = **2** ✓ (2 results passed pre-filter)
- pipelineStats.aiAnalyzed = **2** ✓

**Shows:** "FoodGraph returned 100 → Pre-filter selected 2 (≥85%) → AI analyzed 2" ✓

**Example 2 with new logic:**
- searchCount = 36, preFilterCount = 0, aiFilterCount = 64
- pipelineStats.returned = 36 + 0 + 64 = **100** ✓
- pipelineStats.preFiltered = 0 + 64 = **64** ✓ (64 results passed pre-filter)
- pipelineStats.aiAnalyzed = **64** ✓

**Shows:** "FoodGraph returned 100 → Pre-filter selected 64 (≥85%) → AI analyzed 64" ✓

---

## Key Insight: Cumulative vs Current

### Two Different Views Needed

**1. Pipeline Text (Cumulative View)**
- Shows the **flow** of results through stages
- Answers: "How many passed each stage?"
- Must use **cumulative counts** because results move forward

**2. Filter Buttons (Current View)**
- Shows the **distribution** of results by current stage
- Answers: "How many results are at each stage right now?"
- Uses **current stage counts** for filtering

### The Math

For a result to be at 'ai_filter' stage, it must have:
1. ✅ Passed initial FoodGraph search
2. ✅ Passed pre-filter (≥85% similarity)
3. ✅ Passed AI filter (visual similarity match)

So counting "how many passed pre-filter" = count at 'pre_filter' + count at 'ai_filter'

Because results at 'ai_filter' **also passed** pre-filter - they just moved forward.

---

## Before vs After

### Example 1

**Before:**
```
Pipeline: FoodGraph returned 98 → Pre-filter selected 0 (≥85%) → AI analyzed 2

Filter by Processing Stage:
All (100)  🔍 Search (98)  ⚡ Pre-filter (0)  🤖 AI Filter (2)
```

**After:**
```
Pipeline: FoodGraph returned 100 → Pre-filter selected 2 (≥85%) → AI analyzed 2

Filter by Processing Stage:
All (100)  🔍 Search (98)  ⚡ Pre-filter (0)  🤖 AI Filter (2)
```

**Change:** Pipeline text now correctly shows 100 initial results and 2 passed pre-filter.

### Example 2

**Before:**
```
Pipeline: FoodGraph returned 36 → Pre-filter selected 0 (≥85%) → AI analyzed 64

Filter by Processing Stage:
All (100)  🔍 Search (36)  ⚡ Pre-filter (0)  🤖 AI Filter (64)
```

**After:**
```
Pipeline: FoodGraph returned 100 → Pre-filter selected 64 (≥85%) → AI analyzed 64

Filter by Processing Stage:
All (100)  🔍 Search (36)  ⚡ Pre-filter (0)  🤖 AI Filter (64)
```

**Change:** Pipeline text now correctly shows 100 initial results and 64 passed pre-filter.

---

## Technical Details

### Why Pre-filter (0) in Filter Buttons?

The filter button showing "Pre-filter (0)" is **correct** - it means:
- Zero results are **currently at** pre-filter stage
- They all either stayed at 'search' or moved to 'ai_filter'

This happens when:
1. Pre-filter runs and marks results with `processing_stage = 'pre_filter'`
2. AI filter runs immediately after and updates the same results to `processing_stage = 'ai_filter'`
3. Result: No results remain at the intermediate 'pre_filter' stage

**This is normal for batch processing** where all stages run in sequence automatically.

### When Would Pre-filter Button Show Count?

If processing stopped after pre-filter (before AI filter ran):
```
All (100)  Search (36)  Pre-filter (64)  AI Filter (0)
Pipeline: FoodGraph returned 100 → Pre-filter selected 64 (≥85%) → AI analyzed 0
```

---

## Code Changes

### File: `app/analyze/[imageId]/page.tsx`

**Line 1955-1974:** Added separate calculations for stageStats (current) and pipelineStats (cumulative)

**Line 1998:** Updated pipeline text to use pipelineStats

---

## Testing Verification

### Test Cases

**1. All results passed pre-filter and AI:**
- Input: 50 results all match
- Expected: "FoodGraph returned 50 → Pre-filter selected 50 → AI analyzed 50"
- Buttons: Search (0), Pre-filter (0), AI Filter (50)

**2. Some passed pre-filter, fewer passed AI:**
- Input: 100 results, 30 passed pre-filter, 10 passed AI
- Expected: "FoodGraph returned 100 → Pre-filter selected 30 → AI analyzed 10"
- Buttons: Search (70), Pre-filter (20), AI Filter (10)

**3. None passed pre-filter:**
- Input: 100 results, 0 passed pre-filter
- Expected: "FoodGraph returned 100 → Pre-filter selected 0 → AI analyzed 0"
- Buttons: Search (100), Pre-filter (0), AI Filter (0)

---

## Deployment

✅ **Code updated:** app/analyze/[imageId]/page.tsx  
✅ **Linter:** No errors  
✅ **Committed:** Git commit `31bd7a5`  
✅ **Pushed:** To GitHub origin/main  
✅ **Auto-deployed:** Vercel production  

---

## Related Issues

- **UPSERT Implementation:** [[memory:11082996]] - Use UPSERT to prevent duplicates
- **Cumulative Statistics:** [[memory:11083200]] - Calculate cumulative pipeline progress

---

## User Impact

### Before Fix
- ❌ Confusing pipeline statistics (e.g., "Pre-filter selected 0" when 64 actually passed)
- ❌ Couldn't understand actual processing flow
- ❌ Numbers didn't add up

### After Fix
- ✅ Clear pipeline statistics showing actual progress
- ✅ Easy to understand: X returned → Y passed pre-filter → Z matched
- ✅ Numbers make sense and reflect reality
- ✅ Filter buttons still show current distribution for filtering

---

## Conclusion

The pipeline statistics now correctly represent the **cumulative flow** of results through processing stages, while filter buttons continue to show the **current distribution** for filtering purposes. This dual approach provides both understanding (where results are in the pipeline) and utility (ability to filter by stage).

The fix properly accounts for the UPSERT pattern where results progress through stages by updating their `processing_stage` field rather than creating new rows.

