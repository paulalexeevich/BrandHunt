-- Check if visual_match results exist for this detection
-- Detection ID from console: 1ffde270-f1cb-4d38-8916-1d9cf44c4e7

SELECT 
  processing_stage,
  match_status,
  visual_similarity,
  product_name,
  product_gtin,
  created_at
FROM branghunt_foodgraph_results
WHERE detection_id = '1ffde270-f1cb-4d38-8916-1d9cf44c4e7'
ORDER BY created_at DESC;

-- Also check the detection itself
SELECT 
  detection_index,
  brand_name,
  product_name,
  selection_method,
  selected_foodgraph_gtin,
  selected_foodgraph_product_name,
  fully_analyzed,
  analysis_completed_at
FROM branghunt_detections
WHERE id = '1ffde270-f1cb-4d38-8916-1d9cf44c4e7';

