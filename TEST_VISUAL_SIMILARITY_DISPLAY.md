# Testing Visual Similarity Display

**Date:** November 13, 2025  
**Feature:** Visual similarity badges and percentage scores for candidates after visual matching

## Current Situation

Looking at your screenshot:
- **Search (100)** - Raw FoodGraph results
- **Pre-filter (24)** - Currently selected (orange) 
- **AI Filter (0)** - No AI filtering run yet
- **Visual Match (0)** - No visual matching run yet

The visual similarity badges **only appear AFTER visual matching is run** and when viewing the **Visual Match filter**.

## What Should Be Displayed

When visual matching completes, you should see:

### 1. Match Status Badges
- **🎯 IDENTICAL** (green gradient) - Selected match with highest similarity
- **🔍 ALMOST SAME** (blue gradient) - Alternative candidates that passed ≥70% threshold

### 2. Visual Similarity Percentages
- **Green badge** (≥90%) - Example: `👁️ Visual Similarity: 95.0%`
- **Blue badge** (70-89%) - Example: `👁️ Visual Similarity: 82.0%`
- **Yellow badge** (<70%) - Example: `👁️ Visual Similarity: 65.0%`

### 3. Match Reasoning
- Purple box with AI explanation of why this match was selected

## How to Test

### Step 1: Run Visual Match Pipeline

On the photo analysis page, scroll up to find the **Block 2: Product Matching with FoodGraph** section.

You should see two pipeline options:
- **Pipeline 1: AI Filter** (🤖 blue/purple buttons)
- **Pipeline 2: Visual-Only** (🎯 green/teal buttons)

Click one of the **Visual-Only** buttons based on how many products you want to process:
- **🎯 Visual-Only (3)** - Process 3 products
- **🎯 Visual-Only (10)** - Process 10 products
- **🎯 Visual-Only (ALL)** - Process all products

### Step 2: Wait for Processing

You'll see progress messages like:
```
🔍 Searching product 1/24...
⚡ Pre-filtering...
🎯 Visual matching 8 candidates...
💾 Saving match: Native Body Wash...
```

### Step 3: Check Visual Match Filter Count

After processing completes, look at the filter buttons. The **Visual Match** button should now show a count:
- Before: `🎯 Visual Match (0)`
- After: `🎯 Visual Match (8)` ← Should have a number

### Step 4: Click Visual Match Filter

Click the **🎯 Visual Match** button (it should be enabled now).

### Step 5: Review Results

You should now see product cards with:

✅ **Match Status Badge** (top-right corner of product image)
- 🎯 IDENTICAL or 🔍 ALMOST SAME

✅ **Visual Similarity Percentage** (below UPC code)
- 👁️ Visual Similarity: 95.0%
- Color-coded badge (green/blue/yellow)

✅ **Match Reasoning** (purple box below similarity)
- 🤖 The visual elements strongly match: same packaging style, identical color scheme (white/orange/brown), similar bottle shape...

## Expected Results

For the Native body wash products in your screenshot, you should see:

**Product 1:** Native Body Wash - Vanilla & Sandalwood - 18 fl oz
- Match Status: 🎯 IDENTICAL or 🔍 ALMOST SAME
- Visual Similarity: 85-95%
- Reasoning: Explains packaging match

**Product 2:** Native Body Wash Pump - Sandalwood & Shea Butter - 36 fl oz
- Match Status: 🎯 IDENTICAL or 🔍 ALMOST SAME
- Visual Similarity: 80-90%
- Reasoning: Explains packaging match

**Product 3:** Native Limited Edition - Sandalwood & Coastal Breeze - 18 fl oz
- Match Status: 🎯 IDENTICAL or 🔍 ALMOST SAME
- Visual Similarity: 85-95%
- Reasoning: Explains packaging match

## Display Conditions

The visual similarity badges display when:
1. ✅ **Processing stage** = `visual_match`
2. ✅ **Filter button active** (filteredCount !== null)
3. ✅ **visual_similarity field** is populated in database

Currently showing **Pre-filter (24)** results, which don't have visual matching data yet.

## Troubleshooting

### Q: Visual Match button shows (0)
**A:** Run the Visual-Only pipeline first. The count stays at 0 until processing completes.

### Q: Can't find the pipeline buttons
**A:** Look for **Block 2: Product Matching with FoodGraph** section. You may need to click the **⚙️ Image Processing** button in the header to show the processing blocks.

### Q: Visual Match button is disabled
**A:** This happens if:
- No products have gone through pre-filter stage yet
- Need to run Pipeline 2 first to generate visual match data

### Q: See results but no similarity percentages
**A:** Check that you're viewing the **Visual Match** filter (not Pre-filter or AI Filter)

## Quick Test Command

If you want to test on a specific product in this image:

```bash
# Replace <imageId> with your image ID from the URL
# Replace <detectionIndex> with product number (0, 1, or 2 for the three Native products)
node test-pipeline-performance.js <imageId> <detectionIndex>
```

This will show you the visual similarity scores in the console output.

## Code Location

The visual similarity display code is in:
- **File:** `components/FoodGraphResultsList.tsx`
- **Lines:** 355-369 (Visual Similarity Score display)
- **Lines:** 296-317 (Match Status badges)

## Next Steps

1. Run Visual-Only pipeline on this image
2. Wait for processing to complete
3. Click **Visual Match** filter button
4. Verify you see similarity percentages and badges
5. Report back if you don't see the expected display

---

**Note:** The feature is fully implemented and deployed. The badges only appear after visual matching runs and when viewing the Visual Match filter stage.

