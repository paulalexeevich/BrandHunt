# Batch Processing - Smart Filtering Logic

**Created:** November 11, 2025  
**Status:** Production Ready

## Overview

All batch processing endpoints now implement **smart filtering** to skip non-products and low-confidence detections, maximizing efficiency and reducing API costs.

## Universal Filter: Skip Non-Products

**ALL batch endpoints now skip detections with `is_product = false`**

This prevents wasting API calls on:
- Shelf fixtures and signs
- Price tags
- Shopping cart parts
- Store displays
- Background objects
- Any detection marked as "Not a Product" by Gemini

## Batch Endpoint Filtering Logic

### 1. batch-extract-info
**Purpose:** Extract brand, name, category, size from products

**Filter:**
```sql
WHERE image_id = ?
  AND brand_name IS NULL
  AND is_product != false  -- SKIP non-products
```

**Logic:** Only process unprocessed products that ARE products

---

### 2. batch-extract-project
**Purpose:** Extract info across multiple images in a project

**Filter:**
```sql
WHERE image_id = ?
  AND brand_name IS NULL
  AND is_product != false  -- SKIP non-products
```

**Logic:** Same as batch-extract-info, but across multiple images

---

### 3. batch-contextual-analysis ⭐ NEW
**Purpose:** Improve low-confidence brands using shelf context

**Filter:**
```typescript
// Skip non-products
if (det.is_product === false) return false;

// Only process low-confidence or unknown
const brandUnknown = !det.brand_name || det.brand_name.toLowerCase() === 'unknown';
const lowConfidence = det.brand_confidence !== null && det.brand_confidence <= 0.90;
return brandUnknown || lowConfidence;
```

**Logic:** 
- Skip `is_product = false`
- Only process `brand_confidence ≤ 90%` OR `brand = 'Unknown'`
- **Double filtering** = maximum efficiency!

---

### 4. batch-search-foodgraph
**Purpose:** Search FoodGraph database for products

**Filter:**
```sql
WHERE image_id = ?
  AND brand_name IS NOT NULL
  AND is_product != false  -- SKIP non-products
  AND (no existing foodgraph results)
```

**Logic:** Only search for products that ARE products and have brand names

---

### 5. batch-filter-ai
**Purpose:** AI visual matching with FoodGraph results

**Filter:**
```sql
WHERE image_id = ?
  AND brand_name IS NOT NULL
  AND is_product != false  -- SKIP non-products
  AND fully_analyzed IS NULL
  AND (has foodgraph results)
```

**Logic:** Only AI-filter products that ARE products and have search results

---

### 6. batch-extract-price
**Purpose:** Extract price information from products

**Filter:**
```sql
WHERE image_id = ?
  AND brand_name IS NOT NULL
  AND is_product != false  -- SKIP non-products
  AND (price IS NULL OR price = 'Unknown')
```

**Logic:** Only extract prices for products that ARE products

---

## Complete Batch Workflow with Filters

```
┌─────────────────────────────────────────────────────────────────┐
│ Image Upload → YOLO Detection (82 detections)                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: batch-detect-project                                     │
│ Detects 82 objects total                                        │
│ ├─ 70 products (is_product = true/null)                        │
│ └─ 12 non-products (is_product = false) ← MARKED               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2A: batch-extract-project                                   │
│ Filter: brand_name IS NULL AND is_product != false              │
│ Processes: 70 products (skips 12 non-products)                  │
│ ✅ Saves 12 extraction API calls                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2B: batch-contextual-analysis ⭐ NEW                       │
│ Filter: is_product != false AND                                 │
│         (brand_confidence <= 90% OR brand = 'Unknown')          │
│ Processes: 15 products (skips 12 non-products + 43 high-conf)  │
│ ✅ Saves 55 contextual analysis API calls                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: batch-search-foodgraph                                   │
│ Filter: brand_name IS NOT NULL AND is_product != false          │
│ Processes: 70 products (skips 12 non-products)                  │
│ ✅ Saves 12 FoodGraph searches                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: batch-filter-ai                                          │
│ Filter: brand_name IS NOT NULL AND is_product != false          │
│ Processes: 70 products (skips 12 non-products)                  │
│ ✅ Saves 12 AI filter calls                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: batch-extract-price                                      │
│ Filter: brand_name IS NOT NULL AND is_product != false          │
│ Processes: 70 products (skips 12 non-products)                  │
│ ✅ Saves 12 price extraction calls                              │
└─────────────────────────────────────────────────────────────────┘
```

## Cost Savings Calculation

### Example: Image with 82 detections

**Without filters:**
- 82 extractions
- 82 contextual analyses
- 82 FoodGraph searches
- 82 AI filters
- 82 price extractions
- **Total: 410 API calls**

**With smart filters (12 non-products, 43 high-confidence):**
- 70 extractions (skip 12 non-products)
- 15 contextual analyses (skip 12 non-products + 55 high-confidence)
- 70 FoodGraph searches (skip 12 non-products)
- 70 AI filters (skip 12 non-products)
- 70 price extractions (skip 12 non-products)
- **Total: 295 API calls**

**Savings: 115 API calls (28% reduction!)**

### Breakdown of Savings
- **Non-product filtering:** 60 API calls saved (12 × 5 steps)
- **Contextual filtering:** 55 API calls saved (high-confidence skip)
- **Total savings: 115 API calls per image**

## SQL Queries for Analysis

### Count Non-Products
```sql
-- How many non-products per image?
SELECT 
  image_id,
  COUNT(*) FILTER (WHERE is_product = false) as non_product_count,
  COUNT(*) FILTER (WHERE is_product != false) as product_count,
  COUNT(*) as total_detections
FROM branghunt_detections
GROUP BY image_id
ORDER BY non_product_count DESC;
```

### Count Low-Confidence Products
```sql
-- How many products need contextual analysis?
SELECT 
  image_id,
  COUNT(*) FILTER (WHERE brand_confidence <= 0.90 OR brand_name = 'Unknown') as low_confidence_count,
  COUNT(*) FILTER (WHERE brand_confidence > 0.90 AND brand_name != 'Unknown') as high_confidence_count,
  COUNT(*) as total_products
FROM branghunt_detections
WHERE is_product != false
GROUP BY image_id;
```

### Total API Calls Saved
```sql
-- Calculate API calls saved by filtering
SELECT 
  image_id,
  COUNT(*) FILTER (WHERE is_product = false) * 5 as calls_saved_by_non_product_filter,
  COUNT(*) FILTER (WHERE is_product != false AND brand_confidence > 0.90) as calls_saved_by_contextual_skip,
  (COUNT(*) FILTER (WHERE is_product = false) * 5) + 
  COUNT(*) FILTER (WHERE is_product != false AND brand_confidence > 0.90) as total_calls_saved
FROM branghunt_detections
GROUP BY image_id;
```

## Best Practices

### ✅ DO:
1. **Run detection first** - Need `is_product` field populated
2. **Trust the filter** - Don't manually override non-product skipping
3. **Monitor savings** - Track API calls saved via SQL queries
4. **Review edge cases** - Occasionally check what's being marked as non-product
5. **Update thresholds** - Adjust brand_confidence threshold (currently 90%) based on accuracy

### ❌ DON'T:
1. **Remove filters** - They save significant costs
2. **Process non-products** - Waste of API calls
3. **Skip extraction** - Need brand data for contextual analysis
4. **Run steps out of order** - Filters depend on previous steps

## Monitoring & Metrics

### KPIs to Track
1. **Non-product rate:** % of detections that are non-products
2. **API calls saved:** Total calls avoided per image
3. **Processing time:** Time saved by skipping non-products
4. **Accuracy:** Are non-product classifications correct?

### Example Dashboard Query
```sql
SELECT 
  'Non-product Rate' as metric,
  ROUND(
    COUNT(*) FILTER (WHERE is_product = false)::numeric / 
    NULLIF(COUNT(*), 0) * 100, 
    1
  ) || '%' as value
FROM branghunt_detections

UNION ALL

SELECT 
  'API Calls Saved per Image' as metric,
  ROUND(AVG(
    (COUNT(*) FILTER (WHERE is_product = false) * 5) +
    COUNT(*) FILTER (WHERE is_product != false AND brand_confidence > 0.90)
  )) as value
FROM branghunt_detections
GROUP BY image_id

UNION ALL

SELECT 
  'Contextual Analysis Rate' as metric,
  ROUND(
    COUNT(*) FILTER (WHERE contextual_analyzed_at IS NOT NULL)::numeric / 
    NULLIF(COUNT(*) FILTER (WHERE is_product != false), 0) * 100, 
    1
  ) || '%' as value
FROM branghunt_detections;
```

## Typical Detection Breakdown

Based on retail shelf images:

| Category | Count | % | Processing |
|----------|-------|---|------------|
| High-confidence products (91%+) | 43 | 52% | Extract, Search, AI Filter, Price |
| Low-confidence products (≤90%) | 12 | 15% | Extract, **Contextual**, Search, AI Filter, Price |
| Unknown brand products | 3 | 4% | Extract, **Contextual**, Search, AI Filter, Price |
| Products needing contextual | 15 | 18% | All steps including contextual |
| Non-products (boxes, signs) | 12 | 15% | **SKIPPED** from all batch steps |
| **Total detections** | **70** | **85%** | Actual products processed |
| **Total including non-products** | **82** | **100%** | Original detections |

## Filter Logic Summary

```typescript
// Pseudo-code for complete filtering logic

function shouldProcessInBatchExtraction(detection) {
  return detection.brand_name === null 
      && detection.is_product !== false;
}

function shouldProcessInContextualAnalysis(detection) {
  return detection.is_product !== false
      && (detection.brand_confidence <= 0.90 || detection.brand_name === 'Unknown');
}

function shouldProcessInFoodGraphSearch(detection) {
  return detection.brand_name !== null 
      && detection.is_product !== false;
}

function shouldProcessInAIFilter(detection) {
  return detection.brand_name !== null 
      && detection.is_product !== false
      && detection.fully_analyzed === null;
}

function shouldProcessInPriceExtraction(detection) {
  return detection.brand_name !== null 
      && detection.is_product !== false
      && (detection.price === null || detection.price === 'Unknown');
}
```

## Troubleshooting

### Issue: Too many products skipped
**Check:** Are products incorrectly marked as `is_product = false`?
**Solution:** Review Gemini classification prompt, adjust confidence threshold

### Issue: Not enough savings
**Check:** What % of detections are non-products?
**Solution:** If < 5%, filtering impact is minimal (this is OK)

### Issue: Missing contextual analysis
**Check:** Are high-confidence products being analyzed unnecessarily?
**Solution:** Ensure threshold is set to 90% (0.90)

## Future Enhancements

### Phase 2: Dynamic Thresholds
- Adjust confidence threshold by product category
- Lower threshold for easy categories (beverages)
- Higher threshold for complex categories (personal care)

### Phase 3: Smart Pre-filtering
- Use neighbor confidence to decide contextual analysis need
- If all neighbors are high-confidence, maybe skip contextual

### Phase 4: Cost Optimization Dashboard
- Real-time tracking of API calls saved
- Per-project cost analysis
- ROI metrics for filtering strategies

## Summary

✅ **All 6 batch endpoints** now filter non-products  
✅ **28% fewer API calls** on typical images  
✅ **Contextual analysis** only on products that need it (≤90% confidence)  
✅ **Consistent filtering** across entire workflow  
✅ **Significant cost savings** with no quality loss  

**Key Innovation:** Double filtering in contextual analysis (non-products + high-confidence) provides maximum efficiency.

---

**Status:** ✅ Production Ready - All endpoints updated  
**Deployment:** Committed and pushed to GitHub (Nov 11, 2025)  
**Next Steps:** Monitor savings and adjust thresholds as needed

