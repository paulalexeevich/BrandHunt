# Refactoring Architecture Overview

**Visual representation of current state vs. proposed architecture**

---

## Current Architecture (Before Refactoring)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  app/analyze/[imageId]/page.tsx (2,807 lines)                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  • 30+ useState declarations                           │   │
│  │  • 1,179 lines of handler functions                    │   │
│  │  • Embedded business logic                             │   │
│  │  • Direct API calls                                    │   │
│  │  • Complex state management                            │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  components/                                                    │
│  ├── FoodGraphResultsList.tsx (387 lines) ✓                   │
│  ├── ImageStatisticsPanel.tsx (150 lines) ✓                   │
│  └── ... (needs 5-7 more components)                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          API Layer                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ❌ MASSIVE DUPLICATION (4,500 duplicate lines)                │
│                                                                 │
│  batch-search-and-save/route.ts (934 lines)                    │
│  ├── SSE setup (133 lines) ← DUPLICATED 8x                    │
│  ├── Concurrency control (60 lines) ← DUPLICATED 8x           │
│  ├── Progress tracking (40 lines) ← DUPLICATED 8x             │
│  ├── Error handling (50 lines) ← DUPLICATED 8x                │
│  └── Business logic (651 lines)                               │
│                                                                 │
│  batch-search-visual/route.ts (651 lines)                      │
│  ├── SSE setup (133 lines) ← DUPLICATED                       │
│  ├── Concurrency control (60 lines) ← DUPLICATED              │
│  ├── ... same pattern repeated                                │
│                                                                 │
│  batch-search-and-save-project/route.ts (485 lines)            │
│  batch-search-visual-project/route.ts (655 lines)              │
│  batch-search-visual-direct/route.ts (650 lines)               │
│  batch-extract-project/route.ts (272 lines)                    │
│  batch-detect-project/route.ts (320 lines)                     │
│  batch-contextual-project/route.ts (555 lines)                 │
│  └── ... all with same duplication                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Utilities Layer                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  lib/                                                           │
│  ├── gemini.ts (complex AI logic)                             │
│  ├── foodgraph.ts (API integration)                           │
│  ├── image-processor.ts (image handling)                      │
│  └── ... (no batch utilities, no shared patterns)             │
│                                                                 │
│  ❌ Missing:                                                   │
│  • Batch processing utilities                                  │
│  • SSE streaming helpers                                       │
│  • Common query functions                                      │
│  • Service layer                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Type Safety                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ❌ 150+ type assertions: (result as any).match_status        │
│  ❌ Untyped API responses                                      │
│  ❌ Missing interfaces for batch operations                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Documentation                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ❌ 70+ markdown files scattered in root                       │
│  • Many overlapping topics                                     │
│  • Hard to find information                                    │
│  • No clear organization                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Proposed Architecture (After Refactoring)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  app/analyze/[imageId]/page.tsx (800 lines) ✅                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  • Clean component composition                         │   │
│  │  • Custom hooks for state                              │   │
│  │  • Minimal business logic                              │   │
│  │  • Clear data flow                                     │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  components/                                                    │
│  ├── FoodGraphResultsList.tsx (387 lines) ✓                   │
│  ├── ImageStatisticsPanel.tsx (150 lines) ✓                   │
│  ├── ProcessingBlocksPanel.tsx (400 lines) ✅                 │
│  ├── BoundingBoxImage.tsx (350 lines) ✅                      │
│  ├── ProductInformationPanel.tsx (400 lines) ✅               │
│  ├── ActionsPanel.tsx (250 lines) ✅                          │
│  └── ... (all < 500 lines)                                    │
│                                                                 │
│  hooks/                                                         │
│  ├── useImageAnalysis.ts (200 lines) ✅                       │
│  ├── useBatchProcessing.ts (300 lines) ✅                     │
│  └── useFoodGraphResults.ts (150 lines) ✅                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          API Layer                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ CLEAN & DRY (1,500 lines total, 67% reduction)            │
│                                                                 │
│  batch-search-and-save/route.ts (150 lines) ✅                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  1. Auth & validation (20 lines)                       │   │
│  │  2. Use shared utilities (10 lines)                    │   │
│  │  3. Return SSE response (20 lines)                     │   │
│  │  4. Business logic delegated to service (100 lines)    │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  batch-search-visual/route.ts (150 lines) ✅                   │
│  batch-search-and-save-project/route.ts (150 lines) ✅         │
│  batch-search-visual-project/route.ts (150 lines) ✅           │
│  batch-search-visual-direct/route.ts (150 lines) ✅            │
│  batch-extract-project/route.ts (120 lines) ✅                 │
│  batch-detect-project/route.ts (120 lines) ✅                  │
│  batch-contextual-project/route.ts (120 lines) ✅              │
│                                                                 │
│  └── All use shared utilities, no duplication                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Service Layer (NEW)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  services/ ✅                                                   │
│  ├── BatchMatchingService.ts (400 lines)                      │
│  │   └── Testable business logic for product matching        │
│  ├── ContextualAnalysisService.ts (300 lines)                 │
│  │   └── Testable contextual analysis logic                  │
│  └── ProductMatchingService.ts (350 lines)                    │
│      └── Testable FoodGraph integration logic                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Utilities Layer                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  lib/ ✅                                                        │
│  ├── batch-processor.ts (300 lines) ✅ NEW                    │
│  │   ├── createSSEResponse()                                  │
│  │   ├── BatchProcessor class                                 │
│  │   ├── CumulativeStats class                                │
│  │   └── validateConcurrency()                                │
│  │                                                              │
│  ├── batch-queries.ts (200 lines) ✅ NEW                      │
│  │   ├── fetchDetections()                                    │
│  │   ├── fetchDetectionsByProject()                           │
│  │   └── fetchImagesForDetections()                           │
│  │                                                              │
│  ├── foodgraph-utils.ts (150 lines) ✅ NEW                    │
│  │   ├── extractFoodGraphFields()                             │
│  │   ├── sortFoodGraphResults()                               │
│  │   └── calculateStageCounts()                               │
│  │                                                              │
│  ├── gemini.ts (existing, improved types)                     │
│  ├── foodgraph.ts (existing, improved types)                  │
│  └── image-processor.ts (existing)                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Type Safety                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  types/ ✅                                                      │
│  ├── batch.ts (comprehensive batch types)                     │
│  │   ├── BatchProcessingRequest                               │
│  │   ├── BatchProgressUpdate                                  │
│  │   ├── BatchCompleteResult                                  │
│  │   └── ProcessingStage, MatchStatus                         │
│  │                                                              │
│  ├── foodgraph.ts (complete FoodGraph types)                  │
│  │   ├── FoodGraphResult                                      │
│  │   ├── FoodGraphProductData                                 │
│  │   └── FoodGraphDisplayFields                               │
│  │                                                              │
│  └── ... (all properly typed, 0 type assertions)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Testing (NEW)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  __tests__/ ✅                                                  │
│  ├── unit/                                                     │
│  │   ├── lib/ (batch utilities tests)                         │
│  │   ├── services/ (business logic tests)                     │
│  │   └── components/ (component tests)                        │
│  ├── integration/                                              │
│  │   ├── api/ (API route tests)                               │
│  │   └── pages/ (page integration tests)                      │
│  └── e2e/                                                      │
│      └── workflows/ (end-to-end tests)                         │
│                                                                 │
│  Target: 80% code coverage                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Documentation                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  docs/ ✅                                                       │
│  ├── architecture/                                             │
│  │   ├── batch-processing.md                                  │
│  │   ├── pipeline-system.md                                   │
│  │   └── statistics-filtering.md                              │
│  ├── features/                                                 │
│  │   ├── foodgraph-integration.md                             │
│  │   ├── contextual-analysis.md                               │
│  │   └── visual-matching.md                                   │
│  ├── deployment/                                               │
│  │   ├── deployment-guide.md                                  │
│  │   └── testing-guide.md                                     │
│  ├── setup/                                                    │
│  │   ├── setup-guide.md                                       │
│  │   └── env-setup.md                                         │
│  └── fixes/                                                    │
│      └── bug-fix-log.md                                        │
│                                                                 │
│  15 organized documents (from 70+ scattered files)             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Comparison

### Before: Direct Database → API → Frontend
```
Frontend
  ↓ (direct API calls)
API Route (934 lines)
  ├── Auth logic
  ├── Database queries
  ├── Business logic (embedded)
  ├── SSE streaming
  ├── Error handling
  └── Response formatting
  ↓
Database
```

**Problems:**
- Business logic mixed with HTTP handling
- Hard to test (need to mock HTTP)
- Duplication across 8 routes
- No separation of concerns

### After: Clean Separation of Concerns
```
Frontend (800 lines)
  ↓
Custom Hooks (useImageAnalysis, useBatchProcessing)
  ↓
API Routes (150 lines each)
  ├── Auth & validation only
  └── Delegate to service
  ↓
Service Layer (testable business logic)
  ├── BatchMatchingService
  ├── ContextualAnalysisService
  └── ProductMatchingService
  ↓
Utilities (shared, reusable)
  ├── batch-processor.ts (SSE, concurrency)
  ├── batch-queries.ts (database queries)
  └── foodgraph-utils.ts (data transformation)
  ↓
Database
```

**Benefits:**
- Clear separation of concerns
- Each layer has single responsibility
- Services are unit testable
- Utilities are reusable
- APIs are thin controllers

---

## Code Organization Comparison

### Before: Flat Structure
```
app/
  api/
    batch-search-and-save/route.ts (934 lines)
    batch-search-visual/route.ts (651 lines)
    ... 12 more similar files
  analyze/[imageId]/page.tsx (2,807 lines)

lib/
  gemini.ts
  foodgraph.ts
  image-processor.ts

components/
  FoodGraphResultsList.tsx
  ImageStatisticsPanel.tsx

types/
  analyze.ts
```

### After: Layered Architecture
```
app/
  api/
    batch-search-and-save/route.ts (150 lines) ✅
    batch-search-visual/route.ts (150 lines) ✅
    ... (all < 200 lines)
  analyze/[imageId]/page.tsx (800 lines) ✅

components/
  FoodGraphResultsList.tsx
  ImageStatisticsPanel.tsx
  ProcessingBlocksPanel.tsx ✅
  BoundingBoxImage.tsx ✅
  ProductInformationPanel.tsx ✅
  ActionsPanel.tsx ✅

hooks/ ✅ NEW
  useImageAnalysis.ts
  useBatchProcessing.ts
  useFoodGraphResults.ts

services/ ✅ NEW
  batchMatching.ts
  contextualAnalysis.ts
  productMatching.ts

lib/
  batch-processor.ts ✅ NEW
  batch-queries.ts ✅ NEW
  foodgraph-utils.ts ✅ NEW
  gemini.ts (improved)
  foodgraph.ts (improved)
  image-processor.ts

types/
  analyze.ts
  batch.ts ✅ NEW
  foodgraph.ts ✅ NEW

__tests__/ ✅ NEW
  unit/
  integration/
  e2e/

docs/ ✅ NEW
  architecture/
  features/
  deployment/
  setup/
  fixes/
```

---

## Metrics Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Analyze Page** | 2,807 lines | 800 lines | -71% |
| **Batch APIs** | 4,500 lines | 1,500 lines | -67% |
| **Type Assertions** | 150+ | 0 | -100% |
| **Test Coverage** | 0% | 80% | +80% |
| **Documentation Files** | 70+ scattered | 15 organized | -79% |
| **Largest File** | 2,807 lines | <500 lines | Component-based |
| **Duplicate Code** | ~4,500 lines | ~0 lines | -100% |
| **Type Coverage** | ~60% | ~90% | +30% |

---

## Implementation Timeline

```
Week 1: Foundation
├── Day 1-2: Create batch utilities (lib/batch-processor.ts, lib/batch-queries.ts)
├── Day 3-4: Add type definitions (types/batch.ts, types/foodgraph.ts)
└── Day 5: Set up testing infrastructure

Week 2: Prove Concept
├── Day 1-2: Refactor batch-search-and-save API (reference implementation)
├── Day 3: Test thoroughly in production
└── Day 4-5: Refactor 2-3 more batch APIs

Week 3: Scale & Components
├── Day 1-2: Complete remaining batch API refactoring
├── Day 3-4: Extract analyze page components
└── Day 5: Create custom hooks

Week 4: Service Layer
├── Day 1-3: Extract business logic to services
├── Day 4-5: Update APIs to use services

Week 5: Polish
├── Day 1-2: Improve type safety
├── Day 3-4: Consolidate documentation
└── Day 5: Final testing and validation
```

---

## Risk Assessment by Phase

| Phase | Risk Level | Mitigation |
|-------|-----------|------------|
| Phase 1: Foundation | 🟢 Low | New utilities, no breaking changes |
| Phase 2: Batch APIs | 🟡 Medium | Thorough testing, one API at a time |
| Phase 3: Components | 🟢 Low | Already proven with FoodGraphResultsList |
| Phase 4: Service Layer | 🟡 Medium | Gradual rollout with feature flags |
| Phase 5: Polish | 🟢 Low | Incremental improvements |

---

## Success Indicators

### Phase 1 Complete When:
- ✅ `lib/batch-processor.ts` created and tested
- ✅ `lib/batch-queries.ts` created and tested
- ✅ Type definitions in place
- ✅ Unit tests passing
- ✅ One API refactored successfully

### Phase 2 Complete When:
- ✅ All 8 batch APIs refactored
- ✅ No code duplication in APIs
- ✅ All APIs < 200 lines each
- ✅ Production testing validates functionality

### Phase 3 Complete When:
- ✅ Analyze page < 1,000 lines
- ✅ 5-7 components extracted
- ✅ Custom hooks in place
- ✅ No file > 500 lines

### Phase 4 Complete When:
- ✅ Service layer created
- ✅ Business logic extracted from APIs
- ✅ Services have unit tests
- ✅ 80% test coverage achieved

### Phase 5 Complete When:
- ✅ 0 type assertions remaining
- ✅ Documentation consolidated to 15 files
- ✅ All success metrics met
- ✅ Team onboarding documentation updated

---

## Key Architectural Principles

### 1. Single Responsibility
Each module does one thing well:
- **API Routes:** HTTP handling only
- **Services:** Business logic only
- **Utilities:** Reusable helpers only
- **Components:** UI rendering only

### 2. Dependency Inversion
High-level modules don't depend on low-level details:
- APIs depend on service interfaces
- Services depend on utility interfaces
- Easy to swap implementations

### 3. Don't Repeat Yourself (DRY)
Common patterns extracted to utilities:
- SSE streaming → `createSSEResponse()`
- Batch processing → `BatchProcessor` class
- Database queries → `fetchDetections()`

### 4. Testability First
Design for testing:
- Pure functions where possible
- Services isolated from HTTP
- Utilities don't depend on framework
- Components receive data via props

### 5. Progressive Enhancement
Refactor incrementally:
- Phase 1 enables Phase 2
- Each phase delivers value
- Can stop at any phase
- No big-bang rewrites

---

**Ready to implement?** Start with Phase 1 in **REFACTORING_PHASE1_GUIDE.md**


