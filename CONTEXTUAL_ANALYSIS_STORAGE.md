# Contextual Analysis - Database Storage & Testing Guide

**Created:** November 11, 2025  
**Status:** Experimental - Ready for Testing

## Quick Answer to "Where Should Results Be Saved?"

✅ **Results ARE NOW saved to the database** in the `branghunt_detections` table with dedicated contextual analysis fields.

## Database Schema

### New Fields Added to `branghunt_detections`

| Field | Type | Description |
|-------|------|-------------|
| `contextual_brand` | TEXT | Brand name inferred from neighbors |
| `contextual_brand_confidence` | DECIMAL(4,3) | Confidence score (0.000-1.000) |
| `contextual_brand_reasoning` | TEXT | Explanation of brand inference |
| `contextual_size` | TEXT | Size inferred from neighbors |
| `contextual_size_confidence` | DECIMAL(4,3) | Confidence score (0.000-1.000) |
| `contextual_size_reasoning` | TEXT | Explanation of size inference |
| `contextual_visual_similarity_left` | DECIMAL(4,3) | Similarity score to left neighbors |
| `contextual_visual_similarity_right` | DECIMAL(4,3) | Similarity score to right neighbors |
| `contextual_overall_confidence` | DECIMAL(4,3) | Overall analysis confidence |
| `contextual_notes` | TEXT | Additional observations |
| `contextual_prompt_version` | TEXT | Prompt version used (v1/v2/v3) |
| `contextual_analyzed_at` | TIMESTAMPTZ | Timestamp of analysis |
| `contextual_left_neighbor_count` | INTEGER | Number of left neighbors used |
| `contextual_right_neighbor_count` | INTEGER | Number of right neighbors used |

## How Saving Works

### 1. **User Control**
- **Checkbox in UI**: "Save results to database" (checked by default)
- Users can disable saving if just experimenting
- Allows testing different prompts without cluttering database

### 2. **API Parameter**
```json
{
  "detectionId": "uuid",
  "expandedCropBase64": "base64string",
  "promptVersion": "v1",
  "minNeighbors": 3,
  "saveResults": true  // ← Controls database saving
}
```

### 3. **Save Logic**
```typescript
// API only saves if:
if (saveResults && !analysis.parse_error) {
  // Update detection with contextual analysis results
  await supabase
    .from('branghunt_detections')
    .update({
      contextual_brand: analysis.inferred_brand,
      contextual_brand_confidence: analysis.brand_confidence,
      // ... all other fields
    })
    .eq('id', detectionId);
}
```

### 4. **Success Feedback**
- Green success banner when saved
- "Results saved to database" message
- Shows in console logs

## Testing the API & Verifying Results

### Test 1: Check API is Working

1. **Navigate** to analyze page with a product image
2. **Select a product** that has extracted brand/info  
3. **Expand** "Contextual Analysis (Experimental)" section
4. **Check the checkbox** "Save results to database"
5. **Click** "Analyze with Neighbors"

**Expected Console Output:**
```
Found 3 left neighbors, 2 right neighbors
Expanded box: { y0: ..., x0: ..., y1: ..., x1: ... }
Generated expanded crop
[Contextual Analysis] Sending request to Gemini...
[Contextual Analysis] Got response from Gemini, extracting text...
[Contextual Analysis] Gemini response length: 523 characters
[Contextual Analysis] Gemini response: { inferred_brand: "...", ... }
[Contextual Analysis] Saving results to database...
[Contextual Analysis] Results saved successfully
```

**Expected UI:**
- ✅ Green success banner: "Results saved to database"
- Expanded crop preview showing multiple products
- Neighbor list with brands/sizes
- AI analysis with inferred brand, size, confidence scores

### Test 2: Verify Database Storage

```sql
-- Check if results were saved
SELECT 
  detection_index,
  brand_name as "Original Brand",
  contextual_brand as "Contextual Brand",
  contextual_brand_confidence as "Brand Conf",
  contextual_size as "Contextual Size",
  contextual_size_confidence as "Size Conf",
  contextual_overall_confidence as "Overall Conf",
  contextual_prompt_version as "Prompt",
  contextual_left_neighbor_count as "Left",
  contextual_right_neighbor_count as "Right",
  contextual_analyzed_at as "Analyzed At"
FROM branghunt_detections
WHERE contextual_analyzed_at IS NOT NULL
ORDER BY contextual_analyzed_at DESC
LIMIT 10;
```

**Expected Result:**
- Rows with populated contextual fields
- Confidence scores between 0.000 and 1.000
- Prompt version (v1, v2, or v3)
- Neighbor counts (integers)
- Recent timestamp

### Test 3: Compare Different Prompts

Test the same product with all 3 prompt versions:

```sql
-- Compare prompt versions for a detection
SELECT 
  detection_index,
  contextual_prompt_version,
  contextual_brand,
  contextual_brand_confidence,
  contextual_overall_confidence,
  contextual_analyzed_at
FROM branghunt_detections
WHERE detection_index = 5  -- Example detection
  AND contextual_analyzed_at IS NOT NULL
ORDER BY contextual_analyzed_at;
```

**Test Process:**
1. Run analysis with V1 prompt → Save
2. Run analysis with V2 prompt → Save
3. Run analysis with V3 prompt → Save
4. Query database to compare results

**What to Compare:**
- Which prompt gives highest confidence?
- Which prompt's inference matches reality?
- Which prompt provides best reasoning?
- Consistency across prompts?

### Test 4: Accuracy Validation

```sql
-- Compare contextual inference with original extraction
SELECT 
  detection_index,
  brand_name as "Extracted Brand",
  contextual_brand as "Inferred Brand",
  CASE 
    WHEN brand_name = contextual_brand THEN '✓ MATCH'
    ELSE '✗ DIFFERENT'
  END as "Accuracy",
  contextual_brand_confidence as "Confidence",
  size as "Extracted Size",
  contextual_size as "Inferred Size"
FROM branghunt_detections
WHERE contextual_analyzed_at IS NOT NULL
ORDER BY contextual_analyzed_at DESC;
```

**Metrics to Track:**
- **Accuracy Rate**: % where contextual matches extracted
- **Confidence Calibration**: High confidence → correct inference?
- **Improvement Rate**: % where contextual is better than extracted
- **False Positives**: High confidence but wrong answer

## Use Cases for Saved Data

### 1. **Quality Assurance**
- Review low-confidence extractions
- Compare contextual vs direct extraction
- Identify products that need better images

### 2. **Prompt Optimization**
- A/B test different prompt versions
- Measure accuracy by prompt type
- Refine prompts based on failure patterns

### 3. **Batch Processing Decision**
- If accuracy > 90%, integrate into batch
- If accuracy < 70%, keep as manual tool
- Identify product categories where it works best

### 4. **Data Enrichment**
- Fill in missing brand names
- Validate uncertain extractions
- Add size information when unclear

### 5. **Analytics**
- Track neighbor patterns on shelves
- Identify brand grouping strategies
- Measure visual similarity across brands

## Querying Saved Results

### Example 1: High Confidence Inferences

```sql
SELECT 
  detection_index,
  contextual_brand,
  contextual_brand_confidence,
  contextual_brand_reasoning
FROM branghunt_detections
WHERE contextual_brand_confidence >= 0.80
  AND contextual_analyzed_at IS NOT NULL
ORDER BY contextual_brand_confidence DESC;
```

### Example 2: Mismatches (Potential Issues)

```sql
SELECT 
  detection_index,
  brand_name as "Original",
  contextual_brand as "Contextual",
  contextual_brand_confidence as "Confidence",
  contextual_brand_reasoning as "Why Different?"
FROM branghunt_detections
WHERE brand_name IS NOT NULL
  AND contextual_brand IS NOT NULL
  AND brand_name != contextual_brand
  AND contextual_analyzed_at IS NOT NULL;
```

### Example 3: Products with Many Neighbors

```sql
SELECT 
  detection_index,
  contextual_brand,
  contextual_left_neighbor_count + contextual_right_neighbor_count as "Total Neighbors",
  contextual_overall_confidence
FROM branghunt_detections
WHERE contextual_analyzed_at IS NOT NULL
ORDER BY (contextual_left_neighbor_count + contextual_right_neighbor_count) DESC
LIMIT 20;
```

## Best Practices

### ✅ DO:
- **Save production tests** - Check the box when results look good
- **Test all prompts** - Compare v1, v2, v3 on same product
- **Document findings** - Note which scenarios work best
- **Validate accuracy** - Compare inferred vs actual manually
- **Track patterns** - Which brands/categories work well?

### ❌ DON'T:
- **Save every experiment** - Uncheck box when just exploring
- **Trust blindly** - Always verify high-impact decisions
- **Ignore low confidence** - Review results < 0.70
- **Skip reasoning** - Read the AI's explanation
- **Forget context** - Remember this uses neighbors

## API Response Structure

```json
{
  "success": true,
  "saved": true,  // ← Indicates if results were saved
  "detection": {
    "id": "uuid",
    "detection_index": 5,
    "current_brand": "Original Brand",
    "current_size": "500ml"
  },
  "neighbors": {
    "left": [
      { "id": "uuid", "index": 3, "brand": "Brand X", "size": "500ml" },
      { "id": "uuid", "index": 4, "brand": "Brand X", "size": "500ml" }
    ],
    "right": [
      { "id": "uuid", "index": 6, "brand": "Brand X", "size": "500ml" }
    ]
  },
  "expanded_box": {
    "y0": 100, "x0": 200, "y1": 300, "x1": 800
  },
  "expanded_crop_preview": "data:image/jpeg;base64,...",
  "analysis": {
    "inferred_brand": "Brand X",
    "brand_confidence": 0.92,
    "brand_reasoning": "Both left and right neighbors are Brand X...",
    "inferred_size": "500ml",
    "size_confidence": 0.88,
    "size_reasoning": "Visual dimensions match neighbors...",
    "visual_similarity": {
      "left_similarity": 0.95,
      "right_similarity": 0.90,
      "description": "Very similar packaging style..."
    },
    "overall_confidence": 0.91,
    "notes": "High confidence due to consistent neighbors"
  },
  "prompt_version": "v1"
}
```

## Troubleshooting

### Issue: No Results Saved
**Check:**
1. Is checkbox enabled?
2. Did API return success?
3. Check console for "Results saved successfully"
4. Verify no parse_error in response

### Issue: Wrong Results Saved
**Action:**
1. Try different prompt version
2. Check if enough neighbors exist
3. Review neighbor brands/sizes
4. Read AI reasoning for explanation

### Issue: Low Confidence
**Possible Causes:**
- Mixed brands on shelf
- Poor neighbor data quality
- Product at edge (few neighbors)
- Unclear image quality

## Future Enhancements

### Phase 2: UI Display
- Show saved contextual results on product cards
- Compare contextual vs extracted side-by-side
- Highlight high-confidence contextual data

### Phase 3: Batch Integration
- Auto-run on low-confidence extractions
- Use as verification step
- Apply to products with < 70% brand confidence

### Phase 4: Machine Learning
- Train model on accurate contextual analyses
- Learn which shelf patterns are reliable
- Predict when contextual analysis will help

## Summary

✅ **Database storage is implemented and working**  
✅ **Results saved with optional user control**  
✅ **14 fields track comprehensive analysis data**  
✅ **Ready for testing and accuracy validation**  
✅ **Migration applied successfully**  

**Next Step:** Test the feature with real products and measure accuracy!

---

**Database Table:** `branghunt_detections`  
**Migration File:** `migrations/add_contextual_analysis_fields.sql`  
**API Endpoint:** `/api/contextual-analysis`  
**UI Location:** Analyze page → Product details → "Contextual Analysis (Experimental)"

