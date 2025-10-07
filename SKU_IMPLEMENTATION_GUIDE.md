# SKU Extraction Feature - Implementation Guide

## Overview

This guide provides step-by-step instructions to implement SKU (Stock Keeping Unit) extraction in the BrangHunt application. SKU extraction will extract product identifiers, barcodes, UPC codes, or product codes visible on product packages.

## Step 1: Apply Database Migration

### Using Supabase Dashboard
1. Go to https://supabase.com/dashboard/project/ybzoioqgbvcxqiejopja
2. Navigate to **SQL Editor**
3. Run the migration from `migrations/add_sku_column.sql`:
   ```sql
   ALTER TABLE branghunt_detections
   ADD COLUMN IF NOT EXISTS sku TEXT;
   
   COMMENT ON COLUMN branghunt_detections.sku IS 'Stock Keeping Unit - product identifier, barcode, UPC, or product code extracted from the product image';
   ```
4. Verify by running:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'branghunt_detections' AND column_name = 'sku';
   ```

## Step 2: Update TypeScript Interfaces

### File: `lib/gemini.ts`

**Update ProductInfo interface (around line 10-13):**
```typescript
export interface ProductInfo {
  brand: string;
  category: string;
  sku: string;  // ADD THIS LINE
}
```

**Update extractProductInfo prompt (around line 98-117):**
```typescript
const prompt = `
Focus on the product within the bounding box region (y0=${boundingBox.y0}, x0=${boundingBox.x0}, y1=${boundingBox.y1}, x1=${boundingBox.x1}, normalized 0-1000).

Extract the following information about this product:
1. Brand name (the manufacturer/brand of the product)
2. Category (e.g., "Frozen Food", "Dairy", "Snacks", "Beverages", "Bakery", "Pasta", "Canned Goods", etc.)
3. SKU (Stock Keeping Unit - any product identifier, barcode, UPC, or product code visible on the package)  // ADD THIS LINE

Return a JSON object with this exact structure:
{
  "brand": "brand name here",
  "category": "category name here",
  "sku": "product SKU/code here"  // ADD THIS LINE
}

If you cannot determine the brand, use "Unknown" for brand.
If you cannot determine the category, use "Unknown" for category.
If you cannot determine the SKU, use "Unknown" for sku.  // ADD THIS LINE
Only return the JSON object, nothing else.
`;
```

**Update fallback in catch block (around line 148-152):**
```typescript
return {
  brand: 'Unknown',
  category: 'Unknown',
  sku: 'Unknown'  // ADD THIS LINE
};
```

### File: `lib/supabase.ts`

**Update BranghuntDetection interface (around line 24-42):**
```typescript
export interface BranghuntDetection {
  id: string;
  image_id: string;
  detection_index: number;
  bounding_box: {
    y0: number;
    x0: number;
    y1: number;
    x1: number;
  };
  confidence_score: number | null;
  brand_name: string | null;
  category: string | null;
  sku: string | null;  // ADD THIS LINE
  brand_extraction_prompt: string | null;
  brand_extraction_response: string | null;
  created_at: string;
  updated_at: string;
}
```

## Step 3: Update API Routes

### File: `app/api/detect/route.ts`

**Update detectionsToSave mapping (around line 47-63):**
```typescript
// Save detections to database (without brand names, categories, or SKUs yet)  // UPDATE COMMENT
const detectionsToSave = detections.map((detection, i) => ({
  image_id: imageId,
  detection_index: i,
  bounding_box: {
    y0: detection.box_2d[0],
    x0: detection.box_2d[1],
    y1: detection.box_2d[2],
    x1: detection.box_2d[3],
  },
  confidence_score: null,
  brand_name: null,
  category: null,
  sku: null,  // ADD THIS LINE
  brand_extraction_prompt: null,
  brand_extraction_response: null,
}));
```

### File: `app/api/extract-brand/route.ts`

**Update detection update call (around line 38-64):**
```typescript
// Update detection with brand name, category, and SKU  // UPDATE COMMENT
const { data: updatedDetection, error: updateError } = await supabase
  .from('branghunt_detections')
  .update({
    brand_name: productInfo.brand,
    category: productInfo.category,
    sku: productInfo.sku,  // ADD THIS LINE
    brand_extraction_prompt: `Product info extraction for detection ${detectionId}`,
    brand_extraction_response: JSON.stringify(productInfo),
  })
  .eq('id', detectionId)
  .select()
  .single();

if (updateError) {
  console.error('Failed to update detection:', updateError);
  throw new Error('Failed to update detection');
}

return NextResponse.json({ 
  success: true,
  brandName: productInfo.brand,
  category: productInfo.category,
  sku: productInfo.sku,  // ADD THIS LINE
  detection: updatedDetection,
  message: 'Product info extracted successfully' 
});
```

## Step 4: Update UI Components

### File: `app/analyze/[imageId]/page.tsx`

**Update Detection interface (around line 14-21):**
```typescript
interface Detection {
  id: string;
  detection_index: number;
  bounding_box: BoundingBox;
  brand_name: string | null;
  category: string | null;
  sku: string | null;  // ADD THIS LINE
}
```

**Update state after brand extraction (around line 118-123):**
```typescript
const data = await response.json();

// Update detection in state
setDetections(prev => prev.map(d => 
  d.id === detectionId ? { ...d, brand_name: data.brandName, category: data.category, sku: data.sku } : d  // ADD sku
));
```

**Add SKU display in bounding box label (around line 249-255):**
```typescript
{detection.brand_name && (
  <div className="absolute -bottom-8 left-0 right-0 px-2 py-1 text-xs font-semibold bg-white border-2 border-green-600 rounded text-center truncate">
    {detection.brand_name}
    {detection.category && <span className="text-gray-500"> • {detection.category}</span>}
    {detection.sku && detection.sku !== 'Unknown' && <span className="text-blue-500"> • SKU: {detection.sku}</span>}  // ADD THIS LINE
  </div>
)}
```

**Add SKU display in product list (around line 308-320):**
```typescript
{detection.brand_name ? (
  <div className="flex flex-col items-end">
    <span className="text-green-600 flex items-center gap-1">
      <CheckCircle className="w-4 h-4" />
      {detection.brand_name}
    </span>
    {detection.category && (
      <span className="text-xs text-gray-500">{detection.category}</span>
    )}
    {detection.sku && detection.sku !== 'Unknown' && (  // ADD THESE 3 LINES
      <span className="text-xs text-blue-500">SKU: {detection.sku}</span>
    )}
  </div>
) : (
```

### File: `app/results/[imageId]/page.tsx`

**Update Detection interface (around line 24-32):**
```typescript
interface Detection {
  id: string;
  detection_index: number;
  bounding_box: BoundingBox;
  brand_name: string | null;
  category: string | null;
  sku: string | null;  // ADD THIS LINE
  foodgraph_results: FoodGraphResult[];
}
```

**Add SKU display in product information (around line 181-208):**
```typescript
<div className="bg-gray-50 rounded-lg p-4 mb-4">
  <h3 className="font-semibold text-gray-900 mb-2">Product Information</h3>
  <div className="space-y-1">
    <div>
      <span className="text-sm text-gray-600">Brand: </span>
      <span className="text-lg text-indigo-600 font-semibold">
        {detections[selectedDetection].brand_name || 'Unknown'}
      </span>
    </div>
    {detections[selectedDetection].category && (
      <div>
        <span className="text-sm text-gray-600">Category: </span>
        <span className="text-base text-gray-700">
          {detections[selectedDetection].category}
        </span>
      </div>
    )}
    {detections[selectedDetection].sku && detections[selectedDetection].sku !== 'Unknown' && (  // ADD THESE 7 LINES
      <div>
        <span className="text-sm text-gray-600">SKU: </span>
        <span className="text-base text-blue-600 font-semibold">
          {detections[selectedDetection].sku}
        </span>
      </div>
    )}
  </div>
</div>
```

## Step 5: Update Documentation

### File: `PROJECT_SUMMARY.md`

**Update branghunt_detections table description (around line 59-63):**
```markdown
2. **branghunt_detections**
   - One record per detected product
   - Linked to parent image via `image_id`
   - Stores bounding box coordinates (normalized 0-1000)
   - Fields: id, image_id, detection_index, bounding_box, confidence_score, brand_name, category, sku, brand_extraction_prompt, brand_extraction_response
```

**Update workflow step 3 (around line 88-91):**
```markdown
┌─────────────────────────────────────────────────────────────┐
│ 3. PRODUCT INFO EXTRACTION (Gemini 2.5 Flash)              │
│    For each detection → Extract brand/category/SKU → Store │
└──────────────────────┬──────────────────────────────────────┘
```

## Step 6: Verify Implementation

1. **Run TypeScript compiler:**
   ```bash
   npm run build
   ```

2. **Check for linting errors:**
   ```bash
   npm run lint
   ```

3. **Test the feature:**
   - Upload a product image
   - Run detection
   - Extract brand/category/SKU for a product
   - Verify SKU is displayed in the UI
   - Check database to confirm SKU is stored

## Rollback Instructions

If you need to remove the SKU feature:

1. **Revert database migration:**
   ```sql
   ALTER TABLE branghunt_detections DROP COLUMN IF EXISTS sku;
   ```

2. **Revert code changes:**
   ```bash
   git revert HEAD
   ```

## Testing Checklist

- [ ] Database column added successfully
- [ ] TypeScript compiles without errors
- [ ] No linting errors
- [ ] Upload and detection works
- [ ] Brand/category/SKU extraction displays correct data
- [ ] SKU shows in bounding box labels
- [ ] SKU shows in product information panel
- [ ] "Unknown" appears when SKU cannot be determined
- [ ] Existing functionality unchanged

## Troubleshooting

**Issue**: SKU always shows "Unknown"
- **Solution**: Check Gemini API prompt is correctly formatted
- **Solution**: Verify image has visible product codes/barcodes
- **Solution**: Check Gemini API rate limits haven't been exceeded

**Issue**: Database errors when inserting detections
- **Solution**: Verify SKU column exists in database
- **Solution**: Check Supabase connection is active
- **Solution**: Review migration was applied correctly

**Issue**: TypeScript compilation errors
- **Solution**: Verify all interfaces updated with `sku` field
- **Solution**: Check optional chaining used: `detection.sku?.`
- **Solution**: Run `npm install` to update dependencies

## Additional Notes

- SKU extraction may not work for all product types
- Works best with clear, high-resolution images
- Barcodes and UPC codes are most reliably detected
- Some products may not have visible SKU information
- The "Unknown" fallback ensures graceful handling of missing data

---

**Implementation Status**: Ready for development  
**Estimated Time**: 30-45 minutes  
**Difficulty**: Medium  
**Breaking Changes**: None (all changes are backward compatible)

