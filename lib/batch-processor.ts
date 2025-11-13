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
          return { success: true as const, result, index: globalIdx };
        } catch (error) {
          // Handle error through callback if provided
          if (this.options.onError) {
            try {
              const fallbackResult = await this.options.onError(
                error instanceof Error ? error : new Error(String(error)),
                item,
                globalIdx
              );
              return { success: true as const, result: fallbackResult, index: globalIdx };
            } catch (callbackError) {
              return {
                success: false as const,
                error: callbackError instanceof Error ? callbackError : new Error(String(callbackError)),
                index: globalIdx
              };
            }
          }
          return {
            success: false as const,
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
          // Store error for debugging if needed
          console.error(`Item ${outcome.index} failed:`, outcome.error);
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

  reset() {
    this.stats = { success: 0, noMatch: 0, errors: 0 };
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

