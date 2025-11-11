# Visual Match Filter Gap Fix

**Date:** November 11, 2025  
**Issue:** Visual Match button showed `(0)` even when product had 2+ candidates waiting for visual matching

---

## The Problem

**User observation:** "How visual match status updated? I think it's gap"

The Visual Match filter button was showing `(0)` even though:
- The product had 2+ match candidates
- The **🎯 Visual Match Selection** button showed "2 candidates"
- The candidates were visible and ready for visual matching

### Root Cause

The count logic only included products that **already completed** visual matching:
```typescript
// OLD (incomplete)
const visualMatchCount = detection.selection_method === 'visual_matching' ? aiMatchesCount : 0;
```

This ignored products with 2+ candidates **waiting** for visual matching!

---

## The Solution

Updated the count to include **both** scenarios:

### 1. Count Logic (Line ~2633)

```typescript
// NEW (complete)
// Count products for visual matching:
// 1) Already matched via visual_matching, OR
// 2) Has 2+ identical/almost_same results (pending visual match)
const multipleMatchCandidates = foodgraphResults.filter(r => {
  const matchStatus = (r as any).match_status;
  return r.processing_stage === 'ai_filter' && 
         (matchStatus === 'identical' || matchStatus === 'almost_same');
}).length;

const visualMatchCount = (detection.selection_method === 'visual_matching' || multipleMatchCandidates >= 2) 
  ? aiMatchesCount 
  : 0;
```

### 2. Filter Logic (Line ~2731)

```typescript
} else if (stageFilter === 'visual_match') {
  // Show results for products that use/need visual matching:
  // 1) Already matched via visual_matching, OR
  // 2) Has 2+ candidates (pending visual match)
  const candidateCount = foodgraphResults.filter(r => {
    const matchStatus = (r as any).match_status;
    return r.processing_stage === 'ai_filter' && 
           (matchStatus === 'identical' || matchStatus === 'almost_same');
  }).length;
  
  if (detection.selection_method === 'visual_matching' || candidateCount >= 2) {
    filteredResults = foodgraphResults.filter(r => r.processing_stage === 'ai_filter');
  } else {
    filteredResults = [];
  }
}
```

---

## User Experience

### Before Fix

```
🎯 Visual Match Selection button: "2 candidates" ✓
Filter by Processing Stage:
  🔍 Search (100)
  ⚡ Pre-filter (2)
  🤖 AI Filter (2)
  🎯 Visual Match (0)  ← WRONG! Shows 0 despite having 2 candidates
```

Button is disabled (greyed out) even though visual matching is available.

### After Fix

```
🎯 Visual Match Selection button: "2 candidates" ✓
Filter by Processing Stage:
  🔍 Search (100)
  ⚡ Pre-filter (2)
  🤖 AI Filter (2)
  🎯 Visual Match (2)  ← CORRECT! Shows 2 candidates
```

Button is enabled (cyan) and clicking shows the 2 candidates for review.

---

## Visual Match Filter Now Includes

| Scenario | selection_method | Candidates | Button Shows | Button State |
|----------|------------------|------------|--------------|--------------|
| **Already matched** | 'visual_matching' | N/A | (N) | ✅ Enabled |
| **Pending match** | NULL | 2+ identical/almost_same | (N) | ✅ Enabled |
| **Auto-selected** | 'auto_select' | 1 | (0) | ❌ Disabled |
| **Consolidated** | 'consolidation' | 1 | (0) | ❌ Disabled |
| **No matches** | NULL | 0 | (0) | ❌ Disabled |

---

## Why This Matters

1. **Visibility**: Users can see when visual matching is **available**, not just completed
2. **Workflow**: Can click Visual Match to review candidates **before** running visual analysis
3. **Consistency**: Button count matches the "2 candidates" badge shown above
4. **User Experience**: No confusion about why button shows (0) when candidates exist

---

## Testing

### Test Case: Product with 2+ Pending Candidates

1. Product has 2+ almost_same results from AI Filter
2. Visual Match Selection button shows "2 candidates"
3. Visual Match filter button shows **(2)** ✅
4. Button is **enabled** (cyan styling) ✅
5. Click button → Shows 2 candidates ✅
6. Run visual matching → selection_method='visual_matching' ✅
7. Button still shows **(N)** where N = matched count ✅

### Test Case: Product Already Visually Matched

1. Product has selection_method='visual_matching'
2. Visual Match filter button shows **(1)** ✅
3. Button is **enabled** ✅
4. Click button → Shows the selected match ✅

### Test Case: Product with Single Match

1. Product has 1 identical match (auto-selected)
2. Visual Match filter button shows **(0)** ✅
3. Button is **disabled** (greyed out) ✅

---

## Commit Details

```bash
Commit: 292a5f1
Message: Fix Visual Match filter to show pending candidates
Files Changed: 1
- app/analyze/[imageId]/page.tsx (modified)

Lines Changed:
- Count logic: +13 -1 (lines ~2624-2635)
- Filter logic: +11 -3 (lines ~2721-2735)
```

---

## Related Issues Fixed

This also fixes:
- ✅ Button count mismatch with candidate badge
- ✅ Unable to review candidates before visual matching
- ✅ Confusion about when visual matching is available
- ✅ Inconsistent UI signals (button disabled but candidates shown)

---

**Status:** ✅ Gap Fixed and Deployed  
**User Experience:** Improved  
**Git:** Committed and Pushed

