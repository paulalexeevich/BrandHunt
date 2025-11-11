-- Migration: Fix FoodGraph duplicates by using UPSERT pattern
-- Description: Change to single row per GTIN that updates as it progresses through stages
-- Date: 2025-11-11
-- 
-- Problem: Same GTIN appears 3 times (search, pre_filter, ai_filter stages)
-- causing duplicates in UI when displaying results
-- 
-- Solution: 
-- 1. Keep only the LATEST stage for each GTIN (ai_filter > pre_filter > search)
-- 2. Change unique constraint to (detection_id, product_gtin) only
-- 3. APIs will use UPSERT to update existing rows instead of inserting new ones
--
-- This is optimal for batch processing where all stages run automatically

-- Step 1: Remove duplicates, keeping only the LATEST stage per GTIN
-- Stage priority: ai_filter (3) > pre_filter (2) > search (1)
WITH ranked_results AS (
  SELECT 
    id,
    detection_id,
    product_gtin,
    processing_stage,
    CASE processing_stage
      WHEN 'ai_filter' THEN 3
      WHEN 'pre_filter' THEN 2
      WHEN 'search' THEN 1
      ELSE 0
    END as stage_priority,
    ROW_NUMBER() OVER (
      PARTITION BY detection_id, product_gtin 
      ORDER BY 
        CASE processing_stage
          WHEN 'ai_filter' THEN 3
          WHEN 'pre_filter' THEN 2
          WHEN 'search' THEN 1
          ELSE 0
        END DESC,
        id DESC  -- If same stage, keep newest
    ) as rn
  FROM branghunt_foodgraph_results
  WHERE product_gtin IS NOT NULL
)
DELETE FROM branghunt_foodgraph_results
WHERE id IN (
  SELECT id FROM ranked_results WHERE rn > 1
);

-- Step 2: Drop the old unique constraint that included processing_stage
DROP INDEX IF EXISTS idx_unique_detection_gtin_stage;

-- Step 3: Create new unique constraint WITHOUT processing_stage
-- This enforces: one row per GTIN per detection
CREATE UNIQUE INDEX idx_unique_detection_gtin
ON branghunt_foodgraph_results (detection_id, product_gtin)
WHERE product_gtin IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_unique_detection_gtin IS 
'Ensures one row per GTIN per detection. The processing_stage column tracks the latest stage reached. Use ON CONFLICT UPDATE to progress through stages.';

-- Verification Query 1: Check for duplicates (should return 0 rows)
SELECT 
  detection_id,
  product_gtin,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(processing_stage) as stages,
  ARRAY_AGG(id) as ids
FROM branghunt_foodgraph_results
WHERE product_gtin IS NOT NULL
GROUP BY detection_id, product_gtin
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Verification Query 2: Count by stage (see distribution)
SELECT 
  processing_stage,
  COUNT(*) as result_count
FROM branghunt_foodgraph_results
GROUP BY processing_stage
ORDER BY 
  CASE processing_stage
    WHEN 'search' THEN 1
    WHEN 'pre_filter' THEN 2
    WHEN 'ai_filter' THEN 3
    ELSE 4
  END;

-- Verification Query 3: Total unique GTINs per detection
SELECT 
  detection_id,
  COUNT(DISTINCT product_gtin) as unique_gtins,
  COUNT(*) as total_rows
FROM branghunt_foodgraph_results
WHERE product_gtin IS NOT NULL
GROUP BY detection_id
HAVING COUNT(*) != COUNT(DISTINCT product_gtin)  -- Should return 0 rows
ORDER BY detection_id;

