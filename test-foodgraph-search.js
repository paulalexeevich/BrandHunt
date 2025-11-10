/**
 * Test script to search FoodGraph for a specific product
 * Run with: node test-foodgraph-search.js
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function testFoodGraphSearch() {
  console.log('🔍 Testing FoodGraph Search\n');
  console.log('Search Query: "Dove Men+Care 24H Extra Fresh Extra Fresh"\n');
  console.log('='.repeat(80) + '\n');

  // Import the searchProducts function
  const { searchProducts, getFrontImageUrl } = require('./lib/foodgraph.ts');
  
  try {
    // Search for the product
    const result = await searchProducts('Dove Men+Care 24H Extra Fresh Extra Fresh');
    
    const products = result.products;
    const searchTerm = result.searchTerm;
    
    console.log(`Search Term Used: "${searchTerm}"`);
    console.log(`Total Results Found: ${products.length}\n`);
    console.log('='.repeat(80) + '\n');
    
    if (products.length === 0) {
      console.log('❌ No results found');
      return;
    }
    
    // Show TOP 1 result
    const top1 = products[0];
    
    console.log('🏆 TOP 1 RESULT:\n');
    console.log('Title:', top1.title);
    console.log('Brand:', top1.companyBrand || 'N/A');
    console.log('Manufacturer:', top1.companyManufacturer || 'N/A');
    console.log('Category:', top1.category ? top1.category.join(' > ') : 'N/A');
    console.log('Size/Measures:', top1.measures || 'N/A');
    console.log('Key (GTIN):', top1.key);
    console.log('Score:', top1._score || 'N/A');
    
    // Get front image URL
    const imageUrl = getFrontImageUrl(top1);
    console.log('Front Image URL:', imageUrl || 'No image available');
    
    // Show additional keys (GTINs, ASINs, etc.)
    if (top1.keys) {
      console.log('\nAdditional Keys:');
      Object.entries(top1.keys).forEach(([key, value]) => {
        if (value) console.log(`  ${key}: ${value}`);
      });
    }
    
    // Show ingredients if available
    if (top1.ingredients) {
      console.log('\nIngredients:', top1.ingredients.substring(0, 200) + '...');
    }
    
    // Show source URLs if available
    if (top1.sourcePdpUrls && top1.sourcePdpUrls.length > 0) {
      console.log('\nSource URLs:');
      top1.sourcePdpUrls.slice(0, 3).forEach(url => console.log(`  - ${url}`));
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 FULL JSON DATA:\n');
    console.log(JSON.stringify(top1, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

// Run the test
testFoodGraphSearch();


