-- Remove unused extraction fields
-- Date: 2025-11-11
-- Description: Remove description, sku, and details_visible fields that are no longer used
--              after prompt optimization. We now rely on field-specific confidence scores
--              rather than an overall visibility classification.

-- Step 1: Drop the constraint on details_visible
ALTER TABLE branghunt_detections
DROP CONSTRAINT IF EXISTS check_details_visible_values;

-- Step 2: Drop the details_visible column and its indexes
DROP INDEX IF EXISTS idx_detections_details_visible_clear;
DROP INDEX IF EXISTS idx_detections_details_visible_partial;

ALTER TABLE branghunt_detections
DROP COLUMN IF EXISTS details_visible;

-- Step 3: Drop description field and its confidence score
ALTER TABLE branghunt_detections
DROP COLUMN IF EXISTS description;

ALTER TABLE branghunt_detections
DROP COLUMN IF EXISTS description_confidence;

-- Step 4: Drop sku field and its confidence score
ALTER TABLE branghunt_detections
DROP COLUMN IF EXISTS sku;

ALTER TABLE branghunt_detections
DROP COLUMN IF EXISTS sku_confidence;

-- Add comment to document the change
COMMENT ON TABLE branghunt_detections IS 'Product detections with extraction info. Optimized to focus on core fields: brand, productName, category, flavor, size. Quality determined by field-specific confidence scores, not overall visibility classification.';

