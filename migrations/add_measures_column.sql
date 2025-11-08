-- Add measures column to branghunt_foodgraph_results table
-- This stores the product size/measures from FoodGraph (e.g., "2.65 oz (75 g)", "34.5 oz, Jar")

ALTER TABLE branghunt_foodgraph_results
ADD COLUMN IF NOT EXISTS measures TEXT;

-- Add comment
COMMENT ON COLUMN branghunt_foodgraph_results.measures IS 'Product size/measures from FoodGraph (e.g., "2.65 oz (75 g)")';

-- Add index for filtering by measures
CREATE INDEX IF NOT EXISTS idx_foodgraph_results_measures 
ON branghunt_foodgraph_results(measures)
WHERE measures IS NOT NULL;

