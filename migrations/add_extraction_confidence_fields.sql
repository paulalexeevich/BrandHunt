-- Add classification and confidence fields for product extraction
-- Date: November 9, 2025
-- Description: Adds classification fields (is_product, details_visible) and confidence scores for each extracted field

-- Add classification fields
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS is_product BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS details_visible BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS extraction_notes TEXT;

-- Add confidence scores for each extracted field
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS brand_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS product_name_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS category_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS flavor_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS size_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS description_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS sku_confidence DECIMAL(3,2);

-- Add indexes for classification queries
CREATE INDEX IF NOT EXISTS idx_detections_is_product 
ON branghunt_detections(is_product) 
WHERE is_product = TRUE;

CREATE INDEX IF NOT EXISTS idx_detections_details_visible 
ON branghunt_detections(details_visible) 
WHERE details_visible = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN branghunt_detections.is_product IS 'Whether the detected item is actually a product (vs shelf fixture, price tag, etc.)';
COMMENT ON COLUMN branghunt_detections.details_visible IS 'Whether product details (brand, name, etc.) are clearly visible in the image';
COMMENT ON COLUMN branghunt_detections.extraction_notes IS 'Notes about why extraction failed or details about extraction quality';
COMMENT ON COLUMN branghunt_detections.brand_confidence IS 'Confidence score (0.0-1.0) for extracted brand name';
COMMENT ON COLUMN branghunt_detections.product_name_confidence IS 'Confidence score (0.0-1.0) for extracted product name';
COMMENT ON COLUMN branghunt_detections.category_confidence IS 'Confidence score (0.0-1.0) for extracted category';
COMMENT ON COLUMN branghunt_detections.flavor_confidence IS 'Confidence score (0.0-1.0) for extracted flavor/variant';
COMMENT ON COLUMN branghunt_detections.size_confidence IS 'Confidence score (0.0-1.0) for extracted size/weight';
COMMENT ON COLUMN branghunt_detections.description_confidence IS 'Confidence score (0.0-1.0) for extracted description';
COMMENT ON COLUMN branghunt_detections.sku_confidence IS 'Confidence score (0.0-1.0) for extracted SKU/barcode';

