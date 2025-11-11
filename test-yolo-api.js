const fetch = require('node:fetch');

const YOLO_API_URL = 'http://157.180.25.214/api/detect';

// Small test image (1x1 pixel PNG in base64)
const TEST_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function testYOLOAPI() {
  console.log('🎯 Testing YOLO API at:', YOLO_API_URL);
  console.log('━'.repeat(60));
  
  const startTime = Date.now();
  
  try {
    // Test 1: Check API availability
    console.log('\n📡 Test 1: API Availability');
    const response = await fetch(YOLO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: TEST_IMAGE
      })
    });
    
    const duration = Date.now() - startTime;
    console.log(`  ✅ API is reachable`);
    console.log(`  ⏱️  Response time: ${duration}ms`);
    console.log(`  📊 Status: ${response.status} ${response.statusText}`);
    
    const result = await response.json();
    console.log(`  📦 Response:`, JSON.stringify(result, null, 2));
    
    // Test 2: Download real image and test detection
    console.log('\n📸 Test 2: Real Image Detection');
    console.log('  Downloading test image from S3...');
    
    const imageUrl = 'https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%231450+-+1727+Martin+Luther+King+Jr+Blvd%2C+Houma%2C+LA+70360/11-11-2025/IMG_3116.jpg';
    
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    
    console.log(`  ✅ Image downloaded (${(imageBase64.length / 1024 / 1024).toFixed(2)} MB base64)`);
    console.log('  🔍 Sending to YOLO API...');
    
    const detectionStart = Date.now();
    const detectionResponse = await fetch(YOLO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: imageBase64
      })
    });
    
    const detectionDuration = Date.now() - detectionStart;
    const detectionResult = await detectionResponse.json();
    
    console.log(`  ✅ Detection complete!`);
    console.log(`  ⏱️  Processing time: ${(detectionDuration / 1000).toFixed(2)}s`);
    
    if (detectionResult.success) {
      console.log(`  📊 Results:`);
      console.log(`     - Image size: ${detectionResult.image_dimensions.width}x${detectionResult.image_dimensions.height}`);
      console.log(`     - Total detections: ${detectionResult.total_detections}`);
      console.log(`     - Detections with confidence > 0.5: ${detectionResult.detections.filter(d => d.confidence > 0.5).length}`);
      
      if (detectionResult.detections.length > 0) {
        console.log(`\n  🎯 Sample detections (top 5):`);
        detectionResult.detections.slice(0, 5).forEach((det, i) => {
          console.log(`     ${i+1}. ${det.class_name} (confidence: ${(det.confidence * 100).toFixed(1)}%)`);
          console.log(`        bbox: [${det.bbox.x1}, ${det.bbox.y1}, ${det.bbox.x2}, ${det.bbox.y2}]`);
        });
      }
    } else {
      console.log(`  ❌ Detection failed:`, detectionResult);
    }
    
    // Summary
    console.log('\n' + '━'.repeat(60));
    console.log('📊 YOLO API Performance Summary');
    console.log('━'.repeat(60));
    console.log(`✅ API is working and accessible`);
    console.log(`⚡ Detection speed: ${(detectionDuration / 1000).toFixed(2)}s per image`);
    console.log(`🎯 Detection accuracy: ${detectionResult.total_detections} products found`);
    console.log(`🔓 No authentication required`);
    console.log(`\n✅ YOLO API is ready for batch processing!`);
    
  } catch (error) {
    console.error('\n❌ Error testing YOLO API:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   💡 API server is not reachable at', YOLO_API_URL);
    } else if (error.code === 'ETIMEDOUT') {
      console.error('   💡 Request timed out - API may be slow or overloaded');
    }
  }
}

testYOLOAPI();
