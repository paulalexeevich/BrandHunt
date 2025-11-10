# Multi-Stage FoodGraph Results Storage

## Overview

The batch processing system now saves FoodGraph results at **three distinct processing stages**, providing complete transparency and enabling quality review of what options were considered and filtered out at each step.

## The Three Stages

### 1. 🔍 Search Stage (`processing_stage = 'search'`)
**Raw FoodGraph API results**

- **What**: All products returned by FoodGraph API search
- **Typical Count**: 50-100 results per product
- **Contains**: Every product matching the brand name search term
- **Purpose**: See the full universe of options before any filtering

**Example**: Searching for "Duke Cannon" returns:
- Duke Cannon deodorants (all scents, all sizes)
- Duke Cannon soaps
- Duke Cannon hair products
- Similar brand names (false positives)

### 2. ⚡ Pre-Filter Stage (`processing_stage = 'pre_filter'`)
**Text-based similarity filtered results (≥85% match)**

- **What**: Products passing text-based similarity threshold
- **Typical Count**: 10-20 results per product
- **Filters By**: 
  - Brand name match (70% weight)
  - Retailer match (30% weight)
  - ≥85% total normalized score required
- **Purpose**: Narrow to plausible matches before expensive AI comparison

**Example**: From 100 "Duke Cannon" results → filters to 15 with:
- Exact brand match ("Duke Cannon")
- Available at matching retailer (Target)
- Removes unrelated products

### 3. 🤖 AI Filter Stage (`processing_stage = 'ai_filter'`)
**AI visual comparison results with scores**

- **What**: Products analyzed by Gemini AI visual comparison
- **Typical Count**: 10-20 results (same as pre-filter, but with AI scores)
- **Contains**:
  - `match_status`: identical/almost_same/not_match
  - `match_confidence`: 0.0-1.0 (AI certainty)
  - `visual_similarity`: 0.0-1.0 (how similar images look)
- **Purpose**: Final ranking with visual similarity scores

**Example**: From 15 pre-filtered results → AI scores each:
- 1 identical match (95% confidence, 98% visual similarity)
- 2 almost_same (different size, 90% confidence)
- 12 not_match (different product line)

## Database Schema

### Table: `branghunt_foodgraph_results`

```sql
-- New column added by migration
processing_stage TEXT DEFAULT 'ai_filter' 
CHECK (processing_stage IN ('search', 'pre_filter', 'ai_filter'))
```

**Index**: `idx_foodgraph_results_stage (detection_id, processing_stage)`

**Fields by Stage**:
```
Stage         | match_status | match_confidence | visual_similarity
--------------|--------------|------------------|------------------
search        | NULL         | NULL             | NULL
pre_filter    | NULL         | NULL             | NULL
ai_filter     | required     | required         | required
```

## Batch Processing Flow

### Complete Workflow

```
1. Search FoodGraph API
   ↓ Save ~50-100 results with stage='search'
   
2. Apply Text Pre-Filter (≥85% similarity)
   ↓ Save ~10-20 results with stage='pre_filter'
   
3. Run AI Visual Comparison (parallel)
   ↓ Save ~10-20 results with stage='ai_filter' + scores
   
4. Apply Consolidation Logic
   ↓ Auto-save best match to detection record
```

### Storage Example

**Single Product** (Duke Cannon deodorant):
```
detection_id: abc-123
├── 52 results (stage='search')       - All FoodGraph matches
├── 14 results (stage='pre_filter')   - ≥85% text similarity
└── 14 results (stage='ai_filter')    - With AI scores
    ├── 1 identical (auto-saved)
    ├── 2 almost_same
    └── 11 not_match
```

**Total**: 80 rows in database for this one product (52 + 14 + 14)

### Batch of 100 Products

```
Storage Estimate:
- 100 × 52 search = 5,200 rows
- 100 × 14 pre-filter = 1,400 rows
- 100 × 14 AI-filter = 1,400 rows
──────────────────────────────────
Total: ~8,000 rows (~16MB)
```

**vs Previous** (only final AI results): ~1,400 rows (~3MB)
**Trade-off**: 5.7x more storage for complete audit trail

## UI Features

### Stage Filter Buttons

When a product has results from multiple stages, filter buttons appear:

```
[All (80)] [🔍 Search (52)] [⚡ Pre-filter (14)] [🤖 AI Filter (14)]
```

**Colors**:
- **All**: Indigo (default)
- **Search**: Blue
- **Pre-filter**: Orange
- **AI Filter**: Purple

### Stage Badges on Cards

Each result card displays a stage badge:

```
┌─────────────────────┐
│ [Product Image]     │
│ Product Name        │
│ Brand Name          │
│                     │
│ 🔍 Search Stage     │ ← Blue badge
│ [💾 Save Button]    │
└─────────────────────┘
```

**Badge Text**:
- `🔍 Search Stage` - Raw FoodGraph result
- `⚡ Pre-filtered (≥85%)` - Passed text similarity
- `🤖 AI Analyzed` - Scored by AI visual comparison

### Filter Behavior

1. **Default**: Shows all stages (most transparent)
2. **Click Search**: See raw results (what FoodGraph returned)
3. **Click Pre-filter**: See what passed text similarity
4. **Click AI Filter**: See final scored results

**Use Cases**:
- Check if good match was filtered out at pre-filter stage
- Compare raw search vs filtered results
- Verify AI scoring on edge cases
- Debug why product shows "no match"

## Benefits

### 1. Complete Transparency
- Users see **every option** at **every step**
- No "black box" - clear what was filtered and why
- Can verify if system missed obvious matches

### 2. Quality Control
- Review batch processing decisions
- Identify products needing manual intervention
- Catch AI false negatives (good matches scored low)

### 3. Debugging Capability
```
Problem: "Why did batch say no match when product is in FoodGraph?"

Investigation:
1. Click "Search" filter → See if product appeared in raw results
2. Click "Pre-filter" → Check if filtered out by text similarity
3. Click "AI Filter" → Check AI scores (might be "almost_same" with 85%)

Root Cause: AI marked as "almost_same" (different size), 
            but consolidation logic didn't promote it
            because multiple almost_same matches existed
```

### 4. Data for Optimization

Analyze batch results to improve filtering:
```sql
-- How many products lost at each stage?
SELECT 
  detection_id,
  COUNT(*) FILTER (WHERE processing_stage = 'search') as search_count,
  COUNT(*) FILTER (WHERE processing_stage = 'pre_filter') as prefilter_count,
  COUNT(*) FILTER (WHERE processing_stage = 'ai_filter') as ai_count
FROM branghunt_foodgraph_results
GROUP BY detection_id
HAVING COUNT(*) FILTER (WHERE processing_stage = 'pre_filter') = 0
-- Products completely filtered out at pre-filter stage
```

## Implementation Details

### Backend Changes

**File**: `app/api/batch-search-and-save/route.ts`

```typescript
// After FoodGraph search
const searchInserts = foodgraphResults.map((fgResult, index) => ({
  detection_id: detection.id,
  processing_stage: 'search',  // New field
  // ... other fields, no scores
}));
await supabase.from('branghunt_foodgraph_results').insert(searchInserts);

// After pre-filter
const preFilterInserts = preFilteredResults.map((fgResult, index) => ({
  detection_id: detection.id,
  processing_stage: 'pre_filter',  // New field
  // ... other fields, no scores
}));
await supabase.from('branghunt_foodgraph_results').insert(preFilterInserts);

// After AI filter
const aiFilterInserts = comparisonResults.map((comparison, index) => ({
  detection_id: detection.id,
  processing_stage: 'ai_filter',  // New field
  match_status: comparison.matchStatus,  // With scores!
  match_confidence: comparison.details.confidence,
  visual_similarity: comparison.details.visualSimilarity,
  // ... other fields
}));
await supabase.from('branghunt_foodgraph_results').insert(aiFilterInserts);
```

### Frontend Changes

**File**: `app/analyze/[imageId]/page.tsx`

```typescript
// Added interface field
interface FoodGraphResult {
  // ... existing fields
  processing_stage?: 'search' | 'pre_filter' | 'ai_filter' | null;
}

// Added state for filtering
const [stageFilter, setStageFilter] = useState<'all' | 'search' | 'pre_filter' | 'ai_filter'>('all');

// Filter results before display
let filteredResults = stageFilter === 'all' 
  ? foodgraphResults 
  : foodgraphResults.filter(r => r.processing_stage === stageFilter);
```

## Migration

**File**: `migrations/add_processing_stage_column.sql`

**Applied**: 2025-11-10

**Results**: 
- ✅ Column added successfully
- ✅ 5,026 existing results backfilled as `ai_filter`
- ✅ 49 detections updated
- ✅ Index created for efficient filtering

## Performance Impact

### Write Performance
```
Before: 1 insert per product (final result only)
After:  3 inserts per product (search + pre-filter + AI-filter)

Impact: +2 DB inserts per product
Time:   +0.1s per product (negligible vs 10s AI comparison)
```

### Read Performance
```
Before: Load ~10-20 AI results per detection
After:  Load ~80 results per detection (search + pre + AI)

Impact: 4x more rows loaded
Time:   Still <100ms (well-indexed, small payloads)
```

### Storage Impact
```
Before: ~10-20 rows per product
After:  ~80 rows per product (4x increase)

Example Image (100 products):
- Before: 1,400 rows (~3MB)
- After:  8,000 rows (~16MB)

Trade-off: Acceptable for complete audit trail
```

## Best Practices

### When to Use Stage Filtering

1. **Use "All" (default)**: Regular quality review
2. **Use "Search"**: Check if product exists in FoodGraph at all
3. **Use "Pre-filter"**: Debug text similarity issues (brand/retailer mismatch)
4. **Use "AI Filter"**: Focus on final scored results for decision

### Quality Review Workflow

```
1. Click on batch-processed product
2. See green "Batch Processing Complete" banner
3. Check auto-selected match (🎯 SELECTED badge)
4. Click stage filter buttons to review all options:
   - Search: Was correct product in FoodGraph?
   - Pre-filter: Did text similarity catch it?
   - AI Filter: What did AI score it?
5. If disagree with selection, click Save on different result
```

### Debugging "No Match" Results

```
Scenario: Batch said "no match" but product looks familiar

Steps:
1. Filter by "Search" stage
   → Is product in FoodGraph at all?
   → Maybe different brand name?

2. Filter by "Pre-filter" stage  
   → Did pre-filter eliminate it?
   → Check brand similarity score
   → Check retailer availability

3. Filter by "AI Filter" stage
   → What did AI score it?
   → Check visual_similarity percentage
   → Maybe 82% similarity (close but below 85% threshold)?
```

## Future Enhancements

### Possible Additions

1. **Stage Statistics Dashboard**
   - Show aggregate drop-off rates
   - "70% of products eliminated at pre-filter"
   - Identify bottleneck stages

2. **Comparison View**
   - Side-by-side: Search vs Pre-filter vs AI
   - Highlight what changed between stages

3. **Stage-Specific Filters**
   - Pre-filter: Filter by similarity score range
   - AI Filter: Filter by visual_similarity percentage

4. **Export Capability**
   - Download all results at each stage
   - Analyze in spreadsheet for patterns

## Troubleshooting

### "No stage badges showing"
**Cause**: Product processed before this feature was added
**Solution**: Re-run batch processing to populate all stages

### "Only seeing ai_filter stage"
**Cause**: Existing data was backfilled as `ai_filter`
**Solution**: Normal - old data doesn't have search/pre-filter stages

### "Filter buttons not appearing"
**Cause**: Product only has results from one stage
**Solution**: Buttons only show when multiple stages have data

## Summary

Multi-stage results storage transforms batch processing from a "black box" into a **transparent, reviewable pipeline**. Users can now:

- ✅ See all options at every step
- ✅ Verify filtering decisions
- ✅ Debug "no match" results
- ✅ Trust batch processing results
- ✅ Override auto-selections with confidence

**Trade-off**: 5.7x more storage for complete transparency and quality control capability.

**Conclusion**: The transparency and debugging value far outweighs the storage cost, especially for quality-critical product matching workflows.

