# Gemini Model Selection Feature - Implementation Status

## ✅ Completed (60% Done)

### 1. Database Schema ✅
- Created migration `add_gemini_model_selection.sql`
- Added `extraction_model` column (for info extraction operations)
- Added `visual_match_model` column (for visual matching/AI filtering)
- Default: `gemini-2.5-flash` for both
- Supported models: gemini-2.5-flash, gemini-2.0-flash-exp, gemini-1.5-flash, gemini-1.5-pro
- Applied migration to production database

### 2. Gemini Library Updates ✅
- Updated `extractProductInfo()` - accepts `modelName` parameter
- Updated `compareProductImages()` - accepts `modelName` parameter
- Updated `selectBestMatchFromMultiple()` - accepts `modelName` parameter
- Added `getProjectModels()` helper function to fetch model selections from database
- All functions log which model is being used

### 3. Git Commit ✅
- Committed changes: `c65946e`

## ⏳ Remaining Tasks (40% Left)

### 1. Update Project Settings UI (PromptSettingsModal)
**File:** `components/PromptSettingsModal.tsx`

Add two new dropdown fields:

```typescript
// Add to state
const [extractionModel, setExtractionModel] = useState('gemini-2.5-flash');
const [visualMatchModel, setVisualMatchModel] = useState('gemini-2.5-flash');

// Add to UI (after prompt templates section)
<div className="mb-6">
  <h3 className="text-lg font-semibold mb-4">Model Selection</h3>
  
  <div className="mb-4">
    <label className="block text-sm font-medium mb-2">
      Extraction Model
      <span className="text-gray-500 text-xs ml-2">
        (for extractProductInfo, extractPrice, detectProducts)
      </span>
    </label>
    <select
      value={extractionModel}
      onChange={(e) => setExtractionModel(e.target.value)}
      className="w-full px-4 py-2 border rounded-lg"
    >
      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Standard)</option>
      <option value="gemini-2.5-flash-lite-preview">Gemini 2.5 Flash-Lite (75% cheaper, faster)</option>
    </select>
    <p className="mt-1 text-xs text-gray-500">
      Flash-Lite: $0.075 vs Flash: $0.30 per 1M input tokens
    </p>
  </div>

  <div className="mb-4">
    <label className="block text-sm font-medium mb-2">
      Visual Match Model
      <span className="text-gray-500 text-xs ml-2">
        (for compareProductImages, selectBestMatchFromMultiple)
      </span>
    </label>
    <select
      value={visualMatchModel}
      onChange={(e) => setVisualMatchModel(e.target.value)}
      className="w-full px-4 py-2 border rounded-lg"
    >
      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Standard)</option>
      <option value="gemini-2.5-flash-lite-preview">Gemini 2.5 Flash-Lite (75% cheaper, faster)</option>
    </select>
    <p className="mt-1 text-xs text-gray-500">
      Flash-Lite: $0.30 vs Flash: $2.50 per 1M output tokens
    </p>
  </div>
</div>

// Update save function to include models
const handleSave = async () => {
  await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      extraction_model: extractionModel,
      visual_match_model: visualMatchModel,
      // ... other fields
    })
  });
};
```

### 2. Update API Route to Save Models
**File:** `app/api/projects/[projectId]/route.ts`

Update PATCH handler to accept and save model selections:

```typescript
export async function PATCH(request: NextRequest, { params }: { params: { projectId: string } }) {
  const { extraction_model, visual_match_model, ...otherFields } = await request.json();
  
  const updateData: any = { ...otherFields };
  if (extraction_model) updateData.extraction_model = extraction_model;
  if (visual_match_model) updateData.visual_match_model = visual_match_model;
  
  const { data, error } = await supabase
    .from('branghunt_projects')
    .update(updateData)
    .eq('id', params.projectId)
    .select()
    .single();
  
  // ... rest of handler
}
```

### 3. Update API Routes to Use Selected Models
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

### 4. Testing Checklist
- [ ] Open project settings
- [ ] Verify model dropdowns appear with current values
- [ ] Change extraction model to gemini-2.5-flash-lite-preview
- [ ] Change visual match model to gemini-2.5-flash-lite-preview
- [ ] Save settings
- [ ] Run batch extraction - verify console shows selected model
- [ ] Run visual matching - verify console shows selected model
- [ ] Check that different projects can have different models

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

1. Update `PromptSettingsModal.tsx` to add model selection dropdowns
2. Update API route to save model selections
3. Update 5-6 key API routes to fetch and use selected models
4. Test with different model combinations
5. Document performance differences

---

**Status:** 60% Complete  
**Time Estimate:** 1-2 hours to complete remaining tasks  
**Complexity:** Low-Medium (following established patterns)

