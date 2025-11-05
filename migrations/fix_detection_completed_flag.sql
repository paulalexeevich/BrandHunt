-- Migration: Fix detection_completed flag for existing images
-- This updates images that have detections but aren't marked as detection_completed

-- Update images that have detections but detection_completed is false
UPDATE branghunt_images
SET 
  detection_completed = true,
  detection_completed_at = NOW()
WHERE 
  detection_completed = false
  AND id IN (
    SELECT DISTINCT image_id 
    FROM branghunt_detections
  );

-- Show how many records were updated
SELECT 
  COUNT(*) as images_fixed,
  'Images with detections now marked as detection_completed' as message
FROM branghunt_images
WHERE 
  detection_completed = true
  AND id IN (
    SELECT DISTINCT image_id 
    FROM branghunt_detections
  );

