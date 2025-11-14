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
      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
      <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental)</option>
      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Slower, more accurate)</option>
    </select>
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
      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
      <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental)</option>
      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Slower, more accurate)</option>
    </select>
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
- [ ] Change extraction model to gemini-1.5-pro
- [ ] Change visual match model to gemini-2.0-flash-exp
- [ ] Save settings
- [ ] Run batch extraction - verify console shows selected model
- [ ] Run visual matching - verify console shows selected model
- [ ] Check that different projects can have different models

## Model Descriptions

| Model | Speed | Quality | Use Case |
|-------|-------|---------|----------|
| **gemini-2.5-flash** | ⚡⚡⚡ Fast | ⭐⭐⭐ Good | Recommended default |
| **gemini-2.0-flash-exp** | ⚡⚡⚡ Fast | ⭐⭐⭐ Good | Experimental features |
| **gemini-1.5-flash** | ⚡⚡ Moderate | ⭐⭐ OK | Budget option |
| **gemini-1.5-pro** | ⚡ Slow | ⭐⭐⭐⭐ Excellent | High accuracy needed |

## Benefits

✅ **Per-project customization** - Different projects can use different models  
✅ **Speed vs accuracy tradeoff** - Choose based on use case  
✅ **Cost optimization** - Use faster models for testing  
✅ **Experimentation** - Try new experimental models  
✅ **Separate concerns** - Different models for extraction vs matching  

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

