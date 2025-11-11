# Visual Match Selection - Testing Guide

## How to Test the Visual Match Feature

### Prerequisites
The Visual Match Selection button appears **only after AI Filter** and **only when there are 2+ identical or almost_same matches**.

### Step-by-Step Testing:

#### 1. Navigate to a Project
- Go to http://localhost:3000/projects
- Click on any project with images

#### 2. Select an Image with Products
- Click on an image that has detected products
- You'll see the analyze page with product cards

#### 3. Select a Product (Detection)
- Click on a product card to select it
- The selected product will be highlighted

#### 4. Run the Complete Pipeline
You need to run all steps in order:

**Step 1: Extract Info**
- Click "📋 Extract Brand & Info"
- Wait for Gemini to extract brand, product name, size, etc.

**Step 2: Search FoodGraph**
- Click "🔍 Search FoodGraph"
- Gets TOP 100 results from FoodGraph database

**Step 3: Pre-Filter**
- Click "📊 Pre-Filter by Brand/Size/Retailer"
- Filters results to ≥85% match on brand/size/retailer

**Step 4: AI Filter**
- Click "🤖 Filter with AI"
- Gemini analyzes each candidate image
- Returns `identical`, `almost_same`, or `not_match` for each

#### 5. Visual Match Button Appears
After AI Filter completes, check the "AI Match Status Breakdown" panel:
- ✓ Identical: X
- ≈ Almost Same: Y

**If (X + Y) >= 2**, you'll see:
```
🎯 Visual Match Selection
[X + Y candidates]
```

#### 6. Click the Button
- Click "🎯 Visual Match Selection"
- Wait 5-10 seconds for Gemini to analyze all candidates
- Results appear in a colored panel below

### What to Expect:

**If a match is selected (green panel):**
- ✅ Product name, brand, GTIN
- Confidence score (e.g., 95%)
- Visual similarity score (e.g., 92%)
- Match indicators: ✓ Brand, ✓ Size, ✓ Flavor
- Detailed reasoning from Gemini
- Detection is auto-saved with the selected match

**If no match found (yellow panel):**
- ⚠️ No suitable match found
- Confidence score (low)
- Reasoning explaining why no match was good enough

### Finding Good Test Cases:

**Products likely to have multiple matches:**
1. **Generic sizes** - "Coca-Cola 12oz" might return Classic, Zero, Diet, Cherry variants
2. **Multi-packs** - "Oreo Cookies" might return different pack sizes
3. **Flavors** - "Lay's Chips" might return multiple flavors
4. **Similar products** - Generic items that come in many variants

### SQL Query to Find Test Cases:

Run this in Supabase SQL editor to find detections with multiple matches:

```sql
SELECT 
  d.id as detection_id,
  d.brand_name,
  d.product_name,
  d.size,
  COUNT(DISTINCT fgr.id) FILTER (WHERE fgr.match_status IN ('identical', 'almost_same')) as candidate_count,
  i.original_filename
FROM branghunt_detections d
JOIN branghunt_images i ON d.image_id = i.id
LEFT JOIN branghunt_foodgraph_results fgr ON d.id = fgr.detection_id 
  AND fgr.processing_stage = 'ai_filter'
WHERE d.fully_analyzed = false
GROUP BY d.id, i.original_filename
HAVING COUNT(DISTINCT fgr.id) FILTER (WHERE fgr.match_status IN ('identical', 'almost_same')) >= 2
ORDER BY candidate_count DESC
LIMIT 20;
```

### Troubleshooting:

**Button doesn't appear:**
- Check the AI Match Status Breakdown panel
- Verify you have at least 2 candidates (Identical + Almost Same)
- Make sure you've run all 4 steps in order

**Button is disabled/grayed out:**
- Visual matching is already in progress
- Wait for it to complete

**Error message:**
- Check browser console (F12) for detailed error
- Check server logs for Gemini API issues

### Manual API Test:

You can also test the API directly:

```bash
# Replace DETECTION_ID with your actual detection ID
curl -X POST http://localhost:3000/api/visual-match \
  -H "Content-Type: application/json" \
  -d '{"detectionId": "DETECTION_ID"}'
```

### Expected Results:

**Typical response time:** 5-10 seconds
**Gemini calls:** 1 (with all candidates + shelf image)
**Success rate:** ~90% for clear product images
**Auto-save:** Yes, if a match is selected with confidence ≥ 0.6

