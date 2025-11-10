-- Migration: Add processing_stage column to track FoodGraph result stages
-- Description: Enables saving results at multiple stages (search, pre-filter, AI filter)
-- Date: 2025-11-10

-- Add processing_stage column to track which stage each result came from
ALTER TABLE branghunt_foodgraph_results 
ADD COLUMN IF NOT EXISTS processing_stage TEXT DEFAULT 'ai_filter' 
CHECK (processing_stage IN ('search', 'pre_filter', 'ai_filter'));

-- Add index for efficient filtering by stage
CREATE INDEX IF NOT EXISTS idx_foodgraph_results_stage 
ON branghunt_foodgraph_results(detection_id, processing_stage);

-- Add comment
COMMENT ON COLUMN branghunt_foodgraph_results.processing_stage IS 
'Stage at which this result was saved: search (raw FoodGraph results), pre_filter (passed text similarity), ai_filter (passed AI comparison)';

-- Backfill existing data - assume all existing results are from ai_filter stage
UPDATE branghunt_foodgraph_results 
SET processing_stage = 'ai_filter' 
WHERE processing_stage IS NULL;

-- Verification
SELECT 
  processing_stage,
  COUNT(*) as result_count,
  COUNT(DISTINCT detection_id) as detection_count
FROM branghunt_foodgraph_results
GROUP BY processing_stage
ORDER BY processing_stage;

