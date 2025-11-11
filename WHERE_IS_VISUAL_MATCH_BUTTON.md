# Where is the Visual Match Selection Button?

## Current Status
Looking at your screenshot, you have **2 ALMOST SAME** matches showing for Mando deodorants.

## Button Location

The **🎯 Visual Match Selection** button appears in the **Action Buttons section** on the right side of the page.

### Location Flow:

```
┌─────────────────────────────────────────┐
│  Right Panel (Product Details)         │
├─────────────────────────────────────────┤
│                                         │
│  🔬 Contextual Analysis (Experimental)  │
│     [Show] button                       │
│                                         │
│  💰 Extract Price  ← You're here       │
│                                         │
│  🎯 Visual Match Selection              │
│     [2 candidates]   ← BUTTON HERE!    │
│                                         │
├─────────────────────────────────────────┤
│  Filter by Processing Stage:            │
│  🔍 Search (100)                        │
│  ⚡ Pre-filter (6)                      │
│  🤖 AI Filter (6) ← Currently selected │
│                                         │
├─────────────────────────────────────────┤
│  ≈ ALMOST SAME - Mando 2.6oz  [Save]   │
│  ≈ ALMOST SAME - Mando 0.5oz  [Save]   │
│  + 50 more results available            │
└─────────────────────────────────────────┘
```

## Why the Button Should Be There

Your current state shows:
- ✅ **AI Filter completed** (showing 6 results)
- ✅ **2 ALMOST SAME matches** (the 2 Mando products)
- ✅ **Not fully analyzed** yet

This meets ALL conditions for the button to appear:
```typescript
{filteredCount !== null && 
 matchStatusCounts && 
 (matchStatusCounts.identical + matchStatusCounts.almostSame) >= 2 && 
 !detection.fully_analyzed}
```

## Button Appearance

The button looks like this:

```
┌──────────────────────────────────────────────┐
│ 🎯 Visual Match Selection                   │
│    [2 candidates]                            │
└──────────────────────────────────────────────┘
```

- **Color**: Gradient purple/indigo background
- **Text**: White text
- **Badge**: Shows number of candidates in a semi-transparent white badge
- **Full width**: Takes up the entire width of the action buttons area

## Troubleshooting

### If you don't see the button:

1. **Scroll up** in the right panel - the button is above the results

2. **Check you selected the right detection**:
   - Click on a product box on the left (the shelf image)
   - Make sure it's highlighted

3. **Verify AI Filter was run**:
   - Look for the purple "🤖 AI Filter (6)" button
   - Make sure it shows results (not "0")

4. **Check match counts**:
   - Look for "≈ ALMOST SAME" or "✓ IDENTICAL" labels on the results
   - Need at least 2 of these combined

5. **Refresh the page**:
   - Sometimes state doesn't update properly
   - Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

## What Happens When You Click It

1. Button changes to: **"Visual Matching..."** with spinner
2. Takes ~5-10 seconds
3. Shows result panel below with:
   - ✅ Selected product (if match found)
   - 📊 Confidence score (0-100%)
   - 👁️ Visual similarity score
   - ✓ Brand/Size/Flavor match indicators
   - 📝 Detailed reasoning from Gemini
4. Auto-saves the selection to the detection

## Example Result

```
┌─────────────────────────────────────────────────┐
│ ✅ Visual Match Selected                        │
│                                                  │
│ Product: Mando Whole Body Men's Smooth Solid    │
│ Brand: Mando                                     │
│ GTIN: 00850030360427                            │
│                                                  │
│ Confidence: 92%                                  │
│ Visual Similarity: 88%                           │
│                                                  │
│ Matches:  ✓ Brand   ✓ Size   ✓ Flavor          │
│                                                  │
│ Reasoning: The shelf image shows a blue         │
│ Mando deodorant stick with "2.6 oz" clearly     │
│ visible. The first candidate matches perfectly   │
│ in color, size marking, and packaging design.   │
│ The 0.5oz variant can be ruled out as the       │
│ shelf product is clearly larger.                │
│                                                  │
│ Analyzed 2 candidates                            │
└─────────────────────────────────────────────────┘
```

## Next Steps

Once you see the button:
1. Click it
2. Wait for results
3. Review Gemini's reasoning
4. The correct match will be auto-saved
5. You can proceed to the next product

## Still Can't Find It?

Please:
1. Take a fresh screenshot of the entire right panel
2. Make sure you scroll to the very top of the right panel
3. Share the screenshot - I'll help locate it

