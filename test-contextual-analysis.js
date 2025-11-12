#!/usr/bin/env node

/**
 * Test batch contextual analysis for specific image
 * Tests products #41 and #22 to verify they get overwritten
 */

const IMAGE_ID = '26258a2f-3f77-477d-ab44-fa9a79a1cc87';
const BASE_URL = 'http://localhost:3000';

async function checkProductsBefore() {
  console.log('📊 Checking products #41 and #22 BEFORE contextual analysis...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/results/${IMAGE_ID}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const data = await response.json();
    const detections = data.detections || [];
    
    const product41 = detections.find(d => d.detection_index === 41);
    const product22 = detections.find(d => d.detection_index === 22);
    
    console.log('Product #41:');
    if (product41) {
      console.log(`  Brand: ${product41.brand_name || 'NULL'} (confidence: ${product41.brand_confidence || 0})`);
      console.log(`  Size: ${product41.size || 'NULL'}`);
      console.log(`  Corrected by contextual: ${product41.corrected_by_contextual || false}`);
      console.log(`  Should process: ${!product41.brand_name || product41.brand_name.toLowerCase() === 'unknown' || (product41.brand_confidence !== null && product41.brand_confidence <= 0.90)}`);
    } else {
      console.log('  NOT FOUND');
    }
    
    console.log('\nProduct #22:');
    if (product22) {
      console.log(`  Brand: ${product22.brand_name || 'NULL'} (confidence: ${product22.brand_confidence || 0})`);
      console.log(`  Size: ${product22.size || 'NULL'}`);
      console.log(`  Corrected by contextual: ${product22.corrected_by_contextual || false}`);
      console.log(`  Should process: ${!product22.brand_name || product22.brand_name.toLowerCase() === 'unknown' || (product22.brand_confidence !== null && product22.brand_confidence <= 0.90)}`);
    } else {
      console.log('  NOT FOUND');
    }
    
    return { product41, product22 };
  } catch (error) {
    console.error('Error:', error.message);
    return { product41: null, product22: null };
  }
}

async function runBatchContextualAnalysis() {
  console.log('\n🔬 Running batch contextual analysis...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/batch-contextual-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageId: IMAGE_ID }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error || response.statusText}`);
    }
    
    const result = await response.json();
    
    console.log(`✅ Batch processing complete!`);
    console.log(`   Processed: ${result.processed}`);
    console.log(`   Corrected: ${result.corrected}`);
    console.log(`   No improvement: ${result.noImprovement}`);
    console.log(`   Skipped (no neighbors): ${result.skipped}`);
    console.log(`   Errors: ${result.errors}`);
    
    // Find results for products #41 and #22
    const results41 = result.results.filter(r => r.detectionIndex === 41);
    const results22 = result.results.filter(r => r.detectionIndex === 22);
    
    console.log('\n📋 Product #41 results:');
    if (results41.length > 0) {
      results41.forEach(r => {
        console.log(`  Status: ${r.status}`);
        console.log(`  Original: ${r.originalBrand || 'NULL'} (${Math.round((r.originalBrandConfidence || 0) * 100)}%)`);
        console.log(`  Contextual: ${r.contextualBrand || 'NULL'} (${Math.round((r.contextualBrandConfidence || 0) * 100)}%)`);
        console.log(`  Corrected: ${r.corrected}`);
        if (r.correctionNotes) {
          console.log(`  Notes: ${r.correctionNotes}`);
        }
        if (r.error) {
          console.log(`  Error: ${r.error}`);
        }
      });
    } else {
      console.log('  No results (may not have qualified for processing)');
    }
    
    console.log('\n📋 Product #22 results:');
    if (results22.length > 0) {
      results22.forEach(r => {
        console.log(`  Status: ${r.status}`);
        console.log(`  Original: ${r.originalBrand || 'NULL'} (${Math.round((r.originalBrandConfidence || 0) * 100)}%)`);
        console.log(`  Contextual: ${r.contextualBrand || 'NULL'} (${Math.round((r.contextualBrandConfidence || 0) * 100)}%)`);
        console.log(`  Corrected: ${r.corrected}`);
        if (r.correctionNotes) {
          console.log(`  Notes: ${r.correctionNotes}`);
        }
        if (r.error) {
          console.log(`  Error: ${r.error}`);
        }
      });
    } else {
      console.log('  No results (may not have qualified for processing)');
    }
    
    return result;
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

async function checkProductsAfter() {
  console.log('\n📊 Checking products #41 and #22 AFTER contextual analysis...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/results/${IMAGE_ID}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const data = await response.json();
    const detections = data.detections || [];
    
    const product41 = detections.find(d => d.detection_index === 41);
    const product22 = detections.find(d => d.detection_index === 22);
    
    console.log('Product #41:');
    if (product41) {
      console.log(`  Brand: ${product41.brand_name || 'NULL'} (confidence: ${product41.brand_confidence || 0})`);
      console.log(`  Size: ${product41.size || 'NULL'}`);
      console.log(`  Corrected by contextual: ${product41.corrected_by_contextual || false}`);
      if (product41.contextual_correction_notes) {
        console.log(`  Correction notes: ${product41.contextual_correction_notes}`);
      }
    } else {
      console.log('  NOT FOUND');
    }
    
    console.log('\nProduct #22:');
    if (product22) {
      console.log(`  Brand: ${product22.brand_name || 'NULL'} (confidence: ${product22.brand_confidence || 0})`);
      console.log(`  Size: ${product22.size || 'NULL'}`);
      console.log(`  Corrected by contextual: ${product22.corrected_by_contextual || false}`);
      if (product22.contextual_correction_notes) {
        console.log(`  Correction notes: ${product22.contextual_correction_notes}`);
      }
    } else {
      console.log('  NOT FOUND');
    }
    
    return { product41, product22 };
  } catch (error) {
    console.error('Error:', error.message);
    return { product41: null, product22: null };
  }
}

async function main() {
  console.log('🧪 Testing Batch Contextual Analysis');
  console.log(`Image ID: ${IMAGE_ID}`);
  console.log('='.repeat(60));
  console.log();
  
  // Check before
  const before = await checkProductsBefore();
  
  // Run batch processing
  const result = await runBatchContextualAnalysis();
  
  if (result) {
    // Wait a moment for database to update
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check after
    const after = await checkProductsAfter();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 SUMMARY:');
    console.log('='.repeat(60));
    
    if (before.product41 && after.product41) {
      console.log('\nProduct #41:');
      const brand41Changed = before.product41.brand_name !== after.product41.brand_name;
      const conf41Changed = before.product41.brand_confidence !== after.product41.brand_confidence;
      console.log(`  Brand changed: ${brand41Changed ? '✅ YES' : '❌ NO'}`);
      console.log(`  Confidence changed: ${conf41Changed ? '✅ YES' : '❌ NO'}`);
      console.log(`  Overwritten: ${after.product41.corrected_by_contextual ? '✅ YES' : '❌ NO'}`);
    }
    
    if (before.product22 && after.product22) {
      console.log('\nProduct #22:');
      const brand22Changed = before.product22.brand_name !== after.product22.brand_name;
      const conf22Changed = before.product22.brand_confidence !== after.product22.brand_confidence;
      console.log(`  Brand changed: ${brand22Changed ? '✅ YES' : '❌ NO'}`);
      console.log(`  Confidence changed: ${conf22Changed ? '✅ YES' : '❌ NO'}`);
      console.log(`  Overwritten: ${after.product22.corrected_by_contextual ? '✅ YES' : '❌ NO'}`);
    }
  }
}

main().catch(console.error);

