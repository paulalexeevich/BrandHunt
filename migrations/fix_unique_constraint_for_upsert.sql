-- Fix unique constraint to work with UPSERT operations
-- Issue: Supabase's onConflict doesn't support partial indexes (WITH WHERE clause)
-- Solution: Recreate the unique index without the WHERE clause

-- Step 1: Drop the existing partial unique index
DROP INDEX IF EXISTS idx_unique_detection_gtin;

-- Step 2: Create a new unique constraint WITHOUT the WHERE clause
-- This allows UPSERT operations to work correctly
CREATE UNIQUE INDEX idx_unique_detection_gtin 
ON branghunt_foodgraph_results (detection_id, product_gtin);

-- Verification: Check that the new constraint exists
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'branghunt_foodgraph_results'
  AND indexname = 'idx_unique_detection_gtin';

