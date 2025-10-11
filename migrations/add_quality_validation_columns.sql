-- Migration: Add quality validation columns to branghunt_images table
-- Created: 2025-10-11
-- Purpose: Store image quality validation results (blur detection, product count)

-- Add columns for quality validation
ALTER TABLE branghunt_images
ADD COLUMN IF NOT EXISTS is_blurry BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS blur_confidence DECIMAL(3,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS estimated_product_count INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS product_count_confidence DECIMAL(3,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS quality_validated_at TIMESTAMPTZ DEFAULT NULL;

-- Add comment to explain the columns
COMMENT ON COLUMN branghunt_images.is_blurry IS 'Whether the image appears blurry (affects detection accuracy)';
COMMENT ON COLUMN branghunt_images.blur_confidence IS 'Confidence score for blur detection (0.0 to 1.0)';
COMMENT ON COLUMN branghunt_images.estimated_product_count IS 'Estimated number of products in the image';
COMMENT ON COLUMN branghunt_images.product_count_confidence IS 'Confidence score for product count estimation (0.0 to 1.0)';
COMMENT ON COLUMN branghunt_images.quality_validated_at IS 'Timestamp when quality validation was performed';

-- Create index for faster filtering by quality validation status
CREATE INDEX IF NOT EXISTS idx_branghunt_images_quality_validated 
ON branghunt_images(quality_validated_at);

CREATE INDEX IF NOT EXISTS idx_branghunt_images_product_count 
ON branghunt_images(estimated_product_count);

