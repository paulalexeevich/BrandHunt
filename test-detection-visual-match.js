/**
 * Test Visual Match for Specific Detection
 * Tests detection #5 from the Secret deodorant shelf
 */

const DETECTION_ID = 'e752a3b5-545b-4d54-8e8b-78edc090262f';
const IMAGE_ID = 'c6e68dbd-e2ca-4642-9e75-18e05c1bdc86';

async function testVisualMatch() {
  console.log('🧪 Testing Visual Match for Detection #5 (Secret Clinical)');
  console.log('============================================================\n');
  console.log(`Detection ID: ${DETECTION_ID}`);
  console.log(`Image ID: ${IMAGE_ID}\n`);

  try {
    console.log('📞 Calling Visual-Only Pipeline API...\n');
    
    const response = await fetch('http://localhost:3000/api/batch-search-visual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add your auth cookie if needed
      },
      body: JSON.stringify({
        imageId: IMAGE_ID,
        concurrency: 1 // Process one at a time to see detailed logs
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ API Error:', error);
      process.exit(1);
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    console.log('📊 Processing stream...\n');
    console.log('🔍 WATCH THE SERVER CONSOLE for debug output like:');
    console.log('   - "🔍 DEBUG: Full visualMatchResult object"');
    console.log('   - "candidateScores (N):"');
    console.log('   - "🐛 DEBUG: Saving GTIN ... with visual_similarity = ..."');
    console.log('\n' + '='.repeat(80) + '\n');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          
          if (data.type === 'progress') {
            const det = data.detectionIndex;
            const stage = data.stage;
            const msg = data.message;
            console.log(`[#${det}] ${stage}: ${msg}`);
          } else if (data.type === 'complete') {
            console.log('\n✅ Complete!');
            console.log(`   Processed: ${data.processed} detections`);
            console.log(`   Success: ${data.success}`);
            console.log(`   No Match: ${data.noMatch}`);
            console.log(`   Errors: ${data.errors}`);
            
            if (data.results && data.results.length > 0) {
              console.log('\n📋 Results:');
              data.results.forEach(r => {
                console.log(`   [#${r.detectionIndex}] ${r.status}`);
                if (r.savedMatch) {
                  console.log(`      → ${r.savedMatch.brandName} - ${r.savedMatch.productName}`);
                  console.log(`      → GTIN: ${r.savedMatch.gtin}`);
                }
              });
            }
          }
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📝 NOW CHECK:');
    console.log('1. Server console logs for debug output');
    console.log('2. Run this SQL to see saved results:');
    console.log(`
SELECT 
  product_gtin,
  match_status,
  visual_similarity,
  SUBSTRING(match_reason, 1, 80) as reason_preview
FROM branghunt_foodgraph_results
WHERE detection_id = '${DETECTION_ID}'
  AND processing_stage = 'visual_match'
ORDER BY match_status DESC, visual_similarity DESC;
    `);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testVisualMatch();

