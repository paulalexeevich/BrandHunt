-- Add comprehensive product detail columns to branghunt_detections table
-- Date: October 8, 2025
-- Description: Adds columns to store all product information returned by Gemini

-- Add label column (from initial detection phase)
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS label TEXT;

-- Add product name column (from brand extraction phase)
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS product_name TEXT;

-- Add flavor/variant column (from brand extraction phase)
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS flavor TEXT;

-- Add size/weight column (from brand extraction phase)
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS size TEXT;

-- Add description column (from brand extraction phase)
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add comments for documentation
COMMENT ON COLUMN branghunt_detections.label IS 'Initial product label/description from detection phase (e.g., "Frozen pie box")';
COMMENT ON COLUMN branghunt_detections.product_name IS 'Full product name extracted from package (e.g., "Key Lime Pie")';
COMMENT ON COLUMN branghunt_detections.flavor IS 'Flavor or variant extracted from package (e.g., "Chocolate", "Strawberry")';
COMMENT ON COLUMN branghunt_detections.size IS 'Size or weight extracted from package (e.g., "8 oz", "16 oz", "2 lbs")';
COMMENT ON COLUMN branghunt_detections.description IS 'Product description extracted from package';

