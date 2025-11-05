# Detection Status Fix

## Issue
Images in project pages were showing "Not detected" badge even when they had products detected (e.g., "56 products detected" when clicking on the image).

## Root Cause
**Field Mismatch:** Detection APIs and project page were using different database fields to track detection status:
- **Detection APIs** (YOLO and Gemini): Setting `processed` and `processing_status` fields
- **Project Page**: Checking `detection_completed` field

This caused a disconnect where images had detections saved but weren't marked as "completed" in the project view.

## Date Fixed
November 5, 2025

## Solution

### 1. Updated YOLO Detection API (`app/api/detect-yolo/route.ts`)
**Changed lines 168-177:**
```typescript
// Update image status - set detection_completed flag
await supabase
  .from('branghunt_images')
  .update({
    processed: true,
    processing_status: 'completed',
    detection_completed: true,              // ADDED
    detection_completed_at: new Date().toISOString(),  // ADDED
  })
  .eq('id', imageId);
```

### 2. Updated Gemini Detection API (`app/api/detect/route.ts`)
**Changed lines 126-135:**
```typescript
// Update image status - set detection_completed flag
await supabase
  .from('branghunt_images')
  .update({ 
    processing_status: 'detected',
    processed: false,
    detection_completed: true,              // ADDED
    detection_completed_at: new Date().toISOString(),  // ADDED
  })
  .eq('id', imageId);
```

### 3. Created Migration for Existing Data
**File:** `migrations/fix_detection_completed_flag.sql`

Updates all existing images that have detections but aren't marked as `detection_completed = true`.

```sql
UPDATE branghunt_images
SET 
  detection_completed = true,
  detection_completed_at = NOW()
WHERE 
  detection_completed = false
  AND id IN (
    SELECT DISTINCT image_id 
    FROM branghunt_detections
  );
```

**Migration Result:** Fixed 19 existing images

## Testing

### Before Fix:
- Project page shows image with "❌ Not detected" badge
- Click on image → Shows "56 products detected" in analyze page
- Status mismatch confuses users

### After Fix:
- Project page shows image with "✅ 56 products" badge
- Status correctly reflects detection state
- Consistent status across all pages

## Database Fields Used

### Image Status Fields:
- `detection_completed` (BOOLEAN) - Main field for tracking if detection ran
- `detection_completed_at` (TIMESTAMP) - When detection was completed
- `processed` (BOOLEAN) - Legacy field (still set for backwards compatibility)
- `processing_status` (TEXT) - Human-readable status

### Usage:
- **Project pages:** Check `detection_completed` to show badges
- **Detection APIs:** Set both `detection_completed` and `processed` fields
- **Stats views:** Use `detection_completed` for counting images with detection

## Commit
```
commit 61584a0
Fix detection status not updating in project page
```

## Related Files
- `app/api/detect-yolo/route.ts` - YOLO detection API
- `app/api/detect/route.ts` - Gemini detection API  
- `app/projects/[projectId]/page.tsx` - Project detail page (reads detection_completed)
- `migrations/fix_detection_completed_flag.sql` - Data migration script

## Future Considerations

1. **Standardize Status Fields:** Consider deprecating redundant fields (`processed`, `processing_status`) in favor of just `detection_completed`
2. **Status Enum:** Create a proper status enum instead of multiple boolean flags
3. **Real-time Updates:** Add subscription to automatically refresh project page when detection completes
4. **Batch Status Updates:** When running batch detection, ensure status updates happen atomically

## Key Learning
When displaying database-derived status in UI, ensure the API that updates the data writes to the EXACT fields the UI reads from. Field name mismatches cause silent failures where data exists but UI shows incorrect state.

