# BrangHunt Refactoring Plan

**Date:** November 12, 2025  
**Current State:** 2,807 lines in analyze page, 14+ batch APIs with duplication, 70+ documentation files

## Executive Summary

The codebase has grown organically with excellent feature coverage but needs systematic refactoring to improve:
- **Maintainability**: Reduce duplication across batch processing APIs
- **Readability**: Break down large page components into smaller, focused components
- **Testability**: Extract business logic from API routes into testable utility functions
- **Documentation**: Consolidate 70+ markdown files into organized documentation

---

## Priority 1: Extract Common Batch Processing Logic (HIGH IMPACT)

### Problem
There are 14+ batch processing API endpoints with 80-90% code duplication:
- `batch-search-and-save/` (934 lines)
- `batch-search-visual/` (651 lines)
- `batch-search-and-save-project/` (485 lines)
- `batch-search-visual-project/` (655 lines)
- `batch-search-visual-direct/` (650 lines)
- `batch-extract-project/` (272 lines)
- `batch-detect-project/` (320 lines)
- `batch-contextual-project/` (555 lines)

**Common patterns duplicated across all:**
1. SSE streaming setup (lines 119-133 in each)
2. Progress tracking with cumulative counters
3. Concurrency control with batch processing
4. Error handling and retry logic
5. Authentication and database fetching
6. Result aggregation and response formatting

### Solution: Create Reusable Batch Processing Utilities

#### Step 1.1: Create `lib/batch-processor.ts`
```typescript
// Centralize SSE streaming logic
export class BatchProcessor<T, R> {
  constructor(
    private readonly concurrency: number,
    private readonly sendProgress: (update: any) => void
  ) {}

  async processBatch(
    items: T[],
    processItem: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    // Handle batching, progress, and error aggregation
  }
}

// Centralize SSE stream creation
export function createSSEStream<T>(
  handler: (sendProgress: (data: any) => void) => Promise<T>
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const sendProgress = (update: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
      };
      await handler(sendProgress);
      controller.close();
    }
  });
}
```

#### Step 1.2: Create `lib/batch-queries.ts`
```typescript
// Centralize common database queries
export async function fetchDetectionsForProcessing(
  supabase: any,
  imageId: string,
  filters?: {
    requireBrand?: boolean;
    isProduct?: boolean;
    fullyAnalyzed?: boolean;
  }
) {
  // Reusable query logic
}

export async function fetchDetectionsForProject(
  supabase: any,
  projectId: string,
  filters?: any
) {
  // Reusable query logic
}
```

#### Step 1.3: Refactor Each Batch API
Convert each API from 500-900 lines to 150-250 lines by using shared utilities.

**Benefits:**
- Reduce ~4,500 lines of duplicate code to ~1,500 lines
- Fix bugs in one place instead of 14 places
- Easier to add new batch operations
- Consistent error handling and progress reporting

**Estimated Impact:** 67% code reduction in batch APIs

---

## Priority 2: Further Component Extraction from Analyze Page (HIGH IMPACT)

### Problem
The `app/analyze/[imageId]/page.tsx` is still 2,807 lines with multiple complex sections.

### Solution: Extract 5-7 More Components

#### Step 2.1: Extract `ProcessingBlocksPanel` Component
**Lines:** ~1500-1700 (Block 1 & Block 2 UI)
**Responsibility:** Handle Extract Information and Product Matching blocks
**Props:** Image data, processing state, handlers
**Estimated size:** 400-500 lines

#### Step 2.2: Extract `ProductMatchCard` Component  
**Lines:** ~2200-2400 (FoodGraph Match display)
**Responsibility:** Display matched product with blue border
**Props:** Detection, selected match details
**Estimated size:** 150-200 lines

#### Step 2.3: Extract `ProductInformationPanel` Component
**Lines:** ~2400-2600 (Product Information section)
**Responsibility:** Display extracted product info with confidence scores
**Props:** Detection, contextual analysis
**Estimated size:** 300-400 lines

#### Step 2.4: Extract `ActionsPanel` Component
**Lines:** ~2800-3100 (Action buttons section)
**Responsibility:** Contextual Analysis, Extract Price, Search FoodGraph buttons
**Props:** Detection, handlers, state
**Estimated size:** 400-500 lines

#### Step 2.5: Extract `BoundingBoxOverlay` Component
**Lines:** ~2000-2200 (Bounding box rendering logic)
**Responsibility:** Render colored boxes on image with labels
**Props:** Detections, dimensions, filters, selection
**Estimated size:** 300-350 lines

#### Step 2.6: Create Custom Hooks
```typescript
// hooks/useImageAnalysis.ts
export function useImageAnalysis(imageId: string) {
  // Centralize image fetching, detection loading, state management
}

// hooks/useFoodGraphResults.ts
export function useFoodGraphResults(detectionId: string) {
  // Handle FoodGraph results fetching and caching
}

// hooks/useBatchProcessing.ts
export function useBatchProcessing() {
  // Handle SSE streaming for batch operations
}
```

**Benefits:**
- Reduce analyze page from 2,807 to ~800-1,000 lines
- Each component has single responsibility
- Easier to test individual components
- Better code organization and reusability

**Estimated Impact:** 65% code reduction in analyze page

---

## Priority 3: Consolidate Documentation (MEDIUM IMPACT)

### Problem
70+ markdown files scattered in root directory, many overlapping or outdated.

### Solution: Organize into `/docs` directory structure

```
/docs
  /architecture
    - batch-processing.md (consolidate 8 batch docs)
    - pipeline-system.md (consolidate 5 pipeline docs)
    - statistics-filtering.md (consolidate 10 stats/filter docs)
  /features
    - foodgraph-integration.md (consolidate 12 FoodGraph docs)
    - contextual-analysis.md (consolidate 5 contextual docs)
    - visual-matching.md (consolidate 4 visual match docs)
  /deployment
    - deployment-guide.md (consolidate 3 deployment docs)
    - testing-guide.md (consolidate 8 test docs)
  /fixes
    - bug-fix-log.md (consolidate 15+ fix docs)
  /setup
    - setup-guide.md (keep existing)
    - env-setup.md (keep existing)
```

**Benefits:**
- Easier to find relevant documentation
- Remove outdated/duplicate information
- Better onboarding for new developers
- Cleaner project root

**Estimated Impact:** Reduce 70+ files to ~15 organized documents

---

## Priority 4: Extract Business Logic from API Routes (MEDIUM IMPACT)

### Problem
Complex business logic embedded in API route handlers makes testing difficult.

### Solution: Create Service Layer

#### Step 4.1: Create `services/` directory
```typescript
// services/productMatching.ts
export class ProductMatchingService {
  async searchAndMatch(detection: Detection): Promise<MatchResult> {
    // All FoodGraph search + AI filter logic
  }
  
  async preFilterResults(results: any[]): Promise<any[]> {
    // Pre-filtering logic
  }
  
  async selectBestMatch(candidates: any[]): Promise<Match> {
    // Visual matching selection
  }
}

// services/contextualAnalysis.ts
export class ContextualAnalysisService {
  async analyzeWithContext(detection: Detection, neighbors: Detection[]): Promise<Analysis> {
    // Contextual analysis logic
  }
}

// services/batchProcessing.ts
export class BatchProcessingService {
  async processDetections(imageId: string, options: BatchOptions): Promise<Results> {
    // Orchestrate batch operations
  }
}
```

**Benefits:**
- API routes become thin controllers (50-100 lines each)
- Business logic is testable without HTTP mocking
- Services can be reused across different endpoints
- Clear separation of concerns

**Estimated Impact:** Move 2,000+ lines from routes to testable services

---

## Priority 5: Type Safety Improvements (LOW-MEDIUM IMPACT)

### Problem
Extensive use of `any` types and type assertions throughout codebase.

### Solution: Strengthen TypeScript Types

#### Step 5.1: Create Comprehensive Type Definitions
```typescript
// types/foodgraph.ts
export interface FoodGraphSearchResult {
  key: string;
  title: string;
  companyBrand: string;
  measures: string;
  frontImageUrl: string;
  // ... all fields with proper types
}

export interface FoodGraphMatch {
  result: FoodGraphSearchResult;
  matchStatus: 'identical' | 'almost_same' | 'not_match';
  confidence: number;
  reasoning: string;
  processingStage: ProcessingStage;
}

// types/batch.ts
export interface BatchProcessingOptions {
  concurrency: number;
  skipNonProducts?: boolean;
  includeProgress?: boolean;
}

export interface BatchResult<T> {
  success: number;
  errors: number;
  noMatch: number;
  details: T[];
}
```

#### Step 5.2: Replace Type Assertions
Convert `(result as any).match_status` patterns to proper types.

**Benefits:**
- Catch type errors at compile time
- Better IDE autocomplete
- Easier refactoring with type safety
- Self-documenting code

**Estimated Impact:** Improve type coverage from ~60% to ~90%

---

## Implementation Plan

### Phase 1: Foundation (Week 1)
1. Create `lib/batch-processor.ts` and `lib/batch-queries.ts`
2. Create comprehensive type definitions in `types/`
3. Set up `/docs` directory structure

### Phase 2: Batch API Refactoring (Week 2)
1. Refactor `batch-search-and-save` using new utilities
2. Refactor `batch-search-visual` using same pattern
3. Refactor remaining batch APIs one by one
4. Add unit tests for batch utilities

### Phase 3: Component Extraction (Week 3)
1. Extract `ProcessingBlocksPanel` component
2. Extract `ProductInformationPanel` component
3. Extract `ActionsPanel` component
4. Create custom hooks
5. Update analyze page to use new components

### Phase 4: Service Layer (Week 4)
1. Create service classes for business logic
2. Extract logic from API routes to services
3. Update routes to use services
4. Add unit tests for services

### Phase 5: Documentation & Cleanup (Week 5)
1. Consolidate markdown files into `/docs`
2. Delete obsolete documentation
3. Create comprehensive README for each doc section
4. Update main README with architecture overview

---

## Success Metrics

### Code Quality
- [ ] Reduce analyze page from 2,807 to <1,000 lines (65% reduction)
- [ ] Reduce batch API duplication from ~4,500 to ~1,500 lines (67% reduction)
- [ ] Achieve 90%+ TypeScript type coverage
- [ ] 0 linting errors

### Maintainability
- [ ] Single place to update SSE streaming logic
- [ ] Single place to update batch processing patterns
- [ ] Components are <500 lines each
- [ ] Services are unit testable

### Documentation
- [ ] Reduce from 70+ to ~15 organized docs
- [ ] All features documented in `/docs`
- [ ] Clear architecture diagrams
- [ ] Setup guide for new developers

---

## Risk Assessment

### Low Risk
- Component extraction (already done successfully with FoodGraphResultsList)
- Documentation consolidation (no code changes)
- Type definition additions (additive, backward compatible)

### Medium Risk
- Batch API refactoring (high test coverage needed)
- Service layer extraction (requires careful interface design)

### Mitigation Strategies
1. Refactor one batch API first, validate thoroughly
2. Use feature flags for service layer adoption
3. Maintain backward compatibility during transition
4. Comprehensive testing at each phase
5. Git commits after each small change

---

## Next Steps

1. **Review and approve this plan**
2. **Prioritize which phases to tackle first**
3. **Set up testing infrastructure** (if not already present)
4. **Create feature branch** for refactoring work
5. **Start with Phase 1** (foundation work)

---

## Notes

- All refactoring should maintain existing functionality
- Performance should not regress
- User-facing behavior remains unchanged
- Backward compatibility maintained for APIs
- Incremental approach with frequent commits
- Each step should be deployable independently


