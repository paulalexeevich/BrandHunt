// Default prompts for Gemini API
// Separated into its own file to allow safe imports from client components

export const DEFAULT_EXTRACT_INFO_PROMPT = `
Analyze this product image and extract information with confidence scores.

FIRST, determine: Is this actually a product? (vs shelf fixture, price tag, empty space, or non-product item)

If it IS a product, extract the following information:
1. Brand name (manufacturer/brand, e.g., "Tru Fru", "Reese's", "bettergoods")
2. Product name (full product name as written on package, e.g., "Frozen Fruit Strawberries", "Peanut Butter Cups")
3. Category (e.g., "Frozen Food", "Dairy", "Snacks", "Candy", "Beverage")
4. Flavor/Variant (e.g., "Strawberry", "Raspberry", "Chocolate", "Original")
5. Size/Weight (e.g., "8 oz", "16 oz", "2 lbs", "500g")

For EACH extracted field, provide a confidence score from 0.0 to 1.0:
- 1.0 = Completely certain, text is clearly visible and readable
- 0.8 = Very confident, minor uncertainty
- 0.6 = Moderately confident, some guessing involved
- 0.4 = Low confidence, mostly guessing
- 0.2 = Very uncertain
- 0.0 = Unknown/not visible

Return a JSON object with this EXACT structure:
{
  "isProduct": true or false,
  "extractionNotes": "Brief note explaining classification or any issues (e.g., 'Not a product - price tag only', 'Product partially visible', 'All details clearly readable')",
  "brand": "brand name or Unknown",
  "brandConfidence": 0.0 to 1.0,
  "productName": "full product name or Unknown",
  "productNameConfidence": 0.0 to 1.0,
  "category": "category name or Unknown",
  "categoryConfidence": 0.0 to 1.0,
  "flavor": "flavor or variant or Unknown",
  "flavorConfidence": 0.0 to 1.0,
  "size": "size or weight or Unknown",
  "sizeConfidence": 0.0 to 1.0
}

Important Guidelines:
- If isProduct = false, set all confidence scores to 0.0 and all fields to "Unknown"
- Be honest about confidence - lower scores for partially visible or unclear text
- Focus on what you CAN see clearly rather than guessing
- Use Unknown for any field you cannot determine with reasonable confidence

Only return the JSON object, nothing else.
`;

export const DEFAULT_AI_FILTER_PROMPT = `
Compare these two product images and determine their match status.

Consider these factors:
1. Brand name and logo
2. Product name and type
3. Packaging design and colors
4. Flavor/variant information
5. Size information
6. Overall visual appearance

Return a JSON object with this structure:
{
  "matchStatus": "identical" or "almost_same" or "not_match",
  "confidence": 0.0 to 1.0,
  "visualSimilarity": 0.0 to 1.0,
  "reason": "Brief explanation of the match status"
}

CRITICAL DEFINITIONS:

matchStatus - THREE possible values:

1. "identical" - Both products are EXACTLY the same:
   - Same brand, same product name
   - Same flavor/variant
   - Same size/quantity
   - Same packaging design
   - All details match perfectly
   
2. "almost_same" - Same EXACT product with minor packaging variations:
   - MUST match: brand, product name, flavor/variant, package type
   - Very close or same size (within similar range, even if unclear/blurry)
   - Almost identical visual design
   - Same meaning in claims/benefits (wording may differ)
   - Only differences: packaging refresh, claim text updates, regional variations
   - Example: Same product with "Doctor Recommended" vs "Spray Protection" claim
   
3. "not_match" - Different products:
   - Different flavor/variant (e.g., "Complete Clean" vs "Light & Fresh") = NOT_MATCH
   - Significantly different size (e.g., 3.8oz vs 10oz) = NOT_MATCH
   - Different product types/lines = NOT_MATCH
   - Different brands = NOT_MATCH

confidence: How certain you are about the matchStatus decision (0.0 = uncertain, 1.0 = very certain)

visualSimilarity: How similar the images LOOK overall (0.0 = completely different, 1.0 = nearly identical)
  * Identical products = 0.9-1.0
  * Almost same (packaging updates) = 0.7-0.9
  * Same brand, different variant = 0.3-0.6
  * Different brands = 0.0-0.3

Examples:
- Exact same: {matchStatus: "identical", confidence: 0.95, visualSimilarity: 0.95, reason: "Same brand, product, size, and flavor"}
- Packaging refresh: {matchStatus: "almost_same", confidence: 0.9, visualSimilarity: 0.85, reason: "Same Secret Complete Clean 3.8oz, minor claim text difference"}
- Different variant: {matchStatus: "not_match", confidence: 0.95, visualSimilarity: 0.7, reason: "Same brand/size but different scent: Fresh vs Powder"}
- Different size: {matchStatus: "not_match", confidence: 0.95, visualSimilarity: 0.75, reason: "Same Tide detergent flavor, but 50oz vs 100oz"}
- Different brands: {matchStatus: "not_match", confidence: 1.0, visualSimilarity: 0.2, reason: "Different brands entirely"}
`;

