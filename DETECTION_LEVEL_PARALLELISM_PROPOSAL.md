# Detection-Level Parallelism for Maximum Speed

## Current Bottleneck

**Architecture:**
- Image concurrency: 15
- Within each image: All detections in parallel (~173 detections avg)
- Progress: Sequential per image

**Problem:**
- With 1382 detections across 8 images, we wait for each image's ~173 detections
- This is slow because images are processed sequentially for progress
- We're using only ~100-200 concurrent Gemini calls (well under 2000 RPM limit)

## Proposed Solution: Detection-Level Queue

Process ALL detections with high concurrency regardless of which image they belong to.

### New Architecture

```typescript
// 1. Fetch ALL detections from ALL images upfront
const allDetections = await fetchAllDetectionsFromAllImages(images);

// 2. Process detections with high concurrency (e.g., 100-200 at a time)
const DETECTION_CONCURRENCY = 150; // ~1500 RPM, leaves headroom

for (let i = 0; i < allDetections.length; i += DETECTION_CONCURRENCY) {
  const batch = allDetections.slice(i, i + DETECTION_CONCURRENCY);
  
  // Process batch with progress per detection
  const batchPromises = batch.map(async (detection) => {
    const imageData = await getImageForDetection(detection.image_id);
    return await extractProductInfo(imageData, detection.bounding_box);
  });
  
  // Await each detection and send progress
  for (const promise of batchPromises) {
    const result = await promise;
    processedCount++;
    sendProgress({ processed: processedCount, total: allDetections.length });
  }
}
```

### Benefits

1. **Speed**: 150 concurrent Gemini calls vs current ~15-30
2. **Rate limit safe**: 150 concurrent = ~1500 RPM (under 2000 limit)
3. **Better progress**: Updates every detection, not every image
4. **Scalable**: Works well with 100s or 1000s of detections

### Estimated Performance

**Current:**
- 1382 detections / 15 image concurrency / ~173 detections per image
- Time: ~5-10 minutes (sequential image processing)

**Proposed:**
- 1382 detections / 150 detection concurrency
- Batches: 10 batches of 138-150 detections
- Gemini response time: ~2-3 seconds per detection
- Time: ~60-90 seconds total (10x faster!)

### Implementation Options

**Option A: Quick Fix - Increase Image Concurrency**
```typescript
const { projectId, concurrency = 50 } = await request.json(); // Was 15
```
- Pros: 1-line change, 3x faster
- Cons: Still image-level bottleneck, not optimal

**Option B: Detection-Level Queue (Recommended)**
- Pros: 10x faster, optimal use of API quota
- Cons: Requires refactoring (~100 lines)

## Recommendation

Start with **Option A** (quick win), then implement **Option B** if you need more speed.

For 1382 detections:
- Option A (concurrency=50): ~2-3 minutes
- Option B (concurrency=150): ~60-90 seconds

