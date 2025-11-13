/**
 * Test Visual Match Gemini API Output
 * 
 * This script tests the visual matching function to see what Gemini actually returns
 * for candidateScores and visual similarity percentages.
 * 
 * Usage: node test-visual-match-output.js <detectionId>
 */

const detectionId = process.argv[2];

if (!detectionId) {
  console.error('❌ Usage: node test-visual-match-output.js <detectionId>');
  console.error('   Example: node test-visual-match-output.js c6e68dbd-e2ca-4642-9e75-18e05c1bdc86');
  process.exit(1);
}

async function testVisualMatch() {
  console.log('🧪 Testing Visual Match Output');
  console.log('================================\n');
  console.log(`📌 Detection ID: ${detectionId}\n`);

  try {
    // Call the visual match API endpoint manually
    const response = await fetch(`http://localhost:3000/api/visual-match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // You'll need to add your auth cookie here if needed
      },
      body: JSON.stringify({
        detectionId: detectionId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ API Error:', error);
      process.exit(1);
    }

    const result = await response.json();

    console.log('📊 GEMINI OUTPUT ANALYSIS');
    console.log('=========================\n');

    console.log('1️⃣  SELECTED MATCH:');
    console.log(`   Candidate Index: ${result.selectedCandidateIndex || 'null'}`);
    console.log(`   Selected GTIN: ${result.selectedGtin || 'null'}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Visual Similarity Score: ${(result.visualSimilarityScore * 100).toFixed(1)}%`);
    console.log(`   Brand Match: ${result.brandMatch ? '✅' : '❌'}`);
    console.log(`   Size Match: ${result.sizeMatch ? '✅' : '❌'}`);
    console.log(`   Flavor Match: ${result.flavorMatch ? '✅' : '❌'}`);
    console.log(`\n   Reasoning: "${result.reasoning}"\n`);

    console.log('2️⃣  ALL CANDIDATE SCORES:');
    console.log(`   Total candidates evaluated: ${result.candidateScores?.length || 0}\n`);

    if (result.candidateScores && result.candidateScores.length > 0) {
      result.candidateScores.forEach((score, idx) => {
        const isSelected = score.candidateGtin === result.selectedGtin;
        const icon = score.passedThreshold ? '✅' : '❌';
        const selectedIcon = isSelected ? '⭐ SELECTED' : '';
        
        console.log(`   ${icon} Candidate ${score.candidateIndex}: ${(score.visualSimilarity * 100).toFixed(1)}% ${selectedIcon}`);
        console.log(`      - Candidate ID: ${score.candidateId}`);
        console.log(`      - GTIN: ${score.candidateGtin}`);
        console.log(`      - Passed Threshold (≥0.7): ${score.passedThreshold ? 'YES' : 'NO'}`);
        console.log('');
      });

      // Summary
      const passedCount = result.candidateScores.filter(s => s.passedThreshold).length;
      const zeroScores = result.candidateScores.filter(s => s.visualSimilarity === 0).length;
      
      console.log('3️⃣  SUMMARY:');
      console.log(`   ✅ Passed threshold (≥70%): ${passedCount}/${result.candidateScores.length}`);
      console.log(`   ⚠️  Zero scores (0.0%): ${zeroScores}/${result.candidateScores.length}`);
      
      if (zeroScores > 0) {
        console.log('\n   ⚠️  WARNING: Found candidates with 0.0% similarity!');
        console.log('   This might indicate an error in Gemini\'s response or score calculation.');
      }

      // Check if selected match has proper score
      const selectedScore = result.candidateScores.find(s => s.candidateGtin === result.selectedGtin);
      if (selectedScore && selectedScore.visualSimilarity === 0) {
        console.log('\n   🐛 BUG DETECTED: Selected match has 0.0% visual similarity!');
        console.log('   Expected: High similarity score (85-99%) for selected match');
        console.log('   Actual: 0.0%');
      }
    }

    console.log('\n4️⃣  WHAT GETS SAVED TO DATABASE:');
    const toSave = result.candidateScores?.filter(s => s.passedThreshold || s.candidateGtin === result.selectedGtin) || [];
    console.log(`   Will save ${toSave.length} results:\n`);
    
    toSave.forEach(score => {
      const isSelected = score.candidateGtin === result.selectedGtin;
      const matchStatus = isSelected ? 'IDENTICAL' : 'ALMOST_SAME';
      console.log(`   - ${matchStatus}: GTIN ${score.candidateGtin} → ${(score.visualSimilarity * 100).toFixed(1)}%`);
    });

    if (toSave.length === 0) {
      console.log('   ⚠️  Nothing will be saved (no candidates passed threshold)');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testVisualMatch();

