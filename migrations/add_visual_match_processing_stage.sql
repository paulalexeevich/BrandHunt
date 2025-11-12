-- Migration: Add 'visual_match' to processing_stage constraint
-- Date: 2025-11-12
-- Purpose: Allow Pipeline 2 (Visual-Only) to store results with processing_stage='visual_match'

-- Step 1: Drop the existing constraint
ALTER TABLE branghunt_foodgraph_results 
DROP CONSTRAINT IF EXISTS branghunt_foodgraph_results_processing_stage_check;

-- Step 2: Add the new constraint with 'visual_match' included
ALTER TABLE branghunt_foodgraph_results 
ADD CONSTRAINT branghunt_foodgraph_results_processing_stage_check 
CHECK (processing_stage IN ('search', 'pre_filter', 'ai_filter', 'visual_match'));

-- Verify the constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'branghunt_foodgraph_results_processing_stage_check';

