# Visual Similarity Badges - User Guide

**Last Updated:** November 13, 2025  
**Issue Fixed:** Commit a55d0d8

## When Do Visual Similarity Badges Appear?

Visual similarity scores and badges **only appear for stages where visual matching actually runs**:

### ❌ NO Visual Similarity (Expected):
- **Search** - Just keyword search, no image comparison yet
- **Pre-filter** - Metadata filtering only (brand, retailer, size)

### ✅ YES Visual Similarity (You Should See Badges):
- **AI Filter** - Pipeline 1 compares product images using Gemini
- **Visual Match** - Pipeline 2 uses visual matching as primary method

## What the Badges Mean

When you click **AI Filter** or **Visual Match** filter buttons:

### 🎯 IDENTICAL (Green Gradient)
- This is the **selected match** - the AI's top pick
- Visual similarity ≥70% AND best metadata match
- Only ONE product per detection gets this badge

### 🔍 ALMOST SAME (Blue Gradient)  
- **Alternative matches** that passed the 70% similarity threshold
- Strong visual matches that could also work
- You can manually select these if you disagree with the AI's choice

### Visual Similarity Percentage
Each product shows: **👁️ Visual Similarity: XX.X%**
- **Green background**: ≥90% (excellent match)
- **Blue background**: 70-89% (good match, passed threshold)
- **Yellow background**: <70% (below threshold)

## How to See the Badges

### Step 1: Run Visual Matching
The badges only appear **after visual matching runs**. You need to:

**Option A: Pipeline 2 (Visual-Only)** ✅ Recommended
1. Go to your project page
2. Click one of the green **Pipeline 2 (Visual-Only)** buttons:
   - 🎯 Visual Match (3)
   - 🎯 Visual Match (10)
   - 🎯 Visual Match (20)
   - 🎯 Visual Match (50)
   - 🎯 Visual Match (ALL)
3. Wait for processing to complete

**Option B: Pipeline 1 (AI Filter)**
1. Go to your project page
2. Click one of the blue **Pipeline 1 (AI Filter)** buttons
3. Visual matching automatically runs when 2+ similar products are found

### Step 2: Open Product Analysis
1. Click on a product image that was processed
2. You'll see the product analysis page

### Step 3: View Results
1. Scroll to "Filter by Processing Stage" section
2. Click the **AI Filter** or **Visual Match** button
3. You should now see:
   - 🎯 **IDENTICAL** badge on the selected match (green)
   - 🔍 **ALMOST SAME** badges on alternatives (blue)
   - **👁️ Visual Similarity: XX.X%** percentages

## Troubleshooting: "I Don't See Any Badges"

### Issue #1: Old Data
**Problem:** You're viewing results from before November 13, 2025  
**Solution:** Re-run the visual matching pipeline on those products

### Issue #2: Wrong Pipeline Used
**Problem:** You used a different pipeline that doesn't save visual similarity  
**Solution:** Use Pipeline 1 (AI Filter) or Pipeline 2 (Visual-Only)

### Issue #3: Looking at Wrong Stage
**Problem:** You're on "Search" or "Pre-filter" tabs  
**Solution:** Click "AI Filter" or "Visual Match" filter buttons

### Issue #4: Only One Candidate
**Problem:** Visual matching needs 2+ candidates to compare  
**Solution:** If there's only 1 result, visual matching doesn't run

### Issue #5: All Below Threshold
**Problem:** No candidates passed the 70% similarity threshold  
**Solution:** You'll see "NO MATCH" badges or no results

## Example: What You Should See

When viewing Harry's 2-in-1 Shampoo products with Visual Match filter active:

```
┌─────────────────────────────────────────────────────────┐
│ 🎯 IDENTICAL                                  [💾 Save] │
│ ┌──────────┐                                            │
│ │  [Image] │  Harry's Men's 2 in 1 Shampoo - Stone    │
│ └──────────┘  14 fl oz                                  │
│               UPC: 00840317400786                       │
│               👁️ Visual Similarity: 95.0% [green]      │
│               🤖 Selected as best match. Visual...      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 🔍 ALMOST SAME                                [💾 Save] │
│ ┌──────────┐                                            │
│ │  [Image] │  Harry's Men's 2-in-1 Shampoo             │
│ └──────────┘  14 fl oz                                  │
│               UPC: 00855235007955                       │
│               👁️ Visual Similarity: 87.0% [blue]       │
│               🤖 Passed visual similarity threshold...  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 🔍 ALMOST SAME                                [💾 Save] │
│ ┌──────────┐                                            │
│ │  [Image] │  Harry's 2 in 1 Shampoo - Wildlands      │
│ └──────────┘  14 fl oz                                  │
│               UPC: 00840317400793                       │
│               👁️ Visual Similarity: 82.0% [blue]       │
│               🤖 Passed visual similarity threshold...  │
└─────────────────────────────────────────────────────────┘
```

## Why Pre-filter Doesn't Show Visual Similarity

**Pre-filter uses ONLY metadata**, not images:
- Brand name matching
- Retailer matching
- Size filtering (with ±20% tolerance)

Visual comparison happens **after** pre-filter in the pipeline:

```
Search (100) → Pre-filter (24) → AI Filter (8) → Visual Match (3)
   ↑              ↑                   ↑                ↑
Keyword      Metadata         Visual Comparison    Final Selection
  only        only              WITH badges         WITH badges
```

## Quick Test

Want to verify the badges work?

1. Go to Projects page
2. Find a project with images
3. Click **🎯 Visual Match (3)** button
4. Wait for "✅ Complete" message
5. Click on any processed product
6. Click **Visual Match** filter button
7. You should see 🎯 IDENTICAL and 🔍 ALMOST SAME badges!

## What Was Fixed (Nov 13, 2025)

- ✅ Backend saves visual similarity scores correctly
- ✅ TypeScript interfaces include new fields
- ✅ UI displays badges and percentages
- ✅ All Pipeline 2 APIs use new saving method
- ✅ Project-level batch processing fixed (commit a55d0d8)

## Still Not Working?

If you followed all steps and still don't see badges:

1. **Check the browser console** for errors
2. **Verify the data** - Open browser DevTools → Network tab → Look for API responses
3. **Re-run the pipeline** - Sometimes a fresh run helps
4. **Clear your browser cache** - Shift+F5 or Ctrl+Shift+R

The system is deployed and working! The badges will appear for any products processed with visual matching after November 13, 2025.

