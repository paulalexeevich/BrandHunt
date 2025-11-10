-- Verification script for FoodGraph unique constraint
-- This checks if duplicates exist and verifies the constraint is applied

-- 1. Check for duplicate GTINs at the same processing stage
SELECT 
  detection_id,
  product_gtin,
  processing_stage,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as duplicate_ids
FROM branghunt_foodgraph_results
WHERE product_gtin IS NOT NULL
GROUP BY detection_id, product_gtin, processing_stage
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2. Check if the unique index exists
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname = 'idx_unique_detection_gtin_stage';

-- 3. Show sample of processing_stage values to verify they're being set
SELECT 
  processing_stage,
  COUNT(*) as count
FROM branghunt_foodgraph_results
GROUP BY processing_stage
ORDER BY count DESC;

