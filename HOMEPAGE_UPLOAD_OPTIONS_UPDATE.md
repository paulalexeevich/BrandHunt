# Homepage Upload Options Update

**Date**: November 5, 2025  
**Commit**: 280b2c5

## Summary

Simplified the BrangHunt homepage to display only 2 upload options for a cleaner, more focused user experience.

## Changes Made

### Upload Options
1. **Bulk Upload Excel** - Purple/pink gradient button that links to `/excel-upload` page for batch image uploads
2. **S3 URL (Single Photo)** - Blue button for single image upload via S3 URL

### Code Changes

#### Removed
- File upload option and related UI
- `uploadMode` state (was `'file' | 'url'`, no longer needed)
- `selectedFile` state variable
- `handleFileSelect()` function
- File input interface and drag-and-drop area
- Upload mode toggle buttons
- Header navigation links (View Gallery, Bulk Upload from Excel)

#### Modified
- Simplified `handleUpload()` to only handle URL uploads
- Simplified `handleReset()` to remove file-related state
- Updated imports to add `FileSpreadsheet` icon, removed `Upload` icon
- Changed gallery link at bottom to only show for authenticated users

#### Added
- Prominent side-by-side buttons for the 2 upload options
- "S3 URL (Single Photo)" label for clarity
- "Bulk Upload Excel" button with `FileSpreadsheet` icon

### UI/UX Improvements

1. **Clearer User Intent**: Users now see exactly 2 options upfront
2. **Reduced Complexity**: Removed file upload, simplifying codebase by 77 lines
3. **Better Visual Hierarchy**: Two prominent, equal-width buttons with distinct colors
4. **Focused Experience**: S3 URL upload interface always visible below the options

### Technical Details

- **Lines Changed**: +48 insertions, -125 deletions
- **Files Modified**: `app/page.tsx`
- **Bundle Size Impact**: Reduced by removing unused file handling code

## User Flow

### Before
1. User sees "Upload File" and "S3 URL" tabs
2. User clicks tab to switch between modes
3. Interface changes based on selected mode

### After
1. User sees 2 prominent buttons: "Bulk Upload Excel" and "S3 URL (Single Photo)"
2. "Bulk Upload Excel" button redirects to `/excel-upload` page
3. S3 URL input interface always visible below buttons
4. Cleaner, more predictable experience

## Testing Checklist

- [x] S3 URL upload still works correctly
- [x] Bulk Excel link redirects to `/excel-upload` page
- [x] Authentication flow unchanged
- [x] Gallery link visible only for authenticated users
- [x] No TypeScript/linting errors
- [x] Responsive design maintained

## Notes

- The `/api/upload` endpoint still supports both file and URL uploads for backward compatibility
- Bulk Excel upload functionality unchanged (uses separate `/excel-upload` page)
- All authentication and RLS policies remain the same
- No database changes required

