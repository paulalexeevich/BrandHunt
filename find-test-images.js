/**
 * Helper script to find images suitable for performance testing
 * Lists images with detections that have brand names extracted
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function findTestImages() {
  console.log('🔍 Finding images suitable for performance testing...\n');

  // Find images with detections that have brand names
  const { data: images, error } = await supabase
    .from('branghunt_images')
    .select(`
      id,
      original_filename,
      store_name,
      created_at,
      project_id
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('❌ Error fetching images:', error);
    process.exit(1);
  }

  console.log(`Found ${images.length} recent images. Checking for detections...\n`);

  const results = [];

  for (const image of images) {
    // Count detections with brand names
    const { data: detections, error: detError } = await supabase
      .from('branghunt_detections')
      .select('id, detection_index, brand_name, product_name, fully_analyzed')
      .eq('image_id', image.id)
      .not('brand_name', 'is', null)
      .order('detection_index');

    if (detError) {
      console.error(`⚠️  Error checking detections for ${image.id}:`, detError.message);
      continue;
    }

    if (detections && detections.length > 0) {
      results.push({
        imageId: image.id,
        filename: image.original_filename,
        storeName: image.store_name,
        detectionCount: detections.length,
        detections: detections.slice(0, 5), // Show first 5
        hasMoreDetections: detections.length > 5
      });
    }
  }

  if (results.length === 0) {
    console.log('❌ No suitable images found.');
    console.log('\nTo create test images:');
    console.log('1. Upload images via UI');
    console.log('2. Run Batch Detect Project');
    console.log('3. Run Batch Extract Info');
    console.log('4. Run this script again');
    process.exit(0);
  }

  console.log(`✅ Found ${results.length} images with extracted brand names\n`);
  console.log('='.repeat(100));

  results.forEach((result, index) => {
    console.log(`\n${index + 1}. 📸 ${result.filename || 'Untitled'}`);
    console.log(`   Image ID: ${result.imageId}`);
    console.log(`   Store: ${result.storeName || 'Unknown'}`);
    console.log(`   Products with brands: ${result.detectionCount}`);
    console.log(`   Available products for testing:`);
    
    result.detections.forEach(det => {
      const analyzed = det.fully_analyzed ? '✓ Analyzed' : '○ Not analyzed';
      console.log(`      #${det.detection_index}: ${det.brand_name} - ${det.product_name || 'Unknown'} [${analyzed}]`);
    });

    if (result.hasMoreDetections) {
      console.log(`      ... and ${result.detectionCount - 5} more products`);
    }

    console.log(`\n   🔬 Test this image:`);
    console.log(`      node test-pipeline-performance.js ${result.imageId}`);
    console.log(`   🎯 Test specific product:`);
    console.log(`      node test-pipeline-performance.js ${result.imageId} ${result.detections[0].detection_index}`);
    console.log('-'.repeat(100));
  });

  console.log('\n💡 TIP: Test products that are NOT analyzed yet (○) for clean results');
  console.log('💡 TIP: Use products from the same store/image for consistent comparison\n');
}

findTestImages().catch(console.error);

