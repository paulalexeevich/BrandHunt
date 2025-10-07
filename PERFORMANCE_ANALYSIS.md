# BrangHunt Performance Analysis

## Current Performance Issues

### Detection Speed (Very Slow)

**Observed Performance:**
- 40 products detected: **23.4 seconds**
- 21 products detected: **64 seconds** ⚠️

### Root Causes

#### 1. Complex Vision Task
The Gemini API is being asked to:
- Detect ALL products in a complex retail shelf image
- Calculate precise bounding boxes for each product (normalized coordinates)
- Process images with 20-40+ products simultaneously

This is an extremely computationally intensive task for a single API call.

#### 2. Large Image Size
- Images are stored as base64 in database
- Large retail shelf images can be several MB
- High resolution = longer processing time

#### 3. Single Synchronous API Call
- The entire detection happens in one blocking API call
- UI shows "processing" but gives no progress feedback for 20-60+ seconds
- No timeout or retry logic

## Optimization Strategies

### Short-term Fixes (Quick Wins)

#### 1. ✅ Add Processing Timeout
Set a reasonable timeout to prevent indefinite waiting:

```typescript
// In lib/gemini.ts
export async function detectProducts(imageBase64: string, mimeType: string): Promise<DetectedProduct[]> {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,  // ADD: Limit output size
    }
  });
  
  // Rest of code...
}
```

#### 2. ✅ Resize Images Before Upload
Add client-side image resizing:

```typescript
// Maximum dimensions for uploaded images
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

// Resize image before encoding to base64
function resizeImage(file: File): Promise<string> {
  // Implementation using Canvas API
}
```

**Expected Impact:** 50-70% speed improvement

#### 3. ✅ Add Better User Feedback
Update UI to show:
- "Analyzing image... This may take 30-60 seconds for complex images"
- Progress indicator
- Cancel button

### Medium-term Optimizations

#### 4. Use Gemini 2.5 Flash-8B (Faster Model)
Switch to the lighter, faster model for initial detection:

```typescript
model: 'gemini-2.5-flash-8b'  // Faster, slightly less accurate
```

**Expected Impact:** 2-3x speed improvement

#### 5. Implement Batch Processing
Instead of detecting all products at once:
1. Detect products in regions (top, middle, bottom)
2. Process regions in parallel
3. Merge results

### Long-term Improvements

#### 6. Two-Stage Detection
- **Stage 1 (Fast)**: Quick detection with approximate boxes using Flash-8B
- **Stage 2 (Accurate)**: Refine bounding boxes for selected products

#### 7. Image Preprocessing
- Auto-crop to region of interest
- Compress before sending to API
- Convert to optimal format (JPEG with quality 85)

#### 8. Caching Strategy
- Cache detection results by image hash
- Skip re-detection if image already processed

## Recommended Action Plan

### Phase 1: Immediate (Today) ✅
1. ✅ Restart server with fixed code (no SKU field)
2. Add image resize on upload (max 1920x1080)
3. Add 90-second timeout to Gemini API call
4. Update UI with better progress messages

### Phase 2: This Week
1. Test Gemini 2.5 Flash-8B for speed comparison
2. Implement client-side image compression
3. Add retry logic for failed API calls

### Phase 3: Future Optimization
1. Implement regional batch processing
2. Add smart caching layer
3. Consider alternative detection models for initial pass

## Expected Results

| Optimization | Current | After Phase 1 | After Phase 2 |
|--------------|---------|---------------|---------------|
| 40 products  | 23s     | 10-15s        | 5-8s          |
| 21 products  | 64s     | 15-20s        | 8-12s         |

## Notes

- Gemini 2.5 Flash is optimized for quality over speed
- Complex retail images with 40+ products will always take longer
- Consider setting expectations: "Processing may take up to 60 seconds for complex images"
- The slowness is primarily due to the complexity of the vision task, not code issues

