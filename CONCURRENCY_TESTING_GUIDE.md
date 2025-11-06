# Concurrency Testing Guide for Step 3 Batch Processing

**Date:** November 6, 2025  
**Feature:** Configurable parallel processing for Search & Save  
**Commit:** 025ca83

## Overview

Added ability to test different concurrency levels for Step 3 (Search & Save) batch processing to find optimal balance between speed and resource usage.

## Testing Buttons

The analyze page now has **5 different buttons** for testing:

### 1. ⚡ 3 at once (Blue)
- **Concurrency:** 3 products in parallel
- **Current default** - safe and proven
- **Use case:** Baseline for comparison
- **Expected:** Stable, moderate speed

### 2. ⚡⚡ 10 at once (Indigo)
- **Concurrency:** 10 products in parallel
- **3.3x increase** over baseline
- **Use case:** Test if we can safely increase throughput
- **Expected:** Faster completion, more API load

### 3. ⚡⚡⚡ 20 at once (Purple)
- **Concurrency:** 20 products in parallel
- **6.6x increase** over baseline
- **Use case:** Test higher parallelization
- **Expected:** Significant speedup, higher resource usage

### 4. 🚀 50 at once (Pink)
- **Concurrency:** 50 products in parallel
- **16.6x increase** over baseline
- **Use case:** Push the limits
- **Expected:** Maximum practical speed, potential bottlenecks

### 5. 🔥 ALL AT ONCE 🔥 (Red/Orange Gradient)
- **Concurrency:** Unlimited (all products simultaneously)
- **Use case:** Maximum theoretical speed test
- **Expected:** Fastest possible, highest resource usage, potential API rate limiting

## How It Works

### Backend
```typescript
// API accepts optional concurrency parameter
const { imageId, concurrency } = await request.json();

// Use provided value or default to 3
const CONCURRENCY_LIMIT = concurrency || 3;

// Process in batches with concurrency control
for (let i = 0; i < detections.length; i += CONCURRENCY_LIMIT) {
  const batch = detections.slice(i, i + CONCURRENCY_LIMIT);
  await Promise.all(batch.map(process));
  await delay(5000); // Between batches
}
```

### Frontend
```typescript
// Multiple buttons call same function with different values
onClick={() => handleSearchAndSaveAll(3)}   // 3 at once
onClick={() => handleSearchAndSaveAll(10)}  // 10 at once
onClick={() => handleSearchAndSaveAll(20)}  // 20 at once
onClick={() => handleSearchAndSaveAll(50)}  // 50 at once
onClick={() => handleSearchAndSaveAll(999999)} // ALL at once
```

## Testing Procedure

### Step 1: Baseline (3 at once)
1. Go to analyze page with ~50-100 products
2. Click "⚡ 3 at once" button
3. **Measure:**
   - Total time to completion
   - Success rate
   - Error count
   - Server resource usage (CPU, memory)
   - Check server console for timing logs
4. **Record results**

### Step 2: Test 10 at once
1. Refresh the page (or use different image)
2. Click "⚡⚡ 10 at once" button
3. **Measure same metrics**
4. **Compare to baseline:**
   - Is it ~3.3x faster?
   - Any increase in errors?
   - Server load sustainable?

### Step 3: Test 20 at once
1. Refresh/new image
2. Click "⚡⚡⚡ 20 at once"
3. **Measure & compare**
4. **Watch for:**
   - API rate limiting errors
   - Memory issues
   - Timeout errors

### Step 4: Test 50 at once
1. Refresh/new image
2. Click "🚀 50 at once"
3. **Measure & compare**
4. **Watch for:**
   - Server overload
   - Failed comparisons
   - Network throttling

### Step 5: Test ALL at once
1. Refresh/new image
2. Click "🔥 ALL AT ONCE 🔥"
3. **Measure & compare**
4. **Likely issues:**
   - Gemini API rate limiting
   - Vercel timeout (300s max)
   - Memory exhaustion
   - Network congestion

## What to Measure

### Performance Metrics
- **Total processing time** (from console logs)
- **Per-product average time**
- **Throughput** (products/second)
- **Time to first match**

### Reliability Metrics
- **Success rate** (%)
- **Error count**
- **Timeout count**
- **Match quality** (are matches correct?)

### Resource Metrics
- **Server CPU usage**
- **Server memory usage**
- **Network bandwidth**
- **API call count**

## Expected Results

### Hypothesis
- **3 at once:** ~10 seconds/product, 100% reliable
- **10 at once:** ~8 seconds/product (20% faster), 98% reliable
- **20 at once:** ~7 seconds/product (30% faster), 95% reliable
- **50 at once:** ~6 seconds/product (40% faster), 90% reliable
- **ALL at once:** Either very fast or crashes (theoretical max speed)

### Optimal Concurrency
We're looking for the **sweet spot** where:
- ✅ Maximum speed improvement
- ✅ Minimal error increase
- ✅ Sustainable resource usage
- ✅ No API rate limiting

## Logging

Server console will show:
```
🔍 Starting batch search & save for image a756888b-c820-4cb6-9eb8-ab653626d759...
⚡ Concurrency level: 10 products at a time
🚀 Found 94 products that need processing
📊 Processing with concurrency limit: 10

🔄 Processing batch 1: products 1-10
  [#1] Starting search...
  [#2] Starting search...
  ...
  [#10] Starting search...
  ⏳ Waiting 5s before next batch...

🔄 Processing batch 2: products 11-20
  ...
```

## Recommendations

After testing, update default concurrency based on results:

**If all tests succeed:**
- Use highest concurrency that maintains 95%+ success rate
- Update `const CONCURRENCY_LIMIT = concurrency || 10;` (or 20, etc.)

**If errors occur at high concurrency:**
- Stick with proven value (3 or 10)
- Consider adding adaptive concurrency (start high, reduce on errors)

**If ALL AT ONCE works:**
- Remove batching entirely
- Process all products in single Promise.all()
- Simplify code significantly

## Future Enhancements

If testing shows value:
1. **Adaptive concurrency** - start high, reduce on errors
2. **Per-API concurrency limits** - different limits for different APIs
3. **User preference** - let users choose speed vs reliability
4. **Auto-detect optimal** - measure and adjust automatically

## Files Modified

- `app/api/batch-search-and-save/route.ts` - Accept and use concurrency parameter
- `app/analyze/[imageId]/page.tsx` - Add 5 test buttons with different concurrency levels

