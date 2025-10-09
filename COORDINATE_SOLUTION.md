# Coordinate System Solution - FINAL

## Problem Solved ✅

Bounding boxes from Gemini product detection are now correctly aligned with products using **Google's official recommended method**.

## Google's Official Method

According to Google's official documentation and example code:

```python
# Google's recommended code for Gemini bounding boxes
prompt = "Detect all prominent items. box_2d should be [ymin, xmin, ymax, xmax] normalized to 0-1000."

bounding_boxes = json.loads(response.text)
for bounding_box in bounding_boxes:
    abs_y1 = int(bounding_box["box_2d"][0]/1000 * height)  # ymin
    abs_x1 = int(bounding_box["box_2d"][1]/1000 * width)   # xmin
    abs_y2 = int(bounding_box["box_2d"][2]/1000 * height)  # ymax
    abs_x2 = int(bounding_box["box_2d"][3]/1000 * width)   # xmax
```

### Key Points:
1. **Format**: `[ymin, xmin, ymax, xmax]` - normalized 0-1000
2. **Conversion**: `coordinate / 1000 * dimension`
3. **No aspect ratio correction needed** - Gemini respects the actual image dimensions

## BrangHunt Implementation

### 1. Database Schema
Coordinates stored as JSONB with structure:
```json
{
  "y0": ymin,  // Top edge
  "x0": xmin,  // Left edge
  "y1": ymax,  // Bottom edge
  "x1": xmax   // Right edge
}
```

### 2. API Route (`/api/detect/route.ts`)
Converts Gemini response to database format:
```typescript
const bbox = {
  y0: detection.box_2d[0],  // ymin
  x0: detection.box_2d[1],  // xmin
  y1: detection.box_2d[2],  // ymax
  x1: detection.box_2d[3],  // xmax
};
```

### 3. Frontend Display (`app/analyze/[imageId]/page.tsx`)
Converts to pixel coordinates for CSS positioning:
```typescript
leftPx = (box.x0 / 1000) * imgWidth;
topPx = (box.y0 / 1000) * imgHeight;
widthPx = ((box.x1 - box.x0) / 1000) * imgWidth;
heightPx = ((box.y1 - box.y0) / 1000) * imgHeight;
```

### 4. Cropping Function (`lib/gemini.ts`)
Crops images using the same conversion:
```typescript
const left = Math.round((boundingBox.x0 / 1000) * imageWidth);
const top = Math.round((boundingBox.y0 / 1000) * imageHeight);
const width = Math.round(((boundingBox.x1 - boundingBox.x0) / 1000) * imageWidth);
const height = Math.round(((boundingBox.y1 - boundingBox.y0) / 1000) * imageHeight);
```

## What Changed

### Before:
- ❌ Percentage-based CSS positioning (`left: 26.4%`)
- ❌ Attempted aspect ratio correction for portrait/landscape images
- ❌ Testing toggles for different coordinate systems

### After:
- ✅ Pixel-based CSS positioning (`left: 153px`)
- ✅ Simple coordinate conversion matching Google's method
- ✅ Works for all aspect ratios (portrait, landscape, square)
- ✅ Clean debug interface showing exact pixel values

## Testing

To verify correct alignment:
1. Open any analyzed image in the app
2. Click "Show Debug" button
3. Verify bounding boxes tightly surround products
4. Check debug overlay shows correct coordinate values

## Technical Details

### Why Pixel-Based?
- CSS percentages are relative to container, which may differ from image dimensions
- Pixel values ensure exact positioning relative to displayed image
- `useRef` tracks actual displayed image dimensions

### Why No Aspect Ratio Correction?
- Gemini normalizes coordinates independently for each axis
- Coordinates are relative to actual image dimensions, not a square space
- Google's official example confirms this approach

## Conclusion

The coordinate system now **exactly matches Google's official recommendation**. All bounding boxes are accurately positioned using the simple formula: `pixel = (normalized / 1000) * dimension`.

No aspect ratio correction or coordinate swapping is needed. The implementation is clean, maintainable, and works reliably for all image types.

