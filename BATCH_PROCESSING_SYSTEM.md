# Batch Processing System - Architecture & Implementation

## Overview
The BrangHunt batch processing system has been redesigned to process all products in parallel while saving intermediate results at each step. This prevents data loss and allows for better debugging and progress tracking.

## Problem Solved
**Previous Issue:** The original `/api/process-all` endpoint tried to execute all 5 processing steps for 57 products in a single request with a 300-second timeout, resulting in 504 Gateway Timeout errors.

**Solution:** Split processing into 4 separate batch API endpoints, each processing all products in parallel and saving results immediately to the database.

## Architecture

### 4-Step Sequential Pipeline

```
Step 1: Extract Info    →  Step 2: Extract Price  →  Step 3: Search FoodGraph  →  Step 4: AI Filter & Save
    (60s timeout)             (60s timeout)              (90s timeout)                 (120s timeout)
   All products in           All products in            All products in               All products in
     parallel                  parallel                   parallel                      parallel
     ↓ Save to DB              ↓ Save to DB               ↓ Save to DB                  ↓ Save to DB
```

### API Endpoints

#### 1. `/api/batch-extract-info` (60s timeout)
- **Purpose:** Extract brand, product name, category, flavor, size, SKU, and description
- **Input:** `{ imageId: string }`
- **Processing:** 
  - Fetches all detections without `brand_name`
  - Processes all in parallel using `Promise.all()`
  - Calls `extractProductInfo()` for each detection
  - Immediately saves extracted data to `branghunt_detections` table
- **Output:** 
  ```json
  {
    "message": "Batch info extraction complete",
    "total": 57,
    "success": 55,
    "errors": 2,
    "results": [...]
  }
  ```

#### 2. `/api/batch-extract-price` (60s timeout)
- **Purpose:** Extract price, currency, and confidence from product bounding boxes
- **Input:** `{ imageId: string }`
- **Processing:**
  - Fetches all detections with `brand_name` but no `price`
  - Processes all in parallel using `Promise.all()`
  - Calls `extractPrice()` for each detection
  - Immediately saves price data to `branghunt_detections` table
- **Output:**
  ```json
  {
    "message": "Batch price extraction complete",
    "total": 55,
    "success": 48,
    "skipped": 5,
    "errors": 2,
    "results": [...]
  }
  ```

#### 3. `/api/batch-search-foodgraph` (90s timeout)
- **Purpose:** Search FoodGraph database for matching products
- **Input:** `{ imageId: string }`
- **Processing:**
  - Fetches all detections with `brand_name` but no FoodGraph results
  - Processes all in parallel using `Promise.all()`
  - Calls `searchProducts()` for each detection
  - Saves top 50 results per product to `branghunt_foodgraph_results` table
- **Output:**
  ```json
  {
    "message": "Batch FoodGraph search complete",
    "total": 55,
    "success": 53,
    "errors": 2,
    "results": [...]
  }
  ```

#### 4. `/api/batch-filter-ai` (120s timeout)
- **Purpose:** Use AI to compare product images and auto-save best matches
- **Input:** `{ imageId: string }`
- **Processing:**
  - Fetches all detections with FoodGraph results but not `fully_analyzed`
  - Loads image once and crops to bounding boxes
  - For each detection, compares against all FoodGraph results in parallel
  - Updates `is_match` and `match_confidence` in `branghunt_foodgraph_results`
  - Auto-saves best match to `branghunt_detections` (sets `fully_analyzed=true`)
- **Output:**
  ```json
  {
    "message": "Batch AI filtering complete",
    "total": 53,
    "success": 53,
    "saved": 51,
    "errors": 0,
    "results": [...]
  }
  ```

## UI Integration

### Progress Tracking Display
The analyze page (`/analyze/[imageId]`) now shows real-time progress:

```
📋 Step 1/4: Extracting product information...

┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 📋 Extract  │ 💰 Extract  │ 🔍 Search   │ 🤖 AI      │
│    Info     │    Price    │     DB      │   Filter   │
│             │             │             │            │
│  55/57 ✓    │   —         │    —        │    —       │
│  Done ✓     │ Waiting...  │ Waiting...  │ Waiting... │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

### Sequential Execution
The `handleProcessAll()` function:
1. Calls each API endpoint sequentially
2. Updates progress state after each step
3. Continues even if a step partially fails
4. Shows final summary with stats from all steps
5. Reloads page data to display updated products

## Benefits

### 1. **No Data Loss**
- Each step saves results immediately to database
- If processing fails at step 3, steps 1 and 2 are already saved
- Users can resume from any failed step

### 2. **Better Performance**
- Shorter timeouts per endpoint (60-120s vs 300s)
- Each endpoint focuses on one task
- Parallel processing within each step maximizes throughput

### 3. **Improved Debugging**
- Console logs show progress for each product
- Easy to identify which step/product failed
- Database contains full audit trail of processing

### 4. **Scalability**
- Each endpoint can be scaled independently
- Can add more steps without affecting existing ones
- Easy to retry individual steps

### 5. **User Experience**
- Real-time progress tracking
- Clear step-by-step visualization
- Informative error messages
- Can see partial results immediately

## Database Schema Impact

### Tables Used
1. **branghunt_detections**
   - Stores extracted product info (step 1)
   - Stores price data (step 2)
   - Stores saved FoodGraph match (step 4)
   
2. **branghunt_foodgraph_results**
   - Stores search results (step 3)
   - Stores AI match flags (step 4)

### Key Columns Updated
- Step 1: `brand_name`, `product_name`, `category`, `flavor`, `size`, `sku`, `description`
- Step 2: `price`, `price_currency`, `price_confidence`
- Step 3: Inserts rows in `branghunt_foodgraph_results`
- Step 4: Updates `is_match`, `match_confidence` in results table; sets `fully_analyzed=true` in detections

## Error Handling

### Graceful Degradation
- Each product is processed independently
- One product failure doesn't affect others
- Returns detailed error information per product
- Success count vs error count clearly reported

### Recovery Strategy
1. Check which step failed in console logs
2. Fix the specific issue (API key, timeout, etc.)
3. Click "Process All" again - it will skip already-processed products
4. Only unprocessed products will be handled

## Performance Metrics

### Before (Single Endpoint)
- Total timeout: 300 seconds
- All-or-nothing processing
- 57 products × 5 steps = 285 operations
- Failure rate: High (504 timeout)

### After (4 Separate Endpoints)
- Step 1: ~60 seconds for 57 products (info extraction)
- Step 2: ~60 seconds for 57 products (price extraction)
- Step 3: ~90 seconds for 57 products (FoodGraph search)
- Step 4: ~120 seconds for 57 products (AI filtering)
- Total: ~330 seconds but chunked into manageable pieces
- Failure rate: Low (each step has shorter timeout)
- Recovery: Immediate (partial results saved)

## Future Enhancements

### Potential Improvements
1. **Webhook Integration:** Notify user when processing completes
2. **Queue System:** Use Redis/BullMQ for better job management
3. **Batch Size Control:** Process in smaller batches (e.g., 10 products at a time)
4. **Progress WebSocket:** Real-time progress updates without polling
5. **Retry Logic:** Automatic retry for failed products
6. **Background Processing:** Move to background workers for large images

### Monitoring
- Add timing metrics for each step
- Track success/failure rates
- Log processing duration per product
- Alert on high failure rates

## Code Structure

```
/app/api/
  ├── batch-extract-info/route.ts    (Step 1)
  ├── batch-extract-price/route.ts   (Step 2)
  ├── batch-search-foodgraph/route.ts (Step 3)
  └── batch-filter-ai/route.ts       (Step 4)

/app/analyze/[imageId]/
  └── page.tsx                        (UI with handleProcessAll)

/lib/
  ├── gemini.ts                       (AI functions)
  ├── foodgraph.ts                    (API integration)
  └── supabase.ts                     (Database client)
```

## Key Learnings

1. **Break Down Large Operations:** Instead of one huge request, split into manageable chunks
2. **Save Progress Incrementally:** Don't wait until the end to save results
3. **Parallel Within, Sequential Between:** Process items in parallel within each step, but steps run sequentially
4. **User Feedback is Critical:** Show progress so users know the system is working
5. **Plan for Failure:** Assume things will fail and design recovery mechanisms

## Deployment Notes

- All endpoints use `runtime = 'nodejs'` for extended timeouts
- Timeouts set based on expected processing time
- No additional environment variables required
- Compatible with Vercel free tier limits (max 300s per function)
- Database already supports all required columns

---

**Implemented:** January 2025  
**Status:** Production Ready  
**Tested With:** 57 products on single retail shelf image

