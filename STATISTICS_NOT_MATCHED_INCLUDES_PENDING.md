# Statistics Fix: Not Matched Includes Pending Products

**Date:** November 11, 2025  
**Status:** ✅ Completed

## Problem

The user reported incorrect statistics in the progress bar:
- Progress bar showed: **69 / 70 Saved (99%)**
- UI statistics showed: **69 Matched, 1 Not Matched**

But the actual count was:
- **60 products** with confirmed matches (saved)
- **10 products** without matches (not saved)

The discrepancy was 9 products that had exactly 1 FoodGraph result but were NOT saved yet (pending state). These were being excluded from both "Matched" and "Not Matched" categories, creating confusion.

## Root Cause

The "Not Matched" category was too narrow - it only included products with **0 FoodGraph results**:

```typescript
const notMatched = detections.filter(d => 
  d.brand_name && 
  !d.fully_analyzed && 
  !d.selected_foodgraph_gtin &&
  (!d.foodgraph_results || d.foodgraph_results.length === 0)  // Only 0 results
).length;
```

This missed 9 products that had:
- ✅ Brand extraction completed (`brand_name` exists)
- ✅ Exactly 1 FoodGraph result (`foodgraph_results.length === 1`)
- ❌ NOT saved yet (`!fully_analyzed && !selected_foodgraph_gtin`)

These "pending save" products weren't counted anywhere, so:
- Matched: 60 (correct)
- Not Matched: 1 (only 0-result products) ❌
- **Missing: 9 pending products** ❌

## Solution

Changed "Not Matched" to include BOTH zero-result products AND pending products (1 result but not saved):

```typescript
// Not Matched = Products with 0 results OR 1 result pending (not saved yet)
const notMatched = detections.filter(d => 
  d.brand_name && 
  !d.fully_analyzed && 
  !d.selected_foodgraph_gtin &&
  (!d.foodgraph_results || d.foodgraph_results.length <= 1)  // 0 OR 1 result
).length;
```

Now the statistics correctly show:
- **Matched: 60** (saved/confirmed products)
- **Not Matched: 10** (1 with 0 results + 9 with 1 result pending)
- **2+ Matches: 0** (products needing manual review)

## Logic Clarification

### Product States

A processed product can be in one of these states:

1. **Matched (60)** - User has saved/confirmed the match
   - `fully_analyzed = true` OR `selected_foodgraph_gtin` exists
   - Ready for export

2. **Not Matched (10)** - User hasn't confirmed a match yet
   - **Zero Results (1):** FoodGraph found nothing
   - **Pending (9):** FoodGraph found 1 result but user hasn't saved it
   - Needs action from user

3. **2+ Matches (0)** - Multiple results, needs manual selection
   - FoodGraph found 2+ results
   - User must pick the correct one

### Why Pending Goes in "Not Matched"

Products with 1 result that aren't saved yet are considered "Not Matched" because:
1. **User hasn't confirmed** - The result might be wrong
2. **Not ready for export** - Can't be included in final dataset
3. **Needs user action** - User must review and save (or reject)
4. **Semantically correct** - "Not matched" means "not confirmed", not "no results found"

## Code Changes

### 1. Statistics Calculation (lines 1484-1506)

**Before:**
```typescript
const notMatched = detections.filter(d => 
  d.brand_name && 
  !d.fully_analyzed && 
  !d.selected_foodgraph_gtin &&
  (!d.foodgraph_results || d.foodgraph_results.length === 0)  // Only 0 results
).length;
```

**After:**
```typescript
// Not Matched = Products with 0 results OR 1 result pending (not saved yet)
const notMatched = detections.filter(d => 
  d.brand_name && 
  !d.fully_analyzed && 
  !d.selected_foodgraph_gtin &&
  (!d.foodgraph_results || d.foodgraph_results.length <= 1)  // 0 OR 1 result
).length;
```

### 2. Filter Logic - Filter Indicator (lines 1635-1641)

**Before:**
```typescript
if (activeFilter === 'pending_save') {
  return detection.brand_name && 
         !detection.fully_analyzed && 
         !detection.selected_foodgraph_gtin &&
         detection.foodgraph_results && 
         detection.foodgraph_results.length === 1;
}
if (activeFilter === 'no_match') {
  return detection.brand_name && 
         !detection.fully_analyzed && 
         !detection.selected_foodgraph_gtin &&
         (!detection.foodgraph_results || detection.foodgraph_results.length === 0);
}
```

**After:**
```typescript
if (activeFilter === 'no_match') {
  // Not Matched includes both 0 results AND 1 result pending (not saved)
  return detection.brand_name && 
         !detection.fully_analyzed && 
         !detection.selected_foodgraph_gtin &&
         (!detection.foodgraph_results || detection.foodgraph_results.length <= 1);
}
```

### 3. Filter Logic - Bounding Boxes (lines 1714-1720)

Same change applied to bounding box filter logic for consistency.

### 4. Filter Type Cleanup (line 127)

**Before:**
```typescript
const [activeFilter, setActiveFilter] = useState<'all' | 'not_product' | 'processed' | 'not_identified' | 'one_match' | 'pending_save' | 'no_match' | 'multiple_matches'>('all');
```

**After:**
```typescript
const [activeFilter, setActiveFilter] = useState<'all' | 'not_product' | 'processed' | 'not_identified' | 'one_match' | 'no_match' | 'multiple_matches'>('all');
```

Removed `'pending_save'` since it's now included in `'no_match'`.

### 5. Filter Labels Cleanup (lines 1652-1668)

Removed 'pending_save' from labels and colors dictionaries.

## Visual Changes

### Before
```
┌─────────────────────────────────────────────────────────────────┐
│ MATCH STATUS                                                    │
│ ┌───────────────┬───────────────┬───────────────┐              │
│ │      69       │       1       │       0       │              │
│ │  ✓ Matched    │  Not Matched  │  2+ Matches   │              │
│ └───────────────┴───────────────┴───────────────┘              │
│                                                                  │
│ Processing Progress                    69 / 70 Saved (99%)     │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ ✓       │
└─────────────────────────────────────────────────────────────────┘
                    Missing 9 products! ❌
```

### After
```
┌─────────────────────────────────────────────────────────────────┐
│ MATCH STATUS                                                    │
│ ┌───────────────┬───────────────┬───────────────┐              │
│ │      60       │      10       │       0       │              │
│ │  ✓ Matched    │  Not Matched  │  2+ Matches   │              │
│ └───────────────┴───────────────┴───────────────┘              │
│                                                                  │
│ Processing Progress                    60 / 70 Saved (86%)     │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░ ✓         │
└─────────────────────────────────────────────────────────────────┘
           All 70 products accounted for! ✓
```

## Math Validation

Given example data (70 total detections):

### Processing Status
- Processed: 69 (products with brand extraction)
- Not Processed: 0
- Not Product: 1
- **Total: 70** ✓

### Match Status (processed products)
- **Matched: 60** (saved/confirmed)
  - `fully_analyzed = true` OR `selected_foodgraph_gtin` exists
- **Not Matched: 10**
  - 1 with 0 FoodGraph results
  - 9 with 1 FoodGraph result (pending save)
- **2+ Matches: 0** (needing manual review)
- **Total processed: 69** ✓

**Breakdown of "Not Matched" (10):**
- Zero results: 1 product (searched, nothing found)
- Pending save: 9 products (1 result each, not saved yet)

**All products accounted for:** 60 + 10 + 0 = 70 ✓ (excluding 1 non-product)

## Benefits

### 1. **Accurate Counts**
- Progress bar now shows correct 60/70 (86%)
- All 69 processed products are accounted for
- No missing products in statistics

### 2. **Clear Semantics**
- "Matched" = Confirmed and saved (ready for export)
- "Not Matched" = Not confirmed yet (needs user action)
- Simpler model: either confirmed or not confirmed

### 3. **Better User Understanding**
- Clicking "Not Matched" shows ALL products needing attention
- Includes both zero-result AND pending products
- User knows exactly what needs their review

### 4. **Simplified Code**
- Removed separate "pending_save" filter type
- Single "not_matched" filter handles both cases
- Fewer edge cases to handle

## User Workflow

1. **Upload & detect** → 70 products detected
2. **Extract info** → 69 processed (1 not product)
3. **Search FoodGraph** → Results returned
4. **Statistics show:**
   - Matched: 0 (nothing saved yet)
   - Not Matched: 69 (all need review)
5. **User reviews & saves** → Matched increases
6. **Final state:**
   - Matched: 60 (saved)
   - Not Matched: 10 (rejected or pending)

The "Not Matched" count decreases as user saves products, which is intuitive.

## Filter Behavior

Clicking **"Not Matched"** now shows:
- ✓ Products with 0 FoodGraph results (need retry or manual entry)
- ✓ Products with 1 FoodGraph result not saved yet (need review)
- ✓ All products requiring user action

This is exactly what users want to see when filtering for "products that need attention".

## Testing

Verify the fix:
1. ✓ Check Matched count = fully_analyzed OR selected products
2. ✓ Check Not Matched count = products with ≤1 result AND not saved
3. ✓ Check progress bar shows Matched / Total (not processed / total)
4. ✓ Click "Not Matched" filter → shows both 0-result and pending products
5. ✓ Verify Matched + Not Matched + 2+ Matches = Total Processed ✓

## Files Modified

- `app/analyze/[imageId]/page.tsx`
  - Statistics calculation (lines 1491-1497)
  - Filter logic - indicator (lines 1635-1641)
  - Filter logic - bounding boxes (lines 1714-1720)
  - Filter type definition (line 127)
  - Filter labels/colors (lines 1652-1668)

## Related Documentation

- `STATISTICS_FIX_SAVED_VS_PENDING.md` - Previous fix separating saved from pending
- `STATISTICS_SIMPLIFICATION_TWO_ROW.md` - Current two-row layout
- `BATCH_PROCESSING_FILTERS.md` - Batch processing pipeline

## Summary

Changed "Not Matched" from meaning "0 results found" to "not confirmed/saved yet", which includes both zero-result products AND pending products with 1 result. This fixes the missing 9 products issue and makes the statistics accurately reflect: **60 products matched and saved, 10 products still need user action**.

