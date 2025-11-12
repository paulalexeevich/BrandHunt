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
    expect(stats.total).toBe(5);
    expect(stats.processed).toBe(5);
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
    expect(stats.failed).toBe(0); // Error handler provided fallback
  });

  test('handles errors without callback', async () => {
    const processor = new BatchProcessor<number, number>({
      concurrency: 2
    });

    const { results, stats } = await processor.process([1, 2, 3], async (item) => {
      if (item === 2) throw new Error('Failed');
      return item;
    });

    expect(results).toEqual([1, 3]); // Item 2 failed and was not included
    expect(stats.succeeded).toBe(2);
    expect(stats.failed).toBe(1);
  });

  test('calls onProgress for each item', async () => {
    const progressUpdates: Array<{result: number, processed: number, total: number}> = [];
    
    const processor = new BatchProcessor<number, number>({
      concurrency: 2,
      onProgress: (result, processed, total) => {
        progressUpdates.push({ result, processed, total });
      }
    });

    await processor.process([1, 2, 3], async (item) => item * 2);

    expect(progressUpdates).toHaveLength(3);
    expect(progressUpdates[0]).toEqual({ result: 2, processed: 1, total: 3 });
    expect(progressUpdates[1]).toEqual({ result: 4, processed: 2, total: 3 });
    expect(progressUpdates[2]).toEqual({ result: 6, processed: 3, total: 3 });
  });

  test('handles empty array', async () => {
    const processor = new BatchProcessor<number, number>({
      concurrency: 2
    });

    const { results, stats } = await processor.process([], async (item) => item);

    expect(results).toEqual([]);
    expect(stats.total).toBe(0);
    expect(stats.processed).toBe(0);
    expect(stats.succeeded).toBe(0);
    expect(stats.failed).toBe(0);
  });

  test('respects concurrency limit', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;
    
    const processor = new BatchProcessor<number, number>({
      concurrency: 3
    });

    await processor.process([1, 2, 3, 4, 5, 6], async (item) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise(resolve => setTimeout(resolve, 10));
      currentConcurrent--;
      return item;
    });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
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

  test('resets statistics', () => {
    const stats = new CumulativeStats();
    stats.increment('success');
    stats.increment('noMatch');
    
    expect(stats.getTotal()).toBe(2);
    
    stats.reset();
    
    expect(stats.get()).toEqual({ success: 0, noMatch: 0, errors: 0 });
    expect(stats.getTotal()).toBe(0);
  });

  test('initializes with zeros', () => {
    const stats = new CumulativeStats();
    
    expect(stats.get()).toEqual({ success: 0, noMatch: 0, errors: 0 });
    expect(stats.getTotal()).toBe(0);
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
    expect(validateConcurrency(-5, 10, 50)).toBe(1);
  });

  test('returns value when within bounds', () => {
    expect(validateConcurrency(25, 10, 50)).toBe(25);
  });

  test('handles null by using default', () => {
    expect(validateConcurrency(null as any, 10, 50)).toBe(10);
  });
});

