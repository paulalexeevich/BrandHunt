# Batch Results Visibility - Test Plan & Expected Behavior

## Test Environment Setup Required

### Prerequisites
1. **User Authentication**: Logged-in user with image ownership
2. **Test Data**: At least one image with:
   - Batch-processed products (`fully_analyzed = true`)
   - Saved FoodGraph results in `branghunt_foodgraph_results` table
   - At least one "✓ ONE Match" product

### Test Data Generation
```sql
-- Verify test data exists
SELECT 
  i.id as image_id,
  i.original_filename,
  COUNT(d.id) as total_detections,
  SUM(CASE WHEN d.fully_analyzed = true THEN 1 ELSE 0 END) as completed_count
FROM branghunt_images i
LEFT JOIN branghunt_detections d ON d.image_id = i.id
WHERE i.user_id = '<current_user_id>'
GROUP BY i.id
HAVING SUM(CASE WHEN d.fully_analyzed = true THEN 1 ELSE 0 END) > 0;

-- Check FoodGraph results exist
SELECT 
  d.id,
  d.detection_index,
  d.brand_name,
  d.fully_analyzed,
  d.selected_foodgraph_result_id,
  COUNT(f.id) as foodgraph_count
FROM branghunt_detections d
LEFT JOIN branghunt_foodgraph_results f ON f.detection_id = d.id
WHERE d.image_id = '<test_image_id>'
  AND d.fully_analyzed = true
GROUP BY d.id;
```

## Test Cases

### Test Case 1: Navigate to Batch-Processed Product

**Steps:**
1. Navigate to `/projects`
2. Click on a project with completed products
3. Click on an image with detection status "✅ X products"
4. Or directly navigate to `/analyze/[imageId]` where image has batch-processed products

**Expected Result:**
- Page loads successfully
- Product Statistics panel displays with counts
- Image shows with green bounding boxes
- Products detected status shows "X products detected"

### Test Case 2: Filter to ONE Match Products

**Steps:**
1. On analyze page with batch-processed products
2. Locate Product Statistics panel with 7 category buttons
3. Click on "✓ ONE Match" button (green card)

**Expected Result:**
- Button shows active state:
  - Dark ring border (ring-2 ring-green-900)
  - "● Active" indicator appears below count
- Green filter banner appears above image:
  - Shows "🔍 Filter Active: ✓ ONE Match (X of Y products shown)"
  - Contains "Clear Filter" button
- Image updates to show only products with `fully_analyzed = true`
- All other products' bounding boxes are hidden

### Test Case 3: Click on Batch-Processed Product

**Steps:**
1. With "✓ ONE Match" filter active
2. Click on any green bounding box (saved product)

**Expected Result:**
- `handleBoundingBoxClick` is called
- Console log appears: `📦 Loading X saved FoodGraph results for product #Y`
- Right panel updates to show:
  - **Product #Y** header with green "✓ Saved" badge
  - Progress badges: ✓ Info, ✓ Search, ✓ Pre-Filter, ✓ AI Filter (all green)
  - ✅ Extracted Information section with saved match card
  - **Green banner** appears below actions:
    - Text: "✅ Batch Processing Complete - Match Saved"
    - Explanation: "The result marked with '🎯 SELECTED' below was automatically chosen..."

### Test Case 4: Verify FoodGraph Results Display

**Steps:**
1. Scroll down in right panel after clicking batch-processed product
2. Locate "FoodGraph Matches (X)" section

**Expected Result:**
- **Section IS VISIBLE** (not hidden despite `fully_analyzed = true`)
- Shows title: "FoodGraph Matches (X)" where X = number of results saved
- Results displayed in grid format (2 columns on desktop)
- Each result card shows:
  - Product image
  - Product name and brand
  - Result rank (#1, #2, etc.)
  - **ONE card has "🎯 SELECTED" badge** (top-left corner, green gradient)
  - Match status badge (top-right):
    - ✓ IDENTICAL (green)
    - ≈ ALMOST SAME (yellow)
    - ✗ FAIL (gray)
  - AI Assessment box with scores:
    - Match confidence percentage
    - Visual similarity percentage
    - Match reason text
  - Pre-filter score breakdown:
    - "Total Match: X%"
    - Brand match, Size match, Retailer match indicators
  - Comparison table (Extracted → FoodGraph):
    - Brand comparison
    - Size comparison
    - Retailer comparison with ✓/✗

### Test Case 5: Verify Selected Badge

**Steps:**
1. In FoodGraph results, locate the card with `id === detection.selected_foodgraph_result_id`

**Expected Result:**
- Card has **"🎯 SELECTED" badge** in top-left corner
- Badge styling:
  - `bg-gradient-to-r from-green-600 to-emerald-600`
  - White text
  - Rounded-full shape
  - Shadow-lg
  - Positioned absolutely at `top-2 left-2`
- Badge does NOT overlap with Match Status badge (top-right)

### Test Case 6: Review Alternative Options

**Steps:**
1. Scroll through all FoodGraph result cards
2. Compare the SELECTED result with alternatives

**Expected Result:**
- Can see ALL results that were evaluated (typically 1-20)
- Each shows complete scoring information
- Can verify the SELECTED result has:
  - Highest match confidence OR
  - Best match status (IDENTICAL > ALMOST_SAME) OR
  - Result of consolidation logic
- Can identify why alternatives were not chosen:
  - Lower scores
  - Different match_status
  - Failed retailer match
  - Lower visual similarity

### Test Case 7: Clear Filter and Test Manual Workflow

**Steps:**
1. Click "Clear Filter" button in green banner
2. Or click "Total Products" button to show all
3. Click on a product WITHOUT `fully_analyzed` (unprocessed product)

**Expected Result:**
- Filter resets to show all products
- Clicking unprocessed product shows:
  - Empty FoodGraph Results section (no saved results)
  - Manual action buttons visible (Extract Info, Search FoodGraph, etc.)
  - No green "Batch Processing Complete" banner
  - Normal manual workflow available

### Test Case 8: Verify State Management

**Steps:**
1. Open browser DevTools Console
2. Click between different products (saved vs unsaved)
3. Watch console logs

**Expected Result:**
- For saved products: `📦 Loading X saved FoodGraph results for product #Y`
- For unsaved products: No loading message
- State variables update correctly:
  - `foodgraphResults` populated from `detection.foodgraph_results`
  - `filteredCount` set to results length
  - `preFilteredCount` set to results length
- No errors in console

## Data Verification Queries

### Verify Results Were Saved During Batch Processing
```sql
SELECT 
  d.detection_index,
  d.brand_name,
  d.product_name,
  d.fully_analyzed,
  d.selected_foodgraph_result_id,
  COUNT(f.id) as saved_results_count,
  SUM(CASE WHEN f.match_status = 'identical' THEN 1 ELSE 0 END) as identical_count,
  SUM(CASE WHEN f.match_status = 'almost_same' THEN 1 ELSE 0 END) as almost_same_count,
  MAX(f.match_confidence) as max_confidence,
  MAX(f.visual_similarity) as max_similarity
FROM branghunt_detections d
LEFT JOIN branghunt_foodgraph_results f ON f.detection_id = d.id
WHERE d.image_id = '<test_image_id>'
  AND d.fully_analyzed = true
GROUP BY d.id
ORDER BY d.detection_index;
```

### Verify Selected Result Matches
```sql
SELECT 
  d.detection_index,
  d.selected_foodgraph_result_id,
  f.result_rank,
  f.product_name,
  f.match_status,
  f.match_confidence,
  f.visual_similarity
FROM branghunt_detections d
INNER JOIN branghunt_foodgraph_results f 
  ON f.id = d.selected_foodgraph_result_id
WHERE d.image_id = '<test_image_id>'
  AND d.fully_analyzed = true
ORDER BY d.detection_index;
```

## Known Issues During Testing

### Issue: Empty Images Array
**Symptom:** API returns `{"images": []}` despite database having images
**Cause:** RLS policies - logged-in user doesn't own the test images
**Solution:** 
```sql
-- Create test image owned by current user
INSERT INTO branghunt_images (user_id, original_filename, file_path, ...)
VALUES (auth.uid(), 'test.jpg', '<base64>', ...);
```

### Issue: Project Page Shows "No images"
**Symptom:** Project page displays "No images in this project yet"
**Cause:** Pagination or authentication issue
**Solution:** Navigate directly to `/analyze/[imageId]` with known image ID

## Success Criteria

✅ **Primary Goals:**
1. FoodGraph Results section visible for batch-processed products
2. Green "Batch Processing Complete" banner displays
3. 🎯 SELECTED badge appears on correct result card
4. All saved FoodGraph results display with scores
5. User can review alternatives and verify AI selection quality

✅ **Secondary Goals:**
1. No console errors when clicking products
2. State management works correctly (saved vs unsaved products)
3. Filter functionality works with batch results
4. Manual workflow unchanged for unprocessed products
5. Performance acceptable (<500ms to load results)

## Regression Testing

### Ensure Manual Workflow Still Works
1. Upload new image
2. Run Detect Products
3. Extract Info manually
4. Search FoodGraph manually
5. Filter with AI manually
6. Verify results show correctly
7. Save result manually
8. Verify no "SELECTED" badge on manual saves

## Browser Console Tests

```javascript
// Test 1: Verify detection has saved results
const detection = window.__NEXT_DATA__.props.pageProps.detections.find(d => d.fully_analyzed);
console.log('Detection:', detection);
console.log('Saved results count:', detection?.foodgraph_results?.length);

// Test 2: Verify selected result ID matches
const selectedId = detection?.selected_foodgraph_result_id;
const hasSelectedResult = detection?.foodgraph_results?.some(r => r.id === selectedId);
console.log('Selected ID:', selectedId);
console.log('Has matching result:', hasSelectedResult);

// Test 3: Check match statuses
const statuses = detection?.foodgraph_results?.map(r => r.match_status);
console.log('Match statuses:', statuses);
```

## Performance Benchmarks

- **Page Load:** < 2s for analyze page with 50 detections
- **Click Product:** < 100ms to load saved results into state
- **Render Results:** < 500ms to display 20 FoodGraph cards
- **Filter Toggle:** < 50ms to show/hide products
- **Memory:** < 100MB additional for 20 results with images

## Test Report Template

```
Date: ___________
Tester: ___________
Browser: ___________
Image ID: ___________

Test Case 1: Navigate to Product      [ PASS / FAIL ]
Test Case 2: Filter ONE Match          [ PASS / FAIL ]
Test Case 3: Click Product             [ PASS / FAIL ]
Test Case 4: Results Display           [ PASS / FAIL ]
Test Case 5: SELECTED Badge            [ PASS / FAIL ]
Test Case 6: Review Alternatives       [ PASS / FAIL ]
Test Case 7: Manual Workflow           [ PASS / FAIL ]
Test Case 8: State Management          [ PASS / FAIL ]

Overall: [ PASS / FAIL ]

Notes:
_________________________________
_________________________________
```

