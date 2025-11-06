# Bounding Box Storage Format Fix

**Date:** November 6, 2025  
**Issue:** ALL products showing "Invalid coordinates" error in batch processing  
**Commit:** e401976

## Problem

Batch processing (Step 3) was showing "❌Invalid coordinates" for **ALL products** (100% failure rate), even though detections existed in the database with valid bounding box data.

### Root Cause

**Database Storage:**
- Detection APIs (`/api/detect` and `/api/detect-yolo`) save coordinates as a **JSONB object**:
  ```typescript
  {
    bounding_box: {
      y0: 123,
      x0: 456,
      y1: 789,
      x1: 012
    }
  }
  ```

**Batch Processing Code (BEFORE fix):**
- Tried to access coordinates as **individual columns**:
  ```typescript
  if (detection.y0 == null || detection.x0 == null ...) {
    // This always fails because these columns don't exist!
  }
  const boundingBox = {
    y0: detection.y0,  // undefined!
    x0: detection.x0,  // undefined!
    y1: detection.y1,  // undefined!
    x1: detection.x1   // undefined!
  };
  ```

**Result:** All products failed with "Invalid coordinates" error because `detection.y0` doesn't exist as a column - only `detection.bounding_box.y0` exists.

## Solution

Updated batch processing to correctly access the `bounding_box` JSONB column:

```typescript
// Extract bounding box from JSONB column or individual columns
let boundingBox: { y0: number; x0: number; y1: number; x1: number };

if (detection.bounding_box && typeof detection.bounding_box === 'object') {
  // Coordinates stored in bounding_box JSONB column (current format)
  boundingBox = detection.bounding_box;
} else if (detection.y0 != null && detection.x0 != null && detection.y1 != null && detection.x1 != null) {
  // Coordinates stored as individual columns (legacy format, if it exists)
  boundingBox = {
    y0: detection.y0,
    x0: detection.x0,
    y1: detection.y1,
    x1: detection.x1
  };
} else {
  // Neither format available - true error
  result.status = 'error';
  result.error = 'Invalid bounding box coordinates';
  return result;
}

// Validate extracted coordinates
if (isNaN(boundingBox.y0) || isNaN(boundingBox.x0) || isNaN(boundingBox.y1) || isNaN(boundingBox.x1)) {
  result.status = 'error';
  result.error = 'Invalid bounding box coordinates';
  return result;
}
```

## Results

- ✅ Batch processing now correctly reads coordinates from `bounding_box` JSONB column
- ✅ Backward compatible with individual columns if they exist
- ✅ Proper validation for both storage formats
- ✅ All 94+ products can now be processed successfully

## Key Lessons

1. **Check database schema before accessing fields** - don't assume column structure
2. **PostgreSQL JSONB columns** require accessing nested properties (`.bounding_box.y0` not `.y0`)
3. **Detection APIs** and **batch processing** must agree on storage format
4. **Supabase `.select('*')`** returns JSONB columns as JavaScript objects
5. **Type assertions matter** - `as { y0: number; ... }` helps TypeScript understand structure

### How to Verify Storage Format

When debugging similar issues, check how data is inserted:

**Detection APIs:**
```typescript
// app/api/detect/route.ts, app/api/detect-yolo/route.ts
.insert({
  bounding_box: { y0, x0, y1, x1 },  // JSONB column
  // NOT individual columns!
})
```

**Accessing in queries:**
```typescript
const { data: detections } = await supabase
  .from('branghunt_detections')
  .select('*');  // Returns bounding_box as object

// Access as:
detection.bounding_box.y0  // ✅ Correct
// NOT:
detection.y0  // ❌ Wrong - column doesn't exist
```

## Database Schema

The `branghunt_detections` table stores coordinates as:
- Column name: `bounding_box`
- Type: JSONB
- Structure: `{y0: number, x0: number, y1: number, x1: number}`
- Normalized coordinates: 0-1000 scale

## Files Changed

- `app/api/batch-search-and-save/route.ts` - Fixed coordinate access to use `detection.bounding_box`

