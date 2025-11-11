# Gemini API Prompt Templates Feature

## Overview

This feature allows users to customize the AI instructions (prompts) used by Gemini API for different processing steps. Each project can have its own custom prompts with full version history.

## Features Implemented

### 1. Database Schema
- **Table:** `branghunt_prompt_templates`
- **Columns:**
  - `id` - UUID primary key
  - `project_id` - References branghunt_projects
  - `step_name` - Processing step ('extract_info', 'ai_filter', etc.)
  - `prompt_template` - The actual prompt text
  - `version` - Version number (increments with each save)
  - `is_active` - Boolean flag (only one active version per project+step)
  - `created_at`, `updated_at`, `created_by`
- **Features:**
  - Unique constraint on (project_id, step_name, is_active) WHERE is_active = true
  - Indexes for fast lookups
  - RLS policies for project-based access control
  - Automatic versioning (new versions created on each save)

### 2. API Endpoints

#### GET /api/prompt-templates
Fetches prompt templates for a project.
```
Query params: project_id (required), step_name (optional)
Returns: { templates: PromptTemplate[] }
```

#### POST /api/prompt-templates
Creates a new version of a prompt template.
```
Body: { project_id, step_name, prompt_template }
Returns: { template: PromptTemplate, message: "Created version X" }
```

#### PUT /api/prompt-templates
Activates a specific template version.
```
Body: { template_id }
Returns: { template: PromptTemplate, message: "Activated version X" }
```

### 3. Core Library Updates

**lib/gemini.ts:**
- Added `getPromptTemplate(projectId, stepName)` function
- Updated `extractProductInfo()` to accept optional `projectId` parameter
- Updated `compareProductImages()` to accept optional `projectId` parameter
- Default prompts stored as constants (fallback if no custom prompt)

### 4. API Integration

Updated these APIs to pass projectId to Gemini functions:
- `/api/extract-brand/route.ts` - Single product extraction
- `/api/batch-extract-info/route.ts` - Batch product extraction
- `/api/filter-foodgraph/route.ts` - Single AI filtering
- `/api/batch-filter-ai/route.ts` - Batch AI filtering

### 5. User Interface

**New Component:** `components/PromptSettingsModal.tsx`
- Modal dialog for managing prompts
- Shows current active version for each step
- Inline editing with textarea
- Save creates new version (preserves history)
- Success/error messaging
- Beautiful, responsive design

**Updated:** `app/projects/[projectId]/page.tsx`
- Added Settings button (⚙️) next to project name
- Opens PromptSettingsModal when clicked
- Passes projectId to modal

### 6. Supported Steps

Currently configured for two steps (easily extensible):

1. **extract_info** - "Extract Product Information"
   - Extracts brand, product name, category, flavor, size, etc. from shelf images
   - Used in brand extraction and batch extraction APIs

2. **ai_filter** - "AI Product Matching"
   - Compares product images to determine match status
   - Returns matchStatus, confidence, visualSimilarity, and reason
   - Used in FoodGraph filtering APIs

## Database Migration Instructions

### Step 1: Create Prompt Templates Table

Run this in Supabase SQL Editor:

```sql
-- File: migrations/create_prompt_templates_table.sql
-- This creates the table, indexes, RLS policies, and comments
```

Execute: `/Users/pavelp/Desktop/BrangHunt/migrations/create_prompt_templates_table.sql`

### Step 2: Seed Default Prompts

Run this in Supabase SQL Editor:

```sql
-- File: migrations/seed_default_prompt_templates.sql
-- This inserts default prompts for all existing projects
```

Execute: `/Users/pavelp/Desktop/BrangHunt/migrations/seed_default_prompt_templates.sql`

This will:
- Create default 'extract_info' prompts for all projects
- Create default 'ai_filter' prompts for all projects
- Set version = 1 and is_active = true for all defaults
- Use project's user_id as created_by

## Usage

### For Users

1. Navigate to any project page
2. Click the Settings (⚙️) icon next to the project name
3. In the modal, you'll see all available processing steps
4. Click "Edit" on any step to modify its prompt
5. Make your changes in the textarea
6. Click "Save Version X" to create a new version
7. New version becomes active immediately

### For Developers

To add a new Gemini API step:

1. **Update Constants** in `lib/gemini.ts`:
   ```typescript
   const DEFAULT_YOUR_STEP_PROMPT = `Your default prompt here...`;
   ```

2. **Update** `getPromptTemplate()` to handle new step:
   ```typescript
   return stepName === 'your_step' ? DEFAULT_YOUR_STEP_PROMPT : ...;
   ```

3. **Update UI** in `components/PromptSettingsModal.tsx`:
   ```typescript
   const STEP_NAMES = {
     ...existing,
     your_step: 'Your Step Title',
   };
   
   const STEP_DESCRIPTIONS = {
     ...existing,
     your_step: 'Description of what this step does',
   };
   ```

4. **Use in API**:
   ```typescript
   const prompt = await getPromptTemplate(projectId, 'your_step');
   // Use prompt with Gemini API
   ```

5. **Seed defaults** (optional):
   Add to `migrations/seed_default_prompt_templates.sql`

## Benefits

1. **Flexibility:** Users can tune prompts for their specific use cases
2. **Version Control:** All prompt changes are tracked with versions
3. **Per-Project:** Each project can have different prompts
4. **Safe Defaults:** If no custom prompt, uses hardcoded defaults
5. **History Preservation:** Old versions are kept (not deleted)
6. **Easy Rollback:** Can reactivate any previous version
7. **Extensible:** Easy to add new processing steps

## Technical Details

### Prompt Fetching Flow

1. API receives request (e.g., extract brand from detection)
2. API fetches detection with project_id
3. API calls `extractProductInfo(imageBase64, mimeType, boundingBox, projectId)`
4. Gemini function calls `getPromptTemplate(projectId, 'extract_info')`
5. If custom prompt found and active → use it
6. Else → use default prompt
7. Send prompt to Gemini API

### Version Management

- Each save creates a NEW row (no updates to existing rows)
- Old version marked `is_active = false`
- New version marked `is_active = true`
- Unique constraint ensures only one active per project+step
- Version number auto-increments based on max existing version

### Performance

- Indexed by (project_id, step_name, is_active)
- Single query to fetch active prompt
- Cached at Gemini function level (no caching across requests)
- Minimal overhead (~10ms to fetch from DB)

## Testing

### Manual Testing Checklist

- [ ] Open any project page
- [ ] Click Settings button
- [ ] Verify modal opens with 2 steps shown
- [ ] Verify current prompts are displayed
- [ ] Click Edit on Extract Info
- [ ] Modify the prompt text
- [ ] Click Save Version 2
- [ ] Verify success message shows
- [ ] Verify modal updates to show new version
- [ ] Process an image (extract brand)
- [ ] Check server logs for "Using custom prompt" message
- [ ] Verify extraction uses new prompt
- [ ] Repeat for AI Filter step

### Integration Testing

1. **Extract Info with Custom Prompt:**
   - Modify extract_info prompt (e.g., add "Always say 'TEST:' before brand name")
   - Run brand extraction
   - Verify output includes TEST prefix

2. **AI Filter with Custom Prompt:**
   - Modify ai_filter prompt (e.g., lower confidence threshold)
   - Run product matching
   - Verify matching behaves differently

3. **Version Rollback:**
   - Create version 2 of a prompt
   - Create version 3 of same prompt
   - Activate version 2 again
   - Verify version 2 is used, not version 3

## Future Enhancements

1. **Prompt Library:** Share prompts across projects
2. **Prompt Diff:** Show differences between versions
3. **Prompt Testing:** Test prompts before saving
4. **Export/Import:** Export prompts as JSON
5. **Analytics:** Track which prompts perform best
6. **Templates:** Predefined prompt templates for common scenarios
7. **Variables:** Support dynamic variables in prompts (e.g., {{brand_name}})

## Files Changed

### New Files
- `migrations/create_prompt_templates_table.sql`
- `migrations/seed_default_prompt_templates.sql`
- `app/api/prompt-templates/route.ts`
- `components/PromptSettingsModal.tsx`
- `PROMPT_TEMPLATES_FEATURE.md` (this file)

### Modified Files
- `lib/gemini.ts` - Added getPromptTemplate, updated functions
- `app/api/extract-brand/route.ts` - Pass projectId
- `app/api/batch-extract-info/route.ts` - Pass projectId
- `app/api/filter-foodgraph/route.ts` - Pass projectId
- `app/api/batch-filter-ai/route.ts` - Pass projectId
- `app/projects/[projectId]/page.tsx` - Added Settings button and modal

## Deployment Checklist

1. ✅ Code changes committed to git
2. ⏳ Run migration: `create_prompt_templates_table.sql`
3. ⏳ Run migration: `seed_default_prompt_templates.sql`
4. ⏳ Deploy to Vercel
5. ⏳ Test on production
6. ⏳ Update documentation

## Support

If you encounter issues:
1. Check server logs for "Using custom prompt" or "using default prompt"
2. Verify RLS policies allow access to templates
3. Verify project_id is correctly passed through API chain
4. Check that migrations ran successfully (table exists, constraints work)
5. Verify default prompts were seeded for all projects

