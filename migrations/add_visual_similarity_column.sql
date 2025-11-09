-- Add visual_similarity column to branghunt_foodgraph_results table
-- Visual similarity is a separate metric from match confidence:
-- - match_confidence: How confident the AI is in its isMatch decision (0.0-1.0)
-- - visual_similarity: How similar the images LOOK regardless of whether they're the same product (0.0-1.0)
--
-- Example: Same brand, different variant (stick vs spray deodorant)
-- - isMatch: false (different products)
-- - match_confidence: 0.95 (very confident they're different)
-- - visual_similarity: 0.65 (packaging looks somewhat similar - same brand colors/design)

ALTER TABLE branghunt_foodgraph_results 
ADD COLUMN IF NOT EXISTS visual_similarity DECIMAL(3,2) DEFAULT NULL;

COMMENT ON COLUMN branghunt_foodgraph_results.visual_similarity IS 
'AI-generated visual similarity score (0.0-1.0) indicating how similar the images look, independent of whether they are the same product. 0.9-1.0 = nearly identical, 0.5-0.8 = same brand different variant, 0.3-0.5 = same brand different line, 0.0-0.3 = different brands';

-- Add index for querying by visual similarity
CREATE INDEX IF NOT EXISTS idx_foodgraph_results_visual_similarity 
ON branghunt_foodgraph_results(visual_similarity DESC) 
WHERE visual_similarity IS NOT NULL;

