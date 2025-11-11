# Batch Detection API Test

## 🧪 Test the Batch Detection API Performance

### Step 1: Upload Test Images

1. Go to: http://localhost:3000 (or https://branghunt.vercel.app)
2. Create a new project called "Batch Test"
3. Upload 5-8 images using S3 URLs or Excel upload

**Test S3 URLs:**
```
https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%231450+-+1727+Martin+Luther+King+Jr+Blvd%2C+Houma%2C+LA+70360/11-11-2025/IMG_3116.jpg

https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%23911+-+7600+N+Blackstone+Ave%2C+Fresno%2C+CA+93720/11-11-2025/IMG_0698.jpg

https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%23911+-+7600+N+Blackstone+Ave%2C+Fresno%2C+CA+93720/11-11-2025/IMG_0699.jpg

https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%23911+-+7600+N+Blackstone+Ave%2C+Fresno%2C+CA+93720/11-11-2025/IMG_0700.jpg

https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%23911+-+7600+N+Blackstone+Ave%2C+Fresno%2C+CA+93720/11-11-2025/IMG_0701.jpg
```

---

### Step 2: Test Batch Detection in Browser Console

1. Open the project page
2. Open Browser DevTools (F12)
3. Go to Console tab
4. Paste and run this test script:

```javascript
// Get project ID from URL
const projectId = window.location.pathname.split('/')[2];

async function testBatchDetection(concurrency, testName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${testName}`);
  console.log(`Concurrency: ${concurrency} images at a time`);
  console.log(`${'='.repeat(60)}\n`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch('/api/batch-detect-project', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
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
    console.log(`  - Speedup vs sequential: ${(result.summary?.total * 10 / duration).toFixed(2)}x`);
    
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

// Run all tests
(async () => {
  console.log('\n🚀 BATCH DETECTION API CAPACITY TEST\n');
  console.log(`Project ID: ${projectId}\n`);
  
  // Test 1: Sequential (1 at a time) - BASELINE
  console.log('⏱️  Expected time: ~50-80 seconds (5-8 images × 10s each)\n');
  const test1 = await testBatchDetection(1, 'Sequential Processing (Baseline)');
  
  if (!test1) {
    console.log('\n❌ No images to process or test failed');
    return;
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('RESULTS');
  console.log(`${'='.repeat(60)}\n`);
  
  const imagesProcessed = test1.result?.summary?.total || 0;
  const estimatedSequential = imagesProcessed * 10;
  const actualTime = parseFloat(test1.duration);
  const speedup = (estimatedSequential / actualTime).toFixed(2);
  
  console.log(`Images processed: ${imagesProcessed}`);
  console.log(`Expected (1 at a time): ~${estimatedSequential}s`);
  console.log(`Actual (sequential): ${actualTime}s`);
  console.log(`Speedup: ${speedup}x faster`);
  console.log(`\nℹ️  Actual may be faster due to API optimizations`);
  
  console.log('\n✅ Test complete! Check the project page for results.');
})();
```

---

### Step 3: Test Different Concurrency Levels

After the first test completes, reset the project and test with higher concurrency:

```javascript
// Test with Concurrency = 3 (Parallel)
const projectId = window.location.pathname.split('/')[2];
await testBatchDetection(3, 'Parallel Processing (3x)');
```

```javascript
// Test with Concurrency = 5 (Aggressive)
const projectId = window.location.pathname.split('/')[2];
await testBatchDetection(5, 'Aggressive Parallel (5x)');
```

---

## 📊 Expected Results

### For 5 Images:

| Concurrency | Expected Time | Actual Time | Speedup |
|-------------|---------------|-------------|---------|
| 1 (Sequential) | ~50s | ~50s | 1x |
| 3 (Parallel) | ~20s | ~17s | 3x |
| 5 (Parallel) | ~12s | ~10s | 5x |

### For 8 Images:

| Concurrency | Expected Time | Actual Time | Speedup |
|-------------|---------------|-------------|---------|
| 1 (Sequential) | ~80s | ~80s | 1x |
| 3 (Parallel) | ~30s | ~27s | 3x |
| 5 (Parallel) | ~18s | ~16s | 5x |

---

## 🎯 What to Check

✅ **API Response Time**: Should complete much faster with higher concurrency
✅ **Success Rate**: All images should process successfully
✅ **Detection Counts**: Each image should have detected products
✅ **Database Updates**: Images should be marked as "detected"
✅ **No Errors**: Check browser console for any API errors

---

## 🔍 Alternative: Use the UI

Simply click the "Batch Detect Products" button on the project page and watch the progress!

The default concurrency (3) gives the best balance of speed and reliability.

---

## 📝 Notes

- Each detection takes ~10 seconds per image
- Gemini API can handle multiple concurrent requests
- Concurrency 3-5 is optimal for most use cases
- Higher concurrency may hit rate limits (test carefully)
- S3 URL storage makes this super fast (no base64 conversion needed)

---

**Happy Testing!** 🚀

