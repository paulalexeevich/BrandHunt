# Real-Time Batch Processing State Updates Fix

**Date:** November 6, 2025  
**Commit:** 32f9e64

## Problem

During bulk batch processing (Step 3: Search & Save), when products were saved to the database with `fully_analyzed = true`, the UI still showed manual action buttons (🔍 Search FoodGraph, 🤖 Filter with AI) for already-completed products. Users could click on Product #3 that was already saved and still see the Search button, causing confusion.

### Root Cause

The analyze page only reloaded detection data from the database **after the entire batch completed** via the `fetchImage()` call on line 655. While individual products were being saved during streaming progress updates, the local React state (`detections`) wasn't being updated until all products finished.

**Timeline of issue:**
1. Batch process starts for 107 products
2. Product #3 completes and is saved to DB with `fully_analyzed = true`
3. User clicks on Product #3 bounding box
4. UI shows old state where `fully_analyzed = false/null`
5. Manual "Search FoodGraph" button still visible (shouldn't be)
6. User must wait for all 107 products to finish before UI updates

## Solution

Added real-time state updates during Server-Sent Events (SSE) streaming in `handleSearchAndSaveAll()` function.

### Implementation

**File:** `app/analyze/[imageId]/page.tsx`  
**Lines:** 646-677

```typescript
// Update individual detection when it completes (stage='done' or stage='error')
if (data.stage === 'done' || data.stage === 'error' || data.stage === 'no-match') {
  // Reload the specific detection from database to get saved match data
  if (data.stage === 'done') {
    // Find the detection ID for this index
    const detectionToReload = detections[data.detectionIndex];
    if (detectionToReload) {
      fetch(`/api/results/${resolvedParams.imageId}`)
        .then(res => res.json())
        .then(refreshedData => {
          if (refreshedData.detections) {
            // Update just this one detection with fresh data from DB
            setDetections(prev => prev.map((det, idx) => {
              if (idx === data.detectionIndex) {
                return refreshedData.detections[idx];
              }
              return det;
            }));
          }
        })
        .catch(err => console.error('Failed to refresh detection:', err));
    }
  } else {
    // For errors/no-match, just update the fully_analyzed flag
    setDetections(prev => prev.map((det, idx) => {
      if (idx === data.detectionIndex) {
        return { ...det, fully_analyzed: false };
      }
      return det;
    }));
  }
}
```

### How It Works

1. **SSE Progress Updates:** Backend sends `stage='done'` when a product is saved successfully
2. **Immediate Reload:** Frontend fetches fresh detection data from `/api/results/${imageId}`
3. **Selective Update:** Only updates the specific detection at `data.detectionIndex`
4. **Complete Data:** Gets all saved match fields (`selected_foodgraph_*`) from database
5. **UI Reflects State:** Buttons hide, green "Saved FoodGraph Match" card appears immediately

### Behavior Changes

#### Before Fix
- Product saves → state unchanged until batch completes
- User sees old UI with manual action buttons still available
- Must wait 5-10 minutes for 107 products to finish before UI updates

#### After Fix
- Product saves → immediately reloaded from DB
- UI updates within 1-2 seconds showing:
  - ✓ Green checkmark in progress indicators
  - Hide "Search FoodGraph" and "Filter with AI" buttons
  - Show "Saved FoodGraph Match" card with product details
- Each product reflects real-time status during batch processing

## Technical Details

### Data Flow

```
Batch Processing (Backend)
    ↓
Save product with fully_analyzed=true
    ↓
Send SSE: {type: 'progress', stage: 'done', detectionIndex: 2}
    ↓
Frontend receives progress update
    ↓
Fetch /api/results/{imageId}
    ↓
Extract updated detection at index 2
    ↓
Update detections state with fresh data
    ↓
React re-renders
    ↓
Button conditions check detection.fully_analyzed === true
    ↓
Buttons hidden, saved match card appears
```

### Button Visibility Logic

**File:** `app/analyze/[imageId]/page.tsx`  
**Line:** 1155

```typescript
{detection.brand_name && foodgraphResults.length === 0 && !detection.fully_analyzed && (
  <button onClick={handleSearchFoodGraph}>
    🔍 Search FoodGraph
  </button>
)}
```

When `detection.fully_analyzed` changes from `false` → `true`, the button is hidden automatically.

## Performance Considerations

### API Call Frequency
- One `/api/results/${imageId}` call per completed product
- With CONCURRENCY_LIMIT=3, max 3 calls within 5-second window
- Each call returns full image + all detections (~5-10KB)

### Alternative Approaches Considered

1. **Include saved data in SSE progress updates**
   - Would require modifying backend to send full detection object
   - More complex, requires protocol changes
   - Chose simpler approach: fetch from existing API

2. **Only update fully_analyzed flag (no API call)**
   - Faster but incomplete: buttons hide but saved match card doesn't show
   - Poor UX: user sees incomplete state until batch finishes

3. **Fetch single detection endpoint**
   - Would need new API: `/api/detections/${detectionId}`
   - More efficient but requires new backend code
   - Existing `/api/results` works fine for current scale

## Testing

### Manual Test Case

1. Upload image with 10+ products
2. Run "📋 Extract Info (X)" batch
3. Run "🔍 Search & Save (X)" batch
4. While batch is running:
   - Click on Product #3 bounding box
   - Observe progress updates showing "🔍 searching" → "🤖 filtering" → "💾 saving"
   - **Expected:** When Product #3 shows "✓ done", buttons disappear within 1-2 seconds
   - **Expected:** Green "Saved FoodGraph Match" card appears immediately
   - **Expected:** Progress badge shows ✓ checkmarks for all 4 stages

5. Click on Product #5 (not yet processed)
   - **Expected:** Manual action buttons still visible
   - **Expected:** Progress badges show only completed stages

## Key Learnings

1. **Real-time feedback is critical** for long-running batch operations with 100+ items
2. **SSE streaming enables granular state updates** - use it for immediate UI feedback
3. **Avoid waiting for entire batch to update state** - update progressively as items complete
4. **Fetching from existing API is simpler** than adding new data to SSE protocol
5. **Stage-based progress** (`searching` → `filtering` → `saving` → `done`) provides clear user feedback

## Related Files

- `app/analyze/[imageId]/page.tsx` - Frontend detection updates
- `app/api/batch-search-and-save/route.ts` - Backend SSE streaming
- `app/api/results/[imageId]/route.ts` - Detection fetch API

## Related Documentation

- `PARALLEL_PROCESSING_STEP3.md` - Batch processing with SSE implementation
- `BATCH_PROCESSING_REFACTOR.md` - Original 3-step batch system
- `SAVED_RESULTS_FEATURE.md` - Save result functionality

## Future Improvements

1. **Optimize API calls:** Create single detection endpoint to reduce payload size
2. **Include saved data in SSE:** Modify backend to send complete detection object in progress updates
3. **Debounce updates:** If multiple products complete simultaneously, batch state updates
4. **Cache prevention:** Add cache-busting to `/api/results` calls during batch processing
5. **Optimistic updates:** Show preliminary saved state before database confirmation

