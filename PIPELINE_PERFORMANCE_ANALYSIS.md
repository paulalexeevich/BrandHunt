# Pipeline 2 Performance Analysis Tool

**Created:** November 12, 2025  
**Purpose:** Analyze bottlenecks in Pipeline 2 (Visual-Only): Search → Pre-filter → Visual Match → Save

## Overview

This tool provides detailed timing measurements for each step in Pipeline 2, helping identify performance bottlenecks and optimization opportunities.

## Pipeline 2 Steps

1. **SEARCH** - FoodGraph API call to find matching products
2. **PRE-FILTER** - Local algorithm to filter results by brand/size/retailer similarity
3. **VISUAL MATCH** - Visual comparison using Gemini API
   - **Crop** - Extract product image from shelf photo
   - **Gemini** - API call to compare images and select best match
4. **SAVE** - Database operations to store the result

## Files Created

### 1. Performance Test Script
**File:** `test-pipeline-performance.js`

Node.js script that:
- Processes a single product for accurate timing
- Receives SSE timing events from instrumented API
- Displays detailed performance breakdown
- Identifies the biggest bottleneck

### 2. Instrumented API Endpoint
**File:** `app/api/batch-search-visual-timed/route.ts`

Special version of the Pipeline 2 API that:
- Sends timing events via Server-Sent Events (SSE)
- Measures each step: start time, end time, duration
- Includes sub-step timing (crop vs Gemini API call)
- Maintains compatibility with original API

## Usage

### Step 1: Start Development Server

```bash
npm run dev
```

Wait for server to start on `http://localhost:3000`

### Step 2: Get Image ID

You need an image ID that has at least one detection with `brand_name` extracted.

**Option A - From UI:**
1. Go to Projects page
2. Click on a project
3. Click on an image
4. Copy image ID from URL: `/analyze/[imageId]`

**Option B - From Database:**
```sql
SELECT i.id, i.original_filename, COUNT(d.id) as detection_count
FROM branghunt_images i
JOIN branghunt_detections d ON d.image_id = i.id
WHERE d.brand_name IS NOT NULL
GROUP BY i.id
ORDER BY COUNT(d.id) DESC
LIMIT 5;
```

### Step 3: Run Performance Test

```bash
# Test first product in image
node test-pipeline-performance.js <imageId>

# Test specific product by detection index
node test-pipeline-performance.js <imageId> <detectionIndex>
```

**Example:**
```bash
# Test first product
node test-pipeline-performance.js abc123-def456-ghi789

# Test product #5
node test-pipeline-performance.js abc123-def456-ghi789 5
```

## Sample Output

```
🔬 PIPELINE 2 PERFORMANCE ANALYSIS
================================================================================
📸 Image ID: abc123-def456-ghi789
🎯 Testing single product: #1
================================================================================

🔍 Testing Product: ATHENA
--------------------------------------------------------------------------------
✅ SEARCH: 2347ms (Found 100 results)
✅ PRE-FILTER: 42ms (Filtered to 8 results)
✅ CROP IMAGE: 156ms (240x320px)
✅ GEMINI VISUAL MATCH: 8234ms (Confidence: 85%)
✅ VISUAL MATCH TOTAL: 8390ms
✅ SAVE: 89ms

================================================================================
📊 PERFORMANCE BREAKDOWN
================================================================================

1️⃣  SEARCH (FoodGraph API)
   2347ms (21.8%) ██████████
   
2️⃣  PRE-FILTER (Local algorithm)
   42ms (0.4%) 

3️⃣  VISUAL MATCH
   8390ms (77.9%) ███████████████████████████████████████
   ├─ Crop Image
   156ms (1.4%) ▓
   └─ Gemini API Call
   8234ms (76.4%) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

4️⃣  SAVE (Database operations)
   89ms (0.8%) 

--------------------------------------------------------------------------------
⏱️  TOTAL TIME: 10768ms (10.77s)
================================================================================

📈 RESULTS
================================================================================
✅ Success: 1
⏸️  No Match: 0
❌ Errors: 0
================================================================================

🎯 BOTTLENECK ANALYSIS
================================================================================
🔴 1. Visual Match - Gemini: 8234ms
🟡 2. Search (FoodGraph API): 2347ms
🟢 3. Visual Match - Crop: 156ms
🟢 4. Save (Database): 89ms
🟢 5. Pre-filter (Local): 42ms
================================================================================
🔴 BIGGEST BOTTLENECK: Visual Match - Gemini (8234ms)
================================================================================
```

## Understanding Results

### Timing Breakdown

Each step shows:
- **Duration** in milliseconds
- **Percentage** of total time
- **Visual bar** representing relative time

### Common Patterns

#### Pattern 1: Gemini Dominates (Most Common)
```
Search: 2000ms (20%)
Pre-filter: 50ms (0.5%)
Visual Match - Gemini: 8000ms (78%)
Save: 100ms (1.5%)
```
**Bottleneck:** Gemini API call  
**Cause:** External API latency, number of candidates  
**Solution:** Reduce candidates passed to Gemini, optimize pre-filter

#### Pattern 2: Search Dominates
```
Search: 9000ms (85%)
Pre-filter: 50ms (0.5%)
Visual Match - Gemini: 1500ms (14%)
Save: 100ms (0.5%)
```
**Bottleneck:** FoodGraph API  
**Cause:** Large result set, slow API response  
**Solution:** More specific search terms, smaller result limit

#### Pattern 3: Balanced (Rare)
```
Search: 3000ms (40%)
Pre-filter: 100ms (1%)
Visual Match - Gemini: 4000ms (53%)
Save: 150ms (2%)
```
**Bottleneck:** None dominant  
**Cause:** Well-optimized pipeline  
**Result:** Both APIs contributing equally

### Red Flags

🚨 **Search > 5000ms** - FoodGraph API slow or returning too many results  
🚨 **Pre-filter > 500ms** - Algorithm inefficient, too many results to filter  
🚨 **Gemini > 15000ms** - Too many candidates or API slowdown  
🚨 **Crop > 500ms** - Image too large, sharp processing slow  
🚨 **Save > 500ms** - Database slow or network issues

## Optimization Strategies

### 1. Reduce Gemini Candidates

Current flow passes all pre-filtered results to Gemini. Consider:

- **Limit top N candidates:** Pass only 5-10 best matches from pre-filter
- **Stricter pre-filter:** Increase similarity thresholds to reduce candidates
- **Two-stage visual matching:** Quick visual pass, then detailed analysis

**Example Impact:**
- 20 candidates → 8s Gemini call
- 5 candidates → 3s Gemini call
- **Savings: 5s (62% faster)**

### 2. Optimize Search Query

More specific search terms = fewer results = faster processing.

Current:
```javascript
await searchProducts(detection.brand_name)
// Returns 100 results → slow
```

Optimized:
```javascript
await searchProducts(detection.brand_name, {
  productName: detection.product_name,
  size: detection.size
})
// Returns 20-30 results → faster
```

### 3. Parallel Processing

Process multiple products simultaneously:

```bash
# Current: 1 product at a time
concurrency: 1
10 products = 10 × 10s = 100s

# Optimized: 5 products at a time
concurrency: 5
10 products = 2 × 10s = 20s
```

### 4. Caching

Cache FoodGraph search results:
- Same brand searched multiple times → cache first result
- Potential savings: 20-50% on subsequent products

### 5. Pre-filter Optimization

Current pre-filter is already very fast (40-100ms), but could improve by:
- Early exit on perfect matches
- Skip size comparison if confidence too low
- Parallel string comparisons

## Running Multiple Tests

Test multiple products to get average performance:

```bash
#!/bin/bash
# test-multiple-products.sh

IMAGE_ID="abc123-def456-ghi789"

for INDEX in 1 2 3 4 5; do
  echo "Testing product #$INDEX..."
  node test-pipeline-performance.js $IMAGE_ID $INDEX
  echo ""
  sleep 2
done
```

## Comparing Pipelines

To compare Pipeline 1 (AI Filter) vs Pipeline 2 (Visual-Only):

### Pipeline 1 Steps:
1. Search (2000ms)
2. Pre-filter (50ms)
3. **AI Filter** - Compare each candidate individually (12×500ms = 6000ms)
4. Visual Match - Only if 2+ matches (8000ms)
5. Save (100ms)
**Total: ~16s for 12 candidates**

### Pipeline 2 Steps:
1. Search (2000ms)
2. Pre-filter (50ms)
3. Visual Match - Compare all at once (8000ms)
4. Save (100ms)
**Total: ~10s**

**Pipeline 2 is 37% faster** because it skips AI Filter step.

## Troubleshooting

### "No products to process"
- Image has no detections with `brand_name`
- Run extraction first: Batch Extract Info

### "Invalid bounding box coordinates"
- Detection missing y0, x0, y1, x1 fields
- Run detection first: Batch Detect Project

### API returns 404
- Image ID doesn't exist or not authenticated
- Check image ID is correct

### Timing events not appearing
- Check dev server is running
- Check browser console for SSE connection errors
- Verify `runtime = 'nodejs'` is set in API route

## Next Steps

After identifying bottleneck:

1. **If Gemini is bottleneck (most common):**
   - Implement candidate limiting (pass only top 5-10 to Gemini)
   - Increase pre-filter threshold to be more aggressive
   - Consider two-stage approach

2. **If Search is bottleneck:**
   - Add more specific search parameters
   - Reduce max results from 100 to 50
   - Implement search result caching

3. **If Save is bottleneck:**
   - Check database performance
   - Reduce number of fields being saved
   - Batch multiple saves together

## Git Commit

```bash
git add test-pipeline-performance.js
git add app/api/batch-search-visual-timed/route.ts
git add PIPELINE_PERFORMANCE_ANALYSIS.md
git commit -m "feat: add Pipeline 2 performance analysis tool with detailed timing"
```

## Related Documentation

- `TWO_PIPELINE_APPROACH.md` - Overview of Pipeline 1 vs Pipeline 2
- `PREFILTER_LOGIC_VALIDATION.md` - Pre-filter algorithm details
- `VISUAL_MATCH_SELECTION_FEATURE.md` - Visual matching implementation
- `BATCH_PROCESSING_SYSTEM.md` - Batch processing architecture

## Summary

This tool provides:
- ✅ Detailed timing for each pipeline step
- ✅ Sub-step timing (crop vs Gemini)
- ✅ Visual performance breakdown with bars
- ✅ Automatic bottleneck identification
- ✅ Actionable optimization recommendations

Use it to:
- Identify slow steps in Pipeline 2
- Compare performance across products
- Validate optimization attempts
- Debug performance issues

**Key Insight:** Most bottlenecks are in Gemini API calls. Reducing the number of candidates passed to Gemini is the #1 optimization opportunity.

