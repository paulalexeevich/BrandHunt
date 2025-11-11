-- Add confidence column to branghunt_detections table
-- Date: November 11, 2025
-- Description: Adds confidence score column for YOLO detection confidence

ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS confidence DECIMAL(4,3);

-- Add comment for documentation
COMMENT ON COLUMN branghunt_detections.confidence IS 'Detection confidence score from YOLO (0.000 to 1.000)';

-- Add index for filtering by confidence
CREATE INDEX IF NOT EXISTS idx_detections_confidence 
ON branghunt_detections(confidence)
WHERE confidence IS NOT NULL;

