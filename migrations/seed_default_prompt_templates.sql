-- Seed default prompt templates for all existing projects
-- This adds default prompts for Extract Info and AI Filter steps

-- Function to get default Extract Info prompt
CREATE OR REPLACE FUNCTION get_default_extract_info_prompt()
RETURNS TEXT AS $$
BEGIN
  RETURN 'Analyze this image and extract product information.

FIRST, determine classification:
1. Is this actually a product? (vs shelf fixture, price tag, empty space, or non-product item)
2. Are product details clearly visible? (can you read brand, product name, or other text?)

THEN, extract the following information:
1. Brand name (manufacturer/brand, e.g., "Tru Fru", "Reese''s", "bettergoods")
2. Product name (full product name as written on package, e.g., "Frozen Fruit Strawberries", "Peanut Butter Cups")
3. Category (e.g., "Frozen Food", "Dairy", "Snacks", "Candy")
4. Flavor/Variant (e.g., "Strawberry", "Raspberry", "Chocolate", "Original")
5. Size/Weight (e.g., "8 oz", "16 oz", "2 lbs", "500g")
6. Description (brief product description from package, e.g., "Dark Chocolate Covered Strawberries")
7. SKU/Barcode (any product code, UPC, or barcode visible)

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
  "detailsVisible": true or false,
  "extractionNotes": "Brief note explaining classification or extraction issues (e.g., ''Not a product - price tag only'', ''Product too far/blurry'', ''Clear view of all details'')",
  "brand": "brand name or Unknown",
  "brandConfidence": 0.0 to 1.0,
  "productName": "full product name or Unknown",
  "productNameConfidence": 0.0 to 1.0,
  "category": "category name or Unknown",
  "categoryConfidence": 0.0 to 1.0,
  "flavor": "flavor or variant or Unknown",
  "flavorConfidence": 0.0 to 1.0,
  "size": "size or weight or Unknown",
  "sizeConfidence": 0.0 to 1.0,
  "description": "product description or Unknown",
  "descriptionConfidence": 0.0 to 1.0,
  "sku": "product code/barcode or Unknown",
  "skuConfidence": 0.0 to 1.0
}

Important Guidelines:
- If isProduct = false, set all confidence scores to 0.0 and all fields to "Unknown"
- If detailsVisible = false, you can still set isProduct = true, but confidence scores should be low (0.0-0.4)
- Use Unknown for any field you cannot determine
- Be honest about confidence - lower scores for partially visible or unclear text

Only return the JSON object, nothing else.';
END;
$$ LANGUAGE plpgsql;

-- Function to get default AI Filter prompt
CREATE OR REPLACE FUNCTION get_default_ai_filter_prompt()
RETURNS TEXT AS $$
BEGIN
  RETURN 'Compare these two product images and determine their match status.

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
- Different brands: {matchStatus: "not_match", confidence: 1.0, visualSimilarity: 0.2, reason: "Different brands entirely"}';
END;
$$ LANGUAGE plpgsql;

-- Insert default prompts for all existing projects
INSERT INTO branghunt_prompt_templates (project_id, step_name, prompt_template, version, is_active, created_by)
SELECT 
  p.id AS project_id,
  'extract_info' AS step_name,
  get_default_extract_info_prompt() AS prompt_template,
  1 AS version,
  true AS is_active,
  p.user_id AS created_by
FROM branghunt_projects p
WHERE NOT EXISTS (
  SELECT 1 FROM branghunt_prompt_templates pt 
  WHERE pt.project_id = p.id AND pt.step_name = 'extract_info'
);

INSERT INTO branghunt_prompt_templates (project_id, step_name, prompt_template, version, is_active, created_by)
SELECT 
  p.id AS project_id,
  'ai_filter' AS step_name,
  get_default_ai_filter_prompt() AS prompt_template,
  1 AS version,
  true AS is_active,
  p.user_id AS created_by
FROM branghunt_projects p
WHERE NOT EXISTS (
  SELECT 1 FROM branghunt_prompt_templates pt 
  WHERE pt.project_id = p.id AND pt.step_name = 'ai_filter'
);

-- Clean up temporary functions
DROP FUNCTION IF EXISTS get_default_extract_info_prompt();
DROP FUNCTION IF EXISTS get_default_ai_filter_prompt();

