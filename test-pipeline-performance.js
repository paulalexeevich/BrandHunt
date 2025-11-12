/**
 * Performance Analysis Tool for Pipeline 2 (Visual-Only)
 * Tests: Search → Pre-filter → Visual Match → Save
 * 
 * Usage: node test-pipeline-performance.js <imageId> <detectionIndex>
 * Example: node test-pipeline-performance.js abc123 1
 */

const imageId = process.argv[2];
const detectionIndexFilter = process.argv[3] ? parseInt(process.argv[3]) : null;

if (!imageId) {
  console.error('❌ Usage: node test-pipeline-performance.js <imageId> [detectionIndex]');
  console.error('Example: node test-pipeline-performance.js abc123 1');
  process.exit(1);
}

console.log('🔬 PIPELINE 2 PERFORMANCE ANALYSIS');
console.log('='.repeat(80));
console.log(`📸 Image ID: ${imageId}`);
if (detectionIndexFilter) {
  console.log(`🎯 Testing single product: #${detectionIndexFilter}`);
} else {
  console.log(`🎯 Testing first product found`);
}
console.log('='.repeat(80));
console.log();

// Track timings for each step
const timings = {
  search: { start: 0, end: 0, duration: 0 },
  prefilter: { start: 0, end: 0, duration: 0 },
  visualMatch: { 
    crop: { start: 0, end: 0, duration: 0 },
    gemini: { start: 0, end: 0, duration: 0 },
    total: { start: 0, end: 0, duration: 0 }
  },
  save: { start: 0, end: 0, duration: 0 },
  total: { start: 0, end: 0, duration: 0 }
};

// SSE event parser
function parseSSEEvent(line) {
  if (line.startsWith('data: ')) {
    try {
      return JSON.parse(line.substring(6));
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function runPerformanceTest() {
  try {
    const startTime = Date.now();
    timings.total.start = startTime;

    const response = await fetch(`http://localhost:3000/api/batch-search-visual-timed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        imageId,
        detectionIndexFilter,
        concurrency: 1 // Process only 1 product for accurate timing
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let detectedProduct = null;
    let results = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const event = parseSSEEvent(line);
        if (event) {
          // Handle timing events
          if (event.timing) {
            const { stage, type, timestamp, data } = event.timing;
            
            if (type === 'start') {
              if (stage === 'search') {
                timings.search.start = timestamp;
              } else if (stage === 'prefilter') {
                timings.prefilter.start = timestamp;
              } else if (stage === 'visual_match') {
                timings.visualMatch.total.start = timestamp;
              } else if (stage === 'crop') {
                timings.visualMatch.crop.start = timestamp;
              } else if (stage === 'gemini') {
                timings.visualMatch.gemini.start = timestamp;
              } else if (stage === 'save') {
                timings.save.start = timestamp;
              }
            } else if (type === 'end') {
              if (stage === 'search') {
                timings.search.end = timestamp;
                timings.search.duration = timestamp - timings.search.start;
                console.log(`✅ SEARCH: ${timings.search.duration}ms (Found ${data?.resultCount || 0} results)`);
              } else if (stage === 'prefilter') {
                timings.prefilter.end = timestamp;
                timings.prefilter.duration = timestamp - timings.prefilter.start;
                console.log(`✅ PRE-FILTER: ${timings.prefilter.duration}ms (Filtered to ${data?.resultCount || 0} results)`);
              } else if (stage === 'crop') {
                timings.visualMatch.crop.end = timestamp;
                timings.visualMatch.crop.duration = timestamp - timings.visualMatch.crop.start;
                console.log(`✅ CROP IMAGE: ${timings.visualMatch.crop.duration}ms (${data?.width}x${data?.height}px)`);
              } else if (stage === 'gemini') {
                timings.visualMatch.gemini.end = timestamp;
                timings.visualMatch.gemini.duration = timestamp - timings.visualMatch.gemini.start;
                console.log(`✅ GEMINI VISUAL MATCH: ${timings.visualMatch.gemini.duration}ms (Confidence: ${data?.confidence}%)`);
              } else if (stage === 'visual_match') {
                timings.visualMatch.total.end = timestamp;
                timings.visualMatch.total.duration = timestamp - timings.visualMatch.total.start;
                console.log(`✅ VISUAL MATCH TOTAL: ${timings.visualMatch.total.duration}ms`);
              } else if (stage === 'save') {
                timings.save.end = timestamp;
                timings.save.duration = timestamp - timings.save.start;
                console.log(`✅ SAVE: ${timings.save.duration}ms`);
              }
            }
          }

          // Track product info
          if (event.stage === 'searching' && event.currentProduct) {
            detectedProduct = event.currentProduct;
            console.log(`\n🔍 Testing Product: ${detectedProduct}`);
            console.log('-'.repeat(80));
          }

          // Track completion
          if (event.type === 'complete') {
            results = event;
          }
        }
      }
    }

    timings.total.end = Date.now();
    timings.total.duration = timings.total.end - timings.total.start;

    // Display results
    console.log('\n');
    console.log('='.repeat(80));
    console.log('📊 PERFORMANCE BREAKDOWN');
    console.log('='.repeat(80));
    console.log();
    
    const steps = [
      { 
        name: '1️⃣  SEARCH (FoodGraph API)', 
        duration: timings.search.duration,
        percentage: (timings.search.duration / timings.total.duration * 100).toFixed(1)
      },
      { 
        name: '2️⃣  PRE-FILTER (Local algorithm)', 
        duration: timings.prefilter.duration,
        percentage: (timings.prefilter.duration / timings.total.duration * 100).toFixed(1)
      },
      { 
        name: '3️⃣  VISUAL MATCH', 
        duration: timings.visualMatch.total.duration,
        percentage: (timings.visualMatch.total.duration / timings.total.duration * 100).toFixed(1),
        substeps: [
          { 
            name: '   ├─ Crop Image', 
            duration: timings.visualMatch.crop.duration,
            percentage: (timings.visualMatch.crop.duration / timings.total.duration * 100).toFixed(1)
          },
          { 
            name: '   └─ Gemini API Call', 
            duration: timings.visualMatch.gemini.duration,
            percentage: (timings.visualMatch.gemini.duration / timings.total.duration * 100).toFixed(1)
          }
        ]
      },
      { 
        name: '4️⃣  SAVE (Database operations)', 
        duration: timings.save.duration,
        percentage: (timings.save.duration / timings.total.duration * 100).toFixed(1)
      }
    ];

    steps.forEach(step => {
      const bar = '█'.repeat(Math.round(step.percentage / 2));
      console.log(`${step.name}`);
      console.log(`   ${step.duration}ms (${step.percentage}%) ${bar}`);
      
      if (step.substeps) {
        step.substeps.forEach(substep => {
          const subbar = '▓'.repeat(Math.round(substep.percentage / 2));
          console.log(`${substep.name}`);
          console.log(`   ${substep.duration}ms (${substep.percentage}%) ${subbar}`);
        });
      }
      console.log();
    });

    console.log('-'.repeat(80));
    console.log(`⏱️  TOTAL TIME: ${timings.total.duration}ms (${(timings.total.duration / 1000).toFixed(2)}s)`);
    console.log('='.repeat(80));

    // Show results
    if (results) {
      console.log();
      console.log('📈 RESULTS');
      console.log('='.repeat(80));
      console.log(`✅ Success: ${results.success || 0}`);
      console.log(`⏸️  No Match: ${results.noMatch || 0}`);
      console.log(`❌ Errors: ${results.errors || 0}`);
      console.log('='.repeat(80));
    }

    // Identify bottleneck
    console.log();
    console.log('🎯 BOTTLENECK ANALYSIS');
    console.log('='.repeat(80));
    
    const sortedSteps = [
      { name: 'Search (FoodGraph API)', duration: timings.search.duration },
      { name: 'Pre-filter (Local)', duration: timings.prefilter.duration },
      { name: 'Visual Match - Crop', duration: timings.visualMatch.crop.duration },
      { name: 'Visual Match - Gemini', duration: timings.visualMatch.gemini.duration },
      { name: 'Save (Database)', duration: timings.save.duration }
    ].sort((a, b) => b.duration - a.duration);

    sortedSteps.forEach((step, index) => {
      const emoji = index === 0 ? '🔴' : index === 1 ? '🟡' : '🟢';
      console.log(`${emoji} ${index + 1}. ${step.name}: ${step.duration}ms`);
    });

    console.log('='.repeat(80));
    console.log(`🔴 BIGGEST BOTTLENECK: ${sortedSteps[0].name} (${sortedSteps[0].duration}ms)`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

runPerformanceTest();

