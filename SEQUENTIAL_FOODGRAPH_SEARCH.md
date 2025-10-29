# Sequential FoodGraph Search Implementation

## Issue Resolved
FoodGraph API was failing with rate limiting errors when Step 3 tried to search for 40+ products in parallel.

## Root Cause
- FoodGraph API has rate limiting on concurrent requests
- Parallel `Promise.all()` execution overwhelmed the API
- Multiple simultaneous HTTP requests triggered throttling

## Solution Implemented

### Changed from Parallel to Sequential Processing

**Before (Parallel):**
```typescript
const results = await Promise.all(
  detectionsToProcess.map(async (detection) => {
    const foodgraphResults = await searchProducts(detection.brand_name);
    // Save results...
  })
);
```

**After (Sequential with Delays):**
```typescript
const results = [];

for (let i = 0; i < detectionsToProcess.length; i++) {
  const detection = detectionsToProcess[i];
  
  // Search FoodGraph API
  const foodgraphResults = await searchProducts(detection.brand_name);
  
  // Save to cache (branghunt_foodgraph_results table)
  await supabase.from('branghunt_foodgraph_results').insert(resultsToSave);
  
  results.push(result);
  
  // Add 1.5 second delay before next request
  if (i < detectionsToProcess.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}
```

## Key Changes

### 1. Sequential Processing
- Products processed one at a time in a `for` loop
- Each request waits for previous to complete
- No concurrent FoodGraph API calls

### 2. Rate Limiting Delays
- **1.5 second delay** between each API request
- Uses `setTimeout` wrapped in Promise
- Prevents overwhelming the API
- Only delays between requests (not after last one)

### 3. Results Caching
- Results saved to `branghunt_foodgraph_results` table immediately
- Acts as intermediate cache for Step 4
- Step 4 reads from database instead of re-fetching
- Top 50 results per product saved with full data

### 4. Extended Timeout
- Increased from **90 seconds** to **180 seconds**
- Calculation: 40 products × 1.5s delay + processing time
- Accommodates sequential processing time

### 5. Enhanced Logging
```
🔎 Searching FoodGraph for 40 products SEQUENTIALLY (with delays)...
  [5] (1/40) Searching for: Skippy...
  ✅ [5] Found and saved 50 results to cache
  ⏳ Waiting 1.5s before next request...
  [12] (2/40) Searching for: Jif...
  ✅ [12] Found and saved 45 results to cache
  ⏳ Waiting 1.5s before next request...
```

## Benefits

### ✅ Reliability
- No more rate limiting errors
- Predictable API usage pattern
- Graceful degradation if one fails

### ✅ Caching Strategy
- Results stored in database table
- Step 4 doesn't need to re-fetch
- Can inspect cached results manually
- Easy to clear and re-run if needed

### ✅ Progress Tracking
- Console shows (X/Y) counter
- Can see exactly which product is being processed
- Easy to identify failures
- Returns `totalCached` count in response

### ✅ API Compliance
- Respects rate limits
- Maintains good relationship with API provider
- Sustainable for production use

## Performance Impact

### Time Comparison
- **Parallel (before):** ~10-15 seconds for 40 products (when working)
- **Sequential (after):** ~60-90 seconds for 40 products (reliable)

### Trade-off Justification
- **Slower but reliable** is better than fast but fails
- Cache eliminates re-fetching in Step 4
- One-time cost per image upload
- Results persist for future analysis

## Database Schema

### Table: `branghunt_foodgraph_results`
Acts as cache/intermediate storage for FoodGraph search results.

**Columns:**
- `id` - Primary key
- `detection_id` - Foreign key to branghunt_detections
- `result_rank` - Ranking (1-50)
- `product_name` - Product name from FoodGraph
- `brand_name` - Brand name from FoodGraph
- `category` - Product category
- `front_image_url` - Product image URL
- `product_gtin` - UPC/GTIN barcode
- `full_data` - JSONB with complete API response
- `is_match` - Boolean set by Step 4 AI filtering
- `match_confidence` - Confidence score from AI
- `created_at` - Timestamp

## Step 4 Integration

Step 4 (AI Filter) now reads from cached results:

```typescript
// Fetch detections WITH cached FoodGraph results
const { data: detections } = await supabase
  .from('branghunt_detections')
  .select(`
    *,
    branghunt_foodgraph_results(*)
  `)
  .eq('image_id', imageId)
  .is('fully_analyzed', null);

// Use cached results - no re-fetching needed
const foodgraphResults = detection.branghunt_foodgraph_results;
```

## Error Handling

### Graceful Failures
- If one product search fails, others continue
- Error logged with specific detection index
- Success/error counts tracked separately
- Partial results still saved to database

### Clear Messaging
```json
{
  "message": "Batch FoodGraph search complete",
  "total": 40,
  "success": 38,
  "errors": 2,
  "totalCached": 1850,
  "results": [...]
}
```

## Future Improvements

### Potential Optimizations
1. **Adaptive Delays:** Increase delay if getting rate limit errors, decrease if successful
2. **Batch Processing:** Group into batches of 10 with longer delays between batches
3. **Queue System:** Use job queue for better management of long-running tasks
4. **Resume Support:** Save progress mid-step to resume if timeout occurs
5. **Parallel Batches:** Process 2-3 at a time instead of fully sequential

### Monitoring
- Track API response times
- Alert on high error rates
- Log rate limit headers if available
- Dashboard showing cache hit rates

## API Rate Limit Analysis

### Estimated Limits (based on behavior)
- Concurrent requests: **~5-10 max**
- Requests per minute: **Unknown (conservative approach)**
- Burst capacity: **Low (sequential is safer)**

### Our Conservative Approach
- **1 request every 1.5 seconds** = 40 requests/minute
- Well below any reasonable rate limit
- Ensures reliability over speed
- Can adjust delay if needed

## Key Learnings

### 1. External APIs Need Sequential Processing
When integrating with third-party APIs:
- Always check rate limits first
- Default to sequential with delays
- Only parallelize if explicitly supported

### 2. Cache Intermediate Results
- Don't fetch same data multiple times
- Database storage is cheap
- Enables recovery and debugging
- Improves user experience

### 3. Logging is Critical
- Show progress for long operations
- Include counters (X/Y)
- Log timing information
- Helps identify bottlenecks

### 4. Plan for Failures
- One failure shouldn't break everything
- Track success/error counts
- Provide clear error messages
- Save partial results

## Testing Recommendations

### Before Deployment
1. Test with small batch (5 products)
2. Test with medium batch (20 products)
3. Test with full batch (40+ products)
4. Verify cache writes correctly
5. Confirm Step 4 reads from cache

### Production Monitoring
1. Track Step 3 completion times
2. Monitor cache table size
3. Alert on high error rates
4. Log API response patterns

---

**Implemented:** January 2025  
**Status:** Production Ready  
**Tested With:** 40 products with 1.5s delays  
**Commit:** f9d71be

