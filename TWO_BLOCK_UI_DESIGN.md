# Two-Block UI Design: Visual Workflow Separation

**Date:** November 10, 2025  
**Commit:** 9600ec6

## Overview

Restructured the analyze page to clearly separate the two major product processing workflows into distinct visual blocks with different themes and stages. This creates a more intuitive user experience by showing operations in the order they should be performed.

## The Two Blocks

### Block 1: Image Upload & Detection
**Theme:** Orange/Yellow (Warm colors for initial processing)  
**Stage:** Image upload and extraction  
**Icon:** 📸 / 📋

**Operations:**
1. **Detect Products** - Run YOLO or Gemini detection
2. **Extract Info** - Extract brand, product name, category, flavor, size
3. **Extract Price** - Extract price information

### Block 2: Product Matching with FoodGraph
**Theme:** Blue/Purple (Cool colors for database operations)  
**Stage:** Product identification and matching  
**Icon:** 🔍

**Operations:**
1. **Search** - Query FoodGraph database
2. **Pre-Filter** - Text-based similarity filtering (≥85%)
3. **AI Filter** - Image-based comparison with Gemini
4. **Save** - Store best matches to database

## Visual Design

### Block 1: Detection & Extraction

```tsx
<div className="bg-gradient-to-br from-orange-50 to-yellow-50 
                rounded-xl shadow-lg p-6 mb-6 border-2 border-orange-200">
  <h2>📸 Block 1: Image Upload & Detection</h2>
  <p>Detect products and extract information from the image</p>
  
  {/* Detection controls */}
  {/* Extract Info + Extract Price buttons */}
</div>
```

**Style Characteristics:**
- Gradient background: `from-orange-50 to-yellow-50`
- Border: `border-2 border-orange-200`
- Button colors: Yellow-500, Green-600, Orange-500
- Shadow: `shadow-lg` for prominence
- Padding: `p-6` for breathing room

### Block 2: Product Matching

```tsx
<div className="bg-gradient-to-br from-blue-50 to-purple-50 
                rounded-xl shadow-lg p-6 mb-6 border-2 border-blue-300">
  <h2>🔍 Block 2: Product Matching with FoodGraph</h2>
  <p>Search, pre-filter, AI filter, and save product matches</p>
  
  {/* Search & Save concurrency buttons */}
</div>
```

**Style Characteristics:**
- Gradient background: `from-blue-50 to-purple-50`
- Border: `border-2 border-blue-300`
- Button colors: Blue-500, Indigo-500, Purple-500, Pink-500
- Grid layout: 2-3 columns for concurrency options
- Shadow: `shadow-lg` for prominence

## Smart Visibility

### Block 1 Detection Section
**Shows when:** `!productsDetected`  
**Purpose:** Initial detection step

```javascript
{!productsDetected && (
  <div className="...orange theme...">
    {/* Detection controls */}
  </div>
)}
```

### Block 1 Extraction Section
**Shows when:** `productsDetected && (needsInfo > 0 || needsPrice > 0)`  
**Purpose:** After detection, if extraction pending

```javascript
{productsDetected && (() => {
  const needsInfo = detections.filter(d => !d.brand_name).length;
  const needsPrice = detections.filter(d => d.brand_name && !d.price).length;
  const hasExtractionWork = needsInfo > 0 || needsPrice > 0;

  return hasExtractionWork ? (
    <div className="...orange theme...">
      {/* Extract Info + Extract Price buttons */}
    </div>
  ) : null;
})()}
```

### Block 2 Matching Section
**Shows when:** `productsDetected && needsSearch > 0`  
**Purpose:** After extraction, ready for FoodGraph matching

```javascript
{productsDetected && (() => {
  const needsSearch = detections.filter(d => d.brand_name && !d.fully_analyzed).length;
  
  return needsSearch > 0 ? (
    <div className="...blue theme...">
      {/* Search & Save concurrency buttons */}
    </div>
  ) : null;
})()}
```

## Progress Panels

### Block 1 Progress: Extraction
**Shows when:** `processingStep1 || processingStep2 || step1Progress || step2Progress`  
**Theme:** Orange/Yellow

```tsx
<div className="bg-gradient-to-r from-orange-50 to-yellow-50 
                border-2 border-orange-300 rounded-lg p-4 mb-6">
  <h3>📊 Block 1 Progress: Extraction</h3>
  <div className="grid grid-cols-2 gap-3">
    <div>📋 Extract Info</div>
    <div>💰 Extract Price</div>
  </div>
</div>
```

### Block 2 Progress: FoodGraph Matching
**Shows when:** `processingStep3 || step3Progress`  
**Theme:** Blue/Purple

```tsx
<div className="bg-gradient-to-r from-blue-50 to-purple-50 
                border-2 border-blue-300 rounded-lg p-4 mb-6">
  <h3>📊 Block 2 Progress: FoodGraph Matching</h3>
  <div className="grid grid-cols-1 gap-3">
    <div>🔍 Search & Save</div>
  </div>
  
  {/* Detailed per-product progress */}
</div>
```

## User Flow

### Stage 1: Fresh Upload
1. User sees **Block 1: Detection** section (orange)
2. Selects detection method (YOLO/Gemini)
3. Clicks "🎯 Detect Products"
4. Products detected → Block 1 Detection section disappears

### Stage 2: Extraction
1. **Block 1: Extract Information** section appears (orange)
2. User clicks "📋 Extract Info (89)"
3. Progress panel shows extraction status
4. User clicks "💰 Extract Price (89)"
5. Extraction completes → Block 1 section disappears

### Stage 3: Matching
1. **Block 2: Product Matching** section appears (blue)
2. User selects concurrency level (3/10/20/50/ALL)
3. Progress panel shows search/filter/save status
4. Matching completes → Block 2 section disappears
5. **Statistics Panel** shows completion status

### Final State: All Complete
- No action blocks visible
- Statistics panel shows 100% completion
- Only image grid and product details remain

## Button Design

### Block 1 Buttons

**Detect Products:**
```css
bg-gradient-to-r from-orange-500 to-yellow-500
px-8 py-3
font-bold
shadow-lg
```

**Extract Info:**
```css
bg-yellow-500
px-6 py-3
font-bold
shadow-md
```

**Extract Price:**
```css
bg-green-600
px-6 py-3
font-bold
shadow-md
```

### Block 2 Buttons

**Concurrency Options:**
- **3 at once:** `bg-blue-500` (safe, recommended)
- **10 at once:** `bg-indigo-500` (moderate)
- **20 at once:** `bg-purple-500` (faster)
- **50 at once:** `bg-pink-500` (aggressive)
- **ALL at once:** `bg-gradient-to-r from-red-500 to-orange-500` (maximum speed)

All buttons:
```css
px-4 py-3
font-bold
shadow-md
text-sm
```

## Layout Structure

```
┌─────────────────────────────────────────────────┐
│ Status Bar (white, minimal info)                │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 📸 Block 1: Image Upload & Detection (orange)   │
│ - Detection controls                            │
│ - Extract Info/Price buttons                    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 📊 Block 1 Progress: Extraction (orange)        │
│ [Extract Info] [Extract Price]                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 🔍 Block 2: Product Matching (blue)             │
│ - Search & Save concurrency buttons             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 📊 Block 2 Progress: FoodGraph Matching (blue)  │
│ [Search & Save]                                 │
│ - Detailed per-product progress                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 📊 Product Statistics (blue gradient)           │
│ [7 colored stat cards]                          │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ [Image Grid]          [Product Details]         │
└─────────────────────────────────────────────────┘
```

## Benefits

### For Users
1. **Clear Progression:** See exactly which stage you're in
2. **Reduced Overwhelm:** Only relevant actions shown
3. **Better Understanding:** Block labels explain purpose
4. **Visual Guidance:** Color coding reinforces workflow order
5. **Smart Hiding:** Completed blocks disappear automatically

### For Workflow
1. **Enforced Order:** Can't match before extraction
2. **Logical Grouping:** Related operations together
3. **Stage Clarity:** Orange = preparation, Blue = matching
4. **Progress Tracking:** Separate progress for each block

### For Development
1. **Maintainability:** Clear code organization by workflow
2. **Extensibility:** Easy to add operations to blocks
3. **Debugging:** Can identify which block has issues
4. **Testing:** Can test blocks independently

## Technical Implementation

### Conditional Rendering Pattern

```javascript
// Block 1: Detection (when no products)
{!productsDetected && (
  <Block1Detection />
)}

// Block 1: Extraction (when detection done, extraction needed)
{productsDetected && hasExtractionWork && (
  <Block1Extraction />
)}

// Block 2: Matching (when extraction done, matching needed)
{productsDetected && needsSearch > 0 && (
  <Block2Matching />
)}
```

### Smart Calculation Pattern

```javascript
// Calculate what work is needed
const needsInfo = detections.filter(d => !d.brand_name).length;
const needsPrice = detections.filter(d => d.brand_name && !d.price).length;
const needsSearch = detections.filter(d => d.brand_name && !d.fully_analyzed).length;

// Show block only if work needed
const hasExtractionWork = needsInfo > 0 || needsPrice > 0;
```

### IIFE (Immediately Invoked Function Expression) Pattern

```javascript
{productsDetected && (() => {
  // Calculate eligibility
  const needsSearch = detections.filter(...).length;
  
  // Conditional render
  return needsSearch > 0 ? (
    <div>...</div>
  ) : null;
})()}
```

## Color Palette

### Block 1 (Extraction)
- **Background:** `from-orange-50 to-yellow-50`
- **Border:** `border-orange-200` / `border-orange-300`
- **Headers:** `text-orange-900`
- **Primary Button:** `from-orange-500 to-yellow-500`
- **Secondary Buttons:** `yellow-500`, `green-600`

### Block 2 (Matching)
- **Background:** `from-blue-50 to-purple-50`
- **Border:** `border-blue-300`
- **Headers:** `text-blue-900`
- **Buttons:** `blue-500`, `indigo-500`, `purple-500`, `pink-500`
- **Extreme Button:** `from-red-500 to-orange-500`

### Shared
- **Success States:** `green-500`, `green-600`
- **Error States:** `red-500`, `red-600`
- **Progress Borders:** `yellow-500` (running), `green-500` (done), `blue-500` (matching)

## Responsive Behavior

### Mobile (< 768px)
- Blocks stack vertically
- Button grid: 2 columns for Block 2 buttons
- Full-width buttons for Block 1

### Tablet (768px - 1024px)
- Blocks at 100% width
- Button grid: 3 columns for Block 2
- Side-by-side buttons for Block 1

### Desktop (> 1024px)
- Blocks maintain max-width
- Button grid: 3 columns for Block 2
- Optimal spacing and sizing

## Comparison with Previous Design

### Before
```
Status Bar: [All buttons cramped together in top-right]
- Detect + Extract Info + Extract Price + 5 Search buttons

Progress: [Single 3-column panel]
- Extract Info | Extract Price | Search & Save
```

**Issues:**
- All operations visible at once = overwhelming
- No clear workflow order
- Buttons crowded in header
- No separation between extraction and matching

### After
```
Block 1 (orange): [Shows only when needed]
- Detection controls
- Extract Info + Extract Price

Block 1 Progress (orange): [Shows during extraction]
- Extract Info | Extract Price

Block 2 (blue): [Shows only after extraction]
- 5 Search & Save concurrency options

Block 2 Progress (blue): [Shows during matching]
- Search & Save + detailed per-product progress
```

**Improvements:**
- ✅ Sequential workflow clearly defined
- ✅ Operations only shown when relevant
- ✅ Color coding reinforces stage
- ✅ More space for larger, clearer buttons
- ✅ Progress panels match operation blocks

## Data Flow Through Blocks

```
┌────────────────────────────────────────────┐
│ Image Upload (handled elsewhere)           │
└────────────────┬───────────────────────────┘
                 ↓
┌────────────────────────────────────────────┐
│ BLOCK 1: Detection                         │
│ • YOLO/Gemini detection                    │
│ • Creates detection records                │
│ • Sets is_product, details_visible         │
└────────────────┬───────────────────────────┘
                 ↓
┌────────────────────────────────────────────┐
│ BLOCK 1: Extraction                        │
│ • Extract Info: brand, product, size, etc. │
│ • Extract Price: price, currency           │
│ • Updates detection records                │
└────────────────┬───────────────────────────┘
                 ↓
┌────────────────────────────────────────────┐
│ BLOCK 2: FoodGraph Matching                │
│ • Search: Query FoodGraph API              │
│ • Pre-filter: Text similarity ≥85%         │
│ • AI Filter: Image comparison              │
│ • Save: Store best match                   │
└────────────────┬───────────────────────────┘
                 ↓
┌────────────────────────────────────────────┐
│ Complete: fully_analyzed = true            │
│ Statistics panel shows results             │
└────────────────────────────────────────────┘
```

## Future Enhancements

### Potential Additions

1. **Block Icons:**
   - Animated icons when processing
   - Checkmarks when completed
   - Warning icons if errors

2. **Time Estimates:**
   - "~30 seconds remaining"
   - Based on historical processing times
   - Per block and overall

3. **Workflow Wizard:**
   - "Next Step" button that auto-advances
   - Guided mode for first-time users
   - Skip directly to specific blocks

4. **Collapsible Blocks:**
   - Expand/collapse completed blocks
   - See historical progress
   - Review previous actions

5. **Block Status Indicators:**
   - Not Started (gray)
   - In Progress (animated)
   - Completed (green checkmark)
   - Error (red warning)

## Testing Recommendations

### Visual Testing
- [ ] Block 1 appears before detection
- [ ] Block 1 switches to extraction after detection
- [ ] Block 2 appears only after extraction
- [ ] Blocks disappear when work complete
- [ ] Progress panels match block themes
- [ ] Colors are distinct and accessible

### Workflow Testing
- [ ] Can't access Block 2 before Block 1
- [ ] Buttons disable appropriately
- [ ] Progress updates in real-time
- [ ] Statistics panel updates after actions
- [ ] Smart hiding works correctly

### Responsive Testing
- [ ] Mobile: blocks stack, buttons readable
- [ ] Tablet: buttons fit in grid
- [ ] Desktop: optimal spacing
- [ ] All screen sizes: no overflow

## Documentation Integration

This design complements:
- **Product Statistics Panel** - Shows overall completion
- **Three-Tier Matching System** - Used in Block 2 AI filtering
- **Batch Processing System** - Powers all block operations
- **Pre-filter Enhancement** - Part of Block 2 workflow

## Commit Details

**Files Changed:** 1  
**Lines Changed:** +190 insertions, -135 deletions  
**Net Change:** +55 lines (more explicit structure)  
**Commit Hash:** 9600ec6

**Impact:**
- Better UX: Clear workflow progression
- Cleaner UI: Conditional block display
- Easier maintenance: Logical code organization
- Improved understanding: Visual and semantic separation

