-- Change details_visible from BOOLEAN to 3-level visibility status
-- Date: November 11, 2025
-- Description: Converts details_visible field from boolean to VARCHAR with 3 distinct levels:
--   'clear' - All critical details visible (brand, product name, flavor)
--   'partial' - Some details visible
--   'none' - No details visible

-- Step 1: Add new column with VARCHAR type
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS visibility_status VARCHAR(20);

-- Step 2: Migrate existing boolean data to new 3-level system
-- TRUE -> 'clear' (assuming old TRUE meant details were visible)
-- FALSE -> 'none' (assuming old FALSE meant no details visible)
-- NULL -> NULL (preserve unknown state)
UPDATE branghunt_detections
SET visibility_status = CASE
  WHEN details_visible = TRUE THEN 'clear'
  WHEN details_visible = FALSE THEN 'none'
  ELSE NULL
END
WHERE visibility_status IS NULL;

-- Step 3: Drop the old boolean column
ALTER TABLE branghunt_detections
DROP COLUMN IF EXISTS details_visible;

-- Step 4: Rename new column to replace old one
ALTER TABLE branghunt_detections
RENAME COLUMN visibility_status TO details_visible;

-- Step 5: Add constraint to ensure only valid values
ALTER TABLE branghunt_detections
ADD CONSTRAINT check_details_visible_values 
CHECK (details_visible IN ('clear', 'partial', 'none') OR details_visible IS NULL);

-- Step 6: Update index (drop old, create new)
DROP INDEX IF EXISTS idx_detections_details_visible;

CREATE INDEX idx_detections_details_visible_clear
ON branghunt_detections(details_visible)
WHERE details_visible = 'clear';

CREATE INDEX idx_detections_details_visible_partial
ON branghunt_detections(details_visible)
WHERE details_visible = 'partial';

-- Step 7: Update column comment
COMMENT ON COLUMN branghunt_detections.details_visible IS 
'Three-level visibility status: ''clear'' (all critical details visible: brand, product name, flavor), ''partial'' (some details visible), ''none'' (no details visible)';

