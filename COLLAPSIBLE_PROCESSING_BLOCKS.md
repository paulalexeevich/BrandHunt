# Collapsible Image Processing Blocks Feature

**Date:** November 12, 2025  
**Status:** ✅ IMPLEMENTED  
**Impact:** UX Enhancement - Cleaner default UI, processing controls on-demand

## Overview

Added a collapsible "Image Processing" button in the header that toggles the visibility of Block 1 (Extract Information) and Block 2 (Product Matching with FoodGraph). This reduces visual clutter and provides a cleaner default experience for users focused on product analysis.

## User Experience

### Before:
- Block 1 and Block 2 always visible after detection
- Processing blocks cluttered the page
- Users had to scroll past them to see product details
- No way to hide batch processing controls

### After:
- **Blocks hidden by default** - cleaner page on load
- **"Image Processing" button** in header to show/hide blocks
- Users can focus on product analysis without distractions
- One-click access to batch processing when needed

## Button Design

### Location:
- Header section, next to "Delete Image" button
- Always visible and easily accessible

### Visual States:

**Inactive/Collapsed (Default):**
```
┌─────────────────────────────────┐
│  💻 Image Processing            │  ← Indigo outline style
└─────────────────────────────────┘
```
- Background: `bg-indigo-100` (light indigo)
- Text: `text-indigo-700` (dark indigo)
- Border: `border-2 border-indigo-300`
- Hover: `hover:bg-indigo-200`

**Active/Expanded:**
```
┌─────────────────────────────────┐
│  💻 Image Processing            │  ← Solid indigo style
└─────────────────────────────────┘
```
- Background: `bg-indigo-600` (solid indigo)
- Text: `text-white`
- Hover: `hover:bg-indigo-700`

### Icon:
- Uses `Cpu` icon from `lucide-react`
- Represents computational processing operations

## Implementation Details

### 1. State Management

**Added State:**
```typescript
const [showProcessingBlocks, setShowProcessingBlocks] = useState(false);
```

**Default:** `false` - blocks hidden by default

### 2. Button Component

**Location:** `app/analyze/[imageId]/page.tsx` lines 1405-1416

```tsx
<button
  onClick={() => setShowProcessingBlocks(!showProcessingBlocks)}
  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
    showProcessingBlocks
      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
      : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-2 border-indigo-300'
  }`}
>
  <Cpu className="w-4 h-4" />
  Image Processing
</button>
```

### 3. Conditional Rendering

**Wrapped Components:**

1. **Block 1: Extract Information** (line 1498)
```tsx
{showProcessingBlocks && productsDetected && (() => {
  // Block 1 content
})()}
```

2. **Block 2: Product Matching** (line 1554)
```tsx
{showProcessingBlocks && productsDetected && (() => {
  // Block 2 content
})()}
```

3. **Block 1 Progress Indicators** (line 1710)
```tsx
{showProcessingBlocks && (processingStep1 || processingStep2 || step1Progress || step2Progress) && (
  // Progress display
)}
```

4. **Pipeline Progress Tracking** (line 1737)
```tsx
{showProcessingBlocks && ((processingPipelineAI || processingPipelineVisual || pipelineProgress) || (processingStep3 || step3Progress)) && (
  // Pipeline progress display
)}
```

### 4. Icon Import

**Added to imports:**
```typescript
import { ArrowLeft, Loader2, CheckCircle, Package, Trash2, ChevronDown, Settings, Cpu } from 'lucide-react';
```

## User Workflow

### Scenario 1: Default View (Analysis Focus)
1. User opens photo analysis page
2. Processing blocks hidden by default
3. Clean view showing detected products and analysis results
4. User can immediately interact with products

### Scenario 2: Batch Processing
1. User clicks "Image Processing" button
2. Block 1 and Block 2 appear
3. User can run batch operations:
   - Extract Info
   - Extract Price
   - FoodGraph Search (both pipelines)
4. Progress indicators show operation status
5. Click button again to hide blocks and return to analysis

### Scenario 3: Active Processing
- If processing is running when page loads
- Blocks remain visible (if already opened)
- Progress indicators show real-time updates
- User can collapse after reviewing progress

## Benefits

### ✅ Cleaner Default UI
- Page loads without processing clutter
- Focus on product analysis
- Better visual hierarchy

### ✅ On-Demand Access
- One click to reveal processing controls
- Always accessible via header button
- Clear visual feedback (active/inactive states)

### ✅ Better UX Flow
- Users focused on analysis don't see batch controls
- Users who need batch processing can easily access
- Reduces cognitive load for casual users

### ✅ Maintains Functionality
- All batch processing features still available
- Progress tracking still works
- No functionality removed, just hidden by default

### ✅ Consistent with Block 2 Design
- Block 2 already had collapsible header
- Now entire section is collapsible
- Unified collapsible design pattern

## Technical Notes

### State Persistence:
- State does NOT persist across page reloads
- Always starts collapsed (hidden) by default
- This is intentional - clean state on each page load

### Conditional Logic:
- Uses `&&` operator for conditional rendering
- Maintains existing `productsDetected` check
- Adds `showProcessingBlocks` as additional condition
- Progress indicators also gated by same condition

### Performance:
- Zero performance impact when hidden
- Components not rendered (true conditional, not CSS hidden)
- React doesn't mount hidden components

## Future Enhancements

### Possible Improvements:
1. **State Persistence:** Remember user preference (localStorage)
2. **Auto-Expand:** Automatically expand when processing starts
3. **Notification Badge:** Show count of ready products on collapsed button
4. **Keyboard Shortcut:** Quick toggle with keyboard (e.g., `Ctrl+P`)
5. **Smart Default:** Expand if batch operations are in progress

### Considerations:
- Current design prioritizes clean default state
- State persistence could be added if users request it
- Auto-expand could be confusing if user explicitly collapsed

## Related Features

- **Block 2 Collapsible Header:** Internal collapsible within Block 2
- **Product Statistics Panel:** Always visible (not affected by this toggle)
- **Product Selection:** Always visible (not affected by this toggle)

## Testing Scenarios

### Test 1: Default State
- ✅ Open photo analysis page
- ✅ Verify blocks are hidden
- ✅ Verify "Image Processing" button shows outline style

### Test 2: Toggle Visibility
- ✅ Click "Image Processing" button
- ✅ Verify blocks appear
- ✅ Verify button changes to solid style
- ✅ Click again to hide
- ✅ Verify button returns to outline style

### Test 3: During Processing
- ✅ Expand blocks
- ✅ Start batch processing
- ✅ Verify progress indicators appear
- ✅ Collapse blocks
- ✅ Verify progress indicators hidden
- ✅ Expand again - progress still updating

### Test 4: After Processing Complete
- ✅ Run batch processing to completion
- ✅ Verify results saved
- ✅ Collapse blocks
- ✅ Verify product results still visible

## Files Modified

1. **app/analyze/[imageId]/page.tsx**
   - Line 6: Added `Cpu` icon import
   - Line 148: Added `showProcessingBlocks` state
   - Lines 1405-1425: Added button in header with flex wrapper
   - Line 1498: Wrapped Block 1 with conditional
   - Line 1554: Wrapped Block 2 with conditional
   - Line 1710: Wrapped Block 1 progress with conditional
   - Line 1737: Wrapped Pipeline progress with conditional

## Git Information

- **Commit:** `946704c`
- **Branch:** `main`
- **Date:** November 12, 2025
- **Commit Message:** "feat: add collapsible Image Processing button to hide/show Block 1 and Block 2"

## Conclusion

This feature successfully reduces visual clutter while maintaining full access to batch processing functionality. Users get a cleaner default experience focused on product analysis, with one-click access to processing controls when needed. The implementation is clean, performant, and follows React best practices for conditional rendering.

**Key Achievement:** Better UX through progressive disclosure - show advanced features only when users need them.

