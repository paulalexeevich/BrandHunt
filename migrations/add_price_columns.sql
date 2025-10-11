-- Add price extraction columns to branghunt_detections table
-- Run this migration on Supabase SQL Editor

ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS price TEXT,
ADD COLUMN IF NOT EXISTS price_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS price_confidence DECIMAL(3, 2);

-- Add comments for documentation
COMMENT ON COLUMN branghunt_detections.price IS 'Extracted price value from price tag below product';
COMMENT ON COLUMN branghunt_detections.price_currency IS 'Currency code (USD, EUR, etc.)';
COMMENT ON COLUMN branghunt_detections.price_confidence IS 'Confidence score for price extraction (0.0 to 1.0)';

