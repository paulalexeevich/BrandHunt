/**
 * Test Gemini API extraction directly
 * Run with: GOOGLE_GEMINI_API_KEY=your_key node test-gemini-extraction.js
 * Or: export GOOGLE_GEMINI_API_KEY=your_key && node test-gemini-extraction.js
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGeminiExtraction() {
  console.log('🧪 Testing Gemini API extraction...\n');
  
  // Check API key
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    console.error('❌ GOOGLE_GEMINI_API_KEY not found in environment');
    console.error('   Check .env.local file');
    process.exit(1);
  }
  
  console.log('✅ API key found:', process.env.GOOGLE_GEMINI_API_KEY.substring(0, 20) + '...');
  
  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    }
  });
  
  // Simple test prompt
  const prompt = `
Return a JSON object with test data:
{
  "brand": "Test Brand",
  "brandConfidence": 1.0,
  "productName": "Test Product",
  "productNameConfidence": 1.0,
  "category": "Test Category",
  "categoryConfidence": 1.0,
  "flavor": "Test Flavor",
  "flavorConfidence": 1.0,
  "size": "100g",
  "sizeConfidence": 1.0,
  "description": "Test Description",
  "descriptionConfidence": 1.0,
  "sku": "TEST123",
  "skuConfidence": 1.0,
  "isProduct": true,
  "detailsVisible": true,
  "extractionNotes": "Test extraction"
}

Only return the JSON, nothing else.
`;

  console.log('\n📋 Sending test request to Gemini...');
  
  try {
    const startTime = Date.now();
    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();
    const duration = Date.now() - startTime;
    
    console.log(`✅ Gemini responded in ${duration}ms`);
    console.log('\n📄 Raw response:');
    console.log(text.substring(0, 200) + (text.length > 200 ? '...' : ''));
    
    // Try to parse
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.substring(7);
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.substring(3);
    }
    if (cleanedText.endsWith('```')) {
      cleanedText = cleanedText.substring(0, cleanedText.length - 3);
    }
    cleanedText = cleanedText.trim();
    
    const parsed = JSON.parse(cleanedText);
    console.log('\n✅ Successfully parsed JSON');
    console.log('   Brand:', parsed.brand);
    console.log('   Product:', parsed.productName);
    console.log('   Category:', parsed.category);
    
    console.log('\n✅ Gemini API is working correctly! ');
    console.log('   The issue must be elsewhere in the batch extraction flow.');
    
  } catch (error) {
    console.error('\n❌ Gemini API test failed:');
    console.error('   Error:', error.message);
    
    if (error.message.includes('API_KEY_INVALID')) {
      console.error('\n💡 Your API key appears to be invalid');
      console.error('   Get a new key from: https://aistudio.google.com/app/apikey');
    } else if (error.message.includes('429') || error.message.includes('quota')) {
      console.error('\n💡 Rate limit or quota exceeded');
      console.error('   Check your Gemini API quota in Google Cloud Console');
    } else if (error.message.includes('SAFETY')) {
      console.error('\n💡 Safety filter triggered (unlikely for this test)');
    }
    
    process.exit(1);
  }
}

testGeminiExtraction().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

