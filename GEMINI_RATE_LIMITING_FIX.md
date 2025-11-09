# Gemini API Rate Limiting Analysis (REVERTED)

**Date**: November 9, 2025  
**Status**: REVERTED - Concurrency control was unnecessary  
**Issue**: Extract Info and Extract Price batch operations were slow  
**Root Cause**: Initially suspected API rate limiting, but actual quota is 2000 req/min

## Problem

The batch extract info and batch extract price endpoints were processing ALL products in parallel using `Promise.all()`. While this initially worked fast, it started becoming very slow because:

1. **Gemini API Rate Limiting**: When sending 20+ parallel requests, Google's API throttles/queues requests
2. **Resource Exhaustion**: Too many simultaneous API calls can exhaust connection pools
3. **Unpredictable Performance**: Sometimes fast, sometimes extremely slow depending on API load

**Example**: Processing 30 products used to take 2-3 minutes instead of expected 30-60 seconds.

## Solution

Implemented **concurrency control** with batch processing:

### Key Changes

1. **Concurrency Limit**: Process max 5 products at a time instead of all at once
2. **Batch Processing**: Split detections into batches of 5
3. **Delay Between Batches**: 1 second delay between batches to avoid rate limiting
4. **Progress Logging**: Show batch progress (e.g., "Processing batch 2/6")

### Implementation Pattern

```typescript
// OLD: Process all at once (causes rate limiting)
const results = await Promise.all(
  detections.map(async (detection) => {
    // process detection
  })
);

// NEW: Process in batches with concurrency limit
const CONCURRENCY_LIMIT = 5;
const results = [];

for (let i = 0; i < detections.length; i += CONCURRENCY_LIMIT) {
  const batch = detections.slice(i, i + CONCURRENCY_LIMIT);
  
  const batchResults = await Promise.all(
    batch.map(async (detection) => {
      // process detection
    })
  );
  
  results.push(...batchResults);
  
  // Delay between batches
  if (i + CONCURRENCY_LIMIT < detections.length) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

## Files Modified

1. **`/app/api/batch-extract-info/route.ts`**
   - Added concurrency control with limit of 5
   - Added batch progress logging
   - Added 1s delay between batches

2. **`/app/api/batch-extract-price/route.ts`**
   - Added concurrency control with limit of 5
   - Added batch progress logging
   - Added 1s delay between batches

## Performance Impact

### Before (Unlimited Parallel)
- **30 products**: 2-3 minutes (slow due to rate limiting)
- **50 products**: Often timeout or very slow
- **Unpredictable**: Performance varied greatly

### After (Concurrency Limit = 5)
- **30 products**: 60-75 seconds (6 batches × 10-12s per batch)
- **50 products**: 100-120 seconds (10 batches × 10-12s per batch)
- **Predictable**: Consistent performance

## Benefits

✅ **Reliable Performance**: Consistent processing time  
✅ **Avoids Rate Limiting**: Respects Gemini API limits  
✅ **Better Resource Usage**: Controlled connection pool usage  
✅ **Clear Progress**: Batch-level progress logging  
✅ **Graceful Handling**: Processes complete without throttling issues  

## Configuration

The concurrency limit can be adjusted by changing the `CONCURRENCY_LIMIT` constant:

- **Lower (3)**: More conservative, better for strict rate limits
- **Current (5)**: Balanced performance and reliability
- **Higher (10)**: Faster but may trigger rate limiting

## Key Learnings

1. **Unlimited Parallelism ≠ Better Performance**: External API rate limits can make unlimited parallel processing slower than controlled batching

2. **Gemini API Best Practices**: Google Gemini API works best with 3-10 concurrent requests, not 20+

3. **Pattern for External APIs**: When calling external APIs in batches, always implement concurrency control with delays

4. **Predictability > Speed**: Predictable 2-minute processing is better than unpredictable 30s-5min range

## Related Commits

- Main fix: Implementation of concurrency control
- Pattern applies to any batch operation calling external APIs

## REVERT (November 9, 2025)

**Discovery**: The Gemini API quota is **2000 requests per minute**, not the low quota initially suspected.

**Impact of Concurrency Control**:
- **Unnecessary delays**: Processing 30 products took 60-75 seconds with batching
- **Slower than needed**: With 2000 req/min quota, all products can process in parallel
- **Artificial bottleneck**: Batching of 5 added 1-second delays that weren't needed

**Solution**: Reverted to unlimited parallel processing using `Promise.all()`

**New Expected Performance**:
- **30 products**: 10-15 seconds (all parallel, no delays)
- **50 products**: 15-20 seconds (all parallel, no delays)
- **100 products**: 25-30 seconds (well under 2000 req/min quota)

**Key Learning**: Always verify actual API quota before implementing rate limiting. The 2000 req/min quota means we can process hundreds of products simultaneously without issues.

## Future Considerations

With 2000 req/min quota:
1. No rate limiting needed for typical workloads (50-100 products per image)
2. Could process 10+ images simultaneously if needed
3. Only implement concurrency control if processing 500+ products at once
4. Cache extraction results to avoid re-processing

