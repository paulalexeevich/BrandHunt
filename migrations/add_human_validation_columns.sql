-- Migration: Add human validation columns to detections table
-- Purpose: Track human validation of FoodGraph matches (correct/incorrect)
-- Date: 2025-01-13

-- Add human_validation column (true = correct, false = incorrect, null = not validated)
ALTER TABLE detections 
ADD COLUMN IF NOT EXISTS human_validation BOOLEAN DEFAULT NULL;

-- Add timestamp for when validation was done
ALTER TABLE detections 
ADD COLUMN IF NOT EXISTS human_validation_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for querying validated/unvalidated matches
CREATE INDEX IF NOT EXISTS idx_detections_human_validation 
ON detections(human_validation) 
WHERE human_validation IS NOT NULL;

-- Create index for validation timestamp queries
CREATE INDEX IF NOT EXISTS idx_detections_human_validation_at 
ON detections(human_validation_at) 
WHERE human_validation_at IS NOT NULL;

COMMENT ON COLUMN detections.human_validation IS 'Human validation of FoodGraph match: true = correct, false = incorrect, null = not validated';
COMMENT ON COLUMN detections.human_validation_at IS 'Timestamp when human validation was performed';

