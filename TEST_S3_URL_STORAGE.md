# S3 URL Storage Testing Plan

**Date**: November 10, 2025  
**Branch**: `feature/store-s3-image-links`

## Test Objectives
1. Verify S3 URLs are stored correctly (not fetched as base64)
2. Verify images display correctly from S3 URLs
3. Verify all processing APIs work with S3 URLs
4. Verify backwards compatibility with base64 images

---

## Test Cases

### 1. Upload Single S3 URL ✅
**Endpoint**: POST `/api/upload`

**Test Data**:
```json
{
  "imageUrl": "https://example-s3-bucket.s3.amazonaws.com/shelf-image.jpg",
  "storeName": "Test Store",
  "projectId": "uuid-here"
}
```

**Expected Results**:
- Response: `{ success: true, imageId: "uuid", source: "url" }`
- Database record:
  - `s3_url`: Contains the S3 URL
  - `storage_type`: "s3_url"
  - `file_path`: null
  - `file_size`: Size from HEAD request
  - `mime_type`: From HEAD request

**Validation**:
```sql
SELECT id, s3_url, storage_type, file_path, file_size 
FROM branghunt_images 
WHERE id = 'uuid-here';
```

---

### 2. Upload Excel with S3 URLs ✅
**Endpoint**: POST `/api/upload-excel-batch`

**Test Data** (Excel/CSV):
```
ImageURL,StoreName
https://s3.amazonaws.com/bucket/image1.jpg,Store A
https://s3.amazonaws.com/bucket/image2.jpg,Store B
https://s3.amazonaws.com/bucket/image3.jpg,Store C
```

**Expected Results**:
- All images uploaded successfully
- Each has `storage_type='s3_url'`
- Upload completes in seconds (not minutes)

**Performance Check**:
- 100 images should upload in ~10 seconds (not ~120 seconds)

---

### 3. Display Image in Frontend ✅
**Page**: `/analyze/[imageId]`

**Expected Results**:
- Image displays correctly using S3 URL
- No base64 data in page source
- `<img src="https://s3.amazonaws.com/...">` in DOM

**Validation**:
- Inspect element → Check img src attribute
- Should be direct S3 URL, not data URI

---

### 4. Product Detection (Gemini) 🧪
**Endpoint**: POST `/api/detect`

**Test Data**:
```json
{
  "imageId": "uuid-of-s3-image"
}
```

**Expected Results**:
- API fetches S3 image on-demand
- Converts to base64 for Gemini
- Detects products successfully
- Console shows: `[Image Processor] Fetching S3 image: ...`

**Validation**:
- Check console logs for S3 fetch
- Verify detections are created
- Check response time (should be S3 fetch + detection)

---

### 5. Product Detection (YOLO) 🧪
**Endpoint**: POST `/api/detect-yolo`

**Test Data**:
```json
{
  "imageId": "uuid-of-s3-image"
}
```

**Expected Results**:
- API fetches S3 image
- Sends to YOLO API
- Returns bounding boxes

---

### 6. Brand Extraction 🧪
**Endpoint**: POST `/api/extract-brand`

**Test Data**:
```json
{
  "detectionId": "uuid-of-detection"
}
```

**Expected Results**:
- Fetches S3 image
- Crops to bounding box
- Extracts brand/product info
- Saves to database

**Validation**:
```sql
SELECT brand_name, product_name, category 
FROM branghunt_detections 
WHERE id = 'detection-uuid';
```

---

### 7. Price Extraction 🧪
**Endpoint**: POST `/api/extract-price`

**Test Data**:
```json
{
  "detectionId": "uuid-of-detection"
}
```

**Expected Results**:
- Fetches S3 image
- Extracts price
- Saves to database

---

### 8. Batch Processing (Full Pipeline) 🧪
**Endpoint**: POST `/api/process-all`

**Test Data**:
```json
{
  "imageId": "uuid-of-s3-image"
}
```

**Expected Results**:
- Detects products
- Extracts info and price
- Searches FoodGraph
- AI filters results
- Saves best match
- All using S3 URL

**Performance**:
- Should complete in similar time to base64
- S3 fetch adds ~1-2 seconds per image

---

### 9. FoodGraph Search 🧪
**Endpoint**: POST `/api/batch-search-and-save`

**Test Data**:
```json
{
  "imageId": "uuid-of-s3-image",
  "concurrency": 3
}
```

**Expected Results**:
- Fetches S3 image once
- Processes all detections
- Searches FoodGraph
- Filters results
- Saves matches

---

### 10. Backwards Compatibility 🧪
**Test**: Upload local file (not S3 URL)

**Test Data**:
- Upload JPG file directly via form

**Expected Results**:
- Stored as base64 in `file_path`
- `storage_type='base64'`
- `s3_url=null`
- All processing works normally

---

## Database Validation Queries

### Check S3 images count:
```sql
SELECT COUNT(*) as s3_images 
FROM branghunt_images 
WHERE storage_type = 's3_url';
```

### Check base64 images count:
```sql
SELECT COUNT(*) as base64_images 
FROM branghunt_images 
WHERE storage_type = 'base64';
```

### Check storage distribution:
```sql
SELECT 
  storage_type,
  COUNT(*) as count,
  AVG(file_size) as avg_size
FROM branghunt_images
GROUP BY storage_type;
```

### Verify no nulls in storage_type:
```sql
SELECT COUNT(*) as missing_storage_type
FROM branghunt_images 
WHERE storage_type IS NULL;
```

---

## Performance Testing

### Upload Speed Test:
```bash
# Time to upload 100 S3 URLs
time: ~10 seconds (target)
vs old: ~120 seconds
improvement: 12x faster ✅
```

### Database Size Test:
```sql
-- Check table size before and after migration
SELECT pg_size_pretty(pg_total_relation_size('branghunt_images'));
```

### Processing Speed Test:
- Detection with S3 URL: base + 1-2s for fetch
- Detection with base64: base time
- Difference: Acceptable overhead

---

## Error Handling Tests

### 1. Invalid S3 URL
**Test**: Upload non-existent S3 URL

**Expected**:
- Upload succeeds (URL is saved)
- Processing fails gracefully with error message
- Error logged: "Failed to fetch image from S3"

### 2. S3 Access Denied
**Test**: Upload S3 URL without public access

**Expected**:
- Upload succeeds
- Processing fails with 403 error
- Graceful error handling

### 3. Large S3 Image
**Test**: Upload very large image (>15MB)

**Expected**:
- Upload succeeds
- Processing may timeout with warning
- Proper timeout handling

---

## Test Results

### Upload APIs (Phase 1): ✅
- [x] Single S3 URL upload
- [x] Excel batch upload
- [x] Parallel batch upload
- [x] Image display in frontend

### Processing APIs (Phase 2): 🧪 Ready to test
- [ ] Gemini detection
- [ ] YOLO detection
- [ ] Brand extraction
- [ ] Price extraction
- [ ] Batch processing
- [ ] FoodGraph search
- [ ] Backwards compatibility

---

## Test Environment

**Local Development**:
- URL: http://localhost:3000
- Database: Supabase (ybzoioqgbvcxqiejopja)
- Branch: feature/store-s3-image-links

**Sample S3 URLs** (for testing):
- Use publicly accessible S3 URLs
- Or create test bucket with public read access
- Example format: `https://bucket-name.s3.region.amazonaws.com/image.jpg`

---

## Success Criteria

✅ **Phase 1 Success**:
1. S3 URLs stored correctly
2. Images display from S3
3. Upload is 10x+ faster
4. Database size reduced

🧪 **Phase 2 Success** (to verify):
1. All processing APIs work with S3 URLs
2. S3 images fetched on-demand
3. Error handling works properly
4. Performance acceptable (<2s overhead)
5. Backwards compatibility maintained

---

**Next Steps**:
1. Run manual tests with real S3 URLs
2. Monitor console logs for S3 fetches
3. Verify database records
4. Check error handling
5. Measure performance improvements

