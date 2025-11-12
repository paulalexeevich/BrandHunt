# ProcessingBlocksPanel Component Testing Checklist

**Date:** November 12, 2025  
**Component:** ProcessingBlocksPanel  
**Page:** app/analyze/[imageId]/page.tsx  
**Status:** Ready for testing

---

## 🧪 Testing Plan

### Prerequisites
- ✅ Dev server running on http://localhost:3000
- ✅ Component created (387 lines)
- ✅ Component integrated into page
- ✅ No linter errors
- ✅ Code committed to Git

---

## Test Cases

### 1. Page Loads Without Errors ✓
**Steps:**
1. Navigate to http://localhost:3000
2. Login if required
3. Go to Projects → Select a project
4. Open any image for analysis

**Expected:**
- Page loads successfully
- No console errors
- No visible UI issues

### 2. Processing Blocks Visibility 🔍
**Steps:**
1. On analyze page, check if "Image Processing" button exists in header
2. Click the "Image Processing" button

**Expected:**
- ✅ Button toggles visibility
- ✅ Block 1 and Block 2 appear when toggled on
- ✅ Blocks hide when toggled off

### 3. Block 1: Extract Information 📋
**Steps:**
1. Enable "Image Processing" blocks
2. Run YOLO detection if products not detected
3. Check Block 1 appears with "Extract Info" and "Extract Price" buttons

**Test Extract Info:**
- Click "📋 Extract Info (X)" button
- Observe loading state
- Check progress indicator updates
- Verify completion message

**Test Extract Price:**
- After info extracted, click "💰 Extract Price (X)" button
- Observe loading state
- Check progress indicator updates
- Verify completion message

**Expected:**
- ✅ Buttons show correct counts
- ✅ Loading spinners appear
- ✅ Progress indicators update in real-time
- ✅ Success/error counts displayed
- ✅ Blocks show/hide based on work remaining

### 4. Block 2: Product Matching 🔍
**Steps:**
1. After extraction, Block 2 should show with pipeline options
2. Check collapsible header works (click to expand/collapse)
3. Verify "X ready" badge shows correct count

**Test Pipeline 1 (AI Filter):**
- Click any concurrency button (3, 10, 20, 50, ALL)
- Observe pipeline status
- Check progress updates
- Verify completion

**Test Pipeline 2 (Visual-Only):**
- Click any concurrency button in green section
- Observe pipeline status
- Check progress updates
- Verify completion

**Expected:**
- ✅ Collapsible header works
- ✅ Pipeline buttons respond to clicks
- ✅ Loading states show correctly
- ✅ Progress updates stream in real-time
- ✅ Per-product progress shows stage indicators
- ✅ Pipeline cannot run while another is active

### 5. Progress Indicators 📊
**Check Block 1 Progress:**
- Shows "📊 Block 1 Progress: Extraction"
- Two cards: "Extract Info" and "Extract Price"
- Numbers update correctly
- Status shows: Not Started → Running → Done
- Error counts displayed

**Check Block 2 Progress:**
- Shows "📊 Block 2 Progress: [Pipeline Type]"
- Shows processed count
- Shows success/no match/errors breakdown
- Detailed per-product progress visible
- Stage indicators correct (🔍 ⚡ 🤖 🎯 💾 ✓)

**Expected:**
- ✅ All progress indicators render
- ✅ Counts update in real-time
- ✅ Colors change based on state
- ✅ Product-level details scroll properly

### 6. Error Handling ❌
**Test scenarios:**
- No products detected → Blocks should not show
- All info extracted → "Extract Info" button disabled
- No products need search → Block 2 shows "0 ready"
- Pipeline already running → Other buttons disabled

**Expected:**
- ✅ Graceful handling of empty states
- ✅ Proper button disabled states
- ✅ Error messages display if operations fail
- ✅ No crashes or console errors

### 7. Component Isolation 🔧
**Verify:**
- Component receives all props correctly
- Component doesn't modify parent state directly
- All handlers are called properly
- Component re-renders when props change

**Expected:**
- ✅ Component is pure presentational
- ✅ All interactions work through props
- ✅ No side effects in component

### 8. Visual Regression 👁️
**Compare with original:**
- Layout matches original design
- Colors and styling preserved
- Spacing and alignment correct
- Responsive behavior maintained

**Expected:**
- ✅ No visual differences
- ✅ All styling intact
- ✅ Component looks professional

---

## 🐛 Known Issues to Watch For

### Common Integration Issues:
1. **Props mismatch** - Wrong prop names or types
2. **Missing imports** - Icon components not imported
3. **State synchronization** - Parent/child state out of sync
4. **Event handlers** - Handlers not bound correctly

### Next.js Specific:
1. **Client component** - Ensure 'use client' directive if needed
2. **Hydration errors** - Check for SSR/client mismatches
3. **Cache issues** - May need to clear .next directory

---

## 🔍 Browser Console Checks

### Open DevTools (F12) and check:
1. **Console tab** - No red errors
2. **Network tab** - API calls succeed
3. **React DevTools** - Component tree correct
4. **Performance** - No memory leaks

### Expected Console Output:
```
✅ No errors
✅ API requests succeed (200 status)
✅ SSE streams work (if testing pipelines)
✅ No "Warning:" messages
```

---

## 📝 Testing Results

### Manual Testing Session

**Date:** _________________  
**Tester:** _________________  
**Browser:** _________________  

#### Results:

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1. Page Loads | ⬜ Pass / ⬜ Fail | |
| 2. Block Visibility | ⬜ Pass / ⬜ Fail | |
| 3. Block 1 Extract | ⬜ Pass / ⬜ Fail | |
| 4. Block 2 Pipelines | ⬜ Pass / ⬜ Fail | |
| 5. Progress Indicators | ⬜ Pass / ⬜ Fail | |
| 6. Error Handling | ⬜ Pass / ⬜ Fail | |
| 7. Component Isolation | ⬜ Pass / ⬜ Fail | |
| 8. Visual Regression | ⬜ Pass / ⬜ Fail | |

**Overall Status:** ⬜ PASS / ⬜ FAIL

**Issues Found:**
- [ ] Issue 1: _________________________________
- [ ] Issue 2: _________________________________
- [ ] Issue 3: _________________________________

**Screenshots:**
- [ ] Processing blocks visible
- [ ] Progress indicators working
- [ ] Pipeline running
- [ ] Completion state

---

## 🚨 If Issues Found

### Rollback Steps:
```bash
# If critical issues, rollback to previous commit
git log --oneline -5  # Find commit before extraction
git checkout <commit-hash> app/analyze/[imageId]/page.tsx
git checkout <commit-hash> components/ProcessingBlocksPanel.tsx
```

### Debug Steps:
1. Check browser console for errors
2. Verify all props are passed correctly
3. Check component imports
4. Clear Next.js cache: `rm -rf .next && npm run dev`
5. Review Git diff: `git diff HEAD~1`

---

## ✅ Sign-off

**If all tests pass:**
- [x] Component works as expected
- [x] No regressions found
- [x] Ready to continue with next component
- [x] Commit testing notes

**Next Steps:**
Continue with Component 2: BoundingBoxImage extraction

---

## 🎯 Quick Test Commands

```bash
# Start dev server
npm run dev

# Open in browser
open http://localhost:3000

# Check for console errors (in browser DevTools)
# Check Network tab for failed requests
# Test all buttons and interactions

# If looks good, continue!
```

---

## 📊 Performance Check

### Before Component Extraction:
- Page size: 2,808 lines
- Component count: Mix of inline and extracted

### After Component Extraction:
- Page size: 2,528 lines (-280 lines, -10%)
- Component count: +1 extracted component
- Performance: Should be same or better (smaller main bundle)

### Metrics to Monitor:
- Initial page load time
- Time to Interactive (TTI)
- Component render time
- Memory usage

**Expected:** No performance degradation, possibly improved due to better code splitting.


