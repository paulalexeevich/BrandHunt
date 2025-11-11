# Detection Confidence Threshold

## Overview
Both YOLO detection methods (single image and batch) use a **50% confidence threshold** to filter out low-quality detections.

## Threshold Configuration

### Current Setting
```typescript
const CONFIDENCE_THRESHOLD = 0.5; // Minimum 50% confidence
```

**Locations:**
- `/app/api/detect-yolo/route.ts` (line 10) - Single image detection
- `/app/api/batch-detect-project/route.ts` (line 9) - Batch detection

### How It Works

1. **YOLO API Returns All Detections**
   - YOLO model detects all potential products
   - Each detection includes a confidence score (0.0 to 1.0)
   - Example: 0.876 = 87.6% confident it's a product

2. **Filter by Threshold**
   ```typescript
   const filteredDetections = yoloData.detections.filter(
     det => det.confidence >= CONFIDENCE_THRESHOLD
   );
   ```

3. **Save Only High-Confidence Detections**
   - Only detections with ≥50% confidence are saved to database
   - Low-confidence detections (<50%) are discarded
   - Reduces false positives and noise

## Example Filtering

### YOLO Returns 25 Detections:
```
Detection #1: confidence=0.923 ✅ SAVED (92.3% confident)
Detection #2: confidence=0.876 ✅ SAVED (87.6% confident)
Detection #3: confidence=0.654 ✅ SAVED (65.4% confident)
Detection #4: confidence=0.501 ✅ SAVED (50.1% confident)
Detection #5: confidence=0.499 ❌ FILTERED OUT (49.9% < 50%)
Detection #6: confidence=0.234 ❌ FILTERED OUT (23.4% < 50%)
...
Detection #25: confidence=0.102 ❌ FILTERED OUT (10.2% < 50%)
```

**Result:** 18 high-confidence detections saved, 7 low-confidence filtered out

## Confidence Levels

### Interpretation
- **0.9 - 1.0** (90-100%) = Very High Confidence - Almost certainly a product
- **0.7 - 0.9** (70-90%) = High Confidence - Very likely a product
- **0.5 - 0.7** (50-70%) = Medium Confidence - Probably a product
- **0.3 - 0.5** (30-50%) = Low Confidence - Might be a product (filtered out)
- **0.0 - 0.3** (0-30%) = Very Low Confidence - Unlikely a product (filtered out)

### Why 50% Threshold?

**Balance between Precision and Recall:**

**Too Low (e.g., 30%):**
- ✅ Captures more products (higher recall)
- ❌ More false positives (shelves, tags, fixtures detected as products)
- ❌ More manual cleanup required

**Too High (e.g., 70%):**
- ✅ Fewer false positives (higher precision)
- ❌ Misses some real products (lower recall)
- ❌ Users have to re-run detection or manually add products

**Sweet Spot (50%):**
- ✅ Good balance of precision and recall
- ✅ Catches most real products
- ✅ Filters out most noise
- ✅ Standard ML/CV threshold for binary decisions

## Database Storage

### Column Standardization (Nov 11, 2025)
Both detection methods now use the same column:

```sql
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS confidence DECIMAL(4,3);
```

**Before:** Single image used `confidence_score`, batch used `confidence` ❌  
**After:** Both use `confidence` ✅

### Data Type: `DECIMAL(4,3)`
- Allows values from `0.000` to `1.000`
- Examples: `0.876`, `0.523`, `0.999`
- 3 decimal places for precision

## Console Logging

### Batch Detection
```
📸 Found 8 images to process
🔍 Detecting products in image_001.jpg...
✅ Detected 18/25 products (confidence >= 50%)
```

### Single Image Detection
```
[YOLO Detection] YOLO API returned 25 detections in 612ms
[YOLO Detection] Filtered 25 detections to 18 (confidence >= 50%)
[YOLO Detection] Confidence range: 0.501 - 0.923
```

## Adjusting the Threshold

### To Change Threshold

1. **Edit API Files:**
   ```typescript
   // Change from 0.5 to desired value (e.g., 0.6 for 60%)
   const CONFIDENCE_THRESHOLD = 0.6;
   ```

2. **Update Both Files:**
   - `/app/api/detect-yolo/route.ts`
   - `/app/api/batch-detect-project/route.ts`

3. **Consider Trade-offs:**
   - Higher = fewer products but higher quality
   - Lower = more products but more noise

### Recommended Thresholds by Use Case

| Use Case | Threshold | Rationale |
|----------|-----------|-----------|
| **Retail Audit** | 0.5 (50%) | Balance speed and accuracy |
| **Compliance Check** | 0.7 (70%) | High confidence, few false positives |
| **Exploratory Analysis** | 0.3 (30%) | Capture everything, clean up later |
| **Production Monitoring** | 0.6 (60%) | Good accuracy with minimal noise |

## Query Examples

### Count Detections by Confidence Level
```sql
SELECT 
  CASE 
    WHEN confidence >= 0.9 THEN 'Very High (90-100%)'
    WHEN confidence >= 0.7 THEN 'High (70-90%)'
    WHEN confidence >= 0.5 THEN 'Medium (50-70%)'
    ELSE 'Low (<50%)'
  END as confidence_level,
  COUNT(*) as detection_count
FROM branghunt_detections
WHERE confidence IS NOT NULL
GROUP BY confidence_level
ORDER BY MIN(confidence) DESC;
```

### Find Low-Confidence Detections
```sql
SELECT 
  d.id,
  d.detection_index,
  d.confidence,
  d.label,
  i.original_filename
FROM branghunt_detections d
JOIN branghunt_images i ON i.id = d.image_id
WHERE d.confidence BETWEEN 0.5 AND 0.6
ORDER BY d.confidence ASC
LIMIT 20;
```

### Average Confidence by Image
```sql
SELECT 
  i.original_filename,
  COUNT(d.id) as detection_count,
  ROUND(AVG(d.confidence)::numeric, 3) as avg_confidence,
  ROUND(MIN(d.confidence)::numeric, 3) as min_confidence,
  ROUND(MAX(d.confidence)::numeric, 3) as max_confidence
FROM branghunt_images i
LEFT JOIN branghunt_detections d ON d.image_id = i.id
WHERE d.confidence IS NOT NULL
GROUP BY i.id, i.original_filename
ORDER BY avg_confidence DESC;
```

## Future Enhancements

1. **User-Adjustable Threshold**
   - Add UI slider (0.3 to 0.9)
   - Let users choose precision vs recall balance
   - Save preference per project

2. **Adaptive Threshold**
   - Analyze image quality first
   - Use lower threshold (0.4) for clear images
   - Use higher threshold (0.6) for blurry images

3. **Confidence-Based UI**
   - Show confidence badges on bounding boxes
   - Color-code by confidence level
   - Allow filtering/sorting by confidence

4. **Confidence Analytics**
   - Track confidence distribution over time
   - Identify images needing re-processing
   - Model performance dashboard

## Related Files
- `/app/api/detect-yolo/route.ts` - Single image YOLO detection
- `/app/api/batch-detect-project/route.ts` - Batch YOLO detection
- `/migrations/add_detection_confidence_column.sql` - Database schema
- `BATCH_DETECTION_CONFIDENCE_FIX.md` - Schema fix documentation

## Key Takeaways

1. ✅ **Consistent 50% threshold** across all detection methods
2. ✅ **Same column name** (`confidence`) in both APIs
3. ✅ **Automatic filtering** of low-confidence detections
4. ✅ **Balance** between capturing products and avoiding noise
5. ✅ **Adjustable** if needs change in the future

