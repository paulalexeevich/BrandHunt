#!/usr/bin/env node

/**
 * Test contextual analysis for a single detection to diagnose errors
 */

const IMAGE_ID = '26258a2f-3f77-477d-ab44-fa9a79a1cc87';
const DETECTION_NUMBER = 41; // Product #41 that should get corrected
const BASE_URL = 'http://localhost:3000';

async function testSingleDetection() {
  console.log('🧪 Testing contextual analysis for single detection');
  console.log(`Image: ${IMAGE_ID}, Detection: #${DETECTION_NUMBER}\n`);
  
  try {
    // 1. First, check the current state of the detection
    console.log('1️⃣ Fetching detection info...');
    const imageResponse = await fetch(`${BASE_URL}/api/results/${IMAGE_ID}`);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }
    
    const imageData = await imageResponse.json();
    const detection = imageData.detections?.find(d => d.detection_index === DETECTION_NUMBER);
    
    if (!detection) {
      throw new Error(`Detection #${DETECTION_NUMBER} not found`);
    }
    
    console.log('   Detection info:');
    console.log(`   - ID: ${detection.id}`);
    console.log(`   - Brand: ${detection.brand_name || 'NULL'} (confidence: ${detection.brand_confidence || 0})`);
    console.log(`   - Size: ${detection.size || 'NULL'}`);
    console.log(`   - Is Product: ${detection.is_product}`);
    console.log(`   - Bounding Box: ${JSON.stringify(detection.bounding_box)}`);
    
    // Check if it qualifies for contextual analysis
    const brandUnknown = !detection.brand_name || detection.brand_name.toLowerCase() === 'unknown';
    const lowConfidence = detection.brand_confidence !== null && detection.brand_confidence < 0.91;
    const qualifies = detection.brand_name && (brandUnknown || lowConfidence) && detection.is_product !== false;
    
    console.log(`\n   Qualifies for contextual analysis: ${qualifies}`);
    if (!qualifies) {
      console.log(`   Reason: ${
        !detection.brand_name ? 'No brand_name (extraction not done)' :
        detection.is_product === false ? 'Not a product' :
        !brandUnknown && !lowConfidence ? `Brand confidence too high (${detection.brand_confidence})` :
        'Unknown reason'
      }`);
      return;
    }
    
    // 2. Try to run contextual analysis on just this detection
    console.log('\n2️⃣ Running contextual analysis API on single detection...');
    const contextResponse = await fetch(`${BASE_URL}/api/batch-contextual-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: IMAGE_ID }),
      credentials: 'include'
    });
    
    if (!contextResponse.ok) {
      throw new Error(`API Error: ${contextResponse.statusText}`);
    }
    
    const contextResult = await contextResponse.json();
    console.log('   API Response:');
    console.log(`   - Processed: ${contextResult.processed}`);
    console.log(`   - Corrected: ${contextResult.corrected}`);
    console.log(`   - No improvement: ${contextResult.noImprovement}`);
    console.log(`   - Skipped: ${contextResult.skipped}`);
    console.log(`   - Errors: ${contextResult.errors}`);
    
    // Find result for this specific detection
    const detectionResult = contextResult.results?.find(r => r.detectionIndex === DETECTION_NUMBER);
    if (detectionResult) {
      console.log(`\n   Result for detection #${DETECTION_NUMBER}:`);
      console.log(`   - Status: ${detectionResult.status}`);
      console.log(`   - Original Brand: ${detectionResult.originalBrand} (${Math.round((detectionResult.originalBrandConfidence || 0) * 100)}%)`);
      console.log(`   - Contextual Brand: ${detectionResult.contextualBrand} (${Math.round((detectionResult.contextualBrandConfidence || 0) * 100)}%)`);
      console.log(`   - Corrected: ${detectionResult.corrected}`);
      if (detectionResult.correctionNotes) {
        console.log(`   - Notes: ${detectionResult.correctionNotes}`);
      }
      if (detectionResult.error) {
        console.log(`   - Error: ${detectionResult.error}`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testSingleDetection().catch(console.error);

