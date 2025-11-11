# Batch Contextual Analysis - Smart Brand Correction

**Created:** November 11, 2025  
**Status:** Production Ready

## Overview

Automatically improves low-confidence brand extractions using shelf context. Only processes products that need help (brand confidence ≤90% or Unknown), saving API costs and time.

## Key Features

✅ **Smart Filtering** - Only processes products that need improvement  
✅ **Confidence-Based Overwriting** - Only updates if contextual analysis is more confident  
✅ **Correction Tracking** - Marks all corrected products with clear notes  
✅ **Parallel Processing** - Fast batch execution  
✅ **V1 Prompt** - Uses most detailed prompt for best accuracy  
✅ **Server-Side** - No frontend needed, runs entirely on backend  

## When It Runs

### ✅ WILL Process:
- Products with `brand_confidence <= 0.90` (90% or less)
- Products with `brand_name = 'Unknown'` or NULL
- Products with low `size_confidence` (bonus improvement)

### ❌ WON'T Process:
- Products with `brand_confidence >= 0.91` (91% or higher) - already good!
- Products with no neighbors (can't do contextual analysis)

## Algorithm

### Step 1: Filter Candidates
```sql
SELECT * FROM branghunt_detections
WHERE image_id = ?
  AND (
    brand_name IS NULL 
    OR brand_name = 'Unknown'
    OR brand_confidence <= 0.90
  )
```

### Step 2: For Each Candidate
1. Find 3+ neighbors on left and right (same shelf, Y-coordinate aligned)
2. Generate expanded crop including neighbors
3. Send to Gemini with V1 contextual prompt
4. Parse confidence scores

### Step 3: Smart Overwriting
```typescript
if (contextual_brand_confidence > original_brand_confidence) {
  // OVERWRITE brand fields
  brand_name = contextual_brand
  brand_confidence = contextual_brand_confidence
  corrected_by_contextual = true
  contextual_correction_notes = "Brand: Unknown (0%) → Coca-Cola (92%)"
}

if (contextual_size_confidence > original_size_confidence) {
  // OVERWRITE size fields
  size = contextual_size
  size_confidence = contextual_size_confidence
}
```

### Step 4: Save All Data
- Overwrites `brand_name`, `brand_confidence`, `size`, `size_confidence` if better
- Stores contextual data in `contextual_*` fields for audit trail
- Sets `corrected_by_contextual = true` for corrected products
- Logs correction details in `contextual_correction_notes`

## API Endpoint

**POST** `/api/batch-contextual-analysis`

### Request
```json
{
  "imageId": "uuid-of-image"
}
```

### Response
```json
{
  "message": "Processed 15 detections, corrected 8",
  "processed": 15,
  "corrected": 8,
  "noImprovement": 5,
  "skipped": 2,
  "errors": 0,
  "results": [
    {
      "detectionId": "uuid",
      "detectionIndex": 5,
      "status": "success",
      "originalBrand": "Unknown",
      "originalBrandConfidence": 0.0,
      "contextualBrand": "Coca-Cola",
      "contextualBrandConfidence": 0.92,
      "corrected": true,
      "correctionNotes": "Brand: Unknown (0%) → Coca-Cola (92%); Size: Unknown (0%) → 500ml (88%)"
    }
  ]
}
```

## Integration into Batch Processing Workflow

### Current Workflow
```
1. batch-detect-project     → Detect products with YOLO
2. batch-extract-project    → Extract brand, name, category, etc.
3. batch-search-foodgraph   → Search FoodGraph database
4. batch-filter-ai          → AI filter results
5. batch-save-results       → Save final matches
```

### **NEW** Workflow (with Contextual Analysis)
```
1. batch-detect-project       → Detect products with YOLO
2. batch-extract-project      → Extract brand, name, category, etc.
3. batch-contextual-analysis  → 🆕 IMPROVE low-confidence brands
4. batch-search-foodgraph     → Search FoodGraph database (with better brands!)
5. batch-filter-ai            → AI filter results
6. batch-save-results         → Save final matches
```

## Example Frontend Integration

```typescript
// In your batch processing component
const processStep2 = async () => {
  setProcessingStep2(true);
  
  // Step 2A: Extract Info
  const extractResponse = await fetch('/api/batch-extract-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, concurrency: 15 })
  });
  
  const extractData = await extractResponse.json();
  console.log(`✅ Extracted info for ${extractData.processed} products`);
  
  // Step 2B: Contextual Correction (NEW!)
  for (const imageId of processedImageIds) {
    const contextResponse = await fetch('/api/batch-contextual-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId })
    });
    
    const contextData = await contextResponse.json();
    console.log(`🔬 Corrected ${contextData.corrected} products using context`);
  }
  
  setProcessingStep2(false);
};
```

## Database Fields

### Original Extraction Fields (May Be Overwritten)
- `brand_name` - Overwritten if contextual confidence is higher
- `brand_confidence` - Overwritten if contextual confidence is higher
- `size` - Overwritten if contextual confidence is higher
- `size_confidence` - Overwritten if contextual confidence is higher

### Contextual Analysis Fields (Always Stored)
- `contextual_brand` - Inferred brand from neighbors
- `contextual_brand_confidence` - Confidence score (0.0-1.0)
- `contextual_brand_reasoning` - Why this brand was inferred
- `contextual_size` - Inferred size from neighbors
- `contextual_size_confidence` - Confidence score
- `contextual_size_reasoning` - Why this size was inferred
- `contextual_visual_similarity_left` - Similarity to left neighbors
- `contextual_visual_similarity_right` - Similarity to right neighbors
- `contextual_overall_confidence` - Overall confidence
- `contextual_notes` - Additional observations
- `contextual_prompt_version` - Always "v1"
- `contextual_analyzed_at` - Timestamp
- `contextual_left_neighbor_count` - Number of left neighbors used
- `contextual_right_neighbor_count` - Number of right neighbors used

### Correction Tracking Fields (NEW!)
- `corrected_by_contextual` - **Boolean:** TRUE if brand/size was overwritten
- `contextual_correction_notes` - **Text:** What changed (e.g., "Brand: Unknown (0%) → Coca-Cola (92%)")

## Querying Corrected Products

### Find All Corrected Products
```sql
SELECT 
  detection_index,
  brand_name,
  brand_confidence,
  contextual_brand,
  contextual_brand_confidence,
  corrected_by_contextual,
  contextual_correction_notes
FROM branghunt_detections
WHERE corrected_by_contextual = true
ORDER BY contextual_analyzed_at DESC;
```

### Correction Success Rate
```sql
-- How many products were improved?
SELECT 
  COUNT(*) FILTER (WHERE corrected_by_contextual = true) as corrected_count,
  COUNT(*) FILTER (WHERE contextual_analyzed_at IS NOT NULL) as analyzed_count,
  ROUND(
    COUNT(*) FILTER (WHERE corrected_by_contextual = true)::numeric / 
    NULLIF(COUNT(*) FILTER (WHERE contextual_analyzed_at IS NOT NULL), 0) * 100, 
    1
  ) as correction_rate_percent
FROM branghunt_detections;
```

### Before/After Comparison
```sql
-- See what changed
SELECT 
  detection_index,
  'Brand' as field_type,
  brand_name as current_value,
  contextual_brand as contextual_value,
  brand_confidence as current_confidence,
  contextual_brand_confidence as contextual_confidence
FROM branghunt_detections
WHERE corrected_by_contextual = true
  AND contextual_brand != brand_name

UNION ALL

SELECT 
  detection_index,
  'Size' as field_type,
  size as current_value,
  contextual_size as contextual_value,
  size_confidence as current_confidence,
  contextual_size_confidence as contextual_confidence
FROM branghunt_detections
WHERE corrected_by_contextual = true
  AND contextual_size != size
ORDER BY detection_index;
```

## Performance

### API Calls Saved
- **Before:** Contextual analysis on ALL products = 82 API calls (example)
- **After:** Contextual analysis on LOW-CONFIDENCE only = ~15-20 API calls (example)
- **Savings:** ~70-75% fewer API calls!

### Typical Numbers
For an image with 82 products:
- High confidence brands (91%+): ~65 products → **SKIPPED** ✅
- Low confidence brands (≤90%): ~12 products → Analyzed
- Unknown brands: ~5 products → Analyzed
- **Total analyzed:** ~17 products (80% savings!)

### Processing Time
- Per product: ~2-3 seconds (Gemini API call)
- 17 products in parallel: ~3-5 seconds total
- Much faster than analyzing all 82 products!

## Cost Analysis

### Gemini API Costs (Estimated)
- Contextual analysis uses larger images (expanded crops)
- ~300-500 tokens per analysis
- With filtering: Process only 20-25% of products
- **Monthly savings:** Significant reduction in API costs

## Success Metrics

### Track These KPIs
1. **Correction Rate:** % of analyzed products that were corrected
2. **Confidence Improvement:** Average confidence increase
3. **Accuracy:** % of corrections that are actually correct (manual review)
4. **FoodGraph Match Rate:** Does better brand → better FoodGraph matches?

### Example Query
```sql
-- Average confidence improvement
SELECT 
  AVG(brand_confidence - contextual_brand_confidence) as avg_improvement,
  COUNT(*) as corrected_products
FROM branghunt_detections
WHERE corrected_by_contextual = true;
```

## Troubleshooting

### Issue: No Products Processed
**Check:**
1. Are there products with low confidence? Query: `SELECT COUNT(*) FROM branghunt_detections WHERE brand_confidence <= 0.90`
2. Has extraction been run first?
3. Check logs for "No products need contextual analysis"

### Issue: Many "Skipped" Results
**Reason:** Products have no neighbors (isolated, edge of shelf)
**Solution:** This is expected and OK - can't do contextual analysis without context

### Issue: "No Improvement" Results
**Reason:** Contextual analysis ran but confidence wasn't better than original
**Solution:** This is also OK - we don't overwrite when contextual isn't more confident

## Best Practices

### ✅ DO:
- Run AFTER batch extraction completes
- Run BEFORE FoodGraph search (so search uses better brands)
- Review `contextual_correction_notes` to verify corrections
- Track correction accuracy over time
- Adjust confidence threshold (90%) based on your data

### ❌ DON'T:
- Run before extraction (need original data first)
- Run multiple times on same image (idempotent but wasteful)
- Blindly trust all corrections (review sample)
- Skip manual validation initially

## Example Results

### Example 1: Unknown → Brand
```
Original: brand_name = "Unknown", brand_confidence = 0.0
Neighbors: Left: Coca-Cola, Coca-Cola | Right: Coca-Cola
Contextual: brand = "Coca-Cola", confidence = 0.92
Result: ✅ CORRECTED
Notes: "Brand: Unknown (0%) → Coca-Cola (92%)"
```

### Example 2: Low Confidence → High Confidence
```
Original: brand_name = "Ocean Spray", brand_confidence = 0.65
Neighbors: Left: Ocean Spray (95%), Ocean Spray (92%) | Right: Ocean Spray (89%)
Contextual: brand = "Ocean Spray", confidence = 0.91
Result: ✅ CORRECTED (confidence boost)
Notes: "Brand: Ocean Spray (65%) → Ocean Spray (91%)"
```

### Example 3: No Improvement
```
Original: brand_name = "Tropicana", brand_confidence = 0.88
Neighbors: Left: Ocean Spray | Right: Gatorade
Contextual: brand = "Tropicana", confidence = 0.75
Result: ℹ️ NO IMPROVEMENT (contextual confidence lower)
```

## Migration Applied

The database migration has been applied successfully:

```sql
ALTER TABLE branghunt_detections
  ADD COLUMN corrected_by_contextual BOOLEAN DEFAULT FALSE,
  ADD COLUMN contextual_correction_notes TEXT;
```

## Future Enhancements

### Phase 2: Adaptive Threshold
- Adjust confidence threshold dynamically based on product category
- Lower threshold for beverage products (easier to identify)
- Higher threshold for generic products

### Phase 3: Multi-Pass Analysis
- Run contextual analysis after first pass
- Use corrected products as better neighbor context
- Run second pass on remaining low-confidence products

### Phase 4: Learning System
- Track which corrections were accurate
- Adjust prompt based on success patterns
- Build confidence calibration model

## Summary

✅ **Smart filtering** saves 70-75% of API calls  
✅ **Confidence-based overwriting** ensures we only improve, never degrade  
✅ **Correction tracking** provides full audit trail  
✅ **V1 prompt** uses most detailed context for accuracy  
✅ **Parallel processing** keeps it fast  
✅ **Production ready** with comprehensive error handling  

**Integration Point:** Add between extraction (Step 2) and FoodGraph search (Step 3) in your batch processing workflow.

---

**API Endpoint:** `/api/batch-contextual-analysis`  
**Migration File:** `migrations/add_contextual_correction_marker.sql`  
**Status:** ✅ Migration Applied, Ready to Use

