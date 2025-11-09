# AI Filter Pre-Filter Integration Fix

**Date:** November 9, 2025  
**Issue:** AI filter was processing ALL database results instead of only pre-filtered ones

## Problem Description

### The Bug
After applying the text-based pre-filter (showing 4 results with ≥85% similarity), the AI filter was bypassing the pre-filter and fetching ALL results from the database (up to 50-100), causing:

1. **Extra results appearing** - Products that failed pre-filter (e.g., 80% text match) could pass AI visual comparison, showing 5+ results when only 4 were pre-filtered
2. **Unnecessary AI calls** - Comparing 50-100 products instead of just the 4 pre-filtered ones
3. **Slower processing** - 10-20x more API calls than needed
4. **Higher costs** - Wasted Gemini API quota on low-probability matches

### Root Cause

**Workflow:**
1. **Search FoodGraph** → Saves ~100 results to database
2. **Pre-Filter (Frontend)** → Filters in-memory to 4 results with ≥85% text similarity, updates UI state
3. **AI Filter (Backend)** → ❌ Fetched ALL results from DB, ignored frontend state

The AI filter API (`/api/filter-foodgraph`) was querying:
```typescript
.select('*')
.eq('detection_id', detectionId)
.limit(50)  // Gets all results, ignoring pre-filter!
```

## Solution

### Backend Changes (`app/api/filter-foodgraph/route.ts`)

Added `preFilteredResultIds` parameter to accept the IDs of pre-filtered results:

```typescript
const { detectionId, croppedImageBase64, preFilteredResultIds } = await request.json();

if (preFilteredResultIds && preFilteredResultIds.length > 0) {
  // Fetch ONLY the pre-filtered results
  console.log(`🔍 Fetching ${preFilteredResultIds.length} pre-filtered results for AI comparison...`);
  const { data, error } = await supabase
    .from('branghunt_foodgraph_results')
    .select('*')
    .in('id', preFilteredResultIds);  // Only these specific IDs
  foodgraphResults = data;
  fetchError = error;
} else {
  // Fallback: Fetch top 50 if no pre-filter was applied
  console.log(`⚠️ No pre-filtered results provided, fetching top 50...`);
  // ... existing code
}
```

**Key Features:**
- Uses `.in('id', preFilteredResultIds)` to fetch only specific pre-filtered results
- Backward compatible - falls back to top 50 if no pre-filter applied
- Clear logging to distinguish between pre-filtered and non-pre-filtered paths

### Frontend Changes (`app/analyze/[imageId]/page.tsx`)

Extract and send the IDs of currently displayed (pre-filtered) results:

```typescript
// Extract IDs of pre-filtered results to ensure AI only processes these
const preFilteredResultIds = foodgraphResults.map(r => r.id);
console.log(`🎯 Sending ${preFilteredResultIds.length} pre-filtered result IDs to AI filter`);

const response = await fetch('/api/filter-foodgraph', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    detectionId: selectedDetection,
    croppedImageBase64,
    preFilteredResultIds  // Pass the pre-filtered result IDs
  }),
});
```

**How It Works:**
- After pre-filtering, `foodgraphResults` state contains only the filtered results (e.g., 4 products)
- Extract their database IDs: `foodgraphResults.map(r => r.id)`
- Pass these IDs to the API so it only fetches and compares those specific results

### Documentation Update (`app/api/search-foodgraph/route.ts`)

Updated misleading comment that said "Save top 5 results" when code actually saves ALL results:

```typescript
// Save ALL results to database (typically ~100 results from FoodGraph API)
// Pre-filtering and AI filtering will narrow these down later
const foodgraphResults = [];
for (let rank = 0; rank < products.length; rank++) {
  // ... save each result
}
```

## Results

### Before Fix
- **Search:** 100 results saved to DB
- **Pre-Filter:** 4 results shown in UI
- **AI Filter:** ❌ Compares all 50-100 results from DB → Can show 5+ results
- **API Calls:** 50-100 Gemini comparisons

### After Fix
- **Search:** 100 results saved to DB
- **Pre-Filter:** 4 results shown in UI
- **AI Filter:** ✅ Compares only the 4 pre-filtered results
- **API Calls:** 4 Gemini comparisons (12-25x reduction!)

## Benefits

1. **Correct Behavior** - AI filter respects pre-filter, no unexpected results
2. **10-25x Faster** - Only 4 comparisons instead of 50-100
3. **10-25x Lower Cost** - Fewer Gemini API calls
4. **Better UX** - Consistent workflow where each step narrows results
5. **Backward Compatible** - Still works if pre-filter step is skipped

## Workflow Summary

```
Upload Image
    ↓
Detect Products (YOLO) → 30-50 products
    ↓
Select Product → Extract brand/product info
    ↓
Search FoodGraph → ~100 results saved to DB
    ↓
Pre-Filter (Text-based) → 4 results with ≥85% similarity
    ↓
AI Filter (Visual) → 1-2 results that match visually
    ↓
Save Best Match
```

**Pre-Filter:** Brand (35%), Size (35%), Retailer (30%) text matching, ≥85% threshold  
**AI Filter:** Visual comparison using Gemini 2.5 Flash, ≥70% confidence

## Technical Details

### AI Comparison Prompt
Each AI comparison sends:
- Cropped product image from shelf
- FoodGraph product image

Prompt asks Gemini to compare:
1. Brand name and logo
2. Product name and type
3. Packaging design and colors
4. Flavor/variant information
5. Overall visual appearance

Returns `{isMatch: boolean, confidence: 0.0-1.0, reason: string}`  
Requires `confidence >= 0.7` to consider a match.

### Database Schema
- `branghunt_foodgraph_results` table stores all FoodGraph results
- No `is_pre_filtered` flag needed - pre-filter is transient (in-memory)
- AI filter fetches specific results by ID array

## Files Changed
1. `app/api/filter-foodgraph/route.ts` - Accept and use preFilteredResultIds
2. `app/analyze/[imageId]/page.tsx` - Extract and send pre-filtered IDs
3. `app/api/search-foodgraph/route.ts` - Fix comment about how many results saved

## Testing
- Build passes: `npm run build` ✓
- No TypeScript errors
- No linter errors
- Backward compatible with non-pre-filtered workflow

## Related Documentation
- `RETAILER_PREFILTER_ENHANCEMENT.md` - Pre-filtering implementation
- `BATCH_AI_FILTER_SPEED_FIX.md` - Parallel AI filtering optimization
- `GEMINI_DETECTION_TEST.md` - AI comparison accuracy testing

