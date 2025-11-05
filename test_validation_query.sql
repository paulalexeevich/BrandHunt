-- Query to verify quality validation data
-- Run this in Supabase SQL Editor after testing

SELECT 
  id,
  original_filename,
  is_blurry,
  blur_confidence,
  estimated_product_count,
  product_count_confidence,
  quality_validated_at,
  uploaded_at
FROM branghunt_images
WHERE quality_validated_at IS NOT NULL
ORDER BY uploaded_at DESC
LIMIT 10;






