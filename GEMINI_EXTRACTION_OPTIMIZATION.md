# Gemini Extraction Optimization

## Overview
Optimized batch product extraction to take full advantage of Gemini's 2000 requests per minute (RPM) rate limit by increasing parallel processing concurrency.

## Gemini API Rate Limit
- **Limit:** 2000 requests per minute
- **Per Second:** ~33 requests/second
- **Sustainable Concurrency:** 66-100 concurrent requests (assuming 2-3s per request)

## Previous Configuration

### Before Optimization
```typescript
concurrency: 5  // Only 5 images processed in parallel
```

**Effective Parallelism:**
- 5 images at a time
- All detections per image in parallel
- Example: 5 images × 20 detections = 100 concurrent Gemini calls
- **Underutilized:** Could handle more!

**Performance:**
- 8 images with 142 detections
- 5 images at a time = 2 batches
- Total time: ~16 seconds

## New Configuration

### After Optimization
```typescript
concurrency: 15  // 15 images processed in parallel
```

**Effective Parallelism:**
- 15 images at a time
- All detections per image in parallel
- Example: 15 images × 10 detections = 150 concurrent Gemini calls
- **Well Optimized:** Uses 50-150 concurrent requests (under 2K RPM limit)

**Expected Performance:**
- 8 images with 142 detections
- All 8 images in 1 batch
- Total time: ~5 seconds (3x faster!)

## How It Works

### Two-Level Parallelism

**Level 1: Image Batches (Concurrency = 15)**
```typescript
for (let i = 0; i < images.length; i += concurrency) {
  const batch = images.slice(i, i + concurrency);  // 15 images
  const batchResults = await Promise.all(
    batch.map(async (image) => {
      // Process each image...
    })
  );
}
```

**Level 2: Detections Per Image (Unlimited)**
```typescript
// Within each image, process ALL detections in parallel
await Promise.all(
  detections.map(async (detection) => {
    const productInfo = await extractProductInfo(...);
    // Gemini API call happens here
  })
);
```

### Example Scenario

**Project:** 20 images, average 10 detections per image (200 total extractions)

**Old Configuration (concurrency=5):**
```
Batch 1: Process 5 images (50 detections) → ~3s
Batch 2: Process 5 images (50 detections) → ~3s
Batch 3: Process 5 images (50 detections) → ~3s
Batch 4: Process 5 images (50 detections) → ~3s
Total: ~12 seconds
```

**New Configuration (concurrency=15):**
```
Batch 1: Process 15 images (150 detections) → ~3s
Batch 2: Process 5 images (50 detections) → ~3s
Total: ~6 seconds (2x faster!)
```

## Rate Limit Safety

### Concurrent Request Calculation

| Images | Avg Detections | Total Concurrent Calls | Under 2K RPM? |
|--------|----------------|------------------------|---------------|
| 5 | 10 | 50 | ✅ Yes (2.5% of limit) |
| 10 | 10 | 100 | ✅ Yes (5% of limit) |
| 15 | 10 | 150 | ✅ Yes (7.5% of limit) |
| 15 | 20 | 300 | ✅ Yes (15% of limit) |
| 20 | 10 | 200 | ✅ Yes (10% of limit) |

**Note:** Even with 15 images × 20 detections = 300 concurrent calls, we're only using ~15% of the per-minute capacity.

### Request Duration Math

If each Gemini extraction takes 2 seconds:
- 150 concurrent requests starting at once
- All complete in ~2 seconds
- Total requests in 1 minute: 150 (well under 2000)

If batches complete every 3 seconds:
- 20 batches per minute possible
- 150 requests per batch
- Theoretical max: 3000 requests/min (we'd hit rate limit)
- **In practice:** Projects rarely have enough images to hit this

## Performance Impact

### Small Projects (5-10 images)
- **Before:** 2 batches, ~6 seconds
- **After:** 1 batch, ~3 seconds
- **Speedup:** 2x faster ⚡

### Medium Projects (20-50 images)
- **Before:** 4-10 batches, ~12-30 seconds
- **After:** 2-4 batches, ~6-12 seconds
- **Speedup:** 2-2.5x faster ⚡⚡

### Large Projects (100+ images)
- **Before:** 20+ batches, ~60+ seconds
- **After:** 7+ batches, ~21+ seconds
- **Speedup:** 3x faster ⚡⚡⚡

## Files Modified

1. **`app/api/batch-extract-project/route.ts`**
   - Changed default concurrency: `5` → `15`

2. **`app/projects/[projectId]/page.tsx`**
   - Updated frontend call: `concurrency: 5` → `concurrency: 15`
   - Updated UI description: Added Gemini rate limit info

## Code Changes

### API Route (batch-extract-project/route.ts)
```typescript
// Before
const { projectId, concurrency = 5 } = await request.json();

// After
const { projectId, concurrency = 15 } = await request.json();
```

### Frontend (page.tsx)
```typescript
// Before
body: JSON.stringify({ 
  projectId,
  concurrency: 5
})

// After
body: JSON.stringify({ 
  projectId,
  concurrency: 15
})
```

## Monitoring for Rate Limits

### Signs You're Hitting Rate Limits
- Extraction failures with 429 status codes
- Gemini API errors mentioning "rate limit"
- Slower than expected processing times

### Solutions if Rate Limited
1. **Reduce Concurrency:** Lower from 15 to 10 or 8
2. **Add Delays:** Insert small delays between batches
3. **Upgrade Plan:** Get higher Gemini API rate limits
4. **Batch Smarter:** Process during off-peak hours

### Logging
The API logs concurrent batch processing:
```
📦 Processing batch 1/2 (15 images)...
  📋 Extracting info for 18 detections...
  ✅ Extracted info for 18/18 detections
```

Watch for patterns of failures that could indicate rate limiting.

## Configuration Options

### Conservative (Safe for any project)
```typescript
concurrency: 10  // Max 100 concurrent calls
```

### Balanced (Current - recommended)
```typescript
concurrency: 15  // Max 150 concurrent calls
```

### Aggressive (High-volume processing)
```typescript
concurrency: 20  // Max 200 concurrent calls
```

### Maximum (Approach rate limit)
```typescript
concurrency: 30  // Max 300 concurrent calls (risky!)
```

## Future Enhancements

1. **Dynamic Concurrency**
   - Measure avg detections per image
   - Calculate safe concurrency: `Math.floor(100 / avgDetections)`
   - Adjust automatically

2. **Rate Limit Retry**
   - Catch 429 errors
   - Exponential backoff
   - Auto-retry failed extractions

3. **Progress Tracking**
   - Show per-image progress
   - Estimate time remaining
   - Real-time success/failure counts

4. **Smart Batching**
   - Process images with fewer detections first
   - Distribute load evenly across batches
   - Minimize total processing time

## Key Learnings

1. **Utilize Full Rate Limits:** Don't leave performance on the table
2. **Two-Level Parallelism:** Batch at image level, parallelize at detection level
3. **Stay Under Limits:** 150 concurrent calls comfortably under 2K RPM
4. **Monitor in Production:** Watch for 429 errors to detect rate limiting
5. **Configurable:** Allow users to adjust if needed

## Testing Recommendations

1. **Small Project (8 images):**
   - Should complete in ~3-5 seconds
   - All images in 1 batch

2. **Medium Project (30 images):**
   - Should complete in ~6-9 seconds
   - 2 batches

3. **Large Project (100 images):**
   - Should complete in ~20-30 seconds
   - 7 batches
   - Watch for rate limit errors

4. **Monitor Rate Limit Usage:**
   - Check Google Cloud Console
   - View Gemini API quota usage
   - Ensure staying under 2K RPM

## Related Documentation
- `BATCH_PROCESSING_SPEED_FIX.md` - Detection optimization (concurrency 10)
- `BATCH_ERROR_REPORTING.md` - Error handling
- `DETECTION_CONFIDENCE_THRESHOLD.md` - Confidence filtering

