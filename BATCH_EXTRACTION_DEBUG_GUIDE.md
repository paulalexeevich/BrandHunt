# Batch Extraction Debug Guide

## Issue: "0 Products Extracted" Message

If you see a message like `✅ Completed: 8/8 images successful, 0 products extracted`, this means the batch extraction processed all images but failed to extract any product information.

## Root Cause Analysis

The batch extraction has multiple steps that can fail:
1. **Find Images** - Query images with `detection_completed = true`
2. **Find Detections** - Query detections with `brand_name IS NULL`
3. **Fetch Image Data** - Get image from S3 or database
4. **Call Gemini API** - Extract product info (brand, name, description)
5. **Save to Database** - Update detection records

**"0 products extracted"** means steps 1-3 succeeded but steps 4-5 failed for all detections.

## Database Verification

### Check Your Data
Run this query to verify detections exist:

```sql
-- Get project images and detection counts
SELECT 
  i.project_id,
  i.original_filename,
  i.detection_completed,
  COUNT(d.id) as total_detections,
  COUNT(d.id) FILTER (WHERE d.brand_name IS NULL) as needs_extraction,
  COUNT(d.id) FILTER (WHERE d.brand_name IS NOT NULL) as already_extracted
FROM branghunt_images i
LEFT JOIN branghunt_detections d ON d.image_id = i.id
WHERE i.project_id = 'YOUR_PROJECT_ID_HERE'
GROUP BY i.id, i.project_id, i.original_filename, i.detection_completed
ORDER BY i.created_at;
```

### Expected Results
```
project_id    | original_filename | detection_completed | total_detections | needs_extraction | already_extracted
91b36228-...  | original          | true                | 70               | 70               | 0
91b36228-...  | original          | true                | 84               | 84               | 0
...
```

If `needs_extraction` is 0 for all images, then all products were already extracted!

## Enhanced Logging (Nov 11, 2025)

The batch extraction API now includes detailed logging to help diagnose failures:

### What to Look For in Logs

**1. Project and Image Discovery:**
```
📋 Starting batch info extraction for project 91b36228-c5ce-4230-9fd1-23bc2c8afea4 with concurrency 15...
📸 Found 8 images with detections for project 91b36228-c5ce-4230-9fd1-23bc2c8afea4
```

If you see `⚠️ No images found`, check that:
- You're on the correct project page
- Images have `detection_completed = true`

**2. Detection Discovery:**
```
  📋 Extracting info from original (image_id: 4c6d9446-cef4-4931-8937-da9377f5a59e)...
  🔍 Found 70 detections needing extraction for original
  📦 Extracting info for 70 detections in parallel...
```

If you see `  ℹ️ No unprocessed detections`, all detections already have brand_name set.

**3. Extraction Results:**
```
  ✅ Extracted info for 70/70 detections in original (0 Gemini errors, 0 DB errors)
```

**Error Breakdown:**
- `X Gemini errors` = Gemini API extraction failures (rate limiting, API errors)
- `Y DB errors` = Database update failures (schema issues, RLS policies)

**4. Final Summary:**
```
✅ Batch extraction complete: 8/8 images successful, 0 failed, 655 total detections processed
   Project: 91b36228-c5ce-4230-9fd1-23bc2c8afea4, Concurrency: 15
```

## Common Failure Patterns

### Pattern 1: All Gemini API Errors
```
❌ Extraction failed for detection 0: 429 Too Many Requests
❌ Extraction failed for detection 1: 429 Too Many Requests
...
✅ Extracted info for 0/70 detections (70 Gemini errors, 0 DB errors)
```

**Cause:** Rate limiting from Gemini API  
**Solution:** 
- Reduce concurrency from 15 to 10 or 8
- Wait a few minutes before retrying
- Check Gemini API quota in Google Cloud Console

### Pattern 2: All DB Update Errors
```
❌ DB update failed for detection 0: null value in column "confidence" violates not-null constraint
❌ DB update failed for detection 1: null value in column "confidence" violates not-null constraint
...
✅ Extracted info for 0/70 detections (0 Gemini errors, 70 DB errors)
```

**Cause:** Database schema mismatch or RLS policy issue  
**Solution:**
- Check database schema matches API expectations
- Verify RLS policies allow updates
- Check for NOT NULL constraints on optional fields

### Pattern 3: Mixed Errors
```
✅ Extracted info for 45/70 detections (15 Gemini errors, 10 DB errors)
```

**Cause:** Partial failures due to intermittent issues  
**Solution:**
- Retry the batch extraction (it will only process remaining detections)
- Check logs for specific error patterns

### Pattern 4: Already Extracted
```
  ℹ️ No unprocessed detections in original (all already have brand_name)
  ℹ️ No unprocessed detections in original (all already have brand_name)
...
✅ Completed: 8/8 images successful, 0 products extracted
```

**Cause:** All detections already processed  
**Solution:** This is expected! All products already have extraction data.

## How to View Logs

### Method 1: Server Logs File
```bash
tail -f /Users/pavelp/Desktop/BrangHunt/dev-server.log
```

### Method 2: Terminal Running Next.js
Look at the terminal where you ran `npm run dev`

### Method 3: Browser Console
1. Open browser developer tools (F12)
2. Go to Console tab
3. Look for fetch errors when clicking "Batch Extract Info"

## Step-by-Step Debugging

### Step 1: Verify Data Exists
Run the SQL query above to confirm you have detections that need extraction.

### Step 2: Check Project ID
Make sure the project ID in your browser URL matches your data:
```
https://branghunt.vercel.app/projects/91b36228-c5ce-4230-9fd1-23bc2c8afea4
```

### Step 3: Run Batch Extraction
Click "Batch Extract Info" and watch the logs.

### Step 4: Analyze Log Output
Look for the patterns described above to identify the failure type.

### Step 5: Apply Solution
Based on the failure pattern, apply the appropriate solution.

## Testing After Fix

### 1. Clear Test Data (Optional)
If you want to test fresh extraction:
```sql
UPDATE branghunt_detections
SET 
  brand_name = NULL,
  product_name = NULL,
  product_description = NULL,
  brand_extracted = false,
  brand_extracted_at = NULL
WHERE image_id IN (
  SELECT id FROM branghunt_images 
  WHERE project_id = 'YOUR_PROJECT_ID'
);
```

### 2. Run Batch Extraction
Click "Batch Extract Info" again.

### 3. Verify Success
You should see:
```
✅ Completed: 8/8 images successful, 655 products extracted
```

### 4. Check Database
```sql
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE brand_name IS NOT NULL) as extracted
FROM branghunt_detections d
JOIN branghunt_images i ON i.id = d.image_id
WHERE i.project_id = 'YOUR_PROJECT_ID';
```

Should show `extracted = 655`.

## Configuration Adjustments

### Reduce Concurrency (If Rate Limited)
Edit `/app/projects/[projectId]/page.tsx` line 325:
```typescript
// Before
concurrency: 15

// After (if hitting rate limits)
concurrency: 8
```

### Increase Timeout (If Slow Network)
Edit `/app/api/batch-extract-project/route.ts` line 6:
```typescript
// Before
export const maxDuration = 300; // 5 minutes

// After (if needed)
export const maxDuration = 600; // 10 minutes
```

## Related Documentation
- `GEMINI_EXTRACTION_OPTIMIZATION.md` - Concurrency configuration
- `BATCH_ERROR_REPORTING.md` - Error message enhancements
- `DETECTION_CONFIDENCE_THRESHOLD.md` - Detection filtering

## Support Checklist

When reporting issues, include:
- [ ] Project ID from URL
- [ ] Number of images and detections (from SQL query)
- [ ] Full log output from batch extraction
- [ ] Error pattern (Gemini errors, DB errors, or mixed)
- [ ] Screenshot of error message on UI
- [ ] Browser console errors (if any)

This information will help quickly identify and resolve the issue.

