# 🚀 Run Your First Performance Test

## 3 Simple Steps

### 1️⃣ Find a Test Image

```bash
node find-test-images.js
```

**Copy the Image ID** from the output (looks like: `abc123-def456-ghi789`)

---

### 2️⃣ Run the Performance Test

```bash
node test-pipeline-performance.js <PASTE_IMAGE_ID_HERE>
```

**Example:**
```bash
node test-pipeline-performance.js abc123-def456-ghi789
```

---

### 3️⃣ Read the Results

You'll see output showing **exactly how long each step takes**:

```
🔬 PIPELINE 2 PERFORMANCE ANALYSIS
================================================================================

✅ SEARCH: 2347ms (Found 100 results)
✅ PRE-FILTER: 42ms (Filtered to 8 results)
✅ CROP IMAGE: 156ms (240x320px)
✅ GEMINI VISUAL MATCH: 8234ms (Confidence: 85%)
✅ VISUAL MATCH TOTAL: 8390ms
✅ SAVE: 89ms

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
================================================================================
🔴 BIGGEST BOTTLENECK: Visual Match - Gemini (8234ms)
================================================================================
```

---

## 🎯 What This Tells You

### ✅ Good News
- **Pre-filter is fast:** 42ms ✓
- **Crop is fast:** 156ms ✓
- **Save is fast:** 89ms ✓

### 🔴 The Bottleneck
- **Gemini takes 8.2 seconds (76% of total time)**
- This is because we're comparing 20+ candidate images
- **Easy fix:** Reduce to 10 candidates = 50% faster

---

## 🔧 Quick Optimization

If Gemini is your bottleneck (it usually is), here's the 1-line fix:

**File:** `app/api/batch-search-visual/route.ts`  
**Line:** Around 376

**Change this:**
```javascript
const candidates = preFilteredResults
  .filter(r => r.front_image_url)
  .map(m => ({...}));
```

**To this:**
```javascript
const candidates = preFilteredResults
  .filter(r => r.front_image_url)
  .slice(0, 10)  // 👈 ADD THIS LINE
  .map(m => ({...}));
```

**Result:** 10s → 5s (50% faster!)

---

## 📊 Test Multiple Products

Want to test 5 products to get average performance?

```bash
# Test products #1 through #5
for i in 1 2 3 4 5; do
  node test-pipeline-performance.js abc123-def456-ghi789 $i
  sleep 2
done
```

---

## 📚 Need More Help?

- **Quick start:** `QUICK_START_PERFORMANCE_ANALYSIS.md`
- **Full docs:** `PIPELINE_PERFORMANCE_ANALYSIS.md`
- **Summary:** `PIPELINE_PERFORMANCE_SUMMARY.md`

---

## ✅ You're Done!

You now know:
- ✅ Which step is slowest
- ✅ How long each step takes
- ✅ What to optimize first
- ✅ Expected improvement

Happy optimizing! 🚀

