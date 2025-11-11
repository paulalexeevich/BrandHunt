# Contextual Analysis - Auto-Update Feature

**Date:** November 11, 2025  
**Issue:** Contextual analysis found correct brand but didn't update product display  
**Status:** ✅ FIXED

## The Problem

User reported:
> "I see product is unknown. While V1 context analysis give 90% confidence and answer Brand: Athena - which is correct!"

### What Was Happening
- Contextual analysis correctly identified brand as "Athena" with 90% confidence
- Results were saved to `contextual_*` fields in database
- But the main `brand_name` field remained "Unknown"
- Product display at top of page still showed "Brand: Unknown"

### Root Cause
The manual contextual analysis endpoint was only saving results to the separate `contextual_*` fields for audit purposes, but was **not overwriting** the main `brand_name` and `size` fields like the batch version did.

## The Solution

### 1. Confidence Comparison Logic
Now both manual and batch contextual analysis compare confidence scores:

```typescript
// Get contextual analysis results
const contextualBrand = analysis.inferred_brand || analysis.brand;
const contextualBrandConf = analysis.brand_confidence || 0;

// Get current values
const currentBrand = detection.brand_name;
const currentBrandConf = detection.brand_confidence || 0;

// OVERWRITE if contextual has higher confidence
if (contextualBrandConf > currentBrandConf) {
  updateData.brand_name = contextualBrand;
  updateData.brand_confidence = contextualBrandConf;
  correctionNotes.push(`Brand updated from "${currentBrand}" to "${contextualBrand}"`);
}
```

### 2. Correction Marker
When a field is overwritten, the system sets:
- `corrected_by_contextual = TRUE` (boolean flag)
- `contextual_correction_notes` (text with before/after details)

Example correction note:
```
Brand updated from "Unknown" (0%) to "Athena" (90%)
```

### 3. Frontend Auto-Refresh
After contextual analysis completes with `saveResults = true`, the frontend automatically refreshes:

```typescript
if (contextSaveResults && data.saved) {
  console.log('✅ Refreshing detection data after contextual correction...');
  await fetchImage(); // Reload all detections to show updated values
}
```

This ensures the updated brand/size appear immediately in the UI.

## User Workflow

### Before Fix
1. User sees "Product: Unknown, Brand: Unknown"
2. User clicks "Analyze with Neighbors"
3. Contextual analysis shows "Inferred Brand: Athena, Confidence: 90%"
4. User checks "Save results" and clicks analyze again
5. ❌ Product still shows "Brand: Unknown" (data saved but not visible)
6. User confusion: "Why isn't it updated?"

### After Fix
1. User sees "Product: Unknown, Brand: Unknown"
2. User checks "Save results to database" checkbox
3. User clicks "🔬 Analyze with Neighbors"
4. Contextual analysis shows "Inferred Brand: Athena, Confidence: 90%"
5. ✅ Page auto-refreshes
6. ✅ Product now shows "Brand: Athena" with 90% confidence badge
7. ✅ Green success banner: "Results saved to database"

## Database Changes

### Fields Updated by Contextual Analysis

**Always saved (audit trail):**
- `contextual_brand` - Brand found by contextual analysis
- `contextual_brand_confidence` - Confidence score (0.0-1.0)
- `contextual_brand_reasoning` - Why this brand was inferred
- `contextual_size` - Size found by contextual analysis
- `contextual_size_confidence` - Confidence score
- `contextual_size_reasoning` - Why this size was inferred
- `contextual_analyzed_at` - Timestamp
- `contextual_prompt_version` - Which prompt was used (v1/v2/v3)
- `contextual_left_neighbor_count` - Number of left neighbors
- `contextual_right_neighbor_count` - Number of right neighbors

**Conditionally overwritten (when contextual confidence > current):**
- `brand_name` - Main brand field
- `brand_confidence` - Main confidence score
- `size` - Main size field
- `size_confidence` - Main size confidence

**Correction markers (when overwrite occurs):**
- `corrected_by_contextual` - Boolean flag (TRUE if corrected)
- `contextual_correction_notes` - Details of what changed

## Example Scenarios

### Scenario 1: Unknown Brand → Identified Brand
**Before:**
- `brand_name = 'Unknown'`
- `brand_confidence = 0.0`

**Contextual Analysis:**
- Finds "Athena" with 90% confidence

**After:**
- ✅ `brand_name = 'Athena'` (OVERWRITTEN)
- ✅ `brand_confidence = 0.90` (OVERWRITTEN)
- ✅ `contextual_brand = 'Athena'` (audit trail)
- ✅ `corrected_by_contextual = true`
- ✅ `contextual_correction_notes = 'Brand updated from "Unknown" (0%) to "Athena" (90%)'`

### Scenario 2: Low Confidence → High Confidence
**Before:**
- `brand_name = 'Dove'`
- `brand_confidence = 0.40` (40% - low)

**Contextual Analysis:**
- Confirms "Dove" with 95% confidence using neighbors

**After:**
- ✅ `brand_name = 'Dove'` (same, but confidence updated)
- ✅ `brand_confidence = 0.95` (IMPROVED)
- ✅ `contextual_brand = 'Dove'`
- ✅ `corrected_by_contextual = true`
- ✅ `contextual_correction_notes = 'Brand updated from "Dove" (40%) to "Dove" (95%)'`

### Scenario 3: High Confidence → No Change
**Before:**
- `brand_name = 'Secret'`
- `brand_confidence = 0.95` (95% - high)

**Contextual Analysis:**
- Finds "Secret" with 80% confidence

**After:**
- ❌ `brand_name = 'Secret'` (NO CHANGE - current is better)
- ❌ `brand_confidence = 0.95` (NO CHANGE)
- ✅ `contextual_brand = 'Secret'` (still saved for audit)
- ❌ `corrected_by_contextual = false` (no correction made)

## SQL Queries

### Find All Corrections
```sql
SELECT 
  id,
  detection_index,
  brand_name,
  brand_confidence,
  contextual_brand,
  contextual_brand_confidence,
  contextual_correction_notes
FROM branghunt_detections
WHERE corrected_by_contextual = true
ORDER BY contextual_analyzed_at DESC;
```

### Measure Improvement
```sql
-- How much did confidence improve?
SELECT 
  detection_index,
  brand_name,
  ROUND(brand_confidence * 100) as final_confidence,
  contextual_brand,
  ROUND(contextual_brand_confidence * 100) as contextual_confidence,
  contextual_correction_notes
FROM branghunt_detections
WHERE corrected_by_contextual = true
  AND contextual_brand_confidence > brand_confidence
ORDER BY (contextual_brand_confidence - brand_confidence) DESC;
```

### Count Corrections by Image
```sql
SELECT 
  image_id,
  COUNT(*) as total_detections,
  COUNT(*) FILTER (WHERE corrected_by_contextual = true) as corrected_count,
  ROUND(
    COUNT(*) FILTER (WHERE corrected_by_contextual = true)::numeric / 
    NULLIF(COUNT(*), 0) * 100, 
    1
  ) as correction_rate
FROM branghunt_detections
GROUP BY image_id
HAVING COUNT(*) FILTER (WHERE corrected_by_contextual = true) > 0
ORDER BY correction_rate DESC;
```

## Manual vs Batch Behavior

### Manual Contextual Analysis (Analyze Page)
**Workflow:**
1. User selects a specific product
2. User checks "Save results to database"
3. User clicks "🔬 Analyze with Neighbors"
4. Frontend generates expanded crop with neighbors
5. API analyzes with Gemini
6. If confidence higher → overwrites brand/size
7. If saved → frontend auto-refreshes
8. ✅ Updated brand/size appear immediately

**Use Case:** Test contextual analysis on specific problem products, see results instantly

### Batch Contextual Analysis
**Workflow:**
1. System identifies all products with ≤90% brand confidence
2. Processes each in parallel (server-side cropping with sharp)
3. Calls Gemini for each qualifying product
4. Compares confidence scores
5. Overwrites brand/size for improvements
6. Returns summary of corrections

**Use Case:** Automatically improve all low-confidence products in batch

## Confidence Threshold Strategy

### When Does Overwrite Happen?
```typescript
if (contextual_confidence > current_confidence) {
  // OVERWRITE
}
```

**Simple rule:** Contextual analysis must be **strictly better** to overwrite.

### Why Not "Higher or Equal"?
If we used `>=`, products with equal confidence would flip-flop between values on repeated analyses. Strict `>` ensures stability.

### Edge Cases

**Case 1: Both 0% confidence**
- Current: 0%, Contextual: 0%
- Result: ❌ No overwrite (not strictly better)

**Case 2: Same confidence**
- Current: 85%, Contextual: 85%
- Result: ❌ No overwrite (same confidence)

**Case 3: Slightly better**
- Current: 84%, Contextual: 85%
- Result: ✅ Overwrite (1% improvement)

## Frontend UX

### Success Message
When results are saved with corrections:

```
✅ Results saved to database
Contextual analysis results have been stored and can be accessed later.
```

Plus console logs:
```
✅ Refreshing detection data after contextual correction...
[Contextual] Corrections applied: Brand updated from "Unknown" (0%) to "Athena" (90%)
✅ Brand/size corrected by contextual analysis!
```

### Visual Updates
After refresh, user sees:
- Updated brand name in product header
- New confidence badge (color-coded by confidence level)
- All related FoodGraph searches now use correct brand
- Statistics panel reflects new brand

### Confidence Badge Colors
- 90-100%: 🟢 Green (High confidence)
- 70-89%: 🟡 Yellow (Medium confidence)
- 50-69%: 🟠 Orange (Low confidence)
- 0-49%: 🔴 Red (Very low confidence)

## Testing

### Test Case 1: Unknown → Known
1. Find product with `brand_name = 'Unknown'`
2. Run contextual analysis with "Save results" checked
3. Verify brand updates to neighbor brand
4. Verify `corrected_by_contextual = true`

### Test Case 2: Low → High Confidence
1. Find product with low brand confidence (<50%)
2. Run contextual analysis
3. Verify confidence improves
4. Verify correction notes explain improvement

### Test Case 3: High Confidence (No Change)
1. Find product with high confidence (>90%)
2. Run contextual analysis
3. Verify brand_name unchanged
4. Verify contextual_* fields still saved
5. Verify `corrected_by_contextual = false`

### Test Case 4: Size Correction
1. Find product with `size = 'Unknown'`
2. Run contextual analysis (neighbors have visible sizes)
3. Verify size updates
4. Verify both brand and size can be corrected together

## Integration Points

### APIs Updated
1. ✅ `/api/contextual-analysis` (manual)
   - Added confidence comparison
   - Added field overwriting
   - Added correction markers

2. ✅ `/api/batch-contextual-analysis` (batch)
   - Already had this logic
   - Consistent behavior with manual

### Frontend Updated
1. ✅ `app/analyze/[imageId]/page.tsx`
   - Added auto-refresh after save
   - Shows updated values immediately
   - No manual page reload needed

## Benefits

### 1. Immediate Feedback
Users see corrections instantly, no confusion about whether analysis worked

### 2. Audit Trail
All contextual analysis results saved in `contextual_*` fields, even if not used

### 3. Smart Overwriting
Only overwrites when actually better, prevents degrading good data

### 4. Transparency
Correction notes show exactly what changed and why

### 5. Consistency
Same logic in both manual and batch processing

## Future Enhancements

### Phase 2: Correction Review UI
- Show list of all corrections made
- Allow users to undo/revert corrections
- Visual diff showing before/after

### Phase 3: Confidence Threshold Tuning
- Allow users to set minimum confidence for overwrite
- Default: any improvement
- Advanced: require X% improvement (e.g., must be 10% better)

### Phase 4: Batch Correction Summary
- Dashboard showing correction statistics
- Which products were improved most
- Success rate by product category

## Summary

✅ **Problem:** Contextual analysis worked but didn't update visible product data  
✅ **Solution:** Compare confidence scores and overwrite when better  
✅ **UX:** Auto-refresh shows updates immediately  
✅ **Audit:** All data preserved in contextual_* fields  
✅ **Markers:** corrected_by_contextual flag tracks corrections  
✅ **Consistency:** Same behavior in manual and batch modes  

**Key Learning:** When implementing analysis features that improve existing data, always compare confidence scores and overwrite main fields when better. Don't just save to separate audit fields - users expect to see improvements reflected immediately!

---

**Commit:** `30502c2` - "Manual contextual analysis now overwrites brand/size when confidence is higher"  
**Date:** November 11, 2025  
**Status:** ✅ Production Ready

