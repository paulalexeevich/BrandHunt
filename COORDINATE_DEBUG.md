# Coordinate Debug Investigation

## Issue
Bounding boxes from Gemini product detection appear misaligned with actual products in the image.

## Hypothesis
The bounding box coordinates returned by Gemini may be:
1. In a different coordinate system than expected
2. Incorrectly mapped from Gemini's response to our database
3. Incorrectly rendered on the frontend

## Coordinate System
**Gemini 2.5 Flash Returns:**
- Format: `[y0, x0, y1, x1]`
- Normalized to 0-1000 scale
- y0: top edge (0 = image top, 1000 = image bottom)
- x0: left edge (0 = image left, 1000 = image right)
- y1: bottom edge (0 = image top, 1000 = image bottom)
- x1: right edge (0 = image left, 1000 = image right)

**Database Storage:**
```typescript
{
  y0: detection.box_2d[0],  // top
  x0: detection.box_2d[1],  // left
  y1: detection.box_2d[2],  // bottom
  x1: detection.box_2d[3],  // right
}
```

**Frontend Rendering:**
```css
left: (x0 / 1000) * 100%
top: (y0 / 1000) * 100%
width: ((x1 - x0) / 1000) * 100%
height: ((y1 - y0) / 1000) * 100%
```

## Debug Features Added

### Backend (route.ts)
1. **Detection Logging**: Added console logs to show raw Gemini coordinates
   - Logs first 3 detections in full
   - Logs every detection's coordinate mapping

### Frontend (page.tsx)
1. **Coordinate Debug Toggle**: Button to show/hide coordinate information
2. **Image Dimensions Display**: Shows actual displayed image size
3. **Bounding Box Coordinate Overlay**: Each box shows:
   - x0, y0 (top-left corner) in yellow
   - x1, y1 (bottom-right corner) in green
   - Width and height in blue
   - Detection label in purple

## How to Debug

### Step 1: Check Backend Logs
1. Navigate to an image in the analyze page
2. Click "Detect Products"
3. Check terminal/console for logs like:
   ```
   🔍 Sample detections: [...]
   Detection 0: [y0,x0,y1,x1] -> {"y0":...}
   ```

### Step 2: Check Frontend Display
1. Look at the "📐 Image Dimensions" panel
   - Note the displayed image size (e.g., 800x600px)
2. Look at the coordinate overlays on each bounding box
   - Check if x0 < x1 and y0 < y1 (must be true)
   - Check if all values are between 0 and 1000
   - Check if the width/height makes sense

### Step 3: Verify Alignment
1. Pick a product in the image
2. Note its approximate position (e.g., "top-left quadrant, 30% from left, 20% from top")
3. Look at the bounding box coordinates
4. Calculate percentage: (x0/1000)*100% should match horizontal position
5. Calculate percentage: (y0/1000)*100% should match vertical position

## Expected vs Actual

**Expected**: 
- Bounding boxes tightly fit around each detected product
- Coordinates increase from left-to-right (x0 < x1) and top-to-bottom (y0 < y1)
- Products in the top-left have small x0, y0 values (e.g., 50-200)
- Products in the bottom-right have large x1, y1 values (e.g., 800-950)

**If Misaligned**:
- Check if coordinates are swapped (x/y confusion)
- Check if coordinates are inverted (e.g., bottom-top instead of top-bottom)
- Check if coordinate scale is wrong (maybe 0-100 instead of 0-1000)

## Potential Fixes

### If coordinates are correct but rendering is wrong:
- Image scaling issue: CSS `max-w-full h-auto` may cause the image to scale down
- Container positioning issue: Absolute positioning relative to wrong parent
- **Fix**: Use JavaScript to get actual displayed image size and adjust calculations

### If coordinates from Gemini are wrong:
- Gemini prompt may need refinement
- Temperature setting (currently 0) may need adjustment
- Model might need different instructions about coordinate format

### If coordinate mapping is wrong:
- Array indices may be incorrect (currently [y0, x0, y1, x1])
- Coordinate system may be different (e.g., center-based vs corner-based)

## Next Steps
1. ✅ Added debug logging to backend
2. ✅ Added coordinate display to frontend
3. ✅ Test with current image and examine coordinates
4. ✅ Compare expected vs actual positions
5. ✅ Identify root cause: **Percentage positioning doesn't work correctly**
6. ✅ Implement fix: **Use pixel-based positioning**
7. ⏳ Test with multiple images to verify

## Root Cause Identified

**The Issue**: Using CSS percentage positioning (`left: X%`, `top: Y%`, etc.) for bounding boxes doesn't account for the image's aspect ratio correctly when the image is scaled with `max-w-full h-auto`.

**Why It Fails**:
- The image container (`inline-block`) can have different dimensions than the image itself
- Percentages are relative to the container, not the image
- When the image scales down, the percentages become incorrect

## The Fix

Changed from **percentage-based positioning** to **pixel-based positioning**:

### Before (Wrong):
```javascript
left: `${(box.x0 / 1000) * 100}%`
top: `${(box.y0 / 1000) * 100}%`
width: `${((box.x1 - box.x0) / 1000) * 100}%`
height: `${((box.y1 - box.y0) / 1000) * 100}%`
```

### After (Correct):
```javascript
const imgWidth = imageDimensions.displayed.width;
const imgHeight = imageDimensions.displayed.height;

left: `${(box.x0 / 1000) * imgWidth}px`
top: `${(box.y0 / 1000) * imgHeight}px`
width: `${((box.x1 - box.x0) / 1000) * imgWidth}px`
height: `${((box.y1 - box.y0) / 1000) * imgHeight}px`
```

### Changes Made:
1. **Track Image Dimensions**: Added `useRef` and `useState` to track both natural and displayed image dimensions
2. **Calculate Pixel Positions**: Convert normalized coordinates (0-1000) to actual pixel values based on displayed image size
3. **Dynamic Updates**: Listen to image load and window resize events to update dimensions
4. **Enhanced Debug Info**: Show both natural and displayed dimensions, plus pixel calculations

## Test Image
Currently testing with image ID: `9ed52c03-207f-405b-a900-ec639a3762e7`
- Shows refrigerated shelf with multiple frozen pies
- Products are arranged in clear rows
- Good test case for coordinate accuracy
- Natural dimensions show aspect ratio (width/height ratio displayed in debug panel)

