const projectId = '91b36228-c5ce-4230-9fd1-23bc2c8afea4';

async function testBatchDetection(concurrency, testName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${testName}`);
  console.log(`Concurrency: ${concurrency} images at a time`);
  console.log(`${'='.repeat(60)}\n`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://localhost:3000/api/batch-detect-project', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        concurrency
      })
    });
    
    const result = await response.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ COMPLETED in ${duration}s\n`);
    console.log('Summary:');
    console.log(`  - Total images: ${result.summary?.total || 0}`);
    console.log(`  - Successful: ${result.summary?.successful || 0}`);
    console.log(`  - Failed: ${result.summary?.failed || 0}`);
    console.log(`  - Total detections: ${result.summary?.totalDetections || 0}`);
    console.log(`  - Avg time per image: ${(duration / (result.summary?.total || 1)).toFixed(2)}s`);
    
    if (result.results) {
      console.log('\nPer-image results:');
      result.results.forEach((r, i) => {
        console.log(`  ${i+1}. ${r.originalFilename}: ${r.status} (${r.detectionsCount || 0} products)`);
      });
    }
    
    return { duration, result };
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return null;
  }
}

// Run tests
(async () => {
  console.log('\n🚀 BATCH DETECTION API CAPACITY TEST\n');
  console.log('Testing with 8 images from project...\n');
  
  // Test 1: Sequential (1 at a time)
  const test1 = await testBatchDetection(1, 'Sequential Processing (Baseline)');
  
  // Small delay between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Default (3 at a time)
  const test2 = await testBatchDetection(3, 'Parallel Processing (3x)');
  
  // Small delay between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Aggressive (5 at a time)
  const test3 = await testBatchDetection(5, 'Aggressive Parallel (5x)');
  
  // Summary comparison
  console.log(`\n${'='.repeat(60)}`);
  console.log('PERFORMANCE COMPARISON');
  console.log(`${'='.repeat(60)}\n`);
  
  if (test1 && test2 && test3) {
    console.log(`Sequential (1x):  ${test1.duration}s`);
    console.log(`Parallel (3x):    ${test2.duration}s  (${(test1.duration / test2.duration).toFixed(2)}x faster)`);
    console.log(`Aggressive (5x):  ${test3.duration}s  (${(test1.duration / test3.duration).toFixed(2)}x faster)`);
  }
  
  console.log('\n✅ Tests complete!\n');
})();
