# Visual Match Selection Instruction Feature

**Date:** November 13, 2025  
**Status:** ✅ Complete

## Overview

Added the ability to customize Visual Match Selection instructions in the project settings page, alongside the existing Extract Product Information and AI Product Matching instructions.

## Changes Made

### 1. Added Default Prompt Template (`lib/default-prompts.ts`)

Created `DEFAULT_VISUAL_MATCH_PROMPT` with template placeholders:
- `{{brand}}` - Detected brand name
- `{{productName}}` - Detected product name
- `{{size}}` - Detected size
- `{{flavor}}` - Detected flavor
- `{{category}}` - Detected category
- `{{candidateCount}}` - Number of candidates
- `{{candidateDescriptions}}` - Formatted candidate list
- `{{candidateImageCount}}` - Total images (shelf + candidates)

### 2. Updated Prompt Template System (`lib/gemini.ts`)

**Modified `getPromptTemplate()` function:**
- Added switch statement to handle three step types: `extract_info`, `ai_filter`, `visual_match`
- Returns appropriate default prompt for each step
- Fetches custom prompt from database if available

**Modified `selectBestMatchFromMultiple()` function:**
- Now fetches custom prompt template via `getPromptTemplate(projectId, 'visual_match')`
- Replaces template placeholders with actual values
- Supports per-project customization while maintaining default behavior

### 3. Updated UI (`components/PromptSettingsModal.tsx`)

Added visual_match to three configuration objects:
- `STEP_NAMES`: "Visual Match Selection"
- `STEP_DESCRIPTIONS`: "This prompt instructs the AI to select the best match from multiple product candidates using visual similarity and metadata."
- `DEFAULT_PROMPTS`: Reference to `DEFAULT_VISUAL_MATCH_PROMPT`

## How It Works

1. **Default Behavior:** Uses `DEFAULT_VISUAL_MATCH_PROMPT` template
2. **Custom Prompts:** Admin can edit via Settings button on project page
3. **Template Processing:** Placeholders replaced with actual values at runtime
4. **Version Control:** Each save creates new version (preserved history)
5. **Per-Project:** Each project can have different visual matching logic

## Benefits

- **Customizable:** Teams can adjust matching criteria per project
- **Consistent:** Same pattern as extract_info and ai_filter
- **Flexible:** Template placeholders allow dynamic content
- **Auditable:** Version history tracks all changes
- **Testable:** Can A/B test different matching strategies

## Database

Uses existing `branghunt_prompt_templates` table:
- `project_id`: Links to project
- `step_name`: 'visual_match'
- `prompt_template`: Custom prompt text
- `version`: Auto-incrementing version number
- `is_active`: Only one active version per project+step

## UI Location

Project Settings → Settings Button → Visual Match Selection card (third option)

## Example Use Cases

1. **Strict Matching:** Increase confidence threshold to reduce false positives
2. **Relaxed Matching:** Adjust for regional packaging variations
3. **Brand-Specific:** Customize logic for products with complex SKU structures
4. **Size Focus:** Prioritize size matching over visual similarity
5. **Testing:** Try different prompts to optimize match accuracy

## Files Modified

- `lib/default-prompts.ts` (+43 lines)
- `lib/gemini.ts` (+25 insertions, -31 deletions)
- `components/PromptSettingsModal.tsx` (+3 insertions, -0 deletions)

## Commit

```
commit 0f2de42
feat: add Visual Match Selection instruction to project settings
```

## Testing

To test the feature:

1. Navigate to any project page
2. Click "Settings" button (gear icon)
3. Scroll to "Visual Match Selection" card
4. Click "Edit" to customize the prompt
5. Modify the template (maintain placeholder format)
6. Click "Save Version X"
7. Run visual matching on products to use new prompt

## Notes

- Backward compatible: Existing projects use default prompt
- Template placeholders MUST be maintained for proper function
- Custom prompts are project-specific (not global)
- Empty/null projectId falls back to default prompt

