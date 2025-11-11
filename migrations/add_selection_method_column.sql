-- Add selection_method column to track how matches were selected
-- Date: November 11, 2025
-- Description: Adds a column to track whether a match was selected through:
--              - 'visual_matching': Gemini visual similarity analysis (2+ matches)
--              - 'auto_select': Single identical match found
--              - 'consolidation': Single almost_same match found
--              - NULL: Manual selection or not yet analyzed

-- Add selection_method column
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS selection_method TEXT;

-- Add check constraint to ensure valid values
ALTER TABLE branghunt_detections
ADD CONSTRAINT valid_selection_method 
CHECK (selection_method IN ('visual_matching', 'auto_select', 'consolidation') OR selection_method IS NULL);

-- Add index for querying by selection method
CREATE INDEX IF NOT EXISTS idx_detections_selection_method 
ON branghunt_detections(selection_method) 
WHERE selection_method IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN branghunt_detections.selection_method IS 'Method used to select the FoodGraph match: visual_matching (Gemini analysis), auto_select (single identical), consolidation (single almost_same), or NULL (manual/not analyzed)';

