# Gemini Model Selection Feature - Implementation Status

## ✅ Completed (80% Done)

### 1. Database Schema ✅
- Created migration `add_gemini_model_selection.sql`
- Added `extraction_model` column (for info extraction operations)
- Added `visual_match_model` column (for visual matching/AI filtering)
- Default: `gemini-2.5-flash` for both
- **Supported models (simplified):** gemini-2.5-flash, gemini-2.5-flash-lite-preview
- Applied migration to production database
- Created second migration `update_gemini_model_constraints.sql` to simplify model options

### 2. Gemini Library Updates ✅
- Updated `extractProductInfo()` - accepts `modelName` parameter
- Updated `compareProductImages()` - accepts `modelName` parameter
- Updated `selectBestMatchFromMultiple()` - accepts `modelName` parameter
- Added `getProjectModels()` helper function to fetch model selections from database
- All functions log which model is being used

### 3. Project Settings UI ✅ **NEW**
**File:** `components/PromptSettingsModal.tsx`
- Added "Gemini Model Selection" section at top of modal
- Two dropdown selectors: Info Extraction Model & Visual Matching Model
- Each dropdown shows: model name + description (Standard vs Cheaper/Faster)
- Save Models button with loading state
- Cost savings information displayed (75% cheaper info)
- Auto-fetches current models when modal opens
- Success/error message handling

### 4. API Routes ✅ **NEW**
**File:** `app/api/projects/[projectId]/route.ts`
- **GET** endpoint updated to fetch and return `extraction_model` and `visual_match_model`
- **PATCH** endpoint added for updating model selections
- Server-side validation of model values (only allows two valid models)
- Graceful fallback to 'gemini-2.5-flash' defaults

### 5. Git Commits ✅
- Initial: `c65946e` (database + lib updates)
- Constraint update: `3a3b4ed` (simplified to 2 models)
- UI + API: `fe82afc` (model selection UI and API endpoints)

## ⏳ Remaining Tasks (20% Left)

### 1. Update Processing API Routes to Use Selected Models
Update these routes to fetch and use project-specific models:

**Key Routes:**
- `app/api/extract-brand/route.ts` - Use extraction_model
- `app/api/batch-extract-project/route.ts` - Use extraction_model
- `app/api/filter-foodgraph/route.ts` - Use visual_match_model
- `app/api/batch-search-and-save/route.ts` - Use both models
- `app/api/batch-search-visual/route.ts` - Use visual_match_model

**Pattern:**
```typescript
// Fetch project with models
const { data: project } = await supabase
  .from('branghunt_projects')
  .select('project_type, extraction_model, visual_match_model')
  .eq('id', projectId)
  .single();

const projectType = project?.project_type || 'regular';
const extractionModel = project?.extraction_model || 'gemini-2.5-flash';
const visualMatchModel = project?.visual_match_model || 'gemini-2.5-flash';

// Pass to Gemini functions
const productInfo = await extractProductInfo(
  imageBase64,
  mimeType,
  boundingBox,
  projectId,
  projectType,
  extractionModel  // ← Add this
);

const comparison = await compareProductImages(
  croppedBase64,
  foodgraphImageUrl,
  true,
  projectId,
  projectType,
  visualMatchModel  // ← Add this
);
```

### 2. Testing Checklist
- [ ] Open project settings modal (Settings button on project page)
- [ ] Verify model dropdowns appear at top with current values
- [ ] Change extraction model to gemini-2.5-flash-lite-preview
- [ ] Change visual match model to gemini-2.5-flash-lite-preview
- [ ] Click "Save Models" button
- [ ] Verify success message appears
- [ ] Close and reopen modal - verify selections were saved
- [ ] Run batch extraction - verify console shows selected model
- [ ] Run visual matching - verify console shows selected model
- [ ] Check that different projects can have different models
- [ ] Measure actual cost savings with Flash-Lite

## Model Descriptions

According to the [official Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite-preview):

| Model | Speed | Cost (Paid Tier) | Use Case |
|-------|-------|------------------|----------|
| **gemini-2.5-flash** | ⚡⚡⚡ Fast | $0.30 input / $2.50 output per 1M tokens | Recommended default, balanced performance |
| **gemini-2.5-flash-lite-preview** | ⚡⚡⚡⚡ Faster | $0.075 input / $0.30 output per 1M tokens | **75% cheaper!** Best for high-volume processing |

## Benefits

✅ **Massive cost savings** - Flash-Lite is 75% cheaper for high-volume processing  
✅ **Per-project customization** - Different projects can use different models  
✅ **Speed optimization** - Flash-Lite is faster than Flash  
✅ **Separate concerns** - Different models for extraction vs matching  
✅ **Simple choice** - Just two options: Standard or Lite  

## Console Logging

When operations run, you'll see:
```
🔵 extractProductInfo called - START
   modelName: gemini-1.5-pro
   projectType: regular
```

```
🔍 compareProductImages called
   model: gemini-2.0-flash-exp
   projectType: test
```

## Next Steps

1. ✅ ~~Update `PromptSettingsModal.tsx` to add model selection dropdowns~~ **DONE**
2. ✅ ~~Update API route to save model selections~~ **DONE**
3. ⏳ Update 5-6 key API routes to fetch and use selected models (IN PROGRESS)
4. ⏳ Test with different model combinations
5. ⏳ Document performance differences and actual cost savings

---

**Status:** 80% Complete  
**Time Estimate:** 30-60 minutes to complete remaining tasks  
**Complexity:** Low (following established patterns)

## How to Test Now

1. Open your project in the UI
2. Click the **Settings** button (gear icon)
3. Scroll to the top of the modal
4. You'll see **"Gemini Model Selection"** section with:
   - 🔍 Info Extraction Model dropdown
   - 🎯 Visual Matching Model dropdown
   - Cost savings information
5. Select models and click **"Save Models"** button
6. Success message will appear when saved
7. Models are now saved to database for that project

