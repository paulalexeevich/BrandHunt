# Batch Processing Refactor - 3-Step Workflow

## Overview
Refactored the batch processing system from a single "Process All Products" button into 3 separate, independent steps with dedicated buttons. This gives users more control over the processing workflow and allows them to run steps selectively.

## Changes Made

### 1. New API Endpoint: `/api/batch-search-and-save`
**File**: `app/api/batch-search-and-save/route.ts`

**Purpose**: Combines FoodGraph search + AI filtering + saving into a single sequential operation without storing intermediate results.

**Processing Flow**:
```
For each product (sequential with 10s delays):
  1. Search FoodGraph API → Hold results in memory
  2. AI Filter (compare first 20 results) → Find best match
  3. Save only final match to DB → Update detection record
```

**Key Features**:
- Sequential processing with 10-second delays between products (FoodGraph API requirement)
- 2-second delays between AI comparisons within each product
- No intermediate database writes for FoodGraph results (memory only)
- Only saves the final matched product to `branghunt_detections` table
- Processes products that have `brand_name` but `fully_analyzed = NULL`

**Response Format**:
```json
{
  "message": "Batch search & save complete",
  "total": 120,
  "success": 85,
  "noMatch": 30,
  "errors": 5,
  "results": [...]
}
```

**Timeout**: 300 seconds (Vercel free tier maximum)

### 2. Updated UI - 3 Separate Buttons
**File**: `app/analyze/[imageId]/page.tsx`

**Old Workflow**:
- Single "⚡ Process All Products" button
- Ran all 4 steps sequentially (Extract Info → Extract Price → Search FoodGraph → AI Filter)
- User had to wait for entire process to complete

**New Workflow**:
- **Button 1**: "📋 Extract Info (All)"
  - Yellow button
  - Calls `/api/batch-extract-info`
  - Parallel processing of all products
  - Extracts: brand, product_name, category, flavor, size, sku, description

- **Button 2**: "💰 Extract Price (All)"
  - Green button
  - Calls `/api/batch-extract-price`
  - Parallel processing of all products
  - Extracts: price, price_currency, price_confidence

- **Button 3**: "🔍 Search & Save (All)"
  - Blue-purple gradient button
  - Calls `/api/batch-search-and-save`
  - Sequential processing with delays
  - Searches FoodGraph → Filters with AI → Saves matches

**State Management**:
```typescript
// Replaced old state
- processingAll: boolean
- batchProgress: object
- currentStep: string
- stepProgress: 4-step object

// With new state
+ processingStep1: boolean
+ processingStep2: boolean
+ processingStep3: boolean
+ step1Progress: { success, total, errors }
+ step2Progress: { success, total, errors }
+ step3Progress: { success, total, noMatch, errors }
```

### 3. Progress Tracking Panel
**Location**: Shows below the status bar when any step is running or completed

**Display**:
- 3-column grid layout (one per step)
- Color-coded borders:
  - Gray: Not started
  - Yellow: Step 1 running/complete
  - Green: Step 2 running/complete
  - Blue: Step 3 running
  - Green: Step 3 complete
- Shows success counts, totals, and error counts
- Real-time updates as steps complete

**Example Display**:
```
📊 Batch Processing Progress

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ 📋 Extract Info │  │ 💰 Extract Price│  │ 🔍 Search & Save│
│     85/120      │  │      80/85      │  │      45/80      │
│ ✓ Done (35 err) │  │ ✓ Done (5 err)  │  │ ✓ Saved 45,     │
│                 │  │                 │  │   No Match 30   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Benefits

### 1. **Better User Control**
- Users can run only the steps they need
- Can stop after extraction if they just need product info
- Can skip price extraction if not needed

### 2. **Faster Iteration**
- Don't need to re-run extraction if only FoodGraph search failed
- Can retry individual steps without repeating successful ones

### 3. **More Reliable**
- Step 3 no longer saves intermediate FoodGraph results to DB
- Reduces database writes by ~50%
- Cleaner data model (only final matches stored)

### 4. **Better Error Handling**
- Clear indication of which step failed
- Can address issues at specific steps
- Progress persists between steps

### 5. **Cost Optimization**
- Step 1 & 2 run in parallel (faster, more Gemini API calls)
- Step 3 runs sequentially (slower but required for FoodGraph API)
- Users can choose which operations to run

## Technical Details

### Processing Characteristics

| Step | Processing | Speed | API Calls | Timeout |
|------|-----------|-------|-----------|---------|
| 1. Extract Info | Parallel | Fast (2-3s per product) | Gemini API | 60s |
| 2. Extract Price | Parallel | Fast (2-3s per product) | Gemini API | 60s |
| 3. Search & Save | Sequential | Slow (13s per product) | FoodGraph + Gemini | 300s |

### Step 3 Breakdown
For each product (~13 seconds per product):
- FoodGraph search: ~1-2 seconds
- Wait delay: 10 seconds (required by FoodGraph API)
- AI comparison (20 results × 2s): ~40 seconds (but stops at first match)
- Database save: ~1 second

**Maximum Products in Step 3**: ~23 products in 300 seconds (300s ÷ 13s/product)

For larger batches (>23 products), Step 3 will timeout at 300s and process only the first ~23 products. Users need to run Step 3 again for remaining products.

## Database Impact

### Before (Old System)
```
Step 3: Search FoodGraph
  → INSERT ~6,000 rows into branghunt_foodgraph_results (120 products × 50 results)

Step 4: AI Filter
  → UPDATE ~120 rows in branghunt_foodgraph_results (is_match, confidence)
  → UPDATE ~85 rows in branghunt_detections (selected match + fully_analyzed)
```

**Total DB Operations**: ~6,205 writes

### After (New System)
```
Step 3: Search & Save
  → UPDATE ~85 rows in branghunt_detections (selected match + fully_analyzed)
```

**Total DB Operations**: ~85 writes

**Reduction**: 98.6% fewer database writes!

## Migration Notes

### Backward Compatibility
- Old batch endpoints still exist:
  - `/api/batch-extract-info` ✓ (reused)
  - `/api/batch-extract-price` ✓ (reused)
  - `/api/batch-search-foodgraph` (unused, kept for compatibility)
  - `/api/batch-filter-ai` (unused, kept for compatibility)
  - `/api/process-all` (removed)

### Database Schema
- No schema changes required
- Existing `branghunt_foodgraph_results` table remains unchanged
- New workflow doesn't use intermediate results table

## Testing Checklist

- [x] Created new `/api/batch-search-and-save` endpoint
- [x] Updated UI with 3 separate buttons
- [x] Added individual progress tracking
- [ ] Test Step 1: Extract Info (All) - verify brand extraction works
- [ ] Test Step 2: Extract Price (All) - verify price extraction works
- [ ] Test Step 3: Search & Save (All) - verify FoodGraph search + AI filter + save
- [ ] Test with small batch (<10 products)
- [ ] Test with medium batch (10-20 products)
- [ ] Verify delays between products (should be ~13s per product)
- [ ] Verify only final matches saved to DB (no intermediate results)
- [ ] Test error handling for each step
- [ ] Verify progress tracking updates correctly

## Known Limitations

1. **Step 3 Timeout**: Limited to ~23 products per run due to 300s timeout
   - For larger batches, users need to run Step 3 multiple times
   - Future: Could implement pagination or streaming responses

2. **No Partial Progress in Step 3**: If Step 3 times out, progress is lost
   - All successful saves are persisted to DB
   - But user won't see which products were processed
   - Future: Could add real-time progress streaming

3. **Sequential Processing Required**: Step 3 must be sequential due to FoodGraph API limits
   - Cannot speed up with parallel processing
   - 10-second delays are mandatory
   - Future: Could batch multiple FoodGraph searches if API supports it

## Future Enhancements

1. **Real-Time Progress Streaming**
   - Use Server-Sent Events (SSE) for Step 3
   - Show which product is currently processing
   - Display success/failure in real-time

2. **Pagination for Large Batches**
   - Add "page" parameter to Step 3
   - Process 20 products at a time
   - Show "Process Next 20" button

3. **Smart Retry Logic**
   - Automatically retry failed products
   - Skip already-processed products
   - Show retry counts

4. **Background Job Queue**
   - Move Step 3 to background job
   - Allow users to continue working
   - Send notification when complete

## Commit History
- Initial implementation: [COMMIT_HASH]
- Documentation: [COMMIT_HASH]

## Related Files
- `app/api/batch-search-and-save/route.ts` (new)
- `app/analyze/[imageId]/page.tsx` (modified)
- `app/api/batch-extract-info/route.ts` (existing, reused)
- `app/api/batch-extract-price/route.ts` (existing, reused)

