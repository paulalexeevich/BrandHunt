# Image Quality Validation Feature

## Overview
This feature adds automatic image quality validation after upload using Gemini API to check for blur and product count before processing.

## Implementation Date
October 11, 2025

## Purpose
- Prevent processing of images with too many products (>50) that would exceed Gemini API limitations
- Warn users about blurry images that may produce inaccurate detection results
- Provide upfront feedback to users about image quality before they start analysis

## How It Works

### 1. Upload Flow
1. User uploads image (file or URL)
2. System saves image to database
3. **NEW**: System automatically validates image quality
4. User sees validation results with warnings (if any)
5. User can proceed to analysis (if image passes validation)

### 2. Validation Checks

#### Blur Detection
- Uses Gemini AI to analyze image sharpness
- Checks text readability and product edge clarity
- Returns blur confidence score (0.0 to 1.0)
- **Warning**: Displayed if blur confidence >= 0.6

#### Product Count Estimation
- Uses Gemini AI to count visible products in image
- Returns estimated count and confidence score
- **Warning**: Displayed if count > 40 (approaching limit)
- **Error**: Blocks processing if count > 50 (exceeds Gemini limit)

### 3. User Feedback

#### Visual Indicators

**Yellow Warning** (canProcess = true):
- Image appears blurry OR has 40-50 products
- Analysis can proceed but results may be affected
- Shows warning icon and helpful tips

**Red Alert** (canProcess = false):
- Image has more than 50 products
- Analysis is blocked - user cannot proceed
- Suggests uploading image with fewer products

**Green Success**:
- Image quality is good
- Shows estimated product count
- Ready to proceed with analysis

## Technical Implementation

### New Files

#### 1. `lib/gemini.ts` - `validateImageQuality()` function
```typescript
export async function validateImageQuality(
  imageBase64: string,
  mimeType: string
): Promise<{
  isBlurry: boolean;
  blurConfidence: number;
  estimatedProductCount: number;
  productCountConfidence: number;
  warnings: string[];
  canProcess: boolean;
}>
```

**Features**:
- Uses Gemini 2.5 Flash model
- Temperature = 0 for deterministic results
- JSON response format
- ~5-10 seconds processing time

#### 2. `app/api/validate-quality/route.ts`
```typescript
POST /api/validate-quality
Body: { imageId: string }
Response: { success: boolean, validation: ValidationResult }
```

**Features**:
- 60-second timeout for Gemini calls
- Stores validation results in database
- Returns structured validation data

### Database Changes

#### New Columns in `branghunt_images` table:

| Column | Type | Description |
|--------|------|-------------|
| `is_blurry` | BOOLEAN | Whether image appears blurry |
| `blur_confidence` | DECIMAL(3,2) | Confidence score (0.0 to 1.0) |
| `estimated_product_count` | INTEGER | Estimated number of products |
| `product_count_confidence` | DECIMAL(3,2) | Confidence score (0.0 to 1.0) |
| `quality_validated_at` | TIMESTAMPTZ | Validation timestamp |

**Indexes**:
- `idx_branghunt_images_quality_validated` on `quality_validated_at`
- `idx_branghunt_images_product_count` on `estimated_product_count`

### UI Updates

#### `app/page.tsx` Changes:

1. **New States**:
   - `validating`: Boolean for loading state
   - `validationResult`: Stores validation data

2. **New UI Elements**:
   - Validation loading spinner: "Validating image quality..."
   - Warning/alert box with color-coded severity
   - Product count display in success message
   - Conditional "Start Analysis" button

3. **Warning Messages**:
   - Blur warning with tip about better lighting
   - Product count warning/error with recommendation
   - Clear visual distinction between warnings and errors

## Configuration

### Thresholds (in `lib/gemini.ts`)

```typescript
// Blur detection
if (validation.isBlurry && validation.blurConfidence >= 0.6) {
  // Show blur warning
}

// Product count
if (validation.estimatedProductCount > 50) {
  // Block processing - too many products
  canProcess = false;
} else if (validation.estimatedProductCount > 40) {
  // Show warning - approaching limit
}
```

### Timeouts

- Validation API route: 60 seconds (`maxDuration = 60`)
- Gemini API call: Inherits from route timeout

## User Experience

### Good Quality Image (No Warnings)
```
✅ Upload completed!
📊 Detected approximately 25 products
Your image is ready for analysis.
[Start Analysis] button
```

### Blurry Image (Warning)
```
⚠️ Image Quality Warnings
- ⚠️ Image appears blurry - detection results may be inaccurate
💡 Tip: Try taking a clearer photo with better lighting and focus.

✅ Upload completed!
📊 Detected approximately 30 products (image quality may affect results)
[Start Analysis] button
```

### Too Many Products (Error)
```
❌ Cannot Process Image
- ❌ Image contains approximately 65 products - Gemini API works best with fewer than 50 products
💡 Tip: Try uploading an image with fewer products (under 50 works best).

✅ Upload completed!
Image quality check completed but processing may not work well with this image.
[No analysis button - blocked]
```

## Performance

### Processing Time
- Upload: ~1-2 seconds
- Quality validation: ~5-10 seconds
- **Total**: ~6-12 seconds before user can start analysis

### API Costs
- Adds one Gemini API call per upload
- Uses Gemini 2.5 Flash (most cost-effective)
- Image analysis costs same as product detection

## Error Handling

### Validation API Failure
If validation fails:
- User can still proceed to analysis
- No validation warnings shown
- Graceful degradation - doesn't block workflow

### Database Update Failure
If storing validation results fails:
- Validation still returned to user
- Warning logged to console
- User experience unaffected

## Testing Recommendations

### Test Cases

1. **Clear image with few products (5-10)**
   - Should show no warnings
   - Should allow analysis

2. **Clear image with many products (30-40)**
   - Should show warning about product count
   - Should allow analysis

3. **Clear image with too many products (50+)**
   - Should show error and block analysis
   - Should not show "Start Analysis" button

4. **Blurry image with few products**
   - Should show blur warning
   - Should allow analysis with warning

5. **Blurry image with too many products**
   - Should show both warnings
   - Should block analysis due to product count

## Future Enhancements

1. **Adjustable Thresholds**
   - Make blur/count thresholds configurable
   - Add admin settings page

2. **Skip Validation Option**
   - Allow advanced users to skip validation
   - Add "Proceed Anyway" button for blocked images

3. **Additional Checks**
   - Check image resolution (too low/high)
   - Detect if image is rotated
   - Validate image format/size

4. **Caching**
   - Cache validation results
   - Skip re-validation for same image

## Rollback Instructions

If needed to rollback this feature:

### 1. Database Rollback
```sql
ALTER TABLE branghunt_images
DROP COLUMN IF EXISTS is_blurry,
DROP COLUMN IF EXISTS blur_confidence,
DROP COLUMN IF EXISTS estimated_product_count,
DROP COLUMN IF EXISTS product_count_confidence,
DROP COLUMN IF EXISTS quality_validated_at;

DROP INDEX IF EXISTS idx_branghunt_images_quality_validated;
DROP INDEX IF EXISTS idx_branghunt_images_product_count;
```

### 2. Code Rollback
```bash
git revert <commit-hash>
```

Or manually:
1. Remove `validateImageQuality()` from `lib/gemini.ts`
2. Delete `app/api/validate-quality/route.ts`
3. Remove validation-related code from `app/page.tsx`
4. Remove validation fields from `lib/supabase.ts` interfaces

## Documentation
- Feature documentation: `IMAGE_QUALITY_VALIDATION.md` (this file)
- Migration file: `migrations/add_quality_validation_columns.sql`
- Migration guide: `migrations/README.md`

## Related Features
- Product detection: `lib/gemini.ts` - `detectProducts()`
- Brand extraction: `lib/gemini.ts` - `extractProductInfo()`
- Price extraction: `lib/gemini.ts` - `extractPrice()`

## Notes
- Validation is **non-blocking** for technical failures
- Validation **blocks** only if product count > 50
- All warnings are **informative** - users can proceed with warnings
- Feature follows existing error handling patterns

