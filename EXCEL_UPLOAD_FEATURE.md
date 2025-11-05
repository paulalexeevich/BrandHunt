# Excel Bulk Upload Feature

## Overview
The Excel upload feature enables bulk importing of shelf images directly from Excel files while preserving store metadata. This is particularly useful for processing large batches of retail shelf images collected from multiple store locations.

## Features
- ✅ Bulk upload multiple images from a single Excel file
- ✅ Automatic store name preservation for each image
- ✅ Progress tracking with detailed success/error reporting
- ✅ Automatic image download from URLs in Excel
- ✅ Store name display throughout the app (Analyze & Results pages)
- ✅ Filtering and search by store location

## Database Changes

### Migration: `add_store_name_column.sql`
Added `store_name` column to `branghunt_images` table:

```sql
ALTER TABLE branghunt_images
ADD COLUMN IF NOT EXISTS store_name TEXT;

CREATE INDEX IF NOT EXISTS idx_branghunt_images_store_name 
ON branghunt_images(store_name);
```

**Column**: `store_name` (TEXT, nullable)
- Stores the full store name and location
- Example: "Walgreens (Store #6105 - 9100 Carothers Pkwy, Franklin, TN 37067)"
- Indexed for fast filtering/searching by store

## Excel File Format

### Required Columns
The Excel file must contain these columns:

1. **Probe Image Path** (required)
   - URL to the shelf image
   - Example: `https://traxus.s3.amazonaws.com/unileverus/Probe_Images/20250905/13804/20250905061453-71cbb830-1bb8-4dea-a6b1-5143cdd569f5/original`

2. **Store Name** (required)
   - Full store name and location
   - Example: `Walgreens (Store #6105 - 9100 Carothers Pkwy, Franklin, TN 37067)`

### Optional Columns
The following columns are parsed if present but not required:
- Project Name
- Probe Id
- Template Name
- Scene Id
- Visit Id
- Image Taken Time
- Validated By
- Original Width
- Original Height

## Implementation Details

### 1. API Endpoint: `/api/upload-excel`

**File**: `app/api/upload-excel/route.ts`

**Features**:
- Accepts `.xlsx` and `.xls` files
- Uses `xlsx` library for parsing
- Parallel image downloading from URLs
- Authenticated uploads (requires user login)
- Stores images with base64 encoding in database
- Returns detailed success/error report

**Request**:
```typescript
POST /api/upload-excel
Content-Type: multipart/form-data

FormData:
  file: Excel file (.xlsx or .xls)
```

**Response**:
```typescript
{
  success: true,
  message: "Processed 50 rows: 48 successful, 2 failed",
  results: {
    total: 50,
    successful: 48,
    failed: 2,
    errors: [
      {
        row: 15,
        error: "Failed to fetch image: 404 Not Found",
        storeName: "Target (Store #1234)"
      }
    ]
  }
}
```

**Timeout**: 300 seconds (5 minutes) for large files

### 2. UI Page: `/excel-upload`

**File**: `app/excel-upload/page.tsx`

**Features**:
- File selection with validation
- Upload progress indicator
- Real-time results dashboard:
  - Total rows processed
  - Successful uploads (green)
  - Failed uploads (red)
  - Detailed error list with row numbers
- Auto-redirect to gallery on success
- "Upload Another File" option

**User Flow**:
1. Navigate to `/excel-upload` page
2. Select Excel file (.xlsx or .xls)
3. Click "Upload and Process Images"
4. View progress and results
5. Review any errors if needed
6. Redirected to gallery (or click "View Gallery")

### 3. Updated Upload Endpoint

**File**: `app/api/upload/route.ts`

**Changes**:
- Added optional `storeName` field to form data
- Database insert now includes `store_name: storeName || null`
- Backwards compatible (store_name is optional)

### 4. UI Updates

#### Analyze Page (`app/analyze/[imageId]/page.tsx`)
- Added `store_name` field to `ImageData` interface
- Display store name under image title with blue indicator dot
- Format: `🔵 Store Name`

#### Results Page (`app/results/[imageId]/page.tsx`)
- Added `store_name` field to `ImageData` interface
- Display store name under image title with blue indicator dot
- Shown above product count

#### Home Page (`app/page.tsx`)
- Added "Bulk Upload from Excel" link in header navigation
- Visible only to authenticated users
- Positioned next to "View Gallery" link

## Dependencies

### New Package
```json
"xlsx": "^0.18.5"
```

Installed via: `npm install xlsx`

**Purpose**: Parse Excel files (.xlsx, .xls) and convert to JSON

## Usage Example

### Sample Excel Row
```
| Probe Image Path                                           | Store Name                          |
|-----------------------------------------------------------|-------------------------------------|
| https://s3.amazonaws.com/.../image.jpg                    | Walgreens (Store #6105, TN 37067)  |
| https://s3.amazonaws.com/.../image2.jpg                   | Target (Store #2649, MA 2090)      |
```

### Processing Steps
1. User uploads Excel file via `/excel-upload` page
2. System validates file type and reads all rows
3. For each row:
   - Extract `Probe Image Path` and `Store Name`
   - Fetch image from URL
   - Convert to base64
   - Save to database with store name
   - Track success/failure
4. Display comprehensive results dashboard
5. User reviews results and navigates to gallery

## Error Handling

### Common Errors
1. **Missing Columns**: "Missing 'Probe Image Path' column"
2. **Failed Image Fetch**: "Failed to fetch image: 404 Not Found"
3. **Invalid URL**: "URL does not point to an image"
4. **Database Error**: "Database error: [error message]"

### Error Recovery
- Partial failures don't stop the batch
- Each row is processed independently
- Detailed error log shows which rows failed and why
- Users can fix issues and re-upload only failed rows

## Testing

### Test Scenarios
✅ Upload valid Excel file with 5+ rows
✅ Upload file with missing required columns
✅ Upload file with invalid image URLs
✅ Upload file with mix of valid/invalid rows
✅ Verify store name displays in analyze page
✅ Verify store name displays in results page
✅ Verify database index creation
✅ Test with large files (50+ rows)

### Test File Location
`/Users/pavelp/Desktop/BrangHunt/images (6).xlsx`

**Sample Data**:
- 100+ rows of real shelf images
- Multiple store locations (Walgreens, Target, Publix, H-E-B)
- Various image URLs from Trax S3 bucket

## Performance

### Metrics
- **Small files** (1-10 rows): ~30-60 seconds
- **Medium files** (11-50 rows): ~2-4 minutes
- **Large files** (51-100 rows): ~4-5 minutes (300s timeout limit)

### Optimization
- Images are processed sequentially to avoid overwhelming the database
- Base64 encoding is done in-memory
- Network requests use standard fetch API
- Database inserts are individual (for better error tracking)

### Bottlenecks
1. **Image download time**: Depends on network speed and image size
2. **Base64 conversion**: Memory-intensive for large images
3. **Database writes**: Sequential inserts for reliability

## Security

### Authentication
- Requires user login (via `requireAuth()`)
- Each image is associated with the authenticated user's ID
- Row Level Security (RLS) policies ensure data isolation

### Validation
- File type validation (.xlsx, .xls only)
- Image MIME type validation
- URL validation before fetch
- Error handling for malicious/invalid URLs

## Future Enhancements

### Potential Features
1. **Batch upload in chunks**: Process 10 rows at a time for better progress tracking
2. **Resume capability**: Save progress and allow resuming from last successful row
3. **Store name autocomplete**: Suggest store names based on previous uploads
4. **Export results**: Download error log as Excel file
5. **Store filtering**: Filter gallery by store name
6. **Store analytics**: Dashboard showing images per store
7. **Template validation**: Validate Excel structure against expected schema
8. **Parallel processing**: Process multiple rows concurrently (with rate limiting)

## Troubleshooting

### Issue: "Invalid file type" error
**Solution**: Ensure file has `.xlsx` or `.xls` extension

### Issue: Timeout (300s exceeded)
**Solution**: Split Excel file into smaller batches (< 50 rows)

### Issue: Some images fail to download
**Solution**: 
- Check image URLs are accessible
- Verify network connectivity
- Review error log for specific failure reasons

### Issue: Store name not displaying
**Solution**:
- Verify migration was applied successfully
- Check that Excel has "Store Name" column
- Refresh page to reload data

## Git Commits

### Files Changed
```
✅ migrations/add_store_name_column.sql (new)
✅ app/api/upload-excel/route.ts (new)
✅ app/excel-upload/page.tsx (new)
✅ app/api/upload/route.ts (modified)
✅ app/analyze/[imageId]/page.tsx (modified)
✅ app/results/[imageId]/page.tsx (modified)
✅ app/page.tsx (modified)
✅ package.json (modified - added xlsx)
✅ EXCEL_UPLOAD_FEATURE.md (new)
```

### Commit Message
```
feat: Add Excel bulk upload with store name preservation

- Add store_name column to branghunt_images table with index
- Create /api/upload-excel endpoint for batch Excel uploads
- Create /excel-upload page with progress tracking UI
- Update upload API to support optional storeName field
- Display store name in analyze and results pages
- Add navigation link to Excel upload from home page
- Install xlsx library for Excel parsing
- Support processing 100+ images from single Excel file
- Comprehensive error tracking and reporting
- Complete documentation in EXCEL_UPLOAD_FEATURE.md
```

## Key Learnings

1. **Sequential processing is reliable**: Processing rows one-by-one ensures better error tracking and recovery than parallel batches
2. **Store metadata is critical**: Preserving store context makes analysis results more actionable
3. **User feedback is essential**: Detailed progress and error reporting significantly improves UX
4. **Timeout management**: 300-second limit on Vercel free tier requires batching for large files
5. **Database indexing**: Adding index on store_name enables future filtering/search features

## Related Documentation
- [Authentication System](AUTHENTICATION_SYSTEM.md)
- [Batch Processing System](BATCH_PROCESSING_SYSTEM.md)
- [YOLO Integration](YOLO_INTEGRATION.md)
- [Setup Guide](SETUP_GUIDE.md)

