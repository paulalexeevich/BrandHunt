-- Add store_name column to branghunt_images table
-- This column stores the store name/location where the image was taken
-- Example: "Walgreens (Store #6105 - 9100 Carothers Pkwy, Franklin, TN 37067)"

ALTER TABLE branghunt_images
ADD COLUMN IF NOT EXISTS store_name TEXT;

-- Add index for faster filtering by store
CREATE INDEX IF NOT EXISTS idx_branghunt_images_store_name 
ON branghunt_images(store_name);

-- Add comment to document the column
COMMENT ON COLUMN branghunt_images.store_name IS 'Store name and location where the image was captured';

