# Visual Similarity Scoring System

**Date:** November 13, 2025  
**Feature:** Per-candidate visual similarity scores for visual match selection

## Overview

Enhanced the visual match selection system to return individual visual similarity scores for each candidate and save them to the database. The system now properly differentiates between candidates that passed the visual similarity threshold (≥0.7) and the final selected match.

## Problem

Previously, when visual matching was applied to select between multiple candidates:
- Only the final selected candidate was saved
- Visual similarity scores for other candidates were lost
- No distinction between "passed visual similarity" vs "best match"
- Difficult to debug and understand why certain candidates were selected or rejected

## Solution

Implemented a comprehensive per-candidate scoring system that:

1. **Returns visual similarity scores for ALL candidates** from Gemini
2. **Saves candidates that passed threshold (≥0.7) as `almost_same`**
3. **Saves the final selected candidate as `identical`**
4. **Stores individual visual similarity scores in database**

## Implementation Details

### 1. Updated Visual Match Prompt

Location: `lib/default-prompts.ts`

Added `candidateScores` array to the expected JSON response:

```json
{
  "selectedCandidateIndex": 1 or null,
  "confidence": 0.0 to 1.0,
  "reasoning": "...",
  "visualSimilarityScore": 0.0 to 1.0,
  "brandMatch": true/false,
  "sizeMatch": true/false,
  "flavorMatch": true/false,
  "candidateScores": [
    {
      "candidateIndex": 1,
      "candidateId": "...",
      "visualSimilarity": 0.95,
      "passedThreshold": true
    },
    {
      "candidateIndex": 2,
      "candidateId": "...",
      "visualSimilarity": 0.85,
      "passedThreshold": true
    },
    {
      "candidateIndex": 3,
      "candidateId": "...",
      "visualSimilarity": 0.45,
      "passedThreshold": false
    }
  ]
}
```

### 2. Updated TypeScript Interfaces

Location: `lib/gemini.ts`

```typescript
export interface CandidateScore {
  candidateIndex: number;
  candidateId: string;
  candidateGtin: string;
  visualSimilarity: number;
  passedThreshold: boolean;
}

export interface VisualMatchSelection {
  selectedCandidateId: string | null;
  selectedGtin: string | null;
  confidence: number;
  reasoning: string;
  visualSimilarityScore: number; // For selected candidate
  brandMatch: boolean;
  sizeMatch: boolean;
  flavorMatch: boolean;
  candidateScores: CandidateScore[]; // Scores for ALL candidates
}
```

### 3. New Helper Function: `saveVisualMatchResults`

Location: `lib/gemini.ts` (lines 970-1098)

Saves visual match results to `branghunt_foodgraph_results` table:

```typescript
export async function saveVisualMatchResults(
  supabase: SupabaseClient,
  detectionId: string,
  visualMatchResult: VisualMatchSelection,
  allCandidates: VisualMatchCandidate[],
  searchTerm: string
): Promise<{ 
  success: boolean; 
  savedCount: number; 
  selectedGtin: string | null; 
  error?: string 
}>
```

**Logic:**
- Iterates through all `candidateScores`
- For each candidate that `passedThreshold` OR is the selected match:
  - Saves as `match_status: 'identical'` if selected
  - Saves as `match_status: 'almost_same'` if passed threshold but not selected
  - Stores `visual_similarity` score (0.0-1.0)
  - Stores `match_reason` explaining why it was saved
  - Sets `processing_stage: 'visual_match'`
- Uses UPSERT to handle duplicates (unique constraint: `detection_id`, `product_gtin`)

### 4. Updated Batch Processing APIs

**Modified Files:**
- `app/api/batch-search-visual/route.ts`
- `app/api/batch-search-and-save/route.ts`

**Changes:**
- Import `saveVisualMatchResults` function
- Call `saveVisualMatchResults` after visual matching completes
- Logs show: `✅ Saved N visual match results (X passed threshold)`

**Before (batch-search-visual):**
```typescript
// Old code saved all candidates, marking non-selected as 'not_match'
const visualMatchInserts = candidates.map((candidate, index) => ({
  // ...
  match_status: candidate.gtin === visualSelection.selectedGtin ? 'identical' : 'not_match',
  visual_similarity: candidate.gtin === visualSelection.selectedGtin ? visualSelection.confidence : 0,
}));
```

**After:**
```typescript
// New code uses saveVisualMatchResults helper
const saveResult = await saveVisualMatchResults(
  supabase,
  detection.id,
  visualSelection,
  candidates,
  searchTerm
);
// Only saves candidates that passed threshold (≥0.7) OR were selected
// Properly differentiates 'identical' (selected) vs 'almost_same' (passed threshold)
```

## Database Schema

Existing columns used (already present in `branghunt_foodgraph_results`):

- `visual_similarity` DECIMAL(3,2) - Visual similarity score (0.00-1.00)
- `match_status` ENUM('identical', 'almost_same', 'not_match')
- `match_reason` TEXT - Explanation for the match status
- `processing_stage` ENUM('search', 'pre_filter', 'ai_filter', 'visual_match')

## Usage Example

### Visual Matching Returns:

```javascript
{
  selectedCandidateIndex: 1,
  selectedGtin: "0012345678901",
  confidence: 0.92,
  visualSimilarityScore: 0.95,
  reasoning: "Candidate 1 (95%), Candidate 6 (87%), Candidate 8 (82%) all passed. Selected Candidate 1 due to exact brand and size match.",
  candidateScores: [
    {
      candidateIndex: 1,
      candidateId: "result_123",
      candidateGtin: "0012345678901",
      visualSimilarity: 0.95,
      passedThreshold: true  // ✅ Saved as 'identical'
    },
    {
      candidateIndex: 6,
      candidateId: "result_456",
      candidateGtin: "0012345678902",
      visualSimilarity: 0.87,
      passedThreshold: true  // ✅ Saved as 'almost_same'
    },
    {
      candidateIndex: 8,
      candidateId: "result_789",
      candidateGtin: "0012345678903",
      visualSimilarity: 0.82,
      passedThreshold: true  // ✅ Saved as 'almost_same'
    },
    {
      candidateIndex: 2,
      candidateId: "result_321",
      candidateGtin: "0012345678904",
      visualSimilarity: 0.45,
      passedThreshold: false  // ❌ Not saved
    }
  ]
}
```

### Database Records Created:

| detection_id | product_gtin | match_status | visual_similarity | processing_stage | match_reason |
|--------------|--------------|--------------|-------------------|------------------|--------------|
| det_001 | 0012345678901 | identical | 0.95 | visual_match | Selected as best match. Candidate 1 (95%)... |
| det_001 | 0012345678902 | almost_same | 0.87 | visual_match | Passed visual similarity threshold (87.0%) |
| det_001 | 0012345678903 | almost_same | 0.82 | visual_match | Passed visual similarity threshold (82.0%) |

**Note:** Candidate 2 (0.45 similarity) is NOT saved because it didn't pass the threshold.

## Console Output

New console logs show the visual similarity scores:

```
🎯 Visual Matching Selection: Analyzing 8 candidates for best match
   Extracted Info: Degree - Ultraclear Black + White (2.6 oz)
📊 Visual Similarity Scores:
   ✅ Candidate 1: 95.0% (0012345678901)
   ✅ Candidate 6: 87.0% (0012345678902)
   ✅ Candidate 8: 82.0% (0012345678903)
   ❌ Candidate 2: 45.0% (0012345678904)
   ❌ Candidate 3: 38.0% (0012345678905)
   ❌ Candidate 4: 22.0% (0012345678906)
   ❌ Candidate 5: 15.0% (0012345678907)
   ❌ Candidate 7: 55.0% (0012345678908)
💾 Saving visual match results for detection det_001
   Total candidates: 8
   Passed threshold: 3
   Selected: 0012345678901
   ✅ IDENTICAL: Degree Ultraclear Black + White - 95.0%
   ➕ ALMOST_SAME: Degree Ultraclear Black + White Pure Rain - 87.0%
   ➕ ALMOST_SAME: Degree Ultraclear Black + White Pure Clean - 82.0%
✅ Saved 3 visual match results (3 passed threshold)
```

## Benefits

1. **Transparency**: Can see exactly which candidates passed visual similarity and why
2. **Debugging**: Understand why certain matches were selected or rejected
3. **Quality Control**: Review all candidates that passed threshold, not just the selected one
4. **Manual Review**: Users can override if they disagree with the final selection
5. **A/B Testing**: Can analyze visual similarity scores to optimize the threshold
6. **Audit Trail**: Complete history of visual matching decisions

## Threshold Logic

- **Visual Similarity Threshold**: ≥0.7 (70%)
- **Confidence Threshold for Auto-Save**: ≥0.6 (60%)

**Decision Flow:**
1. Calculate visual similarity for each candidate
2. Identify candidates with `visualSimilarity ≥ 0.7`
3. If 1 candidate passes → auto-select it
4. If 2+ candidates pass → use metadata (brand/size/flavor) to pick best
5. If 0 candidates pass → return null (no match)
6. Save all candidates that passed as `almost_same`
7. Save selected candidate as `identical` (overwrites `almost_same` if needed)

## Testing

To test the new system:

1. **Run visual matching pipeline:**
   ```bash
   # Use batch-search-visual API with multiple similar candidates
   ```

2. **Check console output:**
   - Should see `📊 Visual Similarity Scores` for each candidate
   - Should see `💾 Saving visual match results` with count

3. **Verify database:**
   ```sql
   SELECT 
     detection_id, 
     product_gtin, 
     match_status, 
     visual_similarity, 
     processing_stage,
     match_reason
   FROM branghunt_foodgraph_results
   WHERE processing_stage = 'visual_match'
   AND detection_id = 'YOUR_DETECTION_ID'
   ORDER BY visual_similarity DESC;
   ```

4. **Expected results:**
   - Multiple rows for same detection_id
   - One row with `match_status = 'identical'` (selected)
   - N rows with `match_status = 'almost_same'` (passed threshold)
   - Visual similarity scores descending
   - No rows with `visual_similarity < 0.7` unless they're the selected match

## Related Files

**Modified:**
- `lib/default-prompts.ts` - Updated `DEFAULT_VISUAL_MATCH_PROMPT`
- `lib/gemini.ts` - Added `CandidateScore` interface, updated `VisualMatchSelection`, added `saveVisualMatchResults()`
- `app/api/batch-search-visual/route.ts` - Uses `saveVisualMatchResults()`
- `app/api/batch-search-and-save/route.ts` - Uses `saveVisualMatchResults()`

**Database Columns (already existed):**
- `branghunt_foodgraph_results.visual_similarity`
- `branghunt_foodgraph_results.match_status`
- `branghunt_foodgraph_results.match_reason`
- `branghunt_foodgraph_results.processing_stage`

**Migrations:**
- `migrations/add_visual_similarity_column.sql` (already applied)
- `migrations/add_match_status_column.sql` (already applied)
- `migrations/add_match_reason_column.sql` (already applied)
- `migrations/add_visual_match_processing_stage.sql` (already applied)

## Key Insight

Previously, only the "winner" was saved. Now, we save all candidates that are **visually similar enough** (≥70%) but differentiate between:
- **`identical`** = The AI's top pick (best overall match)
- **`almost_same`** = Strong visual matches that could also work

This allows users to:
- See what other options were considered
- Understand why certain products were selected
- Override the AI's decision if they disagree
- Analyze visual similarity patterns across products

## Future Enhancements

Potential improvements:
1. **Dynamic threshold**: Adjust ≥0.7 threshold based on product category
2. **Weighted scoring**: Combine visual similarity with metadata confidence
3. **Similarity heatmap**: Visualize similarity scores in UI
4. **Threshold tuning**: A/B test different thresholds (0.6, 0.7, 0.8)
5. **Multi-angle matching**: Compare multiple product angles if available

