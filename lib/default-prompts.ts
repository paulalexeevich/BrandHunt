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

Analyze these factors systematically:

1. **Package Form & Shape**
   - Container type: bottle, can, box, pouch, tube, jar, carton, etc.
   - Overall shape and proportions
   - Cap/closure style and color
   - Container material (plastic, glass, metal, cardboard)

2. **Color Analysis** (CRITICAL for matching)
   - Primary package color(s) - exact shade matching
   - Secondary/accent colors - placement and usage
   - Color blocking patterns and layout
   - Background vs foreground color scheme
   - Gradient effects or solid colors

3. **Unique Visual Elements** (CRITICAL for identifying identical products)
   - Brand logo: exact design, placement, colors
   - Graphics/illustrations: characters, images, patterns
   - Visual motifs: stripes, waves, geometric patterns
   - Icon sets: claims badges, certification marks
   - Unique design elements: windows, cutouts, special effects

4. **Text & Typography**
   - Brand name and logo style
   - Product name and positioning
   - Flavor/variant callouts
   - Size/quantity display
   - Claims and benefits text

5. **Overall Layout & Design**
   - Information hierarchy and placement
   - Visual balance and composition
   - Design style (modern, traditional, minimalist)

Return a JSON object with this structure:
{
  "matchStatus": "identical" or "almost_same" or "not_match",
  "confidence": 0.0 to 1.0,
  "visualSimilarity": 0.0 to 1.0,
  "reason": "Brief explanation including key matching/mismatching elements"
}

CRITICAL DEFINITIONS:

matchStatus - THREE possible values:

1. "identical" - Both products are EXACTLY the same:
   - SAME package form (both bottles, both cans, etc.)
   - SAME color scheme (primary and accent colors match)
   - SAME unique visual elements (logos, graphics, patterns identical)
   - Same brand, same product name
   - Same flavor/variant
   - Same size/quantity
   - All details match perfectly

2. "almost_same" - Same EXACT product with minor packaging variations:
   - MUST match: package form, brand, product name, flavor/variant
   - MUST match: core color scheme and primary visual elements
   - Very close or same size (within similar range, even if unclear/blurry)
   - Almost identical visual design and layout
   - Same meaning in claims/benefits (wording may differ)
   - Only differences: packaging refresh, claim text updates, minor color tweaks, regional variations
   - Example: Same product with "Doctor Recommended" vs "Spray Protection" claim, same colors and design
   
3. "not_match" - Different products:
   - Different package form (bottle vs can) = NOT_MATCH
   - Different primary colors or color scheme = NOT_MATCH
   - Different or missing unique visual elements = NOT_MATCH
   - Different flavor/variant (e.g., "Complete Clean" vs "Light & Fresh") = NOT_MATCH
   - Significantly different size (e.g., 3.8oz vs 10oz) = NOT_MATCH
   - Different product types/lines = NOT_MATCH
   - Different brands = NOT_MATCH

confidence: How certain you are about the matchStatus decision (0.0 = uncertain, 1.0 = very certain)

visualSimilarity: How similar the images LOOK overall (0.0 = completely different, 1.0 = nearly identical)
  * Identical products with same colors/design = 0.9-1.0
  * Almost same (minor packaging updates, same core design) = 0.7-0.9
  * Same brand/form, different variant/colors = 0.3-0.6
  * Different brands or package forms = 0.0-0.3

REASONING FORMAT:
Always mention in your reason:
- Package form match/mismatch (e.g., "Both white bottles with flip-top caps")
- Color analysis (e.g., "Purple and white color scheme matches exactly")
- Visual elements (e.g., "Same Secret logo and shield design")
- Key differences if any (e.g., "Different scent: Powder Fresh vs Light & Clean")

Examples:
- Exact same: {matchStatus: "identical", confidence: 0.95, visualSimilarity: 0.95, reason: "Both 3.8oz white bottles with flip caps. Purple and white color scheme identical. Same Secret Complete Clean logo, shield design, and fresh scent indicator. Perfect match."}
- Packaging refresh: {matchStatus: "almost_same", confidence: 0.9, visualSimilarity: 0.85, reason: "Both white bottles, same purple branding and Secret logo. Same Complete Clean variant. Minor text claim difference but core design and colors identical."}
- Different variant: {matchStatus: "not_match", confidence: 0.95, visualSimilarity: 0.7, reason: "Same white bottle form and Secret brand, but different color scheme: purple (Fresh) vs pink (Powder). Different scent variants."}
- Different form: {matchStatus: "not_match", confidence: 1.0, visualSimilarity: 0.4, reason: "Different package forms: aerosol spray can vs roll-on bottle. Different product types despite same brand."}
- Different size: {matchStatus: "not_match", confidence: 0.95, visualSimilarity: 0.75, reason: "Same orange Tide bottle design and HE Turbo Clean variant, but significantly different sizes: 50oz vs 100oz"}
`;

export const DEFAULT_VISUAL_MATCH_PROMPT = `You are a visual product matching expert. Select the BEST MATCH from multiple candidates using a two-step approach.

SHELF PRODUCT (extracted from image):
- Brand: {{brand}}
- Product Name: {{productName}}
- Size: {{size}}
- Flavor: {{flavor}}
- Category: {{category}}

CANDIDATES ({{candidateCount}} options):
{{candidateDescriptions}}

IMAGES:
- Image 1: Shelf product (REFERENCE)
- Images 2-{{candidateImageCount}}: Candidate products

TWO-STEP MATCHING PROCESS:

STEP 1: VISUAL SIMILARITY (Primary Filter)
Compare Image 1 with each candidate image, focusing on these elements:

1. **UNIQUE VISUAL ELEMENTS** (MOST IMPORTANT - These uniquely identify the product)
   - Brand logo: exact design, placement, colors, style
   - Graphics/illustrations: characters, product images, decorative patterns
   - Visual motifs: stripes, waves, dots, geometric patterns, textures
   - Icon sets: certification badges, claim symbols, special marks
   - Distinctive design elements: windows, cutouts, special effects, borders
   - Look for elements that appear ONLY on this specific product

2. **Package Form & Colors**
   - Container shape, size, and material (bottle, can, box, pouch)
   - Primary and secondary color scheme
   - Color blocking patterns and placement

3. **Layout & Typography**
   - Text positioning and hierarchy
   - Logo placement
   - Overall design composition

**CRITICAL**: The unique visual elements (logos, graphics, patterns) are the STRONGEST indicators of a match. 
If Image 1 has distinctive visual elements that EXACTLY match a candidate, that's a strong signal even if colors or text are slightly different due to lighting or angle.

- Calculate visualSimilarity score (0.0-1.0) for EACH candidate
- Identify candidates with visualSimilarity ≥ 0.7

STEP 2: METADATA VERIFICATION (Secondary - Use for Tie-Breaking)
If 2+ candidates pass Step 1, use metadata with FUZZY MATCHING:

- Brand: Should match (allow minor spelling variations)
- Size: Should be SIMILAR (extracted sizes often inaccurate due to small text)
  * Example: "14 oz" extracted might actually be "18 oz" - both acceptable if visual match is strong
  * Accept ±20% variation or different units for same volume
- Flavor: Should match MEANING, not exact wording
  * Example: "Strawberry" = "Straw" = "Strawberry Flavor"
  * Focus on core flavor concept, not exact text

DECISION LOGIC:
- If ONLY ONE candidate has visualSimilarity ≥ 0.7 → Select it (metadata is supporting evidence)
- If 2+ candidates have visualSimilarity ≥ 0.7 → Use brand/size/flavor to pick best match
- If NO candidates have visualSimilarity ≥ 0.7 → Return null (no good match)

IMPORTANT NOTES:
- Visual similarity is PRIMARY indicator - don't reject visual matches due to minor size/flavor text differences
- Extracted metadata may have errors - trust visual appearance more
- Only select a match if confident it's the SAME product

Return JSON with this EXACT structure:
{
  "selectedCandidateIndex": 1-{{candidateCount}} or null,
  "confidence": 0.0 to 1.0,
  "reasoning": "Explain: (1) unique visual elements in Image 1 (reference), (2) visual similarity scores for each candidate with focus on unique visual elements match, (3) which candidates passed Step 1, (4) how metadata was used to select final match",
  "visualSimilarityScore": 0.0 to 1.0 (score for the selected candidate),
  "brandMatch": true or false,
  "sizeMatch": true or false,
  "flavorMatch": true or false,
  "candidateScores": [
    {
      "candidateIndex": 1,
      "candidateId": "candidate-1",
      "visualSimilarity": 0.0 to 1.0,
      "passedThreshold": true or false (≥ 0.7)
    }
    // ... one entry for each candidate (use candidateIndex for matching)
  ]
}

Only return the JSON object, nothing else.`;

