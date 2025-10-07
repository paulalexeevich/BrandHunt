-- Add SKU column to branghunt_detections table
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS sku TEXT;

-- Add comment for documentation
COMMENT ON COLUMN branghunt_detections.sku IS 'Stock Keeping Unit - product identifier, barcode, UPC, or product code extracted from the product image';

