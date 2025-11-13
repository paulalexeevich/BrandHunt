# Human Validation Feature

## Overview
Added human validation buttons to allow manual verification of FoodGraph matches. Users can mark matches as "Correct" or "Incorrect" to help improve accuracy and build a validation dataset.

## Changes Made

### 1. UI Updates
**File**: `app/analyze/[imageId]/page.tsx`

- **Product Name**: Changed from `truncate` to `line-clamp-2` to show 2 lines instead of cutting off
- **Validation Buttons**: Added two buttons below FoodGraph match:
  - 👍 **Correct** button (green) - marks match as correct
  - 👎 **Incorrect** button (red) - marks match as incorrect
- **Button States**: Buttons show active state when clicked with darker color and ring
- **Auto-refresh**: Page refreshes after validation to show updated state

### 2. Type Definitions
**File**: `types/analyze.ts`

Added two new fields to `Detection` interface:
```typescript
human_validation: boolean | null;  // true = correct, false = incorrect, null = not validated
human_validation_at: string | null;  // timestamp when validation was performed
```

### 3. API Endpoint
**File**: `app/api/validate-match/route.ts` (NEW)

- **Method**: POST
- **Request Body**: 
  ```json
  {
    "detectionId": "uuid",
    "isCorrect": true/false
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "validation": true,
    "data": { /* updated detection */ }
  }
  ```

### 4. Database Migration
**File**: `migrations/add_human_validation_columns.sql` (NEW)

Adds two new columns to `detections` table:
- `human_validation` (BOOLEAN, nullable)
- `human_validation_at` (TIMESTAMPTZ, nullable)

Plus indexes for faster querying of validated/unvalidated matches.

## How to Apply Migration

### Option 1: Supabase Dashboard (Recommended)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/ybzoioqgbvcxqiejopja)
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy contents of `migrations/add_human_validation_columns.sql`
5. Paste and click **Run**

### Option 2: Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project
supabase link --project-ref ybzoioqgbvcxqiejopja

# Run the migration
supabase db push
```

## Usage

1. Open an image with a saved FoodGraph match
2. Review the match details (product name, brand, UPC/GTIN)
3. Click **👍 Correct** if the match is accurate
4. Click **👎 Incorrect** if the match is wrong
5. The button will turn solid color to indicate validation status
6. Validation is saved to database with timestamp

## UI Preview

**Before Validation:**
```
┌─────────────────────────────────────┐
│ [Image] 📦 FoodGraph Match          │
│         Product Name (2 lines)      │
│         Brand Name                  │
│         UPC/GTIN: 00000000          │
├─────────────────────────────────────┤
│ [👍 Correct]  [👎 Incorrect]        │
└─────────────────────────────────────┘
```

**After Validation (Correct):**
```
┌─────────────────────────────────────┐
│ [Image] 📦 FoodGraph Match          │
│         Product Name (2 lines)      │
│         Brand Name                  │
│         UPC/GTIN: 00000000          │
├─────────────────────────────────────┤
│ [✓ Correct ●]  [👎 Incorrect]       │
│  (solid green)    (light red)       │
└─────────────────────────────────────┘
```

## Data Analysis Queries

### Get validation statistics
```sql
SELECT 
  COUNT(*) as total_validated,
  SUM(CASE WHEN human_validation = true THEN 1 ELSE 0 END) as correct_count,
  SUM(CASE WHEN human_validation = false THEN 1 ELSE 0 END) as incorrect_count,
  ROUND(AVG(CASE WHEN human_validation = true THEN 100 ELSE 0 END), 2) as accuracy_rate
FROM detections
WHERE human_validation IS NOT NULL;
```

### Find unvalidated matches
```sql
SELECT id, product_name, brand_name, selected_foodgraph_product_name
FROM detections
WHERE selected_foodgraph_gtin IS NOT NULL 
  AND human_validation IS NULL
ORDER BY analysis_completed_at DESC;
```

### Recent validations
```sql
SELECT 
  product_name,
  brand_name,
  selected_foodgraph_product_name,
  human_validation,
  human_validation_at
FROM detections
WHERE human_validation IS NOT NULL
ORDER BY human_validation_at DESC
LIMIT 10;
```

## Future Enhancements

1. **Validation Dashboard**: Add a page showing validation statistics
2. **Bulk Validation**: Allow validating multiple matches at once
3. **Validation Notes**: Add optional text field for why match is incorrect
4. **Auto-correction**: Use incorrect validations to retrain matching algorithms
5. **Validation Metrics**: Track accuracy by brand, category, or user
6. **Export Data**: Download validated dataset for ML training

## Testing

1. ✅ Build passes without errors
2. ✅ TypeScript types updated
3. ✅ API endpoint created
4. ⏳ Migration needs to be applied to database
5. ⏳ Test validation buttons in UI

## Notes

- Validation is only shown for saved FoodGraph matches (when `fully_analyzed = true`)
- Each detection can only have one validation state (correct/incorrect/null)
- Timestamps allow tracking when validations were performed
- Indexes ensure fast querying even with large datasets

