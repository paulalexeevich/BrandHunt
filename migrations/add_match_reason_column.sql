-- Add match_reason column to branghunt_foodgraph_results table
-- This stores the AI's explanation for why products match or don't match
-- Example: "Brand, packaging, and variant all match perfectly" or "Different brand entirely"

ALTER TABLE branghunt_foodgraph_results 
ADD COLUMN IF NOT EXISTS match_reason TEXT DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN branghunt_foodgraph_results.match_reason IS 
'AI-generated reasoning explaining why the product was classified as identical, almost_same, or not_match. Provides transparency for AI decisions.';

-- Create an index for faster queries when filtering by products that have reasoning
CREATE INDEX IF NOT EXISTS idx_foodgraph_results_match_reason 
ON branghunt_foodgraph_results(detection_id) 
WHERE match_reason IS NOT NULL;

