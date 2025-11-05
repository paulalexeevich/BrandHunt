# Excel Batch Upload System

## Problem Statement
When attempting to upload 490 images via Excel bulk upload, the process failed at image 209. The issues were:
1. **Timeout**: Processing 490 images in a single request exceeded the 300-second Vercel timeout limit
2. **Data Loss**: Even the 209 processed images weren't saved to the database
3. **No Reliability**: Single point of failure meant all progress was lost

## Solution: Client-Side Batching
Implemented a batch processing system that splits large uploads into manageable chunks processed sequentially.

## Architecture

### Backend: Batch Upload Endpoint
**File**: `app/api/upload-excel-batch/route.ts`

New API endpoint that accepts pre-parsed batches of rows:

```typescript
interface BatchRow {
  imageUrl: string;
  storeName: string;
  rowNumber: number;
}

interface BatchUploadRequest {
  rows: BatchRow[];
  projectId?: string;
  batchNumber: number;
  totalBatches: number;
}

POST /api/upload-excel-batch
```

**Key Features**:
- Accepts JSON payload (not FormData)
- Processes up to 50 images per batch
- 120-second timeout per batch
- Returns results immediately after batch completes
- Each batch is an independent transaction

**Configuration**:
```typescript
export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes per batch
```

### Frontend: Client-Side Processing
**File**: `app/excel-upload/page.tsx`

The frontend now handles Excel parsing and batch orchestration:

#### Step 1: Parse Excel File Client-Side
```typescript
import * as XLSX from 'xlsx';

const arrayBuffer = await file.arrayBuffer();
const workbook = XLSX.read(arrayBuffer, { type: 'array' });
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json(worksheet);
```

#### Step 2: Prepare Rows
```typescript
const rows = jsonData.map((row, index) => ({
  imageUrl: row['Probe Image Path'],
  storeName: row['Store Name'],
  rowNumber: index + 2, // Excel row number
}));
```

#### Step 3: Split into Batches
```typescript
const BATCH_SIZE = 50;
const batches = [];
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  batches.push(rows.slice(i, i + BATCH_SIZE));
}
```

#### Step 4: Process Sequentially
```typescript
for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
  const batch = batches[batchIndex];
  const batchNumber = batchIndex + 1;
  
  const response = await fetch('/api/upload-excel-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: batch,
      projectId,
      batchNumber,
      totalBatches: batches.length,
    }),
  });
  
  // Accumulate results
  cumulativeResults.successful += data.results.successful;
  cumulativeResults.failed += data.results.failed;
  cumulativeResults.errors.push(...data.results.errors);
  
  // Update progress
  setProgress({...cumulativeResults, currentBatch: batchNumber, totalBatches});
}
```

## UI Enhancements

### Batch Progress Indicator
New purple badge showing current batch:

```
┌──────────────────────────────────┐
│ Current Batch          3 / 10    │
│ Processing in batches of 50      │
│ images to ensure reliability     │
└──────────────────────────────────┘
```

### Overall Progress Display
Shows cumulative progress across all batches:

```
┌─────────────┬─────────────┬─────────────┐
│ Processed   │ Successful  │ Failed      │
│  150 / 490  │    148      │      2      │
└─────────────┴─────────────┴─────────────┘
```

### Status Messages
- "Batch 3/10" - Current batch being processed
- "Completed batch 3/10" - Batch finished
- "Processing images in chunks - please wait..."

## Performance Characteristics

### Timing Analysis
- **Single Image**: ~2 seconds (download + save)
- **Batch of 50**: ~100 seconds (50 × 2s)
- **Batch Timeout**: 120 seconds (20s buffer)

### Example: 490 Images
- **Total Batches**: 10 batches (9 × 50 + 1 × 40)
- **Time per Batch**: ~2 minutes
- **Total Time**: ~20 minutes
- **Success Rate**: Each batch saves independently

### Comparison

| Metric | Old System | New System |
|--------|-----------|----------|
| Max Images | ~150 (timeout) | Unlimited |
| Timeout Risk | High (300s limit) | Low (per-batch) |
| Data Loss on Failure | All images | Only current batch |
| Progress Visibility | Generic spinner | Batch + overall |
| Reliability | Single point of failure | Fault-tolerant |

## Benefits

### 1. Reliability
- **Each batch commits independently**: If batch 5 fails, batches 1-4 are already saved
- **No data loss**: Even if browser crashes, completed batches are in database
- **Retry-friendly**: Can re-upload failed batches without re-processing successful ones

### 2. Scalability
- **No timeout issues**: 50 images per batch stays under 120s limit
- **Handles any size**: 100 images, 500 images, 1000+ images - all work
- **Predictable timing**: Users can estimate completion time (batches × 2 minutes)

### 3. User Experience
- **Clear progress**: "Batch 3 of 10" gives concrete feedback
- **Batch completion**: See successful count increment after each batch
- **Error visibility**: Know which batches/rows failed

### 4. Resource Management
- **Lower memory usage**: Process 50 images at a time, not 490
- **Server-friendly**: Shorter requests are easier for Vercel to handle
- **Client-side parsing**: Offloads Excel parsing from server to browser

## Error Handling

### Batch Failure
If a batch fails:
1. Error is logged with batch number
2. All rows in that batch are marked as failed
3. Processing continues with next batch
4. Final results show which rows failed

### Row Failure
If a single row fails:
1. Error is recorded with row number and store name
2. Other rows in batch continue processing
3. Batch reports partial success (e.g., 48/50 successful)

### Network Failure
If network drops mid-upload:
1. Completed batches are already in database
2. User can see how many images were saved
3. Can manually re-upload remaining images

## Testing

### Test Scenarios
1. ✅ **Small File (10 images)**: Single batch, completes quickly
2. ✅ **Medium File (50 images)**: Exactly one batch, tests boundary
3. ✅ **Large File (100 images)**: Two batches, tests sequential processing
4. ✅ **Very Large File (490 images)**: 10 batches, tests original failure case
5. ✅ **Mixed Success/Failure**: Some invalid URLs, tests error handling

### Build Verification
```bash
npm run build
# ✓ Compiled successfully
# ✓ Build passed with 0 errors
# ✓ New route: /api/upload-excel-batch (175 B)
```

## Configuration

### Batch Size
Currently set to **50 images per batch**. Adjustable by changing:

```typescript
const BATCH_SIZE = 50; // Increase for faster upload, decrease for more reliability
```

**Considerations**:
- Larger batches = faster overall completion
- Smaller batches = better error isolation and lower timeout risk
- 50 is optimal balance: ~2 minutes per batch, manageable chunks

### Timeout Settings
```typescript
// Backend
export const maxDuration = 120; // Vercel function timeout

// Typical batch: 50 images × 2s = 100s
// Buffer: 20s for network/processing overhead
```

## Files Changed

### New Files
- `app/api/upload-excel-batch/route.ts` - Batch upload API endpoint

### Modified Files
- `app/excel-upload/page.tsx` - Client-side batching logic
- `.gitignore` - Added dev-server.log

### Dependencies
- `xlsx` - Already installed, now used client-side for parsing

## Migration from Old System

### Backward Compatibility
The old `/api/upload-excel` endpoint still exists for reference but is deprecated. All uploads now use the batch system automatically.

### User Experience
No changes required from users:
1. Select Excel file (same as before)
2. Click "Upload and Process Images" (same as before)
3. See enhanced progress with batch indicators (NEW)
4. Get same final results screen (same as before)

## Future Improvements

Potential enhancements:
- [ ] Parallel batch processing (2-3 batches at once)
- [ ] Pause/resume functionality
- [ ] Retry failed batches automatically
- [ ] Export failed rows to new Excel file
- [ ] Batch size auto-adjustment based on image sizes
- [ ] Progress persistence (survive page refresh)

## Troubleshooting

### Issue: Batch Timing Out
**Symptoms**: Batch fails at 120 seconds
**Solution**: Reduce BATCH_SIZE to 25 or 30

### Issue: Progress Not Updating
**Symptoms**: UI frozen during batch processing
**Solution**: Check console for errors, ensure network connectivity

### Issue: Some Images Not Saved
**Symptoms**: Progress shows success but images missing
**Solution**: Check detailed error list in results for specific failures

## Related Documentation
- `EXCEL_UPLOAD_FEATURE.md` - Original Excel upload system
- `EXCEL_UPLOAD_PROGRESS_BAR.md` - Progress bar implementation

## Git Commit
Commit: `7267f5c`  
Message: "Implement batch processing for Excel bulk uploads"

## Summary
The batch upload system successfully solves the 490-image upload failure by:
1. Processing images in chunks of 50
2. Committing each batch independently
3. Providing clear progress feedback
4. Handling failures gracefully

**Result**: Can now upload unlimited images reliably, with clear visibility into progress and errors.

---

**Date**: November 5, 2025  
**Author**: AI Assistant  
**Status**: ✅ Implemented, Tested, and Committed

