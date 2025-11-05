-- Migration: Add 4-stage status system for images
-- Status progression: uploaded → detected → extracted → selected

-- Create ENUM type for image status
CREATE TYPE image_status AS ENUM ('uploaded', 'detected', 'extracted', 'selected');

-- Add new status column (temporarily nullable)
ALTER TABLE branghunt_images 
ADD COLUMN status image_status;

-- Set initial status values based on current state
-- Priority: selected > extracted > detected > uploaded

-- Set 'selected' for images with fully analyzed detections
UPDATE branghunt_images
SET status = 'selected'
WHERE id IN (
  SELECT DISTINCT image_id 
  FROM branghunt_detections 
  WHERE fully_analyzed = true
);

-- Set 'extracted' for images with brand/price extracted (but not fully analyzed)
UPDATE branghunt_images
SET status = 'extracted'
WHERE status IS NULL
  AND id IN (
    SELECT DISTINCT image_id 
    FROM branghunt_detections 
    WHERE brand_extracted = true
  );

-- Set 'detected' for images that completed detection
UPDATE branghunt_images
SET status = 'detected'
WHERE status IS NULL
  AND detection_completed = true;

-- Set 'uploaded' for all remaining images
UPDATE branghunt_images
SET status = 'uploaded'
WHERE status IS NULL;

-- Make status column NOT NULL with default
ALTER TABLE branghunt_images 
ALTER COLUMN status SET NOT NULL,
ALTER COLUMN status SET DEFAULT 'uploaded';

-- Add index for better query performance
CREATE INDEX idx_branghunt_images_status ON branghunt_images(status);

-- Add comments for documentation
COMMENT ON TYPE image_status IS 'Image processing status: uploaded → detected → extracted → selected';
COMMENT ON COLUMN branghunt_images.status IS 'Current processing stage: uploaded (just uploaded), detected (ran detector), extracted (brand/price info extracted), selected (FoodGraph matched and saved)';

-- Create helper view to show status distribution
CREATE OR REPLACE VIEW branghunt_image_status_summary AS
SELECT 
  COALESCE(project_id::text, 'no_project') as project_id,
  status,
  COUNT(*) as count
FROM branghunt_images
GROUP BY project_id, status;

-- Show migration results
SELECT 
  status,
  COUNT(*) as image_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM branghunt_images
GROUP BY status
ORDER BY 
  CASE status
    WHEN 'uploaded' THEN 1
    WHEN 'detected' THEN 2
    WHEN 'extracted' THEN 3
    WHEN 'selected' THEN 4
  END;

