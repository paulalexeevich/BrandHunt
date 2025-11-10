# Batch Workflow: Intermediate Results Storage

**Date:** November 10, 2025  
**Commit:** 6e15e30

## Overview

Modified the batch workflow to save ALL intermediate FoodGraph results to the database, making it behave like the manual workflow. This enables users to review complex cases with multiple matches while keeping the batch process as the primary workflow.

## Problem Statement

Previously, the batch workflow kept all FoodGraph results in memory and only saved the final best match. This had limitations:

1. **No transparency:** Users couldn't see what other options were found
2. **No manual override:** If AI auto-selected wrong product, no way to fix it
3. **Lost data:** Complex cases with multiple similar matches were discarded
4. **Different behavior:** Manual workflow saved all results, batch didn't

## Solution

Save all intermediate results to `branghunt_foodgraph_results` table with match status, allowing users to review and manually select when needed.

## Implementation

### 1. Save All Results After AI Filtering

```typescript
// After AI comparison completes
const comparisonResults = await Promise.all(comparisonPromises);

// Map results to database format
const foodgraphInserts = comparisonResults.map((comparison, index) => {
  const fgResult = comparison.result;
  return {
    detection_id: detection.id,
    search_term: searchTerm,
    result_rank: index + 1,
    product_gtin: fgResult.product_gtin || null,
    product_name: fgResult.product_name || null,
    brand_name: fgResult.brand_name || null,
    category: fgResult.category || null,
    measures: fgResult.measures || null,
    front_image_url: fgResult.front_image_url || null,
    full_data: fgResult,
    match_status: comparison.matchStatus,      // NEW!
    match_confidence: comparison.details?.confidence,  // NEW!
    visual_similarity: comparison.details?.visualSimilarity  // NEW!
  };
});

// Delete old results (for re-processing)
await supabase
  .from('branghunt_foodgraph_results')
  .delete()
  .eq('detection_id', detection.id);

// Insert all new results
await supabase
  .from('branghunt_foodgraph_results')
  .insert(foodgraphInserts);
```

### 2. Manual Review Flag for Complex Cases

```typescript
let needsManualReview = false;

if (identicalMatches.length > 0) {
  // Auto-save: Clear winner
  bestMatch = identicalMatches[0].result;
} else if (almostSameMatches.length === 1) {
  // Auto-save: Only one close match
  bestMatch = almostSameMatches[0].result;
  consolidationApplied = true;
} else if (almostSameMatches.length > 1) {
  // Manual review: Multiple similar matches
  needsManualReview = true;
  bestMatch = null;
}
```

### 3. Progress Reporting

```typescript
if (needsManualReview) {
  result.status = 'no_match';
  result.error = `Manual review needed: ${almostSameMatches.length} similar matches found`;
  
  sendProgress({
    stage: 'done',
    message: `⏸️ Manual review: ${almostSameMatches.length} matches`
  });
}
```

## Workflow Comparison

### Before: Memory-Only Batch

```
1. Search FoodGraph → ~100 results in memory
2. Pre-filter → ~15 results in memory
3. AI filter → Match statuses in memory
4. Consolidation → Pick best match
5. Save ONLY best match to branghunt_detections
   
❌ All intermediate data lost
❌ Can't review alternatives
❌ Can't manually fix mistakes
```

### After: Database-Backed Batch

```
1. Search FoodGraph → ~100 results in memory
2. Pre-filter → ~15 results in memory
3. AI filter → Match statuses in memory
4. SAVE ALL 15 results to branghunt_foodgraph_results ✅
5. Consolidation → Pick best match OR flag for review
6. If clear winner → Save to branghunt_detections
   If ambiguous → Leave for manual review
   
✅ All intermediate data preserved
✅ Can review alternatives
✅ Can manually select correct product
✅ Same as manual workflow
```

## Database Structure

### branghunt_foodgraph_results

Each product gets ~10-20 rows (after pre-filter):

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| detection_id | UUID | FK to branghunt_detections |
| search_term | TEXT | Search query used |
| result_rank | INTEGER | Result position (1-based) |
| product_gtin | TEXT | GTIN/barcode |
| product_name | TEXT | Product name |
| brand_name | TEXT | Brand name |
| category | TEXT | Product category |
| measures | TEXT | Size information |
| front_image_url | TEXT | Product image URL |
| full_data | JSONB | Complete FoodGraph response |
| **match_status** | TEXT | **identical/almost_same/not_match** |
| **match_confidence** | DECIMAL | **AI confidence (0.0-1.0)** |
| **visual_similarity** | DECIMAL | **Visual similarity (0.0-1.0)** |

### Indexes

- `detection_id` - Fast lookup of results for a product
- `match_status` - Filter by match quality
- `visual_similarity DESC` - Sort by similarity

## Decision Logic

### Auto-Save Cases

#### Case 1: Identical Match Found
```
Identical: 1+
Almost Same: Any
Result: Save first identical match
Reason: Clear high-confidence match
```

#### Case 2: Single Almost Same
```
Identical: 0
Almost Same: 1
Result: Save the almost_same match (consolidation)
Reason: Only one close match, likely correct
```

### Manual Review Cases

#### Case 3: Multiple Almost Same
```
Identical: 0
Almost Same: 2+
Result: No auto-save, flag for manual review
Reason: Ambiguous - could be any variant
Example: Same product, different sizes/flavors
```

#### Case 4: No Matches
```
Identical: 0
Almost Same: 0
Result: Mark as no_match
Reason: Product not in database or too different
```

## User Experience

### Automatic Cases (No Action Required)

**Identical Match:**
```
✅ Native Deodorant Coconut & Vanilla 2.65 oz
   Status: Saved automatically
   Reason: Perfect match found
```

**Consolidation:**
```
✅ Secret Clinical Complete Clean 3.8 oz
   Status: Saved automatically (consolidated)
   Reason: Only one close match
```

### Manual Review Cases (Action Required)

**Multiple Matches:**
```
⏸️ Tide Laundry Detergent
   Status: Manual review needed (3 similar matches)
   Action: Click to review options
   
   Options found:
   1. ≈ Tide Original 50 oz (88% similar)
   2. ≈ Tide Original 100 oz (87% similar)
   3. ≈ Tide Original 150 oz (85% similar)
```

**No Matches:**
```
❌ Generic Brand Cookies
   Status: No matches found
   Action: None (not in database)
```

## Statistics Impact

### Product Statistics Panel

Products requiring manual review show as:
- **2+ Matches:** Purple card showing count
- **Not fully_analyzed:** true (needs action)
- **Has foodgraph_results:** true (results saved)

```
Total: 89
Not Product: 5
Details Not Visible: 8
Not Identified: 0
✓ ONE Match: 45      ← Auto-saved
NO Match: 12         ← Not in database
2+ Matches: 19       ← Needs manual review ⏸️
```

## Benefits

### 1. Transparency
- Users see ALL options AI considered
- Understand why certain matches were chosen
- View match status and confidence scores
- Compare visual similarity across options

### 2. Flexibility
- Auto-save when clear winner exists
- Manual review when ambiguous
- Override AI decisions if needed
- Select different product from options

### 3. Data Quality
- Catch AI errors before they become final
- Review borderline cases (70-80% similar)
- Verify packaging variations
- Confirm size/flavor matches

### 4. Consistency
- Batch and manual workflows use same database structure
- Same match status definitions
- Same three-tier system
- Same consolidation logic

### 5. Scalability
- Process 100+ products in batch
- Flag only complex cases for review
- Most products auto-save (70-80%)
- Efficient use of user time

## Storage Considerations

### Storage Per Product

**Pre-filter reduces results:**
- FoodGraph returns: ~100 results
- Pre-filter (≥85%): ~10-20 results  
- Saved to DB: ~10-20 rows

**Storage calculation:**
- 100 products × 15 results avg = 1,500 rows
- Each row ≈ 2KB = ~3MB total
- Negligible compared to image storage

### Cleanup Strategy

Results can be deleted:
- When product is fully_analyzed and saved
- After X days if not reviewed
- When detection is deleted (CASCADE)

**Current approach:** Keep all results for review history

## Future Enhancements

### 1. Manual Review UI

Create dedicated page for reviewing pending matches:

```
/review-matches/[imageId]

Shows:
- All products with 2+ almost_same matches
- Side-by-side image comparison
- Match status and confidence scores
- "Select This Match" buttons
```

### 2. Bulk Review Actions

```
- "Accept All Consolidations" - Auto-save all single almost_same
- "Skip Products with No Matches" - Hide from review
- "Show Only High Confidence" - Filter by confidence ≥0.9
```

### 3. Match Quality Filters

```
Filter by match status:
- Show only IDENTICAL matches
- Show only ALMOST_SAME matches  
- Show only products needing review
```

### 4. Historical Review

```
- View all matches considered for a product
- See why certain products were rejected
- Audit trail of manual selections
- Change decisions retroactively
```

### 5. Smart Suggestions

```
When multiple matches exist:
- Highlight most likely match (highest similarity)
- Show size comparison (if detected)
- Flag common confusions (Original vs Fresh scent)
- Suggest "None of these" option
```

## Testing Scenarios

### Scenario 1: Perfect Match
**Input:** Native Deodorant Coconut & Vanilla 2.65 oz  
**FoodGraph:** Exact match found  
**Result:** Auto-saved (identical)  
**Database:** 12 results saved, 1 marked identical  
**User Action:** None needed

### Scenario 2: Single Close Match
**Input:** Secret Clinical Complete Clean (old packaging)  
**FoodGraph:** New packaging found  
**Result:** Auto-saved (consolidation)  
**Database:** 8 results saved, 1 marked almost_same  
**User Action:** None needed

### Scenario 3: Multiple Sizes
**Input:** Tide Detergent (size unclear/blurry)  
**FoodGraph:** 50oz, 100oz, 150oz all match  
**Result:** Manual review needed  
**Database:** 15 results saved, 3 marked almost_same  
**User Action:** Select correct size

### Scenario 4: Multiple Flavors
**Input:** Dove Deodorant (flavor unclear)  
**FoodGraph:** Original, Powder, Fresh all match  
**Result:** Manual review needed  
**Database:** 18 results saved, 3 marked almost_same  
**User Action:** Select correct flavor

### Scenario 5: Not in Database
**Input:** Local store brand product  
**FoodGraph:** No similar matches found  
**Result:** No match  
**Database:** 10 results saved, 0 marked identical/almost_same  
**User Action:** None (skip product)

## Performance Impact

### Before (Memory-Only)
```
Time per product: ~8-12 seconds
- Search: 3s
- Pre-filter: <1s
- AI Filter: 5-8s
- Save: <1s

Total for 100 products: ~15 minutes
```

### After (With DB Saves)
```
Time per product: ~9-13 seconds
- Search: 3s
- Pre-filter: <1s
- AI Filter: 5-8s
- DB Save: 1-2s ← Added
- Final Save: <1s

Total for 100 products: ~18 minutes
```

**Impact:** +20% time (3 minutes for 100 products)  
**Trade-off:** Worth it for transparency and manual review capability

### Optimization Opportunities

1. **Batch inserts:** Insert all 15 results in single query (already done)
2. **Async saves:** Don't wait for DB confirmation (risky)
3. **Selective saves:** Only save matches (lose transparency)
4. **Parallel processing:** Process multiple products simultaneously (already supported)

## Commit Details

**Files Changed:** 1  
**Lines Added:** +65  
**Lines Removed:** -2  
**Net Change:** +63 lines  
**Commit Hash:** 6e15e30

**File:** `app/api/batch-search-and-save/route.ts`

## Related Documentation

- `THREE_TIER_MATCHING.md` - Match status definitions
- `BATCH_PROCESSING_REFACTOR.md` - Original batch system
- `AI_FILTERING_REFINEMENT.md` - AI filter instructions
- `PREFILTER_SIMPLIFIED.md` - Pre-filter logic
- `PRODUCT_STATISTICS_PANEL.md` - Statistics display

## Conclusion

By saving intermediate results, the batch workflow becomes a powerful hybrid:
- **Fast:** Processes 100+ products automatically
- **Smart:** Auto-saves clear winners
- **Flexible:** Flags ambiguous cases for review
- **Transparent:** Users see all options considered
- **Reliable:** Same database structure as manual workflow

This makes batch processing the **primary workflow** while maintaining quality through selective manual review.

