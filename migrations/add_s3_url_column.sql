-- Add S3 URL Column to BrangHunt Images
-- Date: November 10, 2025
-- Description: Adds s3_url column to store original S3 image links instead of base64 data
--              This significantly reduces database size and improves performance

-- =====================================================
-- 1. ADD S3_URL COLUMN
-- =====================================================

-- Add s3_url column to store the original S3 URL
ALTER TABLE branghunt_images
ADD COLUMN IF NOT EXISTS s3_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_images_s3_url ON branghunt_images(s3_url);

-- Add comment
COMMENT ON COLUMN branghunt_images.s3_url IS 'Original S3 URL of the image (alternative to storing base64 in file_path)';

-- =====================================================
-- 2. UPDATE FILE_PATH COLUMN COMMENT
-- =====================================================

-- Update comment to indicate file_path can store either base64 OR S3 URL
COMMENT ON COLUMN branghunt_images.file_path IS 'File path or base64-encoded image data (legacy) or S3 URL. Prefer using s3_url column for new images.';

-- =====================================================
-- 3. ADD STORAGE_TYPE COLUMN
-- =====================================================

-- Add column to track how the image is stored
ALTER TABLE branghunt_images
ADD COLUMN IF NOT EXISTS storage_type TEXT DEFAULT 'base64' CHECK (storage_type IN ('base64', 's3_url'));

-- Add index
CREATE INDEX IF NOT EXISTS idx_images_storage_type ON branghunt_images(storage_type);

-- Add comment
COMMENT ON COLUMN branghunt_images.storage_type IS 'How the image is stored: "base64" (legacy, in file_path) or "s3_url" (recommended, in s3_url column)';

-- =====================================================
-- SUMMARY
-- =====================================================
-- New images will store:
--   - s3_url: The original S3 URL
--   - storage_type: 's3_url'
--   - file_path: NULL or minimal reference
--
-- Legacy images will continue to work with:
--   - file_path: base64 data
--   - storage_type: 'base64'
--   - s3_url: NULL

