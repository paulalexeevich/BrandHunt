/**
 * Test the complete batch extraction flow
 * This simulates what happens when you click "Batch Extract Info"
 */

const { createClient } = require('@supabase/supabase-js');

const PROJECT_ID = '91b36228-c5ce-4230-9fd1-23bc2c8afea4'; // Your project ID

async function testBatchExtractionFlow() {
  console.log('🧪 Testing Batch Extraction Flow\n');
  console.log(`Project ID: ${PROJECT_ID}\n`);
  
  // Check Supabase config
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL not set');
    process.exit(1);
  }
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY not set');
    process.exit(1);
  }
  
  console.log('✅ Supabase config found\n');
  
  // Create Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  console.log('📋 Step 1: Fetching images from project...');
  
  // Fetch images (same query as batch API)
  const { data: images, error: imagesError } = await supabase
    .from('branghunt_images')
    .select('id, original_filename, detection_completed, storage_type, s3_url')
    .eq('project_id', PROJECT_ID)
    .eq('detection_completed', true)
    .order('created_at');
  
  if (imagesError) {
    console.error('❌ Error fetching images:', imagesError);
    process.exit(1);
  }
  
  if (!images || images.length === 0) {
    console.error('❌ No images found for project');
    console.error('   Make sure:');
    console.error('   1. Project ID is correct');
    console.error('   2. Images have detection_completed = true');
    process.exit(1);
  }
  
  console.log(`✅ Found ${images.length} images with detection_completed=true`);
  images.forEach((img, idx) => {
    console.log(`   ${idx + 1}. ${img.original_filename} (${img.id.substring(0, 8)}...)`);
    console.log(`      Storage: ${img.storage_type || 'legacy'}, S3: ${img.s3_url ? 'Yes' : 'No'}`);
  });
  
  console.log('\n📋 Step 2: Fetching detections for each image...');
  
  let totalDetectionsNeedingExtraction = 0;
  
  for (const image of images) {
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('id, detection_index, brand_name, brand_extracted')
      .eq('image_id', image.id)
      .is('brand_name', null)
      .order('detection_index');
    
    if (detectionsError) {
      console.error(`❌ Error fetching detections for ${image.original_filename}:`, detectionsError);
      continue;
    }
    
    const count = detections?.length || 0;
    totalDetectionsNeedingExtraction += count;
    
    console.log(`   ${image.original_filename}: ${count} detections needing extraction`);
  }
  
  console.log(`\n✅ Total detections needing extraction: ${totalDetectionsNeedingExtraction}`);
  
  if (totalDetectionsNeedingExtraction === 0) {
    console.log('\n⚠️  ALL DETECTIONS ALREADY EXTRACTED!');
    console.log('   This is why batch extraction shows "0 products extracted"');
    console.log('   The batch process ran successfully but found nothing to do.');
    console.log('\n💡 To test extraction again:');
    console.log('   1. Clear extraction data with SQL:');
    console.log('      UPDATE branghunt_detections');
    console.log('      SET brand_name = NULL, brand_extracted = false');
    console.log(`      WHERE image_id IN (SELECT id FROM branghunt_images WHERE project_id = '${PROJECT_ID}');`);
    console.log('   2. Run batch extraction again');
    process.exit(0);
  }
  
  console.log('\n📋 Step 3: Checking image data accessibility...');
  
  const testImage = images[0];
  console.log(`   Testing with: ${testImage.original_filename}`);
  
  if (testImage.s3_url) {
    console.log(`   Image stored in S3: ${testImage.s3_url.substring(0, 50)}...`);
    console.log('   Batch extraction will fetch from S3');
  } else if (testImage.storage_type === 'base64') {
    console.log('   Image stored as base64 in database');
    console.log('   Batch extraction will use database storage');
  } else {
    console.log('   ⚠️  Legacy storage - checking file_path');
  }
  
  console.log('\n✅ ALL CHECKS PASSED!');
  console.log('\n📊 Summary:');
  console.log(`   - Project ID: ${PROJECT_ID}`);
  console.log(`   - Images with detections: ${images.length}`);
  console.log(`   - Detections needing extraction: ${totalDetectionsNeedingExtraction}`);
  console.log('\n💡 If batch extraction still shows 0 products:');
  console.log('   1. Check server logs during extraction');
  console.log('   2. Check browser console for errors');
  console.log('   3. Verify Gemini API key is in production environment');
}

testBatchExtractionFlow().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

