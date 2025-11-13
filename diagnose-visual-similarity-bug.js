/**
 * Diagnose Visual Similarity 0.0% Bug
 * 
 * This script queries the database to find visual_match results with 0.0% similarity
 * and analyzes why they have zero scores.
 * 
 * Usage: node diagnose-visual-similarity-bug.js <imageId>
 */

const imageId = process.argv[2] || 'c6e68dbd-e2ca-4642-9e75-18e05c1bdc86';

const QUERY = `
SELECT 
  d.id as detection_id,
  d.detection_index,
  d.brand_name as extracted_brand,
  d.product_name as extracted_product,
  d.size as extracted_size,
  d.selected_foodgraph_gtin as saved_gtin,
  d.selection_method,
  d.fully_analyzed,
  fg.product_gtin,
  fg.product_name,
  fg.brand_name,
  fg.processing_stage,
  fg.match_status,
  fg.visual_similarity,
  fg.match_reason,
  fg.created_at
FROM branghunt_detections d
INNER JOIN branghunt_foodgraph_results fg ON fg.detection_id = d.id
WHERE d.image_id = '${imageId}'
  AND fg.processing_stage = 'visual_match'
  AND fg.visual_similarity IS NOT NULL
ORDER BY d.detection_index, fg.match_status DESC, fg.visual_similarity DESC;
`;

console.log('🔍 Diagnosing Visual Similarity Bug');
console.log('===================================\n');
console.log(`📌 Image ID: ${imageId}\n`);
console.log('📊 SQL Query:');
console.log(QUERY);
console.log('\n' + '='.repeat(80));
console.log('\n💡 INSTRUCTIONS:');
console.log('1. Go to Supabase Dashboard → SQL Editor');
console.log('2. Paste the query above');
console.log('3. Click "Run"');
console.log('4. Look for rows where:');
console.log('   - match_status = \'identical\' (the selected match)');
console.log('   - visual_similarity = 0.0 or NULL');
console.log('\n🐛 EXPECTED BUG PATTERN:');
console.log('   Selected match should have visual_similarity 85-99%');
console.log('   If it shows 0.0%, that\'s the bug!');
console.log('\n📋 Additional check - Count results:');
console.log(`
SELECT 
  processing_stage,
  match_status,
  COUNT(*) as count,
  AVG(visual_similarity) as avg_similarity,
  MIN(visual_similarity) as min_similarity,
  MAX(visual_similarity) as max_similarity
FROM branghunt_foodgraph_results
WHERE detection_id IN (
  SELECT id FROM branghunt_detections WHERE image_id = '${imageId}'
)
AND processing_stage = 'visual_match'
GROUP BY processing_stage, match_status
ORDER BY match_status DESC;
`);

console.log('\n🔧 If you find 0.0% scores, check server logs for:');
console.log('   - "❌ Visual matching selection error"');
console.log('   - "⚠️ No candidates passed threshold"');
console.log('   - "📊 Visual Similarity Scores" output');
console.log('\n' + '='.repeat(80));

