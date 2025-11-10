-- Add match_status column to branghunt_foodgraph_results table
-- This supports three-tier matching: identical, almost_same, not_match

-- Create ENUM type for match status
CREATE TYPE match_status_enum AS ENUM ('identical', 'almost_same', 'not_match');

-- Add match_status column to branghunt_foodgraph_results
ALTER TABLE branghunt_foodgraph_results
ADD COLUMN IF NOT EXISTS match_status match_status_enum;

-- Add index for efficient filtering by match_status
CREATE INDEX IF NOT EXISTS idx_foodgraph_results_match_status 
ON branghunt_foodgraph_results(match_status);

-- Add comment explaining the column
COMMENT ON COLUMN branghunt_foodgraph_results.match_status IS 
'Three-tier AI match status: identical (exact match), almost_same (close variant), not_match (different product)';

-- Update existing rows: if is_match is true, set to identical; otherwise not_match
-- This provides backward compatibility with existing data
UPDATE branghunt_foodgraph_results
SET match_status = CASE 
  WHEN is_match = true THEN 'identical'::match_status_enum
  WHEN is_match = false THEN 'not_match'::match_status_enum
  ELSE 'not_match'::match_status_enum
END
WHERE match_status IS NULL;

