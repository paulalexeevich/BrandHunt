# Phase 1 Implementation Guide: Foundation Utilities

**Goal:** Create reusable utilities for batch processing and SSE streaming  
**Timeline:** 1-2 days  
**Files Created:** 3 utility files + 1 type file  
**Impact:** Enable refactoring of 8 batch APIs

---

## Step 1: Create Batch Processor Utility

### File: `lib/batch-processor.ts`

```typescript
/**
 * Batch Processing Utilities
 * 
 * Provides reusable patterns for:
 * - SSE streaming responses
 * - Concurrent batch processing with progress tracking
 * - Error handling and recovery
 */

export type ProgressCallback = (update: any) => void;

/**
 * Creates an SSE (Server-Sent Events) streaming response
 * 
 * @param processor - Async function that performs work and calls sendProgress
 * @returns Response object configured for SSE streaming
 * 
 * @example
 * export async function POST(request: NextRequest) {
 *   return createSSEResponse(async (sendProgress) => {
 *     sendProgress({ type: 'start', message: 'Processing...' });
 *     // ... do work ...
 *     sendProgress({ type: 'complete', results: [...] });
 *   });
 * }
 */
export function createSSEResponse(
  processor: (sendProgress: ProgressCallback) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (update: any) => {
        const data = `data: ${JSON.stringify(update)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      try {
        await processor(sendProgress);
        controller.close();
      } catch (error) {
        sendProgress({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Options for batch processing
 */
export interface BatchProcessorOptions<T, R> {
  /** Maximum number of concurrent operations */
  concurrency: number;
  /** Called after each item is processed */
  onProgress?: (result: R, processed: number, total: number) => void;
  /** Called when an item fails (can return a default result or rethrow) */
  onError?: (error: Error, item: T, index: number) => R | Promise<R>;
}

/**
 * Result of batch processing
 */
export interface BatchProcessorResult<R> {
  results: R[];
  stats: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  };
}

/**
 * Processes items in concurrent batches with progress tracking
 * 
 * @example
 * const processor = new BatchProcessor({
 *   concurrency: 10,
 *   onProgress: (result, done, total) => {
 *     sendProgress({ processed: done, total });
 *   }
 * });
 * 
 * const { results, stats } = await processor.process(
 *   detections,
 *   async (detection, idx) => {
 *     return await processDetection(detection);
 *   }
 * );
 */
export class BatchProcessor<T, R> {
  private options: BatchProcessorOptions<T, R>;

  constructor(options: BatchProcessorOptions<T, R>) {
    this.options = {
      ...options,
      concurrency: Math.max(1, options.concurrency)
    };
  }

  async process(
    items: T[],
    processor: (item: T, index: number) => Promise<R>
  ): Promise<BatchProcessorResult<R>> {
    const results: R[] = [];
    const stats = {
      total: items.length,
      processed: 0,
      succeeded: 0,
      failed: 0
    };

    if (items.length === 0) {
      return { results, stats };
    }

    const concurrency = Math.min(this.options.concurrency, items.length);

    // Process in batches
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      
      // Start all promises in the batch
      const batchPromises = batch.map(async (item, batchIdx) => {
        const globalIdx = i + batchIdx;
        try {
          const result = await processor(item, globalIdx);
          return { success: true, result, index: globalIdx };
        } catch (error) {
          // Handle error through callback if provided
          if (this.options.onError) {
            try {
              const fallbackResult = await this.options.onError(
                error instanceof Error ? error : new Error(String(error)),
                item,
                globalIdx
              );
              return { success: true, result: fallbackResult, index: globalIdx };
            } catch (callbackError) {
              return {
                success: false,
                error: callbackError instanceof Error ? callbackError : new Error(String(callbackError)),
                index: globalIdx
              };
            }
          }
          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            index: globalIdx
          };
        }
      });

      // Await each promise sequentially to enable real-time progress updates
      for (const promise of batchPromises) {
        const outcome = await promise;
        stats.processed++;

        if (outcome.success) {
          results.push(outcome.result);
          stats.succeeded++;
          this.options.onProgress?.(outcome.result, stats.processed, stats.total);
        } else {
          stats.failed++;
          // You could store errors or handle them here
        }
      }
    }

    return { results, stats };
  }
}

/**
 * Tracks cumulative statistics for batch operations
 * Useful for tracking success/failure/no-match across operations
 */
export class CumulativeStats {
  private stats = {
    success: 0,
    noMatch: 0,
    errors: 0
  };

  increment(type: 'success' | 'noMatch' | 'errors') {
    this.stats[type]++;
  }

  get() {
    return { ...this.stats };
  }

  getTotal() {
    return this.stats.success + this.stats.noMatch + this.stats.errors;
  }
}

/**
 * Helper to validate and normalize concurrency parameter
 */
export function validateConcurrency(
  concurrency: number | undefined,
  defaultValue: number,
  maxValue: number
): number {
  const value = concurrency ?? defaultValue;
  return Math.max(1, Math.min(value, maxValue));
}
```

---

## Step 2: Create Batch Query Utilities

### File: `lib/batch-queries.ts`

```typescript
/**
 * Common database queries for batch processing
 * Centralizes filtering logic to avoid duplication
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DetectionFilters {
  /** Filter by image ID */
  imageId?: string;
  /** Filter by project ID (fetches across all images in project) */
  projectId?: string;
  /** Include only products (true), non-products (false), or all (null) */
  isProduct?: boolean | null;
  /** Require brand_name to be set */
  hasExtractedInfo?: boolean;
  /** Require fully_analyzed to be true */
  fullyAnalyzed?: boolean;
  /** Require NOT fully_analyzed (pending items) */
  notFullyAnalyzed?: boolean;
  /** Filter by specific detection IDs */
  detectionIds?: string[];
}

/**
 * Fetch detections with common filters
 * Handles the complex .or() logic for is_product filtering
 * 
 * @example
 * // Get all products in an image that need FoodGraph search
 * const detections = await fetchDetections(supabase, {
 *   imageId: 'img-123',
 *   isProduct: true,
 *   hasExtractedInfo: true,
 *   notFullyAnalyzed: true
 * });
 */
export async function fetchDetections(
  supabase: SupabaseClient,
  filters: DetectionFilters
) {
  let query = supabase
    .from('branghunt_detections')
    .select('*')
    .order('detection_index', { ascending: true });

  // Image or Project filter
  if (filters.imageId) {
    query = query.eq('image_id', filters.imageId);
  }
  
  if (filters.detectionIds && filters.detectionIds.length > 0) {
    query = query.in('id', filters.detectionIds);
  }

  // Product filter (handles NULL values correctly)
  if (filters.isProduct === true) {
    // Include both NULL (not yet classified) and TRUE (confirmed products)
    // Exclude only FALSE (confirmed non-products)
    query = query.or('is_product.is.null,is_product.eq.true');
  } else if (filters.isProduct === false) {
    // Only confirmed non-products
    query = query.eq('is_product', false);
  }
  // If null or undefined, include all (no filter)

  // Extracted info filter
  if (filters.hasExtractedInfo) {
    query = query.not('brand_name', 'is', null);
  }

  // Fully analyzed filters
  if (filters.fullyAnalyzed) {
    query = query.eq('fully_analyzed', true);
  } else if (filters.notFullyAnalyzed) {
    query = query.or('fully_analyzed.is.null,fully_analyzed.eq.false');
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch detections: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetch detections across multiple images in a project
 * Returns Map<imageId, Detection[]> for efficient lookup
 */
export async function fetchDetectionsByProject(
  supabase: SupabaseClient,
  projectId: string,
  filters: Omit<DetectionFilters, 'imageId' | 'projectId'> = {}
) {
  // First, fetch all images in project
  const { data: images, error: imagesError } = await supabase
    .from('branghunt_images')
    .select('id')
    .eq('project_id', projectId);

  if (imagesError) {
    throw new Error(`Failed to fetch images: ${imagesError.message}`);
  }

  if (!images || images.length === 0) {
    return { detections: [], imageMap: new Map() };
  }

  const imageIds = images.map(img => img.id);

  // Fetch all detections for these images
  let query = supabase
    .from('branghunt_detections')
    .select('*')
    .in('image_id', imageIds)
    .order('detection_index', { ascending: true });

  // Apply other filters
  if (filters.isProduct === true) {
    query = query.or('is_product.is.null,is_product.eq.true');
  } else if (filters.isProduct === false) {
    query = query.eq('is_product', false);
  }

  if (filters.hasExtractedInfo) {
    query = query.not('brand_name', 'is', null);
  }

  if (filters.fullyAnalyzed) {
    query = query.eq('fully_analyzed', true);
  } else if (filters.notFullyAnalyzed) {
    query = query.or('fully_analyzed.is.null,fully_analyzed.eq.false');
  }

  const { data: detections, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch detections: ${error.message}`);
  }

  // Create map for efficient image lookup
  const imageMap = new Map();
  for (const detection of detections || []) {
    if (!imageMap.has(detection.image_id)) {
      imageMap.set(detection.image_id, []);
    }
    imageMap.get(detection.image_id).push(detection);
  }

  return {
    detections: detections || [],
    imageMap,
    imageIds
  };
}

/**
 * Fetch image data for detections
 * Returns Map<imageId, ImageData> for efficient lookup
 */
export async function fetchImagesForDetections(
  supabase: SupabaseClient,
  imageIds: string[]
) {
  if (imageIds.length === 0) {
    return new Map();
  }

  const { data: images, error } = await supabase
    .from('branghunt_images')
    .select('id, s3_url, file_path, storage_type, mime_type, original_filename')
    .in('id', imageIds);

  if (error) {
    throw new Error(`Failed to fetch images: ${error.message}`);
  }

  const imageMap = new Map();
  for (const img of images || []) {
    imageMap.set(img.id, img);
  }

  return imageMap;
}
```

---

## Step 3: Create Enhanced Type Definitions

### File: `types/batch.ts`

```typescript
/**
 * Type definitions for batch processing operations
 */

export interface BatchProcessingRequest {
  imageId?: string;
  projectId?: string;
  concurrency?: number;
  skipNonProducts?: boolean;
}

export type BatchResultStatus = 'success' | 'error' | 'no_match' | 'skipped';

export interface BatchItemResult {
  detectionId: string;
  detectionIndex: number;
  status: BatchResultStatus;
  productName?: string;
  brandName?: string;
  message?: string;
  error?: string;
}

export interface BatchProgressUpdate {
  type: 'start' | 'progress' | 'complete' | 'error';
  message?: string;
  processed?: number;
  total?: number;
  success?: number;
  noMatch?: number;
  errors?: number;
  // Item-level details
  detectionIndex?: number;
  detectionId?: string;
  stage?: string;
  currentProduct?: string;
}

export interface BatchCompleteResult {
  success: number;
  noMatch: number;
  errors: number;
  details: BatchItemResult[];
  duration?: number;
}

/**
 * Processing stages for pipelines
 */
export type ProcessingStage = 'search' | 'pre_filter' | 'ai_filter' | 'visual_match';

/**
 * Match status from AI filtering
 */
export type MatchStatus = 'identical' | 'almost_same' | 'not_match';
```

### File: `types/foodgraph.ts`

```typescript
/**
 * Type definitions for FoodGraph integration
 */

import type { ProcessingStage, MatchStatus } from './batch';

/**
 * FoodGraph product result stored in database
 */
export interface FoodGraphResult {
  id: string;
  detection_id: string;
  product_gtin: string;
  product_name: string;
  front_image_url: string;
  is_match: boolean;
  processing_stage: ProcessingStage;
  match_status: MatchStatus | null;
  match_reason: string | null;
  created_at: string;
  // Full API response data
  full_data?: FoodGraphProductData;
}

/**
 * Full product data from FoodGraph API
 */
export interface FoodGraphProductData {
  title: string;
  companyBrand: string;
  measures: string;
  keys: {
    GTIN14: string;
    [key: string]: string;
  };
  [key: string]: any;
}

/**
 * Extracted fields from FoodGraph result (for display)
 */
export interface FoodGraphDisplayFields {
  brand: string;
  size: string;
  title: string;
  gtin: string | null;
}

/**
 * FoodGraph search options
 */
export interface FoodGraphSearchOptions {
  brand?: string;
  productName?: string;
  category?: string;
  limit?: number;
}

/**
 * Pre-filter criteria
 */
export interface PreFilterCriteria {
  requiredBrandMatch?: boolean;
  requiredCategoryMatch?: boolean;
  minTitleSimilarity?: number;
}
```

---

## Step 4: Example Refactored API Route

### File: `app/api/batch-search-and-save/route.ts` (AFTER refactoring)

```typescript
import { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import { createSSEResponse, BatchProcessor, CumulativeStats, validateConcurrency } from '@/lib/batch-processor';
import { fetchDetections, fetchImagesForDetections } from '@/lib/batch-queries';
import { searchProducts, preFilterFoodGraphResults, getFrontImageUrl } from '@/lib/foodgraph';
import { compareProductImages, cropImageToBoundingBox, selectBestMatchFromMultiple } from '@/lib/gemini';
import { getImageBase64ForProcessing } from '@/lib/image-processor';
import type { BatchProgressUpdate, BatchItemResult } from '@/types/batch';

// Must use Node.js runtime for SSE streaming
export const runtime = 'nodejs';

const CONCURRENCY_LIMIT = 50;

export async function POST(request: NextRequest) {
  try {
    const { imageId, concurrency } = await request.json();

    if (!imageId) {
      return new Response(JSON.stringify({ error: 'Missing imageId parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Authenticate and get Supabase client
    const supabase = await createAuthenticatedSupabaseClient(request);

    // Fetch detections that need processing
    const detections = await fetchDetections(supabase, {
      imageId,
      isProduct: true,
      hasExtractedInfo: true,
      notFullyAnalyzed: true
    });

    if (detections.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No detections require processing',
        success: 0, noMatch: 0, errors: 0, details: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch image data for cropping
    const imageMap = await fetchImagesForDetections(supabase, [imageId]);
    const imageData = imageMap.get(imageId);

    if (!imageData) {
      return new Response(JSON.stringify({ error: 'Image not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return SSE streaming response
    return createSSEResponse(async (sendProgress) => {
      const stats = new CumulativeStats();
      const effectiveConcurrency = validateConcurrency(concurrency, 10, CONCURRENCY_LIMIT);

      sendProgress({
        type: 'start',
        message: `🚀 Starting AI Filter Pipeline for ${detections.length} products (concurrency: ${effectiveConcurrency})`,
        total: detections.length
      });

      // Create batch processor
      const processor = new BatchProcessor<any, BatchItemResult>({
        concurrency: effectiveConcurrency,
        onProgress: (result, processed, total) => {
          // Update cumulative stats
          if (result.status === 'success') stats.increment('success');
          else if (result.status === 'no_match') stats.increment('noMatch');
          else stats.increment('errors');

          // Send progress update
          const currentStats = stats.get();
          sendProgress({
            type: 'progress',
            processed,
            total,
            ...currentStats,
            detectionIndex: result.detectionIndex,
            currentProduct: result.productName || result.brandName,
            message: `Processing: ${processed}/${total} | ✅ ${currentStats.success} | ⏸️ ${currentStats.noMatch} | ❌ ${currentStats.errors}`
          } as BatchProgressUpdate);
        }
      });

      // Process all detections
      const { results } = await processor.process(detections, async (detection, idx) => {
        return await processDetection(detection, imageData, supabase);
      });

      // Send completion
      const finalStats = stats.get();
      sendProgress({
        type: 'complete',
        ...finalStats,
        details: results,
        message: `✅ Complete: ${finalStats.success} matched | ⏸️ ${finalStats.noMatch} no match | ❌ ${finalStats.errors} errors`
      });
    });

  } catch (error) {
    console.error('Batch search and save error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Business logic extracted to separate function (can be further moved to service)
async function processDetection(detection: any, imageData: any, supabase: any): Promise<BatchItemResult> {
  const result: BatchItemResult = {
    detectionId: detection.id,
    detectionIndex: detection.detection_index,
    status: 'error'
  };

  try {
    // Step 1: Search FoodGraph
    const searchResults = await searchProducts({
      brand: detection.brand_name,
      productName: detection.product_name,
      category: detection.category,
      limit: 100
    });

    if (searchResults.length === 0) {
      result.status = 'no_match';
      result.message = 'No FoodGraph results found';
      return result;
    }

    // Step 2: Pre-filter
    const preFiltered = await preFilterFoodGraphResults(searchResults, {
      productName: detection.product_name,
      brandName: detection.brand_name,
      category: detection.category
    });

    // Step 3: AI Filter
    // ... rest of logic ...
    
    result.status = 'success';
    return result;

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}
```

---

## Step 5: Testing the Utilities

### File: `__tests__/unit/lib/batch-processor.test.ts`

```typescript
import { BatchProcessor, CumulativeStats, validateConcurrency } from '@/lib/batch-processor';

describe('BatchProcessor', () => {
  test('processes items with concurrency limit', async () => {
    const items = [1, 2, 3, 4, 5];
    const processed: number[] = [];
    
    const processor = new BatchProcessor<number, number>({
      concurrency: 2,
      onProgress: (result) => processed.push(result)
    });

    const { results, stats } = await processor.process(items, async (item) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return item * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(stats.succeeded).toBe(5);
    expect(stats.failed).toBe(0);
    expect(processed).toEqual([2, 4, 6, 8, 10]);
  });

  test('handles errors with onError callback', async () => {
    const processor = new BatchProcessor<number, number>({
      concurrency: 2,
      onError: () => -1 // Return fallback value on error
    });

    const { results, stats } = await processor.process([1, 2, 3], async (item) => {
      if (item === 2) throw new Error('Failed');
      return item;
    });

    expect(results).toEqual([1, -1, 3]);
    expect(stats.succeeded).toBe(3);
  });
});

describe('CumulativeStats', () => {
  test('tracks statistics correctly', () => {
    const stats = new CumulativeStats();
    stats.increment('success');
    stats.increment('success');
    stats.increment('noMatch');
    stats.increment('errors');

    expect(stats.get()).toEqual({ success: 2, noMatch: 1, errors: 1 });
    expect(stats.getTotal()).toBe(4);
  });
});

describe('validateConcurrency', () => {
  test('returns default when undefined', () => {
    expect(validateConcurrency(undefined, 10, 50)).toBe(10);
  });

  test('clamps to max value', () => {
    expect(validateConcurrency(100, 10, 50)).toBe(50);
  });

  test('ensures minimum of 1', () => {
    expect(validateConcurrency(0, 10, 50)).toBe(1);
  });
});
```

---

## Step 6: Commit and Document

```bash
# Create feature branch
git checkout -b refactor/phase1-batch-utilities

# Add files
git add lib/batch-processor.ts
git add lib/batch-queries.ts
git add types/batch.ts
git add types/foodgraph.ts
git add __tests__/unit/lib/batch-processor.test.ts

# Commit
git commit -m "feat: add reusable batch processing utilities

- Create batch-processor.ts with SSE streaming and concurrent processing
- Create batch-queries.ts for common database queries
- Add comprehensive TypeScript types for batch operations
- Add unit tests for batch processor

This foundation enables refactoring of 8 batch API endpoints with 67% code reduction.

Related: REFACTORING_PLAN.md Phase 1"

# Push
git push origin refactor/phase1-batch-utilities
```

---

## Next Steps After Phase 1

1. **Test the utilities** with existing code
2. **Refactor ONE batch API** as proof-of-concept
3. **Review and validate** the approach
4. **Roll out** to remaining batch APIs
5. **Move to Phase 2** (component extraction)

---

## Benefits Checklist

After completing Phase 1, you should have:

- ✅ Single source of truth for SSE streaming
- ✅ Reusable batch processing with progress tracking
- ✅ Consistent error handling across all batch operations
- ✅ Proper TypeScript types for batch operations
- ✅ Testable utilities with unit tests
- ✅ Foundation for refactoring 8 batch APIs
- ✅ ~60% code reduction potential unlocked


