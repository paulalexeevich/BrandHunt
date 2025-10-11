-- Add columns to store selected FoodGraph match for fully analyzed products
-- Date: October 11, 2025
-- Description: Adds columns to persist the selected FoodGraph match after AI filtering,
--              allowing users to save analysis results and view them later

-- Add selected FoodGraph match columns
ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS selected_foodgraph_gtin TEXT,
ADD COLUMN IF NOT EXISTS selected_foodgraph_product_name TEXT,
ADD COLUMN IF NOT EXISTS selected_foodgraph_brand_name TEXT,
ADD COLUMN IF NOT EXISTS selected_foodgraph_category TEXT,
ADD COLUMN IF NOT EXISTS selected_foodgraph_image_url TEXT,
ADD COLUMN IF NOT EXISTS selected_foodgraph_result_id TEXT,
ADD COLUMN IF NOT EXISTS fully_analyzed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMPTZ;

-- Add index for querying fully analyzed products
CREATE INDEX IF NOT EXISTS idx_detections_fully_analyzed 
ON branghunt_detections(fully_analyzed) 
WHERE fully_analyzed = TRUE;

-- Add index for selected FoodGraph GTIN lookups
CREATE INDEX IF NOT EXISTS idx_detections_selected_gtin 
ON branghunt_detections(selected_foodgraph_gtin) 
WHERE selected_foodgraph_gtin IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN branghunt_detections.selected_foodgraph_gtin IS 'GTIN of the selected FoodGraph product match';
COMMENT ON COLUMN branghunt_detections.selected_foodgraph_product_name IS 'Product name from the selected FoodGraph match';
COMMENT ON COLUMN branghunt_detections.selected_foodgraph_brand_name IS 'Brand name from the selected FoodGraph match';
COMMENT ON COLUMN branghunt_detections.selected_foodgraph_category IS 'Category from the selected FoodGraph match';
COMMENT ON COLUMN branghunt_detections.selected_foodgraph_image_url IS 'Product image URL from the selected FoodGraph match';
COMMENT ON COLUMN branghunt_detections.selected_foodgraph_result_id IS 'Reference to the branghunt_foodgraph_results.id for the selected match';
COMMENT ON COLUMN branghunt_detections.fully_analyzed IS 'Flag indicating if the product has been fully analyzed and a FoodGraph match has been selected';
COMMENT ON COLUMN branghunt_detections.analysis_completed_at IS 'Timestamp when the analysis was completed and a match was saved';

