# Display Default Prompts in Settings Modal

## Overview

Enhanced the Prompt Settings Modal to display the actual default prompt text instead of just showing "No custom prompt set (using default)". This gives users visibility into what prompts the system uses by default before they customize them.

## Changes Made

### 1. Export Default Prompts from `lib/gemini.ts`

```typescript
// Changed from private constants to exported constants
export const DEFAULT_EXTRACT_INFO_PROMPT = `...`;
export const DEFAULT_AI_FILTER_PROMPT = `...`;
```

**Why**: Makes the default prompts reusable across the codebase while maintaining a single source of truth.

### 2. Update `components/PromptSettingsModal.tsx`

#### Import Default Prompts
```typescript
import { DEFAULT_EXTRACT_INFO_PROMPT, DEFAULT_AI_FILTER_PROMPT } from '@/lib/gemini';
```

#### Create Mapping
```typescript
const DEFAULT_PROMPTS = {
  extract_info: DEFAULT_EXTRACT_INFO_PROMPT,
  ai_filter: DEFAULT_AI_FILTER_PROMPT,
};
```

#### Update Display Logic
- **Info Banner**: Added blue info banner when no custom prompt is configured
- **Show Default Text**: Display the actual default prompt text in the preview area
- **Edit Pre-fill**: When clicking "Edit" on a step with no custom prompt, the editor now pre-fills with the default prompt text

## User Experience

### Before
- Showed message: "No custom prompt set (using default)"
- Users couldn't see what the default prompt actually contained
- Had to guess or look at code to understand default behavior

### After
- Shows a clear info banner: **"Using Default Prompt"** with explanation
- Displays the complete default prompt text in a scrollable area
- Users can read and understand the default instructions
- When editing, the default prompt is pre-filled for easy customization

## Benefits

1. **Transparency**: Users can see exactly what prompts are being used
2. **Better Understanding**: Users understand what data the AI extracts and how it compares products
3. **Easier Customization**: Starting point for customization is visible
4. **No Guesswork**: Clear visibility into system behavior
5. **Educational**: Users learn about prompt engineering by seeing working examples

## Visual Example

```
┌─────────────────────────────────────────────────────────┐
│ Extract Product Information                        [Edit]│
│ This prompt instructs the AI to extract product...      │
│                                                          │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 📘 Using Default Prompt - No custom prompt       │  │
│ │    configured yet. Click "Edit" to customize.    │  │
│ └───────────────────────────────────────────────────┘  │
│                                                          │
│ ┌───────────────────────────────────────────────────┐  │
│ │ Analyze this image and extract product info...   │  │
│ │                                                   │  │
│ │ FIRST, determine classification:                 │  │
│ │ 1. Is this actually a product?                   │  │
│ │ 2. What is the visibility level...               │  │
│ │    - "clear": All CRITICAL details...            │  │
│ │    - "partial": Some details...                  │  │
│ │    ... (scrollable)                              │  │
│ └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Technical Details

### Single Source of Truth
- Default prompts defined once in `lib/gemini.ts`
- Exported and imported where needed
- Any changes to defaults automatically reflected in UI

### Backward Compatibility
- No breaking changes
- Existing custom prompts continue to work
- Falls back to defaults when no custom prompt exists

### Type Safety
```typescript
DEFAULT_PROMPTS[stepName as keyof typeof DEFAULT_PROMPTS]
```
Ensures type-safe access to default prompts by step name.

## Files Modified

1. `lib/gemini.ts` - Exported default prompts
2. `components/PromptSettingsModal.tsx` - Updated UI to display defaults

## Testing

✅ Modal displays default prompts when no custom prompt exists  
✅ Info banner shows for default prompts  
✅ Edit button pre-fills with default prompt  
✅ Custom prompts still display correctly  
✅ No TypeScript or linter errors  

## Commit

```bash
git commit -m "Display default prompts in settings modal"
```

**Date**: November 11, 2025

