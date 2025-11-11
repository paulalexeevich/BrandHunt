// Debug script to check FoodGraph results in database
// Run with: node debug-foodgraph-results.js

const { createClient } = require('@supabase/supabase-js');

// Replace with the detection ID from the console logs
const DETECTION_ID = '60771115-d73b-4c66-a0c5-cbc903dc9ae5';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hkcgttqmsnmozefyvzif.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugFoodGraphResults() {
  console.log(`\n🔍 DEBUG: Checking FoodGraph results for detection ${DETECTION_ID}\n`);

  // 1. Check if detection exists
  console.log('1️⃣ Checking detection...');
  const { data: detection, error: detectionError } = await supabase
    .from('branghunt_detections')
    .select('*')
    .eq('id', DETECTION_ID)
    .single();

  if (detectionError) {
    console.error('❌ Error fetching detection:', detectionError);
    return;
  }

  if (!detection) {
    console.error('❌ Detection not found');
    return;
  }

  console.log('✅ Detection found:');
  console.log('   - detection_index:', detection.detection_index);
  console.log('   - fully_analyzed:', detection.fully_analyzed);
  console.log('   - selected_foodgraph_gtin:', detection.selected_foodgraph_gtin);
  console.log('   - selected_foodgraph_product_name:', detection.selected_foodgraph_product_name);
  console.log('   - analysis_completed_at:', detection.analysis_completed_at);

  // 2. Check FoodGraph results (without RLS - uses service role)
  console.log('\n2️⃣ Checking FoodGraph results...');
  const { data: results, error: resultsError } = await supabase
    .from('branghunt_foodgraph_results')
    .select('*')
    .eq('detection_id', DETECTION_ID)
    .order('result_rank', { ascending: true });

  if (resultsError) {
    console.error('❌ Error fetching results:', resultsError);
    return;
  }

  console.log(`📊 Found ${results?.length || 0} FoodGraph results in database`);

  if (results && results.length > 0) {
    console.log('\n📋 Results:');
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.product_name || 'Unknown'}`);
      console.log(`      GTIN: ${r.product_gtin}`);
      console.log(`      Stage: ${r.processing_stage}`);
      console.log(`      Match Status: ${r.match_status || 'N/A'}`);
      console.log(`      Rank: ${r.result_rank}`);
    });
  } else {
    console.log('⚠️  NO RESULTS FOUND IN DATABASE');
    console.log('   This means the batch processing did not save FoodGraph results.');
    console.log('   Possible reasons:');
    console.log('   1. Batch processing failed silently');
    console.log('   2. Results were deleted after processing');
    console.log('   3. UPSERT failed due to unique constraint violation');
  }

  // 3. Check if image belongs to a project
  console.log('\n3️⃣ Checking image and project...');
  const { data: image, error: imageError } = await supabase
    .from('branghunt_images')
    .select('id, project_id, user_id, file_name')
    .eq('id', detection.image_id)
    .single();

  if (imageError) {
    console.error('❌ Error fetching image:', imageError);
    return;
  }

  console.log('✅ Image found:');
  console.log('   - file_name:', image.file_name);
  console.log('   - user_id:', image.user_id);
  console.log('   - project_id:', image.project_id);

  console.log('\n✅ Debug complete\n');
}

debugFoodGraphResults().catch(console.error);

