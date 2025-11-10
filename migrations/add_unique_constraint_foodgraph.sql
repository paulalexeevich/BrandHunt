-- Migration: Add unique constraint to prevent duplicate FoodGraph results
-- Description: Ensures same GTIN cannot be inserted twice for same detection and stage
-- Date: 2025-11-10
-- 
-- Problem: Same product with same GTIN appearing multiple times at the SAME processing stage
-- Solution: Add unique constraint on (detection_id, product_gtin, processing_stage)
-- 
-- Note: This allows same GTIN to exist across different stages (search, pre_filter, ai_filter)
-- which is intentional for audit trail, but prevents true duplicates within a stage.

-- First, remove any existing duplicates before adding constraint
-- Keep the first occurrence (lowest id) of each duplicate group
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY detection_id, product_gtin, processing_stage 
      ORDER BY id
    ) as rn
  FROM branghunt_foodgraph_results
  WHERE product_gtin IS NOT NULL
)
DELETE FROM branghunt_foodgraph_results
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
-- Only applies when product_gtin is not null (some results may not have GTINs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_detection_gtin_stage
ON branghunt_foodgraph_results (detection_id, product_gtin, processing_stage)
WHERE product_gtin IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_unique_detection_gtin_stage IS 
'Prevents duplicate entries of the same product (GTIN) at the same processing stage for a detection. Allows same GTIN across different stages (search, pre_filter, ai_filter) for audit trail.';

-- Verification: Check for any remaining duplicates
SELECT 
  detection_id,
  product_gtin,
  processing_stage,
  COUNT(*) as duplicate_count
FROM branghunt_foodgraph_results
WHERE product_gtin IS NOT NULL
GROUP BY detection_id, product_gtin, processing_stage
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

