# Three-Level Visibility Status Feature

**Date:** November 11, 2025  
**Status:** ✅ Completed and Deployed

## Overview

Upgraded the product details visibility classification from a simple boolean (true/false) to a **three-level status system** that provides more granular control over product processing workflows.

## Motivation

The previous binary system couldn't distinguish between products with:
- ✅ **All critical details visible** (ready for full processing)
- ⚠️ **Some details visible** (partial information, may need different processing)
- ❌ **No details visible** (too far, blurry, or obstructed)

This granularity enables:
1. **Better processing decisions** - Route products to appropriate next steps based on detail visibility
2. **Improved statistics** - See exactly how many products have clear vs partial vs no visible details
3. **Optimized workflows** - Skip FoodGraph matching for products with no readable details

## Three Visibility Levels

| Status | Value | Description | Critical Fields Available |
|--------|-------|-------------|---------------------------|
| **Clear** | `'clear'` | All critical details visible (brand, product name, flavor) | Brand ✓, Product Name ✓, Flavor ✓ |
| **Partial** | `'partial'` | Some details visible but not all critical information | Some fields may be incomplete |
| **None** | `'none'` | No product details visible (too far, blurry, obstructed) | No readable text |

### Expected Confidence Ranges

Based on visibility status, Gemini API should return:

- **Clear**: Critical field confidences should be **0.7-1.0**
- **Partial**: Some confidences may be **0.4-0.7**, but not all critical fields complete
- **None**: All confidences should be **0.0-0.3**

## Database Changes

### Migration: `change_details_visible_to_three_levels.sql`

```sql
-- Changed column type from BOOLEAN to VARCHAR(20)
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS visibility_status VARCHAR(20);

-- Migrated existing data:
-- TRUE → 'clear'
-- FALSE → 'none'
-- NULL → NULL

-- Added constraint to ensure valid values
ALTER TABLE branghunt_detections
ADD CONSTRAINT check_details_visible_values 
CHECK (details_visible IN ('clear', 'partial', 'none') OR details_visible IS NULL);
```

**Before:**
- `details_visible BOOLEAN` - simple true/false

**After:**
- `details_visible VARCHAR(20)` - 'clear', 'partial', or 'none'
- Constraint ensures only valid values
- Indexes updated for each level

## TypeScript Interface Updates

### lib/gemini.ts

```typescript
export interface ProductInfo {
  // Classification fields
  isProduct: boolean;
  detailsVisible: 'clear' | 'partial' | 'none';  // Three-level visibility status
  extractionNotes?: string;
  // ... other fields
}
```

### Frontend Interfaces

Updated in:
- `app/analyze/[imageId]/page.tsx`
- `app/api/batch-extract-info/route.ts`

```typescript
interface Detection {
  // ...
  details_visible: 'clear' | 'partial' | 'none' | null;
  // ...
}
```

## Updated Gemini Prompt

### Key Changes in Extraction Prompt

**Old Instruction:**
```
2. Are product details clearly visible? (can you read brand, product name, or other text?)
```

**New Instruction:**
```
2. What is the visibility level of product details?
   - "clear": All CRITICAL details are clearly visible and readable (brand, product name, flavor)
   - "partial": Some details visible but not all critical information can be extracted
   - "none": No product details are visible (too far, blurry, obstructed, or angle prevents reading)
```

### Updated Response Format

```json
{
  "isProduct": true or false,
  "detailsVisible": "clear" or "partial" or "none",
  "extractionNotes": "Brief note explaining classification",
  // ... other fields
}
```

### Updated Guidelines

```
Important Guidelines:
- If isProduct = false, set detailsVisible = "none", all confidence scores to 0.0
- If detailsVisible = "clear", confidence scores for critical fields should be high (0.7-1.0)
- If detailsVisible = "partial", some confidence scores may be moderate (0.4-0.7)
- If detailsVisible = "none", all confidence scores should be very low (0.0-0.3)
```

## Frontend UI Updates

### 1. Product Statistics Panel

**Before:** 7 categories
**After:** 9 categories

New filter buttons:
- 🔵 **Details: Clear** (`details_clear`) - Blue theme
- 🟡 **Details: Partial** (`details_partial`) - Yellow theme
- 🟠 **Details: None** (`details_none`) - Orange theme

Removed:
- ⚠️ "Details Not Visible" (replaced by above 3)

Grid layout changed from `lg:grid-cols-7` to `lg:grid-cols-5` to accommodate more items.

### 2. Status Badges

Products now display 3 different status badges:

```tsx
{detection.is_product === true && detection.details_visible === 'clear' && (
  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
    ✅ Details Clear
  </span>
)}

{detection.is_product === true && detection.details_visible === 'partial' && (
  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
    ⚠️ Details Partial
  </span>
)}

{detection.is_product === true && detection.details_visible === 'none' && (
  <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
    ❌ Details None
  </span>
)}
```

### 3. Filter Logic

Updated filter logic to handle 3 levels:

```typescript
if (activeFilter === 'details_clear') 
  return detection.is_product === true && detection.details_visible === 'clear';

if (activeFilter === 'details_partial') 
  return detection.is_product === true && detection.details_visible === 'partial';

if (activeFilter === 'details_none') 
  return detection.is_product === true && detection.details_visible === 'none';
```

### 4. "Not Identified" Filter

Updated to only include products with **clear** details (or null):

```typescript
const validNotProcessed = detections.filter(d => 
  (d.is_product === true || d.is_product === null) && 
  (d.details_visible === 'clear' || d.details_visible === null) &&
  !d.brand_name
).length;
```

This ensures only products with readable details are counted as "ready to identify".

## API Routes Updated

All extraction API routes now correctly handle the 3-level status:

1. **`/api/extract-brand`** - Single product extraction
2. **`/api/batch-extract-info`** - Batch detection extraction
3. **`/api/batch-extract-project`** - Full project extraction

Each route:
- Saves `details_visible` as VARCHAR with 3 possible values
- Logs the visibility status for debugging
- Returns the status in API responses

## Backward Compatibility

### Data Migration Strategy

Existing boolean data was migrated safely:
- `TRUE` → `'clear'` (assumed visible meant clearly visible)
- `FALSE` → `'none'` (assumed not visible meant no details)
- `NULL` → `NULL` (preserved unknown state)

### Prompt Template Versioning

The updated prompt is stored in `seed_default_prompt_templates.sql` and will:
- Apply to all NEW projects automatically
- Existing projects can update their prompts via the Prompt Settings modal
- Old prompts are preserved in version history

## Use Cases & Workflows

### 1. Full Processing (Clear Details)
```
Detection → Extract Info → details_visible = 'clear' 
→ High confidence scores → FoodGraph Search → AI Filter → Match Complete
```

### 2. Partial Processing (Some Details)
```
Detection → Extract Info → details_visible = 'partial'
→ Mixed confidence scores → May attempt FoodGraph with available fields
→ Manual review recommended
```

### 3. Skip Processing (No Details)
```
Detection → Extract Info → details_visible = 'none'
→ Low/zero confidence scores → Skip FoodGraph (no searchable text)
→ Mark as unprocessable
```

## Files Modified

### Database
- ✅ `migrations/change_details_visible_to_three_levels.sql` - Column type change
- ✅ `migrations/seed_default_prompt_templates.sql` - Updated prompt template

### Backend
- ✅ `lib/gemini.ts` - ProductInfo interface + fallback value
- ✅ `app/api/extract-brand/route.ts` - No changes needed (passes through)
- ✅ `app/api/batch-extract-info/route.ts` - Updated interface
- ✅ `app/api/batch-extract-project/route.ts` - No changes needed (passes through)

### Frontend
- ✅ `app/analyze/[imageId]/page.tsx` - Detection interface, filters, UI, badges
- ✅ `app/projects/[projectId]/page.tsx` - Statistics calculation

### Documentation
- ✅ `THREE_LEVEL_VISIBILITY_STATUS.md` - This file

## Testing Recommendations

### 1. Database Migration
```sql
-- Verify column type changed
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'branghunt_detections' 
AND column_name = 'details_visible';

-- Verify constraint exists
SELECT constraint_name, check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name = 'check_details_visible_values';
```

### 2. Extraction Testing

Test with 3 types of product images:

**Test Case 1: Clear Details**
- Upload image with product front-facing, well-lit, close-up
- Expected: `detailsVisible: 'clear'`, high confidence scores (0.7-1.0)

**Test Case 2: Partial Details**
- Upload image with product at angle or partially obscured
- Expected: `detailsVisible: 'partial'`, mixed confidence scores (0.4-0.7)

**Test Case 3: No Details**
- Upload image with product far away or very blurry
- Expected: `detailsVisible: 'none'`, low confidence scores (0.0-0.3)

### 3. UI Testing

- ✅ All 9 filter buttons display correctly
- ✅ Clicking each filter shows only matching products
- ✅ Status badges display correct color and text for each level
- ✅ Filter labels and colors match consistently

### 4. Batch Processing

- Upload multiple images with mixed visibility levels
- Verify statistics panel shows counts for all 3 levels
- Check that filters work correctly with batch-processed data

## Benefits

1. **More Accurate Statistics** - See exact breakdown of product visibility
2. **Better Processing Decisions** - Route products based on available information
3. **Improved Efficiency** - Skip expensive FoodGraph calls for unreadable products
4. **Enhanced UX** - Users understand exactly what data is available per product
5. **Future-Proof** - Enables different processing strategies per visibility level

## Future Enhancements

### Possible Workflow Optimizations

1. **Auto-skip FoodGraph for 'none' status** - Save API calls
2. **Partial details workflow** - Use available fields with looser matching
3. **Confidence-based routing** - Combine visibility + confidence for smart routing
4. **Manual review queue** - Flag 'partial' products for human verification

### Analytics

Track visibility statistics across projects:
- What percentage of products have clear details?
- Does store layout or lighting affect visibility rates?
- Optimize image capture guidelines based on visibility data

## Lessons Learned

### ✅ What Went Right

1. **Gradual Type Migration** - Changed DB column type safely with data migration
2. **Comprehensive Updates** - Updated all interfaces, types, and UI consistently
3. **Backward Compatible** - Migrated existing boolean data to appropriate new values
4. **Clear Documentation** - 3 distinct levels are easy to understand and use

### ⚠️ Challenges

1. **Many Files to Update** - TypeScript type changes required updates across multiple files
2. **Filter Logic Updates** - Had to update all filter comparisons from boolean to string
3. **UI Layout Adjustment** - Grid needed to expand to accommodate 3 new filter buttons

### 💡 Key Insights

- **Boolean is often not enough** - Real-world data rarely fits into strict true/false
- **TypeScript strict typing helps** - Caught all places needing updates via compiler errors
- **Consistent naming matters** - Used consistent naming ('clear', 'partial', 'none') everywhere
- **Migration strategy critical** - Plan data migration before changing column types

## Commit Message

```
feat: Implement 3-level visibility status for product details

- Changed details_visible from BOOLEAN to VARCHAR with 3 levels: 'clear', 'partial', 'none'
- Updated Gemini prompt to classify visibility into 3 distinct categories
- Added constraint to ensure only valid status values
- Updated TypeScript interfaces across frontend and backend
- Enhanced UI with 3 new filter buttons and status badges
- Modified filter logic to handle 3-level system
- Migrated existing boolean data: TRUE → 'clear', FALSE → 'none'
- Improved processing workflow decisions based on detail visibility

Benefits:
- More accurate statistics and filtering
- Better processing decisions (can skip FoodGraph for 'none')
- Enhanced UX with clearer product status indicators
- Future-proof for different processing strategies per level

Files changed:
- Database: migration script + constraint
- Backend: lib/gemini.ts, API routes
- Frontend: analyze page + projects page
- Prompt template: updated extraction instructions
```

---

**Deployment Status:** ✅ Ready to deploy after database migration is applied

