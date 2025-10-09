# ✅ RESOLVED - See COORDINATE_SOLUTION.md

## This issue has been completely solved!

**Solution:** Implemented Google's official coordinate conversion method  
**Documentation:** See `COORDINATE_SOLUTION.md` for complete details  
**Implementation:** Commit e82fc7b (October 9, 2025)

**Final Formula:** `pixel = (coordinate / 1000) * dimension`

---

# Coordinate Debug Investigation (Historical)

## Issue
Bounding boxes from Gemini product detection appear misaligned with actual products in the image.

## Root Cause Identified ✅

**The Issue**: Using CSS percentage positioning (`left: X%`, `top: Y%`, etc.) for bounding boxes doesn't work correctly with scaled images.

**The Solution**: Use pixel-based positioning with Google's official formula:
```javascript
leftPx = (x0 / 1000) * displayedWidth
topPx = (y0 / 1000) * displayedHeight
widthPx = ((x1 - x0) / 1000) * displayedWidth
heightPx = ((y1 - y0) / 1000) * displayedHeight
```

## Coordinate System

**Gemini 2.5 Flash Returns:**
- Format: `[ymin, xmin, ymax, xmax]` (per Google's documentation)
- Normalized to 0-1000 scale
- y0/ymin: top edge (0 = image top, 1000 = image bottom)
- x0/xmin: left edge (0 = image left, 1000 = image right)
- y1/ymax: bottom edge (0 = image top, 1000 = image bottom)
- x1/xmax: right edge (0 = image left, 1000 = image right)

**Database Storage:**
```typescript
{
  y0: detection.box_2d[0],  // ymin (top)
  x0: detection.box_2d[1],  // xmin (left)
  y1: detection.box_2d[2],  // ymax (bottom)
  x1: detection.box_2d[3],  // xmax (right)
}
```

**Frontend Rendering (Final Solution):**
```javascript
// Get actual displayed image dimensions
const imgWidth = imageDimensions.displayed.width;
const imgHeight = imageDimensions.displayed.height;

// Convert using Google's official method
leftPx = (box.x0 / 1000) * imgWidth;
topPx = (box.y0 / 1000) * imgHeight;
widthPx = ((box.x1 - box.x0) / 1000) * imgWidth;
heightPx = ((box.y1 - box.y0) / 1000) * imgHeight;
```

## What Was Tested

### ❌ Attempt 1: Percentage-based CSS positioning
- Used `left: X%`, `top: Y%`
- Failed because percentages are relative to container, not image
- Image scaling caused misalignment

### ✅ Attempt 2: Pixel-based positioning (Simple)
- Used `leftPx = (x0/1000) * width`
- Matches Google's official example
- **THIS WORKED PERFECTLY**

### ❌ Attempt 3: Aspect ratio correction
- Assumed Gemini uses 1000x1000 square space
- Added complex scaling for portrait/landscape
- **NOT NEEDED** - Gemini respects actual dimensions

## Debug Features Added

1. **Coordinate Debug Toggle**: Button to show/hide coordinate information
2. **Image Dimensions Display**: Shows natural and displayed image sizes
3. **Bounding Box Overlays**: Shows normalized and pixel coordinates
4. **Console Logging**: Detailed coordinate transformation logs

## Evolution of Understanding

1. **First thought**: Coordinates might be swapped or in wrong order
2. **Second thought**: Percentage positioning should work
3. **Third thought**: Maybe aspect ratio correction needed
4. **Final truth**: Google's simple method is correct - just divide by 1000 and multiply by dimension

## Verification

Tested with image `9ed52c03-207f-405b-a900-ec639a3762e7`:
- Multiple frozen pies on refrigerated shelf
- Clear product separation for accurate testing
- Natural dimensions show various aspect ratios
- All bounding boxes align perfectly with pixel-based method

## Key Learnings

1. **Trust official documentation** - Google provides exact example code
2. **KISS principle** - Simple solution is often correct
3. **Pixel > Percentage** - For positioned overlays on scaled images
4. **useRef for dimensions** - Track actual displayed image size
5. **No aspect correction** - Gemini already handles it correctly

## References

- Google's official Gemini bounding box example (Python)
- BrangHunt implementation in `lib/gemini.ts` and `app/analyze/[imageId]/page.tsx`
- Complete solution documented in `COORDINATE_SOLUTION.md`
