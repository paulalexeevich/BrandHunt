# 4-Stage Image Status System

## Overview
Implemented a clear, linear status progression for images in BrangHunt to replace confusing multiple boolean flags and text fields. Each image now has exactly one status that represents its current stage in the processing pipeline.

## Implementation Date
November 5, 2025

## Status Stages

### 1. 📤 Uploaded (Gray Badge)
**When:** Image is first uploaded to the system
- Image exists in database
- No processing has occurred yet
- Ready for detection

**Database:** `status = 'uploaded'`

### 2. 🎯 Detected (Blue Badge)
**When:** Detection algorithm has run successfully
- Products identified with bounding boxes
- Detections saved to branghunt_detections table
- Shows count: "56 detected"

**Database:** `status = 'detected'`
- Set by: `/api/detect-yolo` or `/api/detect` (Gemini)
- Also sets: `detection_completed = true`, `detection_completed_at = timestamp`

### 3. 📦 Extracted (Yellow Badge)
**When:** Brand and price information extracted
- Brand names, product names, categories extracted
- Price information extracted (even if some products missing price)
- Shows count: "56 extracted"

**Database:** `status = 'extracted'`
- Set by: `/api/batch-extract-price` after price extraction completes
- Indicates both brand AND price extraction attempted

### 4. ✅ Selected (Green Badge)
**When:** FoodGraph matches found and saved
- Products searched in FoodGraph database
- AI filtering applied
- Best matches selected and saved
- Shows count: "56 selected"

**Database:** `status = 'selected'`
- Set by: `/api/save-result` when saving FoodGraph match
- Indicates at least one detection is `fully_analyzed = true`

## Database Schema

### ENUM Type
```sql
CREATE TYPE image_status AS ENUM ('uploaded', 'detected', 'extracted', 'selected');
```

### Column
```sql
ALTER TABLE branghunt_images 
ADD COLUMN status image_status NOT NULL DEFAULT 'uploaded';
```

### Index
```sql
CREATE INDEX idx_branghunt_images_status ON branghunt_images(status);
```

## API Changes

### Upload API (`/api/upload`)
```typescript
status: 'uploaded',  // Explicitly set on upload
```

### Detection APIs (`/api/detect-yolo`, `/api/detect`)
```typescript
status: 'detected',
detection_completed: true,
detection_completed_at: new Date().toISOString()
```

### Extraction API (`/api/batch-extract-price`)
```typescript
// After price extraction loop completes
await supabase
  .from('branghunt_images')
  .update({ status: 'extracted' })
  .eq('id', imageId);
```

### Save Result API (`/api/save-result`)
```typescript
// After saving FoodGraph match
await supabase
  .from('branghunt_images')
  .update({ status: 'selected' })
  .eq('id', updatedDetection.image_id);
```

## UI Implementation

### Project Page Status Badges
```tsx
{/* 4 color-coded badges */}
{image.status === 'uploaded' && (
  <div className="bg-gray-400 text-white ...">
    <Upload className="w-3 h-3" />
    Uploaded
  </div>
)}

{image.status === 'detected' && (
  <div className="bg-blue-500 text-white ...">
    <Target className="w-3 h-3" />
    {detectionCount} detected
  </div>
)}

{image.status === 'extracted' && (
  <div className="bg-yellow-500 text-white ...">
    <Package className="w-3 h-3" />
    {detectionCount} extracted
  </div>
)}

{image.status === 'selected' && (
  <div className="bg-green-500 text-white ...">
    <CheckCircle className="w-3 h-3" />
    {detectionCount} selected
  </div>
)}
```

## Migration Details

### Initial Data Distribution
After migration (40 total images):
- **21 uploaded** (52.5%) - No processing yet
- **12 detected** (30.0%) - Detection completed, no extraction
- **0 extracted** (0%) - No images stopped at extraction stage
- **7 selected** (17.5%) - Fully processed

### Migration Logic
Priority order (highest to lowest):
1. **Selected** - Images with `fully_analyzed = true` detections
2. **Extracted** - Images with `brand_extracted = true` detections (but not fully analyzed)
3. **Detected** - Images with `detection_completed = true`
4. **Uploaded** - All remaining images

## Workflow

### Complete Processing Flow
```
1. User uploads image
   ↓ status = 'uploaded'
   
2. Run detection (YOLO or Gemini)
   ↓ status = 'detected'
   
3. Extract brand info (batch or individual)
   ↓ (still 'detected')
   
4. Extract prices (batch)
   ↓ status = 'extracted'
   
5. Search FoodGraph & AI filter
   ↓ (still 'extracted')
   
6. Save selected match
   ↓ status = 'selected' ✅
```

### Partial Workflows
Users can stop at any stage:
- **Upload only** → Status: uploaded (gray)
- **Upload + Detect** → Status: detected (blue)
- **Upload + Detect + Extract** → Status: extracted (yellow)
- **Complete workflow** → Status: selected (green)

## Benefits

### 1. **Clarity**
- One field instead of multiple (`processed`, `processing_status`, `detection_completed`)
- Clear visual representation of progress
- Easy to understand at a glance

### 2. **Simplicity**
- Linear progression: uploaded → detected → extracted → selected
- No confusion about "what stage is this image in?"
- Status always moves forward, never backward

### 3. **Performance**
- Single indexed column for queries
- Fast filtering: `WHERE status = 'detected'`
- Efficient status distribution queries

### 4. **Maintainability**
- ENUM type prevents invalid states
- Database-enforced constraints
- Self-documenting code

## Queries

### Count by Status
```sql
SELECT status, COUNT(*) as count
FROM branghunt_images
GROUP BY status;
```

### Find Images Ready for Processing
```sql
-- Ready for detection
SELECT * FROM branghunt_images WHERE status = 'uploaded';

-- Ready for extraction
SELECT * FROM branghunt_images WHERE status = 'detected';

-- Ready for FoodGraph search
SELECT * FROM branghunt_images WHERE status = 'extracted';
```

### Project Status Summary
```sql
SELECT * FROM branghunt_image_status_summary
WHERE project_id = 'project-uuid';
```

## Future Enhancements

### Status Counts in Project Stats
Could add to project stats view:
```sql
uploaded_count,
detected_count,
extracted_count,
selected_count
```

### Status Filters
Add filter buttons on project page:
- "Show only uploaded" (gray)
- "Show only detected" (blue)
- "Show only extracted" (yellow)
- "Show only selected" (green)

### Progress Visualization
Add progress bar showing:
```
[===uploaded===][===detected===][==extracted==][==selected==]
    52.5%            30%              0%           17.5%
```

### Batch Status Updates
Add bulk actions:
- "Detect all uploaded images"
- "Extract all detected images"
- "Process all extracted images"

## Files Modified
- `migrations/add_4_stage_status_system.sql` - Database migration
- `app/api/upload/route.ts` - Set 'uploaded' on upload
- `app/api/detect-yolo/route.ts` - Set 'detected' after YOLO
- `app/api/detect/route.ts` - Set 'detected' after Gemini
- `app/api/batch-extract-price/route.ts` - Set 'extracted' after price extraction
- `app/api/save-result/route.ts` - Set 'selected' after saving match
- `app/projects/[projectId]/page.tsx` - UI for status badges

## Commit
```
commit 935c766
Implement 4-stage image status system
```

## Testing Checklist
- [x] Migration applied successfully
- [x] New uploads set to 'uploaded'
- [x] Detection updates status to 'detected'
- [x] Price extraction updates status to 'extracted'
- [x] Saving match updates status to 'selected'
- [x] Project page shows correct color-coded badges
- [x] Status badges show product counts
- [x] Icons display correctly

## Related Documentation
- `DETECTION_STATUS_FIX.md` - Previous detection status issue
- `PROJECTS_SYSTEM.md` - Project management system
- `BATCH_PROCESSING_SYSTEM.md` - Batch processing implementation

