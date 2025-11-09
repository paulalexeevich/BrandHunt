# Classification & Confidence - Quick Reference

## 🎯 At a Glance

### Classification Fields
- **`is_product`**: `true` = actual product | `false` = price tag, fixture, or empty space
- **`details_visible`**: `true` = text readable | `false` = too blurry, far, or obscured
- **`extraction_notes`**: Human-readable explanation (e.g., "Product too far/blurry")

### Confidence Scores (0.0 - 1.0)
Each extracted field gets a confidence score:
- `brand_confidence`
- `product_name_confidence`
- `category_confidence`
- `flavor_confidence`
- `size_confidence`
- `description_confidence`
- `sku_confidence`

---

## 📊 Confidence Interpretation

| Score | Badge | Meaning | Action |
|-------|-------|---------|--------|
| 0.9-1.0 | 🟢 Excellent | Completely certain | Auto-accept |
| 0.7-0.8 | 🟢 Good | Very confident | Generally safe |
| 0.5-0.6 | 🟡 Moderate | Some uncertainty | Review recommended |
| 0.3-0.4 | 🟠 Low | Mostly guessing | Manual verification |
| 0.0-0.2 | 🔴 Poor | Not visible | Do not use |

---

## 💡 Common Patterns

### Perfect Extraction
```
✅ is_product: true
✅ details_visible: true
📝 extraction_notes: "Clear view of all details"
🟢 brand_confidence: 0.95
🟢 product_name_confidence: 0.90
```

### Blurry Product
```
✅ is_product: true
❌ details_visible: false
📝 extraction_notes: "Product too far/blurry"
🔴 brand_confidence: 0.20
🔴 product_name_confidence: 0.15
```

### Non-Product Detection
```
❌ is_product: false
❌ details_visible: false
📝 extraction_notes: "Price tag only - not a product"
🔴 All confidences: 0.0
```

### Partially Visible
```
✅ is_product: true
✅ details_visible: true
📝 extraction_notes: "Brand visible, size partially obscured"
🟢 brand_confidence: 0.90
🟠 size_confidence: 0.35
```

---

## 🔍 SQL Queries

### Get High-Quality Extractions
```sql
SELECT * FROM branghunt_detections
WHERE is_product = TRUE
  AND details_visible = TRUE
  AND brand_confidence >= 0.8
  AND product_name_confidence >= 0.8;
```

### Find Items Needing Review
```sql
SELECT * FROM branghunt_detections
WHERE is_product = TRUE
  AND (brand_confidence < 0.6 
       OR product_name_confidence < 0.6);
```

### Count Non-Products
```sql
SELECT COUNT(*) FROM branghunt_detections
WHERE is_product = FALSE;
```

### Average Confidence by Category
```sql
SELECT 
  category,
  AVG(brand_confidence) as avg_brand,
  AVG(product_name_confidence) as avg_name,
  COUNT(*) as count
FROM branghunt_detections
WHERE is_product = TRUE
GROUP BY category
ORDER BY avg_brand DESC;
```

---

## 🎨 UI Display Examples

### Confidence Badge (React/Tailwind)
```tsx
function ConfidenceBadge({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 0.9) return 'bg-green-100 text-green-800';
    if (score >= 0.7) return 'bg-green-100 text-green-700';
    if (score >= 0.5) return 'bg-yellow-100 text-yellow-800';
    if (score >= 0.3) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };
  
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${getColor()}`}>
      {Math.round(score * 100)}%
    </span>
  );
}
```

### Classification Badge
```tsx
function ClassificationBadge({ detection }: { detection: Detection }) {
  if (!detection.is_product) {
    return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
      ❌ Not a Product
    </span>;
  }
  
  if (!detection.details_visible) {
    return <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
      ⚠️ Details Not Visible
    </span>;
  }
  
  return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
    ✅ Valid Product
  </span>;
}
```

### Product Info with Confidence
```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <span className="font-medium">Brand:</span>
    <div className="flex items-center gap-2">
      <span>{detection.brand_name}</span>
      <ConfidenceBadge score={detection.brand_confidence || 0} />
    </div>
  </div>
  
  <div className="flex items-center justify-between">
    <span className="font-medium">Product:</span>
    <div className="flex items-center gap-2">
      <span>{detection.product_name}</span>
      <ConfidenceBadge score={detection.product_name_confidence || 0} />
    </div>
  </div>
</div>
```

---

## 🔄 Workflow Integration

### Step 1: Extract with Classification
```typescript
const result = await fetch('/api/extract-brand', {
  method: 'POST',
  body: JSON.stringify({ detectionId })
});

const data = await result.json();
console.log(data.isProduct);         // true/false
console.log(data.detailsVisible);    // true/false
console.log(data.brandConfidence);   // 0.0-1.0
```

### Step 2: Filter by Quality
```typescript
// Skip non-products
if (!data.isProduct) {
  console.log('Skipping non-product:', data.extractionNotes);
  return;
}

// Check minimum confidence
if (data.brandConfidence < 0.5) {
  console.log('Low confidence brand extraction');
  // Queue for manual review
}
```

### Step 3: Auto-Accept High Confidence
```typescript
if (data.brandConfidence >= 0.9 && data.productNameConfidence >= 0.9) {
  // Automatically proceed to FoodGraph search
  await searchFoodGraph(detectionId);
} else {
  // Show to user for confirmation
  showReviewInterface(data);
}
```

---

## 📈 Analytics Examples

### Quality Dashboard Query
```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_product = TRUE) as products,
  COUNT(*) FILTER (WHERE is_product = FALSE) as non_products,
  ROUND(AVG(brand_confidence)::numeric, 2) as avg_brand_conf,
  ROUND(AVG(product_name_confidence)::numeric, 2) as avg_name_conf,
  COUNT(*) FILTER (WHERE brand_confidence >= 0.9) as excellent,
  COUNT(*) FILTER (WHERE brand_confidence < 0.5) as needs_review
FROM branghunt_detections
WHERE brand_name IS NOT NULL;
```

### Results:
```
total | products | non_products | avg_brand | avg_name | excellent | needs_review
------|----------|--------------|-----------|----------|-----------|-------------
  456 |     423  |      33      |   0.87    |   0.82   |    312    |     45
```

---

## 🎯 Tips & Best Practices

1. **Always Check Classification First**
   - Verify `is_product = TRUE` before processing
   - Skip non-products to save API calls

2. **Use Confidence Thresholds**
   - Auto-accept: ≥ 0.9
   - Review: 0.5 - 0.8
   - Reject: < 0.5

3. **Read Extraction Notes**
   - Provides context for failures
   - Helps identify systematic issues

4. **Monitor Trends**
   - Track average confidence over time
   - Identify problematic categories
   - Assess image quality improvements

5. **Filter Before Processing**
   - Pre-filter low confidence items
   - Don't waste FoodGraph searches on uncertain data
   - Focus manual review efforts

---

**Created:** November 9, 2025  
**Status:** ✅ Ready to Use

