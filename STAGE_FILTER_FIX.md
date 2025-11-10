# Stage Filter Logic Fix

**Date:** November 10, 2025  
**Commit:** bd3e60b

## Problem

The stage filter display was confusing and showed incorrect counts:
- Said "148 passed 70% AI threshold" when only 5 results were visible
- Didn't make logical sense: FoodGraph returns 100 → Pre-filter reduces to 24 → AI processes 24
- Stage filter buttons were only visible if multiple stages had data
- The "148" number came from showing ALL results regardless of active stage filter

## Solution

Fixed the stage filter to show accurate counts and make the pipeline logic clear.

## Key Changes

### 1. Clear "Viewing" Header ✅

**New Display (lines 1880-1916):**
```typescript
Viewing: 🤖 AI Filtered Results (5 - NO MATCH hidden)
Pipeline: FoodGraph returned 100 → Pre-filter selected 24 (≥85%) → AI analyzed 24
```

**Shows:**
- Which stage you're currently viewing
- Actual count of visible results in that stage
- Complete pipeline with counts at each step

**Benefits:**
- No more confusing "148 passed threshold" message
- Clear what stage you're looking at
- See the entire filtering pipeline at a glance

### 2. Always-Visible Stage Filter Buttons ✅

**Before:** Buttons only appeared if multiple stages had data

**After (lines 1997-2062):** Always visible in a gray box with clear states

**Button States:**
- **Active:** Colored background with ring (blue/orange/purple)
- **Available:** Light colored background, clickable
- **Disabled:** Gray background, shows (0) count, not clickable

**Example:**
```
Filter by Processing Stage:
[All (148)] [🔍 Search (100)] [⚡ Pre-filter (24)] [🤖 AI Filter (24)]
   Active      Available          Available           Available
```

### 3. Accurate Count Calculation

**Logic (lines 1890-1899):**
```typescript
// Get current filtered count based on active stage
let currentCount = stageFilter === 'all' ? stageStats.all :
                   stageFilter === 'search' ? stageStats.search :
                   stageFilter === 'pre_filter' ? stageStats.pre_filter :
                   stageStats.ai_filter;

// Further filter for NO MATCH if hidden
if (stageFilter === 'ai_filter' && !showNoMatch && matchStatusCounts) {
  currentCount = matchStatusCounts.identical + matchStatusCounts.almostSame;
}
```

**Counts are now accurate:**
- All (148): Total of all stages combined
- Search (100): Raw FoodGraph results
- Pre-filter (24): Results passing ≥85% text similarity
- AI Filter (5): Results passing AI + NO MATCH hidden

### 4. Context-Aware Features

**Match Status Breakdown:**
- Now only shows when viewing **AI Filter** stage (line 1937)
- Makes sense because match status only exists after AI filtering
- Reduces clutter on other stages

**NO MATCH Filtering:**
- Only applies when viewing **AI Filter** stage (line 2089)
- Search and Pre-filter stages show all their results
- Prevents confusion about missing results

## Visual Comparison

### Before:
```
FoodGraph Matches (148) → 148 passed 70% AI threshold
[User sees 5 results and is confused 🤔]
```

### After:
```
Viewing: 🤖 AI Filtered Results (5 - NO MATCH hidden)
Pipeline: FoodGraph returned 100 → Pre-filter selected 24 (≥85%) → AI analyzed 24

Filter by Processing Stage:
[All (148)] [🔍 Search (100)] [⚡ Pre-filter (24)] [🤖 AI Filter (24)]
                                                         ^Active

📊 AI Match Status Breakdown     [👁️ Show No Match (19)]
✓ Identical: 2
≈ Almost Same: 3
No Match: 19 (hidden)
```

## Pipeline Logic

### Correct Flow:
1. **🔍 Search (100):** Raw results from FoodGraph API
2. **⚡ Pre-filter (24):** Text similarity ≥85% (brand + size + retailer)
3. **🤖 AI Filter (24):** AI visual comparison with match status
4. **Visible (5):** AI Filter with NO MATCH hidden

### Why "All" Shows 148:
- All stages are stored in database
- Multiple processing runs accumulate
- "All" button shows everything, regardless of stage
- Other buttons show specific stage results

## User Experience

### Stage Filter Workflow:

**1. After Search:**
```
🔍 Search (100) ← Click to see raw FoodGraph results
Shows all 100 results without any filtering
```

**2. After Pre-filter:**
```
⚡ Pre-filter (24) ← Click to see text-filtered results
Shows 24 results that passed ≥85% text similarity
```

**3. After AI Filter:**
```
🤖 AI Filter (24) ← Click to see AI-analyzed results
Shows 5 results (NO MATCH hidden by default)
Toggle to show all 24 including NO MATCH
```

**4. View All:**
```
All (148) ← Click to see everything
Shows results from all stages combined
```

## Benefits

### 1. No More Confusion
- Counts match what you see
- Clear which stage you're viewing
- Understand the filtering pipeline

### 2. Better Control
- Always-visible buttons
- Disabled state shows unavailable stages
- Easy to switch between stages

### 3. Logical Flow
- FoodGraph → Pre-filter → AI makes sense
- Each step reduces results (funnel)
- Pipeline text shows the progression

### 4. Context-Aware UI
- Match breakdown only on AI Filter
- NO MATCH toggle only on AI Filter
- Each stage shows relevant information

## Technical Details

### State Management:
- `stageFilter` state controls active stage
- Calculates `stageStats` object with counts
- `currentCount` reflects visible results after all filters

### Button Styling:
- Active: Solid colored background + ring
- Available: Light colored background + hover effect
- Disabled: Gray + cursor-not-allowed

### Conditional Rendering:
- Match Status Breakdown: `&& stageFilter === 'ai_filter'`
- NO MATCH filtering: `&& stageFilter === 'ai_filter'`
- Ensures features only apply to correct stage

## Edge Cases Handled

1. **No results in stage:** Button disabled, shows (0)
2. **First time viewing:** Default to last active stage
3. **All stages empty:** Shows appropriate message
4. **NO MATCH hidden:** Count adjusts automatically
5. **Stage switching:** Preserves other filters correctly

## Testing Checklist

- [x] Stage buttons always visible
- [x] Counts accurate for each stage
- [x] Pipeline text shows correct numbers
- [x] "Viewing" header shows active stage
- [x] Match breakdown only on AI Filter
- [x] NO MATCH toggle only on AI Filter
- [x] Disabled buttons not clickable
- [x] Active button shows visual feedback
- [x] Switching stages updates counts
- [x] Pipeline makes logical sense

## Performance

- **Impact:** Negligible
- **Operations:** Simple array filters and counts
- **Frequency:** Only when switching stages
- **Complexity:** O(n) for counting results

## Future Enhancements

### Possible Additions:
1. **Stage descriptions:** Tooltip explaining each stage
2. **Progress indicators:** Show which stages are complete
3. **Stage history:** Track when each stage was run
4. **Export by stage:** Download results from specific stage
5. **Comparison view:** Side-by-side stage comparison

### Not Recommended:
- Auto-switching stages (user wants control)
- Hiding empty stages (should show as disabled)
- Merging stages (each serves a purpose)

---

**Key Learning:** When displaying filtered data, always show which filter is active and what the actual visible count is. Don't show total counts when a filter is applied - it confuses users who expect the number to match what they see.

