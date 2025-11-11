# Contextual Analysis Markers

**Date:** November 11, 2025  
**Feature:** Visual indicators for contextually corrected fields

## Overview

Added visual markers to indicate when product fields (brand and size) have been automatically corrected by contextual analysis during batch processing.

## What Was Added

### 1. Detection Interface Updates

Added two new fields to the `Detection` interface in `app/analyze/[imageId]/page.tsx`:

```typescript
interface Detection {
  // ... existing fields ...
  
  // Contextual analysis fields
  corrected_by_contextual: boolean | null;
  contextual_correction_notes: string | null;
}
```

### 2. Visual Markers

#### Brand Marker
When `corrected_by_contextual` is `true`, a purple badge appears next to the brand name:

```tsx
{detection.corrected_by_contextual && (
  <span 
    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-300"
    title={detection.contextual_correction_notes || 'Brand corrected by contextual analysis'}
  >
    🔍 CONTEXTUAL
  </span>
)}
```

#### Size Marker
When both `corrected_by_contextual` is `true` AND the correction notes mention "size", a similar badge appears next to the size field:

```tsx
{detection.corrected_by_contextual && 
 detection.contextual_correction_notes && 
 detection.contextual_correction_notes.toLowerCase().includes('size') && (
  <span 
    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-300"
    title={detection.contextual_correction_notes}
  >
    🔍 CONTEXTUAL
  </span>
)}
```

## Badge Design

- **Color:** Purple (`bg-purple-100 text-purple-800`)
- **Icon:** 🔍 (magnifying glass) to represent contextual analysis
- **Size:** Extra small (`text-[10px]`)
- **Border:** Purple border for visibility
- **Tooltip:** Hover shows the full `contextual_correction_notes` explaining what was changed

## User Experience

### Before Contextual Analysis
```
Brand: Unknown                    60%
```

### After Contextual Analysis (with marker)
```
Brand: Athena  🔍 CONTEXTUAL     90%
```

Hovering over the badge shows:
```
Brand corrected from 'Unknown' (0%) to 'Athena' (90%) using contextual analysis
```

## Benefits

1. **Transparency:** Users can immediately see which fields were improved by contextual analysis
2. **Confidence:** Purple badge indicates AI-enhanced data quality
3. **Auditability:** Hover tooltip shows exactly what changed and why
4. **Batch Processing Validation:** Users can verify contextual analysis is working during batch operations

## Technical Details

### Data Flow
1. Batch contextual analysis runs (`/api/batch-contextual-analysis`)
2. When contextual confidence > original confidence, fields are updated
3. Database sets `corrected_by_contextual = true`
4. Database stores correction details in `contextual_correction_notes`
5. Frontend fetches detection data (fields already included via `SELECT *`)
6. UI displays badges when `corrected_by_contextual` is true

### Performance
- No additional API calls required (fields already fetched with detections)
- Minimal UI overhead (conditional rendering)
- Badge only renders when needed

## Related Features

- **Batch Contextual Analysis:** `/api/batch-contextual-analysis`
- **Manual Contextual Analysis:** Analyze page "Contextual Analysis" button
- **Contextual Correction Fields:** `corrected_by_contextual`, `contextual_correction_notes`

## Files Modified

- `app/analyze/[imageId]/page.tsx` (Detection interface + UI markers)

## Testing

To test this feature:

1. Upload an image with products that have "Unknown" or low-confidence brands
2. Run batch extraction to get initial detection data
3. Run batch contextual analysis
4. Visit the analyze page
5. Products with improved brands should show purple "🔍 CONTEXTUAL" badges
6. Hover over badges to see correction details

## Future Enhancements

- Add contextual markers for other fields (product name, flavor, category)
- Show "before/after" comparison in a modal when clicking the badge
- Add filter to show only contextually-corrected products
- Track accuracy metrics for contextual corrections

## Documentation

See also:
- `BATCH_CONTEXTUAL_ANALYSIS.md` - Batch processing details
- `CONTEXTUAL_ANALYSIS_AUTO_UPDATE.md` - Auto-update mechanism
- `CONTEXTUAL_ANALYSIS_STORAGE.md` - Database schema

