# AI Comparison Test Tool

## Purpose

This test tool helps diagnose issues with the Gemini AI filtering in batch processing. It allows you to test a specific product comparison and see exactly what the Gemini API returns.

## Created

**Date:** November 10, 2025
**Issue:** Filter by AI not working correctly in batch processing
**Files:**
- `/app/api/test-ai-comparison/route.ts` - Test API endpoint
- `/app/test-ai/page.tsx` - Test UI

## How to Use

### Step 1: Get Test Data

1. Navigate to an analyze page with batch-processed products (e.g., `/analyze/[imageId]`)
2. Copy the **Image ID** from the URL
3. Click on a product to select it
4. Open browser console and look for the Detection ID (or query the database)

### Step 2: Run the Test

1. Go to `/test-ai` page
2. Paste the Image ID and Detection ID
3. (Optional) Specify a FoodGraph Result ID, or leave empty to test the first pre-filtered result
4. Click "Run AI Comparison Test"

### Step 3: Review Results

The test will show:

#### AI Comparison Result
- **Match Status**: `identical`, `almost_same`, or `not_match`
- **Confidence**: How certain the AI is about its decision (0-100%)
- **Visual Similarity**: How similar the images look (0-100%)
- **Reason**: AI's explanation for the match status

#### Interpretation
- **Is Match**: Whether AI considers them the same product
- **Should Auto-Save**: Whether batch processing should auto-save (only for identical)
- **Needs Review**: Whether it needs manual review (for almost_same)
- **Should Reject**: Whether it should be rejected (for not_match)

#### Product Details
- **Detected Product**: What was extracted from the shelf image
- **FoodGraph Product**: What was found in the database

## What to Look For

### ✅ Good Results

**Identical Match:**
```json
{
  "match_status": "identical",
  "confidence": 0.95,
  "visual_similarity": 0.95,
  "reason": "Brand, product name, flavor, size, and packaging all match perfectly"
}
```

**Almost Same (packaging variation):**
```json
{
  "match_status": "almost_same",
  "confidence": 0.90,
  "visual_similarity": 0.85,
  "reason": "Same Secret Clinical Complete Clean 3.8oz, minor claim text difference"
}
```

**Correctly Rejected:**
```json
{
  "match_status": "not_match",
  "confidence": 0.95,
  "visual_similarity": 0.70,
  "reason": "Same brand but different scent: Fresh vs Powder"
}
```

### ❌ Bad Results (Issues)

**False Positive:**
- Match status is `identical` but products are clearly different
- Visual similarity is high (>0.9) but products have different flavors/sizes
- Should reject but AI says "almost_same"

**False Negative:**
- Match status is `not_match` but products are clearly identical
- Visual similarity is low (<0.7) but products are the same
- Should match but AI says "not_match"

**Inconsistent Reasoning:**
- Reason contradicts the match status
- Confidence doesn't match the certainty in the reason
- Visual similarity doesn't align with the description

## API Endpoint Details

### Request

```typescript
POST /api/test-ai-comparison

{
  "imageId": "uuid",           // Required: Image containing the product
  "detectionId": "uuid",       // Required: Specific product detection
  "foodgraphResultId": "uuid"  // Optional: Specific FoodGraph result to test
}
```

### Response

```typescript
{
  "success": true,
  "test_info": {
    "image_id": "uuid",
    "detection_id": "uuid",
    "detection_index": 30,
    "foodgraph_result_id": "uuid",
    "foodgraph_result_rank": 1
  },
  "detected_product": {
    "brand": "Native",
    "product": "Native Solid Deodorant",
    "bounding_box": { y0, x0, y1, x1 },
    "cropped_image_size": "200x300px"
  },
  "foodgraph_product": {
    "brand": "Native",
    "product": "Native Solid Deodorant - Mango & Orange Blossom",
    "gtin": "00030772174180",
    "image_url": "https://..."
  },
  "ai_comparison_result": {
    "match_status": "not_match",
    "confidence": 0.95,
    "visual_similarity": 0.70,
    "reason": "Different scents: detected is unscented, FoodGraph shows Mango & Orange Blossom",
    "processing_time_ms": 2347
  },
  "interpretation": {
    "is_match": false,
    "should_auto_save": false,
    "needs_review": false,
    "should_reject": true
  }
}
```

## How It Works

1. **Fetches Data**: Loads image, detection, and FoodGraph results from database
2. **Crops Image**: Extracts just the detected product from the shelf image (like batch processing does)
3. **Calls Gemini**: Compares cropped product image vs FoodGraph product image
4. **Returns Details**: Shows exactly what Gemini API returned with interpretation

## Troubleshooting

### "Image not found"
- Check that the Image ID is correct
- Ensure you're authenticated
- Verify the image exists in the database

### "Detection not found"
- Check that the Detection ID is correct
- Ensure the detection belongs to the specified image

### "No pre-filtered FoodGraph results found"
- Ensure batch processing has run for this product
- Check that pre-filtering stage completed
- Verify results exist with `processing_stage = 'pre_filter'`

### "FoodGraph result has no image URL"
- Some FoodGraph products don't have images
- Try a different result rank
- Check the database to see which results have images

## Common Issues and Solutions

### Issue: All results show "NO MATCH" when they should match

**Possible Causes:**
1. Image cropping is wrong (comparing full shelf instead of single product)
2. Image quality is too low
3. Gemini prompt needs adjustment
4. FoodGraph images are poor quality

**Test:** Run test with a product you know is identical and check:
- Is cropped_image_size reasonable? (should be ~200-400px wide)
- Does visual_similarity make sense? (identical products should be >0.9)
- Does the reason explain why it rejected?

### Issue: Confidence is always 100% even for uncertain matches

**Possible Causes:**
1. Gemini is too confident in its assessments
2. Prompt might need to emphasize uncertainty
3. Response format might not capture nuance

**Test:** Run test with ambiguous cases (same brand, different variant) and check:
- Does confidence vary appropriately?
- Is visual_similarity different from confidence?

### Issue: Visual similarity doesn't match what you see

**Possible Causes:**
1. Gemini is comparing packaging design, not product identity
2. Scale definitions in prompt need adjustment
3. Images are being compared at wrong resolution

**Test:** Run test with visually similar but different products and check:
- Does visual_similarity reflect how similar they LOOK?
- Is match_status based on product identity, not just visual appearance?

## Integration with Batch Processing

The test endpoint uses the EXACT same code path as batch processing:
1. Same `cropImageToBoundingBox()` function
2. Same `compareProductImages()` function with `returnDetails=true`
3. Same bounding box extraction logic
4. Same image preparation

This means if the test shows correct results, batch processing should too (and vice versa).

## Commit

```
Add AI comparison test endpoint and UI

- Created /api/test-ai-comparison endpoint to test Gemini API responses
- Created /test-ai page with detailed test UI
- Tests specific detection vs FoodGraph result comparison
- Shows detailed AI reasoning, confidence, and visual similarity
- Helps diagnose batch processing AI filter issues

Commit: f63364f
```

## Next Steps

After using this test tool:

1. **If AI is working correctly**: The issue is likely in batch processing workflow, not Gemini API
2. **If AI is giving wrong results**: The issue is with Gemini prompt, image preparation, or API configuration
3. **If results are inconsistent**: May need to adjust confidence thresholds or add more validation

Use the detailed output to identify exactly where the problem is and what needs to be fixed.

