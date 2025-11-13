# See Options Button Feature

**Date:** November 13, 2025  
**Status:** ✅ Complete

## Overview

Added a "See Options" button that hides/shows FoodGraph results and filter buttons on the product analysis page. This provides a cleaner default view and gives users control over when to display the detailed FoodGraph matching options.

## Implementation

### 1. **New State Variables**

Added two new state variables in `app/analyze/[imageId]/page.tsx`:

```typescript
const [showFoodGraphOptions, setShowFoodGraphOptions] = useState(false);
const [loadingFoodGraphResults, setLoadingFoodGraphResults] = useState(false);
```

- `showFoodGraphOptions`: Controls visibility of FoodGraph results section (default: `false` - hidden)
- `loadingFoodGraphResults`: Shows loading indicator while fetching results from API

### 2. **Handler Function**

Created `handleSeeOptions()` function (lines 911-940):

```typescript
const handleSeeOptions = async () => {
  if (!selectedDetection) return;

  const detection = detections.find(d => d.id === selectedDetection);
  if (!detection) return;

  // Toggle visibility
  if (showFoodGraphOptions) {
    setShowFoodGraphOptions(false);
    return;
  }

  // Show options and set Visual Match as default filter
  setShowFoodGraphOptions(true);
  setStageFilter('visual_match');

  // Load FoodGraph results if not already loaded
  if (foodgraphResults.length === 0 && detection.fully_analyzed) {
    setLoadingFoodGraphResults(true);
    try {
      console.log('📥 Loading FoodGraph results on-demand...');
      await fetchImage(true);
    } catch (err) {
      console.error('Error loading FoodGraph results:', err);
      setError('Failed to load FoodGraph results');
    } finally {
      setLoadingFoodGraphResults(false);
    }
  }
};
```

**Key Features:**
- Toggles visibility on/off when clicked
- Sets Visual Match as default filter when opening
- Loads FoodGraph results on-demand if not already loaded
- Shows loading indicator during fetch

### 3. **UI Button**

Added button before FoodGraph content section (lines 2044-2068):

```tsx
<div className="mb-4">
  <button
    onClick={handleSeeOptions}
    disabled={loadingFoodGraphResults}
    className="w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all font-semibold flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {loadingFoodGraphResults ? (
      <>
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading options...
      </>
    ) : (
      <>
        <ChevronDown className={`w-5 h-5 transition-transform ${showFoodGraphOptions ? 'rotate-180' : ''}`} />
        ⚙️ {showFoodGraphOptions ? 'Hide' : 'See'} Options
        {!showFoodGraphOptions && foodgraphResults.length > 0 && (
          <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {foodgraphResults.length} results
          </span>
        )}
      </>
    )}
  </button>
</div>
```

**Visual States:**
- **Closed:** Shows "⚙️ See Options" with result count badge
- **Open:** Shows "⚙️ Hide Options" with rotated chevron (180°)
- **Loading:** Shows spinner with "Loading options..." text
- **Disabled:** Opacity reduced, cursor not-allowed during loading

### 4. **Conditional Content Display**

Wrapped all FoodGraph content in conditional fragment (lines 2071-2276):

```tsx
{showFoodGraphOptions && (
  <>
    {/* Banner for batch-saved results */}
    {/* Info banner for confidence sorting */}
    {/* Match status breakdown */}
    {/* Visual match result */}
    {/* Consolidation applied banner */}
    {/* Search term display */}
    {/* FoodGraphResultsList component with filters */}
  </>
)}
```

**Hidden by Default:**
- All informational banners
- Processing stage filter buttons (Search, Pre-filter, AI Filter, Visual Match)
- FoodGraph product cards with images/details
- Match status breakdowns
- Visual similarity badges

## User Experience

### Default View (Options Hidden)
1. User sees product information and extracted fields
2. "See Options" button is visible if FoodGraph results exist or product is fully analyzed
3. Button shows result count badge (e.g., "100 results")
4. Clean, uncluttered interface focusing on product basics

### Opening Options
1. User clicks "See Options" button
2. **Visual Match filter is automatically selected** (default)
3. If results not loaded:
   - Loading indicator appears ("Loading options...")
   - API call fetches FoodGraph results with `fetchImage(true)`
   - Button disabled during fetch
4. Filter buttons appear (Search, Pre-filter, AI Filter, Visual Match)
5. Product cards display with visual similarity badges
6. All relevant banners and breakdowns visible

### Closing Options
1. User clicks "Hide Options" button (chevron rotated up)
2. All FoodGraph content collapses
3. Returns to clean default view
4. Results remain cached in state (no re-fetch needed)

## Benefits

### 1. **Cleaner Default Interface**
- Reduces visual clutter on initial page load
- Users see essential product info first
- Advanced options available on-demand

### 2. **Better Performance**
- On-demand loading: Only fetches FoodGraph results when user needs them
- Prevents unnecessary API calls for users who don't need matching details
- Results cached after first load

### 3. **User Control**
- Users decide when to see detailed matching options
- Toggle visibility as needed during analysis
- No information loss - all data still accessible

### 4. **Visual Match Priority**
- Automatically selects Visual Match filter when opening
- Highlights most relevant matching results
- Matches user workflow (review visual matches first)

### 5. **Clear Loading States**
- Spinner indicates when data is being fetched
- Button disabled during load (prevents multiple requests)
- Error handling with user-friendly messages

## Technical Details

### State Management
- **showFoodGraphOptions**: Boolean toggle for content visibility
- **loadingFoodGraphResults**: Boolean for loading state
- **stageFilter**: Automatically set to 'visual_match' when opening

### API Integration
- Uses existing `fetchImage(true)` function
- Parameter `true` includes FoodGraph results in response
- Respects existing on-demand loading pattern
- Error handling with fallback messages

### Styling
- **Button:** Indigo-to-purple gradient, full-width, prominent
- **Chevron:** Rotates 180° when open (visual feedback)
- **Badge:** Shows result count, white/20 opacity background
- **Loading:** Spinner animation with opacity-50 disabled state
- **Transitions:** Smooth transform and color changes

## Testing Checklist

- [x] Button appears when FoodGraph results exist
- [x] Button appears when product is fully analyzed
- [x] Clicking button shows FoodGraph options
- [x] Visual Match filter selected by default
- [x] Loading indicator shows during API fetch
- [x] Button disabled during loading
- [x] Results display after loading completes
- [x] Clicking again hides options
- [x] Chevron rotates correctly (down → up)
- [x] Result count badge shows correct number
- [x] Error handling works if API fails
- [x] No linting errors

## Files Modified

1. **app/analyze/[imageId]/page.tsx**
   - Added state variables (lines 103-104)
   - Added handler function (lines 911-940)
   - Added UI button (lines 2044-2068)
   - Wrapped content in conditional (lines 2071-2276)

## Related Features

- Works seamlessly with existing filter buttons (Search, Pre-filter, AI Filter, Visual Match)
- Integrates with FoodGraphResultsList component
- Compatible with on-demand result loading
- Supports all pipeline types (AI Filter, Visual-Only)

## Future Enhancements

1. **Remember User Preference**: Store open/close state in localStorage
2. **Keyboard Shortcut**: Add hotkey to toggle options (e.g., 'O' key)
3. **Smart Default**: Auto-open if product has 2+ matches needing review
4. **Animation**: Slide transition when expanding/collapsing content
5. **Result Summary**: Show brief stats in button when closed (e.g., "29 Visual Matches")

## Documentation

This feature complements existing documentation:
- UNIVERSAL_FILTERING_SYSTEM.md (filter logic)
- VISUAL_MATCH_COUNT_FIX.md (count calculations)
- TWO_PIPELINE_APPROACH.md (pipeline integration)

## Success Metrics

- **User Control:** ✅ Users can toggle visibility at will
- **Default Filter:** ✅ Visual Match selected automatically
- **Loading State:** ✅ Clear feedback during API fetch
- **Performance:** ✅ On-demand loading reduces unnecessary calls
- **UX:** ✅ Cleaner default view, advanced options accessible

---

**Implementation Complete!** Users now have a cleaner interface with a "See Options" button that reveals FoodGraph results and filters on-demand, with Visual Match automatically selected.

