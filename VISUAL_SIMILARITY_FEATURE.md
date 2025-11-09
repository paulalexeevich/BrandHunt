# Visual Similarity Feature

## Overview

Added **visual similarity score** (0-100%) as a third metric in AI product comparison, separate from match status and confidence score.

## Problem

Previously, AI filtering only returned:
- `isMatch`: boolean (are they the same product?)
- `confidence`: 0-1 (how confident in the assessment?)

This made it difficult to understand **how close** non-matching products were. For example:
- Same brand, different scent (85% similar) → NO MATCH
- Completely different brand (20% similar) → NO MATCH

Both showed "NO MATCH" but user couldn't see that first one was much closer.

## Solution

Added `visualSimilarity` metric that measures **how similar images LOOK**, independent of whether they're the same product.

### Three Separate Metrics

| Metric | Type | Meaning | Example |
|--------|------|---------|---------|
| **isMatch** | boolean | Same product? | `false` (stick ≠ spray) |
| **confidence** | 0.0-1.0 | How certain? | `1.0` (very certain they're different) |
| **visualSimilarity** | 0.0-1.0 | How similar looking? | `0.65` (packaging looks similar - same brand) |

### Visual Similarity Scale

```
0.9-1.0  = Nearly identical packaging
           Same product, same variant, clear match

0.5-0.8  = Same brand, different variant
           Example: Old Spice stick vs Old Spice spray
           Similar colors, logos, design but different form

0.3-0.5  = Same brand, different product line
           Example: Old Spice deodorant vs Old Spice body wash
           Share brand identity but different categories

0.0-0.3  = Different brands
           Completely different products
```

## Implementation

### 1. Gemini API Prompt (`lib/gemini.ts`)

**Updated prompt:**

```typescript
Return a JSON object with this structure:
{
  "isMatch": true or false,
  "confidence": 0.0 to 1.0,
  "visualSimilarity": 0.0 to 1.0,
  "reason": "Brief explanation"
}

CRITICAL DEFINITIONS:
- isMatch: true only if SAME product (brand, type, variant all match)
- confidence: How certain you are about the isMatch decision
- visualSimilarity: How similar the images LOOK overall
  * Same product, same packaging = 0.9-1.0
  * Same brand, different variant = 0.5-0.8
  * Same brand, different product line = 0.3-0.5
  * Different brands = 0.0-0.3

Examples:
- Same product: {isMatch: true, confidence: 0.95, visualSimilarity: 0.95}
- Stick vs spray: {isMatch: false, confidence: 1.0, visualSimilarity: 0.65}
- Different scent: {isMatch: false, confidence: 0.9, visualSimilarity: 0.85}
- Different brands: {isMatch: false, confidence: 1.0, visualSimilarity: 0.2}
```

**Updated function signature:**

```typescript
export async function compareProductImages(
  originalImageBase64: string,
  foodgraphImageUrl: string,
  returnDetails: true
): Promise<{ 
  isMatch: boolean; 
  confidence: number; 
  visualSimilarity: number; 
  reason: string 
}>;
```

### 2. Backend API (`app/api/filter-foodgraph/route.ts`)

**Capture visualSimilarity:**

```typescript
const comparisonDetails = await compareProductImages(
  croppedImageBase64,
  result.front_image_url,
  true
);

console.log(`✅ Result: ${comparisonDetails.isMatch ? 'MATCH' : 'NO MATCH'} 
  (confidence: ${comparisonDetails.confidence}, 
   visual similarity: ${comparisonDetails.visualSimilarity})`);
```

**Save to database:**

```typescript
await supabase
  .from('branghunt_foodgraph_results')
  .update({ 
    is_match: isMatch,
    match_confidence: confidence,
    visual_similarity: visualSimilarity  // NEW
  })
  .eq('id', result.id);
```

**Log in top results:**

```typescript
sortedByConfidence.slice(0, 3).forEach((r, i) => {
  console.log(`${i + 1}. ${r.product_name} - ${r.is_match ? '✓ PASS' : '✗ FAIL'} 
    (confidence: ${Math.round(r.match_confidence * 100)}%, 
     visual: ${Math.round(r.visual_similarity * 100)}%)`);
});
```

### 3. Frontend Display (`app/analyze/[imageId]/page.tsx`)

**AI Assessment Box:**

```tsx
<div className="bg-green-50 border-green-300">
  <div className="flex justify-between">
    <p>🤖 AI Assessment</p>
    <p>95% Match</p>
  </div>
  
  {/* Visual Similarity - NEW */}
  <div className="flex justify-between">
    <p className="text-gray-600">Visual Similarity:</p>
    <p className="font-semibold text-purple-600">95%</p>
  </div>
  
  <p className="text-gray-600 italic">
    Brand, packaging, and variant all match
  </p>
</div>
```

### 4. Database Migration

**File:** `migrations/add_visual_similarity_column.sql`

```sql
ALTER TABLE branghunt_foodgraph_results 
ADD COLUMN IF NOT EXISTS visual_similarity DECIMAL(3,2) DEFAULT NULL;

COMMENT ON COLUMN branghunt_foodgraph_results.visual_similarity IS 
'AI-generated visual similarity score (0.0-1.0) indicating how similar 
the images look, independent of whether they are the same product.';

CREATE INDEX IF NOT EXISTS idx_foodgraph_results_visual_similarity 
ON branghunt_foodgraph_results(visual_similarity DESC) 
WHERE visual_similarity IS NOT NULL;
```

## Real-World Examples

### Example 1: Perfect Match

**Product:** Degree Men Cool Rush Antiperspirant Stick

```json
{
  "isMatch": true,
  "confidence": 0.95,
  "visualSimilarity": 0.95,
  "reason": "Brand, packaging, and variant all match"
}
```

**UI Display:**
- Badge: `✓ PASS`
- Large text: `95% MATCH` (green)
- Confidence: `95% Match` (green)
- Visual Similarity: `95%` (purple)

### Example 2: Same Brand, Different Form

**Detected:** Old Spice Stick Deodorant  
**FoodGraph:** Old Spice Spray Deodorant

```json
{
  "isMatch": false,
  "confidence": 1.0,
  "visualSimilarity": 0.65,
  "reason": "Same brand (Old Spice) but different form factor (stick vs spray)"
}
```

**UI Display:**
- Badge: `✗ FAIL`
- Large text: `NO MATCH` (red)
- Confidence: `No Match` (red)
- Visual Similarity: `65%` (purple)

**User insight:** "Ah, it found Old Spice but the wrong type. Makes sense!"

### Example 3: Same Brand, Different Scent

**Detected:** Dove Original Clean Deodorant  
**FoodGraph:** Dove Powder Fresh Deodorant

```json
{
  "isMatch": false,
  "confidence": 0.9,
  "visualSimilarity": 0.85,
  "reason": "Same brand and form factor but different scent variant"
}
```

**UI Display:**
- Badge: `✗ FAIL`
- Large text: `NO MATCH` (red)
- Confidence: `No Match` (red)
- Visual Similarity: `85%` (purple)

**User insight:** "Very close! Right brand and type, just wrong scent."

### Example 4: Completely Different Product

**Detected:** Coca-Cola Can  
**FoodGraph:** Pepsi Can

```json
{
  "isMatch": false,
  "confidence": 1.0,
  "visualSimilarity": 0.2,
  "reason": "Different brands - Coca-Cola vs Pepsi"
}
```

**UI Display:**
- Badge: `✗ FAIL`
- Large text: `NO MATCH` (red)
- Confidence: `No Match` (red)
- Visual Similarity: `20%` (purple)

**User insight:** "Not even close. Wrong brand entirely."

## Benefits

### 1. Better User Understanding

Users can now see:
- **Why** products didn't match
- **How close** they were to matching
- Whether to keep looking or adjust search

### 2. Debugging AI Decisions

Developers can analyze:
- Products with high visual similarity but no match → different variants
- Products with low visual similarity but match → poor image quality
- Patterns in false negatives/positives

### 3. Future Enhancements

Opens possibilities for:
- **Fuzzy matching:** "No exact match, but here are 3 similar products (80%+ visual similarity)"
- **Variant detection:** "Found different size of same product (85% similar)"
- **Smart suggestions:** "Detected product not in database, but here are visually similar alternatives"
- **Quality metrics:** Sort results by visual similarity to show closest matches first

## Testing

To test this feature:

1. **Upload a shelf image**
2. **Detect products** (YOLO or Gemini)
3. **Click a product** to analyze
4. **Extract Info** (brand/product/size)
5. **Search FoodGraph** (finds multiple results)
6. **Filter with AI** → Click and wait 10-20 seconds
7. **Check results:**
   - Products marked `✓ PASS` or `✗ FAIL`
   - Each shows confidence and visual similarity
   - Compare visual similarity across passing and failing results

### Expected Patterns

- **Passing products (✓ PASS):**
  - Confidence: 80-100%
  - Visual Similarity: 85-100%
  - Reason: "Brand and variant match"

- **Close non-matches (✗ FAIL, high visual):**
  - Confidence: 80-100%
  - Visual Similarity: 60-85%
  - Reason: "Same brand but different variant"

- **Far non-matches (✗ FAIL, low visual):**
  - Confidence: 80-100%
  - Visual Similarity: 0-30%
  - Reason: "Different brands"

## Console Logging

Backend logs now show all three metrics:

```
🔍 Starting image comparison for 4 FoodGraph results...
   ✅ Result Degree Men Cool Rush: MATCH 
      (confidence: 0.95, visual similarity: 0.95)
   ✅ Result Degree Men Cool Rush Spray: NO MATCH 
      (confidence: 1.0, visual similarity: 0.65)
   ✅ Result Old Spice Classic: NO MATCH 
      (confidence: 0.9, visual similarity: 0.3)
      
✅ Image filtering complete: 1/4 products passed 70% threshold
   Showing all 4 results with confidence scores
   
   1. Degree Men Cool Rush - ✓ PASS (confidence: 95%, visual: 95%)
   2. Degree Men Spray - ✗ FAIL (confidence: 100%, visual: 65%)
   3. Old Spice Classic - ✗ FAIL (confidence: 90%, visual: 30%)
```

## Related Files

- `lib/gemini.ts` - Gemini API comparison logic
- `app/api/filter-foodgraph/route.ts` - Backend filtering API
- `app/analyze/[imageId]/page.tsx` - Frontend UI display
- `migrations/add_visual_similarity_column.sql` - Database schema
- `CONFIDENCE_QUICK_REFERENCE.md` - Related confidence metrics guide

## Commit

**Commit:** `ee724a1`  
**Date:** November 9, 2025  
**Title:** Add visual similarity score to AI filtering

