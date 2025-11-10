# Batch Processing Match Reason Fix

**Date:** November 10, 2025  
**Commit:** 22f6e6f

## Problem

AI reasoning was not displaying in batch-processed products, even though the UI was set up to show it.

## Root Cause

The batch processing route (`app/api/batch-search-and-save/route.ts`) was saving AI comparison results but **missing the `match_reason` field**.

**What was saved:**
```typescript
{
  match_status: comparison.matchStatus,
  match_confidence: comparison.details?.confidence,
  visual_similarity: comparison.details?.visualSimilarity,
  // match_reason: MISSING! ❌
}
```

**What should be saved:**
```typescript
{
  match_status: comparison.matchStatus,
  match_confidence: comparison.details?.confidence,
  visual_similarity: comparison.details?.visualSimilarity,
  match_reason: comparison.details?.reason, // ✅ Added
}
```

## Solution

Added `match_reason: comparison.details?.reason || null` to the `aiFilterInserts` mapping in line 463.

## Impact

**Before Fix:**
- Batch-processed products: No AI reasoning displayed
- Manually filtered products: AI reasoning displayed ✓

**After Fix:**
- Batch-processed products: AI reasoning displayed ✓
- Manually filtered products: AI reasoning displayed ✓

## Technical Details

### Data Flow:

1. **Gemini API returns:**
```typescript
{
  matchStatus: 'identical' | 'almost_same' | 'not_match',
  confidence: 0.95,
  visualSimilarity: 0.92,
  reason: "Brand, packaging, and variant all match perfectly"
}
```

2. **Batch processing stores:**
```typescript
comparison.details?.reason → match_reason column
```

3. **Frontend displays:**
```tsx
{matchReason && (
  <div className="bg-purple-50">
    🤖 {matchReason}
  </div>
)}
```

### Why Manual Worked:

The manual filter route (`/api/filter-foodgraph/route.ts`) was already saving `match_reason` correctly at line 143:
```typescript
match_reason: reason
```

So only batch processing was missing this field.

## Testing

To see the fix in action:
1. Re-run batch processing on any product
2. Click the product to view results
3. AI reasoning should now appear in purple boxes

**Note:** Products processed before this fix will not have reasoning. They need to be re-processed.

## Files Changed

- `app/api/batch-search-and-save/route.ts` (line 463)

## Related Features

- AI reasoning display (app/analyze/[imageId]/page.tsx lines 2230-2237)
- Match reason from Gemini API (lib/gemini.ts)
- Manual filter saving (app/api/filter-foodgraph/route.ts line 143)

---

**Key Learning:** When adding new UI features that display database fields, always verify that ALL code paths (manual, batch, etc.) are saving those fields to the database. Otherwise, the feature will work inconsistently.

