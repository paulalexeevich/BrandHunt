# Real-time Statistics Panel Update During Batch Processing

**Date:** November 10, 2025  
**Commit:** 1d40768

## Problem

During batch processing, there was a significant delay between:
1. **Product Progress panel** (top): Updated in real-time as products were processed
2. **Product Statistics panel** (bottom): Only updated after ALL processing completed

This caused confusion where users saw "✓✓ Saved: 80+ products" in the progress section, but statistics showed "22 / 94 Completed (23%)" - a delay that could last minutes with large batches.

## Root Cause

The statistics panel calculated its data from the `detections` state, which was only fully refreshed:
1. During individual product updates (lines 833-863) - but only updated ONE detection at a time
2. At batch completion (line 874) - `await fetchImage()` called when `type === 'complete'`

The issue: **Individual detection updates were too granular and slow, causing a cumulative delay.**

## Solution

Changed the refresh strategy to reload **ALL detections** after each product completes, not just the individual detection.

### Before (lines 833-863):
```typescript
if (data.stage === 'done') {
  // Only update ONE detection
  const detectionToReload = detections[data.detectionIndex];
  fetch(`/api/results/${resolvedParams.imageId}`)
    .then(res => res.json())
    .then(refreshedData => {
      setDetections(prev => prev.map((det, idx) => {
        if (idx === data.detectionIndex) {
          return refreshedData.detections[idx]; // Only update this one
        }
        return det;
      }));
    });
}
```

### After (lines 833-846):
```typescript
if (data.stage === 'done' || data.stage === 'error' || data.stage === 'no-match') {
  // Reload ALL detections to update statistics immediately
  fetch(`/api/results/${resolvedParams.imageId}`)
    .then(res => res.json())
    .then(refreshedData => {
      if (refreshedData.detections) {
        setDetections(refreshedData.detections); // Update all
        // Statistics panel recalculates automatically
      }
    });
}
```

## Benefits

### 1. Real-time Statistics
- Statistics panel updates after EACH product completes
- No more waiting until batch finishes
- Progress is visible throughout the process

### 2. Simplified Code
- Removed complex single-detection update logic
- Single update path for all scenarios
- 17 fewer lines of code (-28 deletions, +11 additions)

### 3. Consistent Data
- All detections refreshed together
- No risk of partial/stale data
- Statistics always reflect current database state

## Performance Considerations

### API Call Frequency:
- **Before:** 1 API call per product (partial update) + 1 at end (full update)
- **After:** 1 API call per product (full update)
- **Net change:** Actually SAME number of calls, but each returns complete data

### Data Transfer:
- Each API call returns ~94 detections
- Typical detection size: ~2KB
- Total per call: ~188KB
- Acceptable for real-time updates

### Update Interval:
- Depends on concurrency setting
- **3 at once:** Updates every 10-15 seconds
- **20 at once:** Updates every 5-10 seconds
- **ALL at once:** Updates in burst, then done

## User Experience

### Before:
```
Product Progress: #74 ✓ Saved, #75 ✗ No match, #76 ✓ Saved...
Statistics:       22 / 94 Completed (23%) ← STALE DATA!
```
User thinks: "Why is it still showing 23%? I see 80 products done!"

### After:
```
Product Progress: #74 ✓ Saved, #75 ✗ No match, #76 ✓ Saved...
Statistics:       76 / 94 Completed (81%) ← UP TO DATE!
```
User thinks: "Great! I can see the progress is real."

## Technical Details

### Trigger Conditions:
Statistics update when any of these stages complete:
- `data.stage === 'done'` - Product saved successfully
- `data.stage === 'error'` - Processing error occurred
- `data.stage === 'no-match'` - No match found

### Data Flow:
1. Backend processes product and saves to database
2. Backend sends SSE progress update with `stage: 'done'`
3. Frontend receives update via streaming
4. Frontend calls `/api/results/${imageId}` to fetch all detections
5. Frontend updates `detections` state with fresh data
6. Statistics panel recalculates based on new `detections` state
7. UI shows updated percentages and counts

### State Updates:
```typescript
// These states derive from detections array:
const totalProducts = detections.length
const notProduct = detections.filter(d => d.is_product === false).length
const detailsNotVisible = detections.filter(d => d.is_product && !d.details_visible).length
const notIdentified = detections.filter(d => d.is_product && d.details_visible && !d.brand_name).length
const oneMatch = detections.filter(d => d.fully_analyzed === true).length
const noMatch = detections.filter(d => d.brand_name && (!d.foodgraph_results || d.foodgraph_results.length === 0)).length
const multipleMatches = detections.filter(d => d.foodgraph_results?.length >= 2).length

// All recalculate automatically when detections changes
```

## Testing

### Test Scenario:
1. Upload image with 94 products
2. Run batch processing with "3 at once"
3. Watch both panels during processing

### Expected Behavior:
- Product Progress shows real-time updates every few seconds
- Statistics panel updates every time a product completes
- Both panels stay in sync throughout
- No delay between panels

### Success Criteria:
✓ Statistics percentages match progress updates
✓ "ONE Match" count increases as products save
✓ No stale data shown
✓ Smooth, consistent updates

## Known Limitations

### 1. API Call Overhead
- Every completion triggers a full refresh
- For 100 products, that's 100 API calls
- Each call fetches all detections (~188KB)
- Total data transfer: ~18MB
- Acceptable for most use cases

### 2. Race Conditions
- Multiple rapid completions could overlap
- Last fetch wins (correct behavior)
- No data loss, just redundant fetches

### 3. Large Images
- 500+ products means 500 API calls
- Could add throttling if needed
- Current implementation prioritizes UX over optimization

## Future Optimizations

### Possible Improvements:
1. **Batch Updates:** Group rapid updates within 1-second window
2. **Incremental Updates:** Only fetch changed detection
3. **Local Calculation:** Update statistics without API call
4. **WebSocket:** Real-time push instead of polling

### Not Recommended:
- Delaying updates (defeats purpose)
- Caching detections (could show stale data)
- Partial refreshes (risk of inconsistency)

## Files Changed

- `app/analyze/[imageId]/page.tsx` (lines 833-846)

## Related Features

- Batch processing with SSE (lines 755-889)
- Product Statistics panel (calculated from detections)
- Product Progress display (streaming updates)

---

**Key Learning:** When displaying data from multiple sources (streaming progress + database state), ensure all displays refresh at the same frequency. Real-time updates should be truly real-time, not delayed until batch completion.

