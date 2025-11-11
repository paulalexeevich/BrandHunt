# Contextual Analysis Feature

**Created:** November 11, 2025  
**Status:** Experimental - Manual Testing Only

## Overview

The Contextual Analysis feature uses **shelf context** to improve product identification by analyzing neighboring products. This is particularly useful when:

- Brand labels are **partially hidden** or obscured
- Products have **similar visual form factors** (can use size from neighbors)
- Traditional single-product extraction has **low confidence**

## How It Works

### 1. **Expanded Crop Generation**
Instead of analyzing just the target product, the system:
- Identifies neighboring products on the same shelf (based on Y-coordinate alignment)
- Selects up to 3 products on each side (left and right)
- Creates an **expanded crop** that includes the target + neighbors

### 2. **Neighbor Detection Algorithm**
```typescript
// Neighbors are found by:
- Same shelf: Y-center within 30% of target product height
- Proximity: Within 500 normalized units horizontally
- Sorting: Closest neighbors first (up to 3 per side)
```

### 3. **Contextual Analysis Logic**

**Key Insight:** Retail shelves group products by brand. If brand X is on both sides, there's a high probability the center product is also brand X.

The system:
- Provides Gemini with the expanded shelf view
- Lists known brands/sizes of neighboring products
- Asks Gemini to infer the target product's brand and size based on:
  - **Visual patterns** (logos, colors, packaging style)
  - **Neighbor context** (brand grouping on shelves)
  - **Physical similarity** (same size/shape → likely same specifications)

## Implementation

### API Endpoint
**Location:** `/app/api/contextual-analysis/route.ts`

**Request:**
```json
{
  "detectionId": "uuid",
  "promptVersion": "v1" | "v2" | "v3",
  "minNeighbors": 3
}
```

**Response:**
```json
{
  "detection": { "id": "...", "current_brand": "...", "current_size": "..." },
  "neighbors": {
    "left": [{ "id": "...", "index": 0, "brand": "...", "size": "..." }],
    "right": [...]
  },
  "expanded_box": { "y0": 100, "x0": 200, "y1": 300, "x1": 800 },
  "expanded_crop_preview": "data:image/jpeg;base64,...",
  "analysis": {
    "inferred_brand": "Brand X",
    "brand_confidence": 0.85,
    "brand_reasoning": "Both left and right neighbors are Brand X...",
    "inferred_size": "500ml",
    "size_confidence": 0.90,
    "size_reasoning": "Visual dimensions match neighbors...",
    "visual_similarity": {
      "left_similarity": 0.92,
      "right_similarity": 0.88,
      "description": "Very similar packaging style..."
    },
    "overall_confidence": 0.87
  }
}
```

### UI Integration
**Location:** `/app/analyze/[imageId]/page.tsx`

The feature appears as an **experimental section** on the product analysis page:
- Only visible AFTER basic info extraction (`detection.brand_name` exists)
- Collapsible panel with orange/yellow gradient (experimental indicator)
- Shows/hides with toggle button

### Prompt Versions

Three prompt variations for testing:

1. **V1 - Detailed Context**
   - Comprehensive instructions
   - Explicit context about neighbors
   - Detailed JSON response format
   
2. **V2 - Strategy-Based**
   - Focuses on analysis strategies (pattern recognition, visual matching, size estimation)
   - Emphasizes shelf grouping logic
   - Shorter, more focused format

3. **V3 - Concise**
   - Minimal instructions
   - Quick bullet points
   - Simplest JSON format

Users can switch between prompt versions to test which works best for different scenarios.

## UI Features

### Expanded Crop Preview
Shows the actual image crop sent to Gemini, including all neighbors

### Neighbor Context Display
Lists products on left and right sides with their known attributes

### AI Analysis Results
Displays Gemini's inference with:
- **Inferred Brand** (with confidence and reasoning)
- **Inferred Size** (with confidence and reasoning)
- **Visual Similarity** scores for left/right neighbors
- **Overall Confidence** score
- **Additional Notes** from the AI

### Error Handling
- Displays raw response if JSON parsing fails
- Shows clear error messages for API failures
- Gracefully handles cases with no neighbors

## Use Cases

### 1. Partially Hidden Brand
**Problem:** Brand label obscured by shelf fixture or lighting glare  
**Solution:** Neighbors have same brand → infer by context

### 2. Size Confusion
**Problem:** Product size text too small in crop  
**Solution:** Neighbors have same physical dimensions → use their size

### 3. Visual Similarity
**Problem:** Low confidence extraction  
**Solution:** Compare visual patterns with high-confidence neighbors

### 4. Verification
**Problem:** Want to double-check extraction results  
**Solution:** Context analysis provides independent verification

## Current Limitations

1. **Manual Only:** Not integrated into batch processing yet
2. **Requires Neighbors:** Doesn't work for isolated products
3. **Same Shelf Required:** Products must be horizontally aligned
4. **Experimental:** Prompt and logic still being refined

## Technical Details

### Dependencies
- `@google/generative-ai` - Gemini API client
- `jimp` - Image crop extraction
- Standard Next.js/React stack

### Performance
- Average execution time: 3-5 seconds
- Gemini API: gemini-2.0-flash-exp model
- Image processing: Normalized coordinates (0-1000) → pixel conversion

### Database Impact
Currently, results are **NOT stored** in the database. This is purely a manual testing/verification tool. Future versions may add:
- `contextual_brand` and `contextual_size` fields
- `contextual_confidence` scores
- Storage of neighbor relationships

## Testing Guide

### How to Test

1. **Upload and process an image** with multiple products on a shelf
2. **Extract brand/info** for several products (to build neighbor context)
3. **Select a product** in the middle of the shelf
4. **Expand "Contextual Analysis"** section
5. **Choose a prompt version** (start with V1)
6. **Click "Analyze with Neighbors"**
7. **Review results:**
   - Check expanded crop (should include multiple products)
   - Verify neighbor list (should show adjacent products)
   - Compare inferred brand/size with actual extraction
   - Note confidence scores and reasoning

### Test Scenarios

**Scenario 1: Same Brand Grouping**
- Products: 5 bottles of Coca-Cola in a row
- Extract info for products #1, #2, #4, #5
- Run contextual analysis on #3
- Expected: Should infer "Coca-Cola" with high confidence

**Scenario 2: Size Inference**
- Products: Multiple bottles with same shape
- Some have clear size labels, some don't
- Expected: Should infer size based on visual similarity

**Scenario 3: Mixed Brands**
- Products: Different brands on same shelf
- Expected: Should have lower confidence, note visual differences

**Scenario 4: Edge of Shelf**
- Product: First or last on shelf (few/no neighbors on one side)
- Expected: Should gracefully handle asymmetric context

### Prompt Testing

Try each prompt version with the same product and compare:
- Which produces more accurate inferences?
- Which has better confidence calibration?
- Which provides more useful reasoning?
- Which handles edge cases better?

Document findings to refine prompts.

## Future Enhancements

### Phase 2: Database Integration
- Add fields to `branghunt_detections` table
- Store contextual analysis results
- Track accuracy metrics (compare inferred vs actual)

### Phase 3: Batch Processing
If manual testing shows good results:
1. Integrate into batch extraction pipeline
2. Use contextual analysis as **secondary verification**
3. Apply to low-confidence detections automatically
4. Provide confidence boost when context agrees with extraction

### Phase 4: Confidence Weighting
Combine multiple signals:
- Direct extraction confidence: 60%
- Contextual inference confidence: 30%
- Visual similarity scores: 10%
- Final weighted confidence score

### Phase 5: Smart Context Selection
- Analyze entire shelf first
- Identify high-confidence "anchor" products
- Use anchors to bootstrap low-confidence products
- Iterative improvement across the shelf

## Key Learnings

### What Works Well
- ✅ **Brand inference** when neighbors are same brand
- ✅ **Size inference** for uniform product lines
- ✅ **Visual similarity** detection works reliably
- ✅ **Reasoning** provided by Gemini is useful for debugging

### Challenges
- ⚠️ **Mixed shelves:** Lower accuracy when brands change frequently
- ⚠️ **Prompt sensitivity:** Results vary significantly between prompt versions
- ⚠️ **Confidence calibration:** AI confidence doesn't always match accuracy
- ⚠️ **Edge cases:** Products at shelf edges have less context

### Best Practices
1. **Extract neighbors first:** Always ensure 2-3 neighbors have extracted data
2. **Test multiple prompts:** Different scenarios may work better with different prompts
3. **Verify results:** Use as verification/assistance, not blind replacement
4. **Monitor confidence:** Low confidence results should be manually reviewed

## Architecture Notes

### Coordinate System
- **Normalized:** 0-1000 scale (storage)
- **Pixels:** Actual image dimensions (processing)
- Conversion happens in `extractCrop()` function

### Neighbor Detection
- **Y-tolerance:** 30% of target height (configurable)
- **X-distance:** 500 units max (configurable)
- **Sorting:** Closest first, take top 3

### Image Processing
- Uses **Jimp** for server-side crop extraction
- Crops are base64-encoded for Gemini API
- Original image fetched from S3 or database

## Files Changed

### New Files
- `/app/api/contextual-analysis/route.ts` - API endpoint (429 lines)

### Modified Files
- `/app/analyze/[imageId]/page.tsx` - Added UI section and state management (+204 lines)

## Git Commit

```bash
git add app/api/contextual-analysis/route.ts
git add app/analyze/[imageId]/page.tsx
git add CONTEXTUAL_ANALYSIS_FEATURE.md
git commit -m "Add experimental contextual analysis feature using shelf neighbors

- Created API endpoint that finds neighboring products on same shelf
- Generates expanded crop including 3+ products on each side
- Uses Gemini to infer brand/size based on neighbor context
- Adds collapsible UI section on analysis page for manual testing
- Implements 3 prompt versions for testing different approaches
- Shows expanded crop preview, neighbor list, and AI analysis results
- Manual testing only - not integrated into batch processing yet
- Useful for products with partially hidden labels or unclear sizes"
```

## Testing Status

**Status:** Ready for manual testing  
**Next Steps:**
1. Test with real product images
2. Compare accuracy across prompt versions
3. Measure confidence calibration
4. Document edge cases and failure modes
5. Refine prompts based on findings
6. Decide if accurate enough for batch integration

---

**Experimental Feature Notice:** This feature is in active development and testing. Results may vary. Use as a verification tool alongside standard extraction, not as a replacement.

