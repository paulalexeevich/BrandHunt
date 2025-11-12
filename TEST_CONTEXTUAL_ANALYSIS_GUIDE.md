# Batch Contextual Analysis Test Guide

## Overview
This guide helps you test the batch contextual analysis feature for products #41 and #22 in image `26258a2f-3f77-477d-ab44-fa9a79a1cc87`.

## What Gets Processed?
Batch contextual analysis processes products that meet these criteria:
- `brand_name` is 'Unknown' or NULL, **OR**
- `brand_confidence` ≤ 90% (0.90)
- `is_product !== false` (not marked as non-product)

## Test Steps

### 1. Check Current State
Navigate to the analyze page for the image:
```
http://localhost:3000/analyze/26258a2f-3f77-477d-ab44-fa9a79a1cc87
```

Find products #41 and #22 and note their current:
- Brand name
- Brand confidence score
- Size
- Whether they have the purple "🔍 CONTEXTUAL" badge

### 2. Navigate to Project Page
Go to the project page that contains this image. The URL format is:
```
http://localhost:3000/projects/{projectId}
```

### 3. Run Batch Contextual Analysis
1. Scroll to the **Batch Processing** section
2. Click the **🔬 Contextual Analysis** button (orange/amber gradient)
3. Confirm the dialog prompt
4. Wait for processing to complete

### 4. Review Results
The progress indicator will show:
```
✅ Contextual Analysis Complete!

Processed: X
Corrected: Y
No improvement: Z
Skipped (no neighbors): N
Errors: E
```

**Key metrics:**
- **Processed**: Total products analyzed (those with ≤90% confidence or Unknown brand)
- **Corrected**: Products where contextual confidence was higher and values were overwritten
- **No improvement**: Products where contextual analysis didn't provide better confidence
- **Skipped**: Products without enough neighbors (need 1+ on left or right)
- **Errors**: Failed analyses

### 5. Verify Products #41 and #22
Return to the analyze page and check products #41 and #22:

**What to look for:**
1. **Brand name changed?** - If it was "Unknown" or low confidence, did it update?
2. **Confidence score improved?** - Compare before/after confidence scores
3. **Purple badge visible?** - Should show "🔍 CONTEXTUAL" badge next to brand name
4. **Correction notes?** - Hover over badge to see tooltip with correction details

### 6. Check Database (Optional)
If you have database access, verify the updates:
```sql
SELECT 
  detection_index,
  brand_name,
  brand_confidence,
  corrected_by_contextual,
  contextual_brand_name,
  contextual_brand_confidence,
  contextual_correction_notes
FROM branghunt_detections
WHERE image_id = '26258a2f-3f77-477d-ab44-fa9a79a1cc87'
  AND detection_index IN (41, 22);
```

**Expected results for corrected products:**
- `corrected_by_contextual` = `true`
- `brand_name` = updated value (if contextual confidence was higher)
- `brand_confidence` = updated confidence (if contextual confidence was higher)
- `contextual_correction_notes` contains before/after comparison

## Algorithm Details

### How It Works
1. **Fetch all detections** in the image for neighbor context
2. **Filter qualifying products** (≤90% confidence or Unknown brand)
3. **Find neighbors** for each product:
   - Up to 3 products on the left (same horizontal shelf)
   - Up to 3 products on the right
   - Y-position tolerance: ±30% of product height
   - Max horizontal distance: 500 pixels
4. **Create expanded crop** including target + neighbors
5. **Send to Gemini** with contextual prompt (V1):
   - Provides target product info
   - Lists neighbor brands/sizes
   - Asks to infer brand and size using visual patterns
6. **Compare confidence scores**:
   - If contextual_brand_confidence > original_brand_confidence → overwrite
   - If contextual_size_confidence > original_size_confidence → overwrite
7. **Save results** with correction markers

### Edge Cases
- **No neighbors**: Product skipped (can't infer from context)
- **Low contextual confidence**: Contextual data saved but original not overwritten
- **Parse errors**: Gemini response couldn't be parsed to JSON
- **Processing errors**: Network/API failures logged as errors

## Expected Outcomes for Products #41 and #22

### If products have Unknown/low confidence brand:
- ✅ Should be included in "Processed" count
- ✅ May appear in "Corrected" if neighbors provide good context
- ✅ Purple "🔍 CONTEXTUAL" badge should appear
- ✅ Brand name should update to inferred value

### If products already have high confidence (>90%):
- ❌ Won't be processed (skipped by filter)
- ❌ Won't show in results
- ❌ No changes to brand/size

## Troubleshooting

### Products not processed?
Check if they meet criteria:
- Is `brand_confidence` > 90%? (Won't process)
- Is `is_product` = `false`? (Skipped, not a product)
- Does product have neighbors on same shelf?

### "No improvement" result?
- Contextual analysis ran but confidence wasn't higher
- Original brand/size retained
- Contextual data still saved in `contextual_*` fields for audit

### Button disabled or greyed out?
- Another batch operation is running
- Wait for current operation to complete

### "No images in project" error?
- Project doesn't have any images uploaded
- Upload images first before running contextual analysis

## Performance Notes

- **Speed**: ~2-5 seconds per product (includes crop extraction + Gemini API call)
- **Parallel processing**: All qualifying products processed in parallel
- **API limits**: Respects Gemini 2000 RPM limit
- **Typical processing time**: 
  - 10 products: ~10-15 seconds
  - 20 products: ~15-25 seconds
  - 50 products: ~30-60 seconds

## Current Limitation

⚠️ **Single Image Processing**: The button currently processes only the **first image** in the project for testing purposes.

To process a specific image:
1. Ensure it's the first image in the project, OR
2. Use the manual contextual analysis feature on the analyze page for individual products

Future enhancement: Add image selector or "Process All Images" option.

## Documentation References

- Full feature doc: `BATCH_CONTEXTUAL_ANALYSIS.md`
- API implementation: `app/api/batch-contextual-analysis/route.ts`
- UI markers: `CONTEXTUAL_ANALYSIS_MARKERS.md`
- Memory entry: ID 11090725, 11088421

## Next Steps After Testing

1. **Verify accuracy**: Are the inferred brands correct?
2. **Check confidence scores**: Are contextual scores realistic?
3. **Test edge cases**: Products at image edges, isolated products, etc.
4. **Integration workflow**: Add to full pipeline (after Extract, before FoodGraph Search)
5. **Expand scope**: Process all images in project instead of just first one

