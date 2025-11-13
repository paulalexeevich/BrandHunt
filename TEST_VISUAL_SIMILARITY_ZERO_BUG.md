# Testing Visual Similarity 0.0% Bug

## Problem
Visual match results showing `visual_similarity: 0.0%` for IDENTICAL matches that should have high similarity scores (85-99%).

## Enhanced Logging Added

Added detailed debug logging to `lib/gemini.ts` → `saveVisualMatchResults()` function:

1. **Full visualMatchResult object** - Shows what Gemini returned
2. **Per-candidate scores** - Shows visual similarity for each candidate
3. **Database save values** - Shows exactly what visual_similarity value is being saved
4. **Fallback path debugging** - Shows if we're hitting the "below threshold" save path

## How to Test

### Step 1: Run Visual Match Pipeline

1. Start dev server: `npm run dev`
2. Go to the product analysis page showing 0.0% similarity
3. Click "🎯 Visual-Only Pipeline" button to reprocess
4. Watch server console logs

### Step 2: Look for Debug Output

Server console should show:

```
💾 Saving visual match results for detection <id>
   Total candidates: 8
   Passed threshold: 3
   Selected: 00030772057834

🔍 DEBUG: Full visualMatchResult object:
   selectedGtin: 00030772057834
   confidence: 0.95
   visualSimilarityScore: 0.95
   candidateScores (8):
      ⭐ 1: 00030772057834 → 95.0% (PASS)
         2: 00030772057833 → 87.0% (PASS)
         3: 00030772057832 → 82.0% (PASS)
         4: 00030772057831 → 45.0% (FAIL)
         ...
```

### Step 3: Check What Gets Saved

Look for lines showing database save:

```
   ✅ IDENTICAL: Secret Invisible Solid... - 95.0%
      🐛 DEBUG: Saving GTIN 00030772057834 with visual_similarity = 0.95 (95.0%)
```

### Step 4: Identify the Bug

**If you see 0.0% being saved:**

Check for these warning signs:

1. **Fallback path triggered:**
   ```
   ⚠️ No candidates passed threshold, but saving selected match anyway
   🐛 DEBUG: Fallback save - selectedScore found: false
   ⚠️ WARNING: Could not find selectedScore in candidateScores array!
   Will save with visual_similarity = 0 (0.0%)
   ```
   **Root cause:** Selected GTIN doesn't match any GTIN in candidateScores array

2. **GTIN mismatch:**
   ```
   Looking for GTIN: 00030772057834
   Available GTINs: 30772057834, 30772057833, ...
   ```
   **Root cause:** Leading zeros stripped somewhere in the pipeline

3. **Empty candidateScores:**
   ```
   candidateScores (0):
   ```
   **Root cause:** Gemini returned empty array or error occurred

### Step 5: Database Verification

Run this SQL query in Supabase:

```sql
SELECT 
  detection_id,
  product_gtin,
  match_status,
  visual_similarity,
  match_reason,
  created_at
FROM branghunt_foodgraph_results
WHERE processing_stage = 'visual_match'
  AND match_status = 'identical'
  AND (visual_similarity = 0 OR visual_similarity IS NULL)
ORDER BY created_at DESC
LIMIT 20;
```

This finds all IDENTICAL matches with 0.0% similarity.

## Common Root Causes

### 1. GTIN Format Mismatch
- **Problem:** GTINs stored as numbers lose leading zeros
- **Solution:** Ensure GTINs always stored as strings
- **Check:** Compare `visualMatchResult.selectedGtin` vs `candidateScores[].candidateGtin`

### 2. Gemini API Error
- **Problem:** Error during visual matching returns default 0.0 scores
- **Solution:** Check for error messages in logs
- **Check:** Look for "❌ Visual matching selection error"

### 3. Empty Candidate Array
- **Problem:** No candidates passed to visual matching
- **Solution:** Check pre-filter logic
- **Check:** Count of candidates before visual match

### 4. Score Lookup Failure
- **Problem:** Can't find selected candidate in scores array
- **Solution:** Fix GTIN comparison logic
- **Check:** Fallback path logs show GTIN mismatch

## Expected Behavior

✅ **Correct flow:**
```
1. Gemini analyzes 8 candidates
2. Returns scores: [0.95, 0.87, 0.82, 0.45, 0.40, 0.35, 0.30, 0.25]
3. Selects best (0.95) as IDENTICAL
4. Saves 3 results: IDENTICAL (0.95), ALMOST_SAME (0.87), ALMOST_SAME (0.82)
5. Database shows visual_similarity = 0.95 for selected match
```

❌ **Bug flow:**
```
1. Gemini analyzes 8 candidates
2. Returns scores but GTINs don't match
3. Fallback: selectedScore not found → defaults to 0
4. Saves IDENTICAL with visual_similarity = 0
5. UI shows 0.0% ← BUG!
```

## Next Steps

Once you identify the root cause from logs, we can:

1. **Fix GTIN format** - Ensure consistent string format with leading zeros
2. **Fix error handling** - Better fallback when Gemini fails
3. **Fix lookup logic** - Better matching between selected and candidates
4. **Add validation** - Prevent saving 0.0% for IDENTICAL matches

## Tools Created

1. `diagnose-visual-similarity-bug.js` - SQL queries for database analysis
2. `test-visual-match-output.js` - Test Gemini API output (needs auth)

Run the pipeline again and share the debug output to identify the exact issue!

