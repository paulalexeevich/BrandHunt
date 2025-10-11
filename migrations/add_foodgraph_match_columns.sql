-- Add match status columns to branghunt_foodgraph_results table
-- These columns track which FoodGraph results match the actual product image after AI filtering

ALTER TABLE branghunt_foodgraph_results
ADD COLUMN IF NOT EXISTS is_match BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2) DEFAULT NULL;

-- Create index for filtering matched results
CREATE INDEX IF NOT EXISTS idx_foodgraph_results_is_match 
ON branghunt_foodgraph_results(is_match)
WHERE is_match = TRUE;

-- Add comments
COMMENT ON COLUMN branghunt_foodgraph_results.is_match IS 'Whether this FoodGraph result matches the actual product image (set by AI filtering)';
COMMENT ON COLUMN branghunt_foodgraph_results.match_confidence IS 'Confidence score for the match (0.0 to 1.0)';

