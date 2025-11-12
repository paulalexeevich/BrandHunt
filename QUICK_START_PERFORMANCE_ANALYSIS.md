# Quick Start: Pipeline 2 Performance Analysis

## 🚀 3-Minute Setup

### Step 1: Find a Test Image

```bash
node find-test-images.js
```

This will show you available images with their IDs and products. Example output:

```
1. 📸 shelf_photo_001.jpg
   Image ID: abc123-def456-ghi789
   Store: Walmart
   Products with brands: 15
   Available products for testing:
      #1: ATHENA - Hummus [○ Not analyzed]
      #5: COCA-COLA - Diet Coke [○ Not analyzed]
      
   🔬 Test this image:
      node test-pipeline-performance.js abc123-def456-ghi789
```

### Step 2: Run Performance Test

```bash
# Copy the command from output above
node test-pipeline-performance.js abc123-def456-ghi789
```

OR test specific product:

```bash
node test-pipeline-performance.js abc123-def456-ghi789 1
```

### Step 3: Analyze Results

You'll see output like:

```
📊 PERFORMANCE BREAKDOWN
================================================================================

1️⃣  SEARCH (FoodGraph API)
   2347ms (21.8%) ██████████
   
2️⃣  PRE-FILTER (Local algorithm)
   42ms (0.4%) 

3️⃣  VISUAL MATCH
   8390ms (77.9%) ███████████████████████████████████████
   ├─ Crop Image: 156ms (1.4%)
   └─ Gemini API Call: 8234ms (76.4%)

4️⃣  SAVE (Database operations)
   89ms (0.8%) 

⏱️  TOTAL TIME: 10768ms (10.77s)

🎯 BOTTLENECK ANALYSIS
🔴 BIGGEST BOTTLENECK: Visual Match - Gemini (8234ms)
```

## 🎯 What to Look For

### ✅ Good Performance (Under 10 seconds)
- Search: < 3000ms
- Pre-filter: < 100ms
- Visual Match - Gemini: < 6000ms
- Save: < 200ms

### 🟡 Moderate Performance (10-15 seconds)
- Usually means: Too many candidates passed to Gemini
- **Action:** Optimize pre-filter to reduce candidates

### 🔴 Poor Performance (Over 15 seconds)
- Usually means: FoodGraph API slow OR too many Gemini candidates
- **Action:** Check which step is bottleneck and optimize

## 🔧 Common Optimizations

### If Gemini is Bottleneck (Most Common)

**Problem:** Passing 20+ candidates to Gemini → 10+ seconds

**Solution:** Reduce candidates to top 5-10
```javascript
// In batch-search-visual/route.ts around line 376
const candidates = preFilteredResults
  .filter(r => r.front_image_url)
  .slice(0, 10) // 👈 ADD THIS: Limit to top 10
  .map(m => ({...}));
```

**Expected improvement:** 8000ms → 3000ms (62% faster)

### If Search is Bottleneck

**Problem:** FoodGraph returning 100 results → slow

**Solution:** More specific search terms
```javascript
// Use extracted product info for better search
const searchResult = await searchProducts(detection.brand_name, {
  productName: detection.product_name, // 👈 ADD THIS
  size: detection.size                  // 👈 AND THIS
});
```

**Expected improvement:** 5000ms → 2000ms (60% faster)

## 📊 Running Multiple Tests

Create a file `test-batch-performance.sh`:

```bash
#!/bin/bash
IMAGE_ID="abc123-def456-ghi789"

echo "Testing 5 products for average performance..."
for INDEX in 1 2 3 4 5; do
  echo ""
  echo "=== Testing Product #$INDEX ==="
  node test-pipeline-performance.js $IMAGE_ID $INDEX
  sleep 2
done
```

Run it:
```bash
chmod +x test-batch-performance.sh
./test-batch-performance.sh
```

## 🎓 Understanding the Stages

| Stage | What It Does | Typical Time | Optimizable? |
|-------|-------------|--------------|--------------|
| **Search** | FoodGraph API call | 2-3s | ✅ Yes - Better search terms |
| **Pre-filter** | Local text matching | 40-100ms | ⚠️ Already fast |
| **Crop** | Extract product image | 100-200ms | ⚠️ Already fast |
| **Gemini** | Visual comparison API | 5-10s | ✅ Yes - Reduce candidates |
| **Save** | Database update | 50-150ms | ⚠️ Already fast |

## 🎯 Next Steps After Analysis

1. **Identified Gemini as bottleneck?**
   - Implement candidate limiting (add `.slice(0, 10)`)
   - Test again to verify improvement
   - Commit changes with timing comparison

2. **Identified Search as bottleneck?**
   - Add productName and size to search params
   - Test again to verify improvement
   - Commit changes with timing comparison

3. **All steps fast?**
   - Great! Your pipeline is well-optimized
   - Consider increasing concurrency for batch processing
   - Test with `concurrency: 5` or `concurrency: 10`

## 💾 Save Your Learnings

After testing, create a summary:

```bash
# Create optimization log
echo "PERFORMANCE TEST RESULTS - $(date)" >> performance-log.txt
echo "Image: abc123-def456-ghi789" >> performance-log.txt
echo "Product #1: 10.8s total (Gemini: 8.2s - 76%)" >> performance-log.txt
echo "BOTTLENECK: Gemini API call" >> performance-log.txt
echo "OPTIMIZATION: Reduce candidates from 20 to 10" >> performance-log.txt
echo "" >> performance-log.txt
```

Then commit:

```bash
git add performance-log.txt
git commit -m "docs: add performance test results showing Gemini bottleneck"
```

## 📚 Full Documentation

For complete details, see: `PIPELINE_PERFORMANCE_ANALYSIS.md`

## ❓ Troubleshooting

**"No suitable images found"**
- You need to run extraction first
- Go to project → Batch Extract Info

**"API returns 404"**
- Check dev server is running (`npm run dev`)
- Verify image ID is correct

**"No timing events appearing"**
- Make sure you're using the `-timed` API endpoint
- Check server logs for errors

## 🎉 Success Criteria

You've successfully analyzed performance when you can answer:

1. ✅ Which step takes the most time?
2. ✅ What percentage of total time does it take?
3. ✅ What's the specific cause? (Too many candidates? Slow API?)
4. ✅ What optimization will help? (Reduce candidates? Better search?)
5. ✅ What's the expected improvement? (X seconds → Y seconds)

---

**Need help?** Check `PIPELINE_PERFORMANCE_ANALYSIS.md` for detailed examples and troubleshooting.

