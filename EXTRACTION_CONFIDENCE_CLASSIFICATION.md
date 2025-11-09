# Extraction Confidence & Classification System

**Date:** November 9, 2025  
**Feature:** Enhanced product information extraction with classification and confidence scoring

---

## 📋 Overview

Enhanced the product information extraction system to provide:
1. **Classification** - Determines if detected item is actually a product and if details are visible
2. **Confidence Scores** - Per-field confidence levels (0.0 to 1.0) for every extracted field

This allows the system to distinguish between actual products and non-products (price tags, shelf fixtures, empty spaces), and provides quantitative measures of extraction quality.

---

## 🗄️ Database Changes

### New Columns Added to `branghunt_detections`

```sql
-- Classification fields
is_product              BOOLEAN          -- Whether the item is actually a product
details_visible         BOOLEAN          -- Whether product details are clearly visible
extraction_notes        TEXT             -- Notes about extraction quality/issues

-- Confidence scores (0.0 to 1.0)
brand_confidence        DECIMAL(3,2)     -- Confidence for brand name
product_name_confidence DECIMAL(3,2)     -- Confidence for product name
category_confidence     DECIMAL(3,2)     -- Confidence for category
flavor_confidence       DECIMAL(3,2)     -- Confidence for flavor/variant
size_confidence         DECIMAL(3,2)     -- Confidence for size/weight
description_confidence  DECIMAL(3,2)     -- Confidence for description
sku_confidence          DECIMAL(3,2)     -- Confidence for SKU/barcode
```

### Indexes Created

```sql
-- Query products vs non-products
CREATE INDEX idx_detections_is_product 
ON branghunt_detections(is_product) 
WHERE is_product = TRUE;

-- Query items with visible details
CREATE INDEX idx_detections_details_visible 
ON branghunt_detections(details_visible) 
WHERE details_visible = TRUE;
```

---

## 🔄 Updated ProductInfo Interface

```typescript
export interface ProductInfo {
  // Classification fields
  isProduct: boolean;              // true if this is a product
  detailsVisible: boolean;         // true if details are visible
  extractionNotes?: string;        // Explanation of issues/quality
  
  // Product fields
  brand: string;
  productName: string;
  category: string;
  flavor: string;
  size: string;
  description: string;
  sku: string;
  
  // Confidence scores (0.0 to 1.0)
  brandConfidence: number;
  productNameConfidence: number;
  categoryConfidence: number;
  flavorConfidence: number;
  sizeConfidence: number;
  descriptionConfidence: number;
  skuConfidence: number;
}
```

---

## 🤖 Enhanced Gemini Prompt

The extraction prompt now includes:

### Classification Instructions

```
FIRST, determine classification:
1. Is this actually a product? (vs shelf fixture, price tag, empty space, or non-product item)
2. Are product details clearly visible? (can you read brand, product name, or other text?)
```

### Confidence Scoring Guidelines

```
For EACH extracted field, provide a confidence score from 0.0 to 1.0:
- 1.0 = Completely certain, text is clearly visible and readable
- 0.8 = Very confident, minor uncertainty
- 0.6 = Moderately confident, some guessing involved
- 0.4 = Low confidence, mostly guessing
- 0.2 = Very uncertain
- 0.0 = Unknown/not visible
```

### Important Rules

```
- If isProduct = false, set all confidence scores to 0.0 and all fields to "Unknown"
- If detailsVisible = false, you can still set isProduct = true, but confidence scores should be low (0.0-0.4)
- Use Unknown for any field you cannot determine
- Be honest about confidence - lower scores for partially visible or unclear text
```

---

## 📊 Confidence Score Interpretation

| Score Range | Interpretation | Use Case |
|------------|----------------|----------|
| 0.9 - 1.0  | Excellent - Text clearly visible | Safe to use directly |
| 0.7 - 0.8  | Good - Minor uncertainty | Generally reliable |
| 0.5 - 0.6  | Moderate - Some guessing | Review before using |
| 0.3 - 0.4  | Low - Mostly guessing | Manual verification needed |
| 0.0 - 0.2  | Very Poor - Not visible | Do not use |

---

## 🔧 API Updates

### Updated Routes

1. **`/api/extract-brand`** - Single product extraction
   - Now saves classification fields
   - Saves confidence scores for all fields
   - Returns full classification and confidence data

2. **`/api/batch-extract-info`** - Batch processing
   - Processes all detections regardless of classification
   - Logs `isProduct` and `detailsVisible` status
   - Saves complete confidence data

### Response Format

```json
{
  "success": true,
  "isProduct": true,
  "detailsVisible": true,
  "extractionNotes": "Clear view of all details",
  
  "brandName": "Tru Fru",
  "brandConfidence": 0.95,
  
  "productName": "Frozen Fruit Strawberries",
  "productNameConfidence": 0.90,
  
  "category": "Frozen Food",
  "categoryConfidence": 0.85,
  
  "flavor": "Strawberry",
  "flavorConfidence": 0.80,
  
  "size": "8 oz",
  "sizeConfidence": 0.75,
  
  "description": "Dark Chocolate Covered Strawberries",
  "descriptionConfidence": 0.85,
  
  "sku": "123456789012",
  "skuConfidence": 0.90
}
```

---

## 💡 Use Cases

### 1. Filter Non-Products

```sql
-- Get only actual products with visible details
SELECT * FROM branghunt_detections
WHERE is_product = TRUE 
  AND details_visible = TRUE;
```

### 2. Quality Filtering

```sql
-- Get high-confidence brand extractions
SELECT * FROM branghunt_detections
WHERE is_product = TRUE
  AND brand_confidence >= 0.8;
```

### 3. Manual Review Queue

```sql
-- Get low-confidence extractions needing review
SELECT * FROM branghunt_detections
WHERE is_product = TRUE
  AND (brand_confidence < 0.5 
       OR product_name_confidence < 0.5);
```

### 4. Classification Analysis

```sql
-- Analyze detection accuracy
SELECT 
  is_product,
  COUNT(*) as count,
  AVG(brand_confidence) as avg_brand_conf,
  AVG(product_name_confidence) as avg_name_conf
FROM branghunt_detections
WHERE brand_name IS NOT NULL
GROUP BY is_product;
```

---

## 🎯 Example Scenarios

### Scenario 1: Perfect Detection
```json
{
  "isProduct": true,
  "detailsVisible": true,
  "extractionNotes": "Clear view of all product details",
  "brand": "Reese's",
  "brandConfidence": 1.0,
  "productName": "Peanut Butter Cups",
  "productNameConfidence": 0.95
}
```

### Scenario 2: Blurry Product
```json
{
  "isProduct": true,
  "detailsVisible": false,
  "extractionNotes": "Product too far/blurry to read text",
  "brand": "Unknown",
  "brandConfidence": 0.2,
  "productName": "Unknown",
  "productNameConfidence": 0.1
}
```

### Scenario 3: Non-Product
```json
{
  "isProduct": false,
  "detailsVisible": false,
  "extractionNotes": "Not a product - price tag only",
  "brand": "Unknown",
  "brandConfidence": 0.0,
  "productName": "Unknown",
  "productNameConfidence": 0.0
}
```

### Scenario 4: Partially Visible
```json
{
  "isProduct": true,
  "detailsVisible": true,
  "extractionNotes": "Brand visible but size partially obscured",
  "brand": "Nestle",
  "brandConfidence": 0.9,
  "size": "Unknown",
  "sizeConfidence": 0.3
}
```

---

## 📈 Benefits

### 1. **Data Quality**
- Quantitative measure of extraction reliability
- Filter out low-confidence extractions
- Focus manual review on uncertain cases

### 2. **Non-Product Detection**
- Identify false positives (price tags, shelf fixtures)
- Reduce wasted processing on non-products
- Improve overall accuracy metrics

### 3. **Visibility Issues**
- Track when products are detected but unreadable
- Identify image quality problems
- Guide image capture improvements

### 4. **Analytics & Reporting**
- Average confidence by product category
- Detection quality over time
- Camera/lighting quality assessment

### 5. **Workflow Optimization**
- Auto-accept high-confidence extractions (≥0.9)
- Queue medium-confidence for review (0.5-0.8)
- Auto-reject low-confidence (≤0.4)
- Skip non-products from further processing

---

## 🔄 Backward Compatibility

### Existing Data
- Existing detections will have `NULL` values for new fields
- System continues to work with missing confidence data
- Can be gradually populated through re-extraction

### Legacy Code
- All APIs maintain backward compatibility
- Old fields (`brand_name`, etc.) still populated
- New fields are optional additions

---

## 🚀 Future Enhancements

### Potential Additions
1. **Weighted Confidence** - Combine field confidences into overall score
2. **Confidence Thresholds** - Configurable per-field acceptance thresholds
3. **Confidence Trends** - Track confidence over time to assess improvements
4. **Active Learning** - Use confidence to select training examples
5. **UI Indicators** - Visual badges showing confidence levels (🟢🟡🔴)

### Analytics Queries
```sql
-- Overall extraction quality metrics
SELECT 
  COUNT(*) as total_products,
  COUNT(*) FILTER (WHERE is_product = TRUE) as actual_products,
  AVG(brand_confidence) FILTER (WHERE is_product = TRUE) as avg_brand_conf,
  COUNT(*) FILTER (WHERE details_visible = FALSE) as visibility_issues
FROM branghunt_detections
WHERE brand_name IS NOT NULL;
```

---

## 📝 Migration Instructions

### Apply Database Migration

```bash
# Run the migration
psql -h [SUPABASE_HOST] -U postgres -d postgres -f migrations/add_extraction_confidence_fields.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Paste contents of `migrations/add_extraction_confidence_fields.sql`
3. Run query

### Verify Migration

```sql
-- Check new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'branghunt_detections' 
  AND column_name IN ('is_product', 'details_visible', 'brand_confidence');

-- Should return 3 rows
```

---

## 🏷️ Git Commit

```bash
git add migrations/add_extraction_confidence_fields.sql
git add lib/gemini.ts
git add lib/supabase.ts
git add app/api/batch-extract-info/route.ts
git add app/api/extract-brand/route.ts
git add EXTRACTION_CONFIDENCE_CLASSIFICATION.md

git commit -m "Add classification and confidence scoring to product extraction

- Add is_product, details_visible classification fields
- Add per-field confidence scores (0.0-1.0) for all extracted data
- Enhanced Gemini prompt with classification instructions
- Updated ProductInfo interface with new fields
- Modified API routes to save classification and confidence
- Created indexes for classification queries
- Complete backward compatibility maintained

Benefits:
- Identify non-products (price tags, fixtures)
- Quantify extraction quality per field
- Enable confidence-based filtering and review
- Improve overall system accuracy"
```

---

## 📚 Related Documentation
- `PRODUCT_DETAILS_ENHANCEMENT.md` - Original product extraction feature
- `PRICE_EXTRACTION_FEATURE.md` - Price extraction with confidence
- `SKU_IMPLEMENTATION_GUIDE.md` - SKU/barcode extraction

---

**Status:** ✅ Complete and Ready for Testing

