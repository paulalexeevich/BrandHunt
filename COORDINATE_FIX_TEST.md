# Coordinate Fix Testing Guide

## The Problem

Bounding boxes from Gemini product detection are misaligned with actual products. We've implemented two coordinate conversion methods to test which one works correctly.

## Two Coordinate Conversion Methods

### Method 1: Simple Conversion (Aspect: OFF)
Assumes Gemini normalizes coordinates 0-1000 independently for each axis based on actual image dimensions.

```javascript
leftPx = (x0 / 1000) * imageWidth
topPx = (y0 / 1000) * imageHeight
```

**When this works:** Gemini respects the image's actual aspect ratio when normalizing coordinates.

### Method 2: Aspect Ratio Correction (Aspect: ON)
Assumes Gemini uses a 1000x1000 square coordinate space, requiring adjustment for non-square images.

**For Portrait Images (aspect < 1):**
- X coordinates are scaled and centered
- Y coordinates remain simple

**For Landscape Images (aspect > 1):**
- Y coordinates are scaled and centered
- X coordinates remain simple

**When this works:** Gemini uses a square coordinate space regardless of image shape.

## How to Test

1. **Refresh the page** at `http://localhost:3000/analyze/727be488-537d-40a0-83c8-226ceacc04cb`

2. **Check the debug panel** (dark box at top):
   - Image dimensions (natural and displayed)
   - Aspect ratio (will be < 1 for portrait, > 1 for landscape)
   - Sample box #1 coordinates and calculated pixels

3. **Test Method 1 (Simple):**
   - Ensure "Aspect: OFF" button is gray
   - Check if bounding boxes align with products
   - Open browser console (F12) and look for log: `🎯 Box #1 (WITHOUT aspect):`

4. **Test Method 2 (Aspect Correction):**
   - Click "Aspect: ON" button (turns blue)
   - Boxes will recalculate immediately
   - Check if bounding boxes now align with products
   - Console shows: `🎯 Box #1 (WITH aspect):`

5. **Compare console logs:**
   ```
   WITHOUT aspect: coords[264,130,400,220] -> pixels[153,134,79x93], aspect=0.563
   WITH aspect: coords[264,130,400,220] -> pixels[XXX,134,XXXxXX], aspect=0.563
   ```

## What to Look For

### Signs of Correct Alignment:
- ✅ Box #1 tightly surrounds "Edwards Original Whipped Cheesecake"
- ✅ Box #2 surrounds "Edwards Turtle Creme Pie"
- ✅ All 31 boxes frame their respective products accurately
- ✅ Labels match visible product names

### Signs of Incorrect Alignment:
- ❌ Boxes float in empty spaces
- ❌ Boxes cover wrong products
- ❌ Boxes are too large/small
- ❌ Horizontal or vertical offset across all boxes

## Expected Results

### Current Image (727be488-537d-40a0-83c8-226ceacc04cb):
- **Natural size:** 2376x4224px
- **Aspect ratio:** 0.563 (portrait)
- **31 products detected**
- **First product:** Edwards Original Whipped Cheesecake at coords [264,130,400,220]

### If Simple Method Works:
The issue was with percentage-based CSS positioning, and pixel-based positioning solved it.

### If Aspect Correction Works:
Gemini uses a square coordinate space, and we need aspect ratio correction for all future detections.

## Next Steps

Once you identify which method works:

1. **Document the finding** in this file
2. **Remove the toggle** and hardcode the correct method
3. **Update the Gemini prompt** if needed to clarify coordinate system
4. **Test with multiple images** (landscape and portrait) to verify
5. **Update COORDINATE_DEBUG.md** with final solution

## Test Results

**Date:** _____
**Tested by:** _____

| Method | Result | Notes |
|--------|--------|-------|
| Simple (Aspect OFF) | ☐ Works ☐ Fails | |
| Aspect Correction (Aspect ON) | ☐ Works ☐ Fails | |

**Final Decision:** _____________________________

**Additional Notes:**

