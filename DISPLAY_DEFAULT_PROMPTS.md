# Display Default Prompts in Settings Modal

## Overview

Enhanced the Prompt Settings Modal to display the actual default prompt text instead of just showing "No custom prompt set (using default)". This gives users visibility into what prompts the system uses by default before they customize them.

## Changes Made

### 1. Create Separate File for Default Prompts (`lib/default-prompts.ts`)

```typescript
// Created new file with NO server dependencies
export const DEFAULT_EXTRACT_INFO_PROMPT = `...`;
export const DEFAULT_AI_FILTER_PROMPT = `...`;
```

**Why**: Separates prompts from server-only code (like `next/headers`), allowing safe imports from both client and server components. Prevents build errors when client components need to access these constants.

### 2. Update `lib/gemini.ts` to Import from New File

```typescript
import { DEFAULT_EXTRACT_INFO_PROMPT, DEFAULT_AI_FILTER_PROMPT } from '@/lib/default-prompts';
```

**Why**: Server-side code can still use the prompts without duplicating them.

### 3. Update `components/PromptSettingsModal.tsx`

#### Import Default Prompts
```typescript
import { DEFAULT_EXTRACT_INFO_PROMPT, DEFAULT_AI_FILTER_PROMPT } from '@/lib/default-prompts';
```

**Why**: Client component can safely import from the new file without triggering Next.js server/client boundary errors.

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
- Default prompts defined once in `lib/default-prompts.ts`
- Pure constants file with NO server dependencies
- Exported and imported by both server (`lib/gemini.ts`) and client (`PromptSettingsModal.tsx`) components
- Any changes to defaults automatically reflected everywhere

### Client/Server Separation
The architecture separates concerns properly:
```
lib/default-prompts.ts (pure constants, no dependencies)
    ↑                           ↑
    |                           |
lib/gemini.ts (server)    PromptSettingsModal.tsx (client)
```

This prevents the "needs next/headers" error that occurs when client components try to import from files with server-only dependencies.

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

1. `lib/default-prompts.ts` - **NEW FILE** - Pure constants with no server dependencies
2. `lib/gemini.ts` - Updated to import from `lib/default-prompts.ts`
3. `components/PromptSettingsModal.tsx` - Updated to import from `lib/default-prompts.ts` and display defaults

## Testing

✅ Modal displays default prompts when no custom prompt exists  
✅ Info banner shows for default prompts  
✅ Edit button pre-fills with default prompt  
✅ Custom prompts still display correctly  
✅ No TypeScript or linter errors  
✅ **Build succeeds** - No "needs next/headers" error  
✅ Client component safely imports from `lib/default-prompts.ts`  
✅ Server functions continue to work with prompts  

## Commits

```bash
# Initial implementation
git commit -m "Display default prompts in settings modal"

# Fix build error
git commit -m "Fix build error: Extract default prompts to separate file"
```

**Date**: November 11, 2025

## Key Learnings

1. **Next.js Client/Server Boundary**: Client components cannot import from files that use server-only APIs (like `next/headers`)
2. **Solution**: Extract shared constants to a separate file with NO server dependencies
3. **Architecture Pattern**: Pure constants file → imported by both client and server code
4. **Prevention**: When creating shared utilities, consider which components will import them

