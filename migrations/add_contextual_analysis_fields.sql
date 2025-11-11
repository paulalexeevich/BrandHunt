-- Migration: Add contextual analysis fields to branghunt_detections
-- Purpose: Store results from neighbor-based contextual analysis
-- Date: November 11, 2025

-- Add fields for contextual analysis results
ALTER TABLE branghunt_detections
  ADD COLUMN IF NOT EXISTS contextual_brand TEXT,
  ADD COLUMN IF NOT EXISTS contextual_brand_confidence DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS contextual_brand_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS contextual_size TEXT,
  ADD COLUMN IF NOT EXISTS contextual_size_confidence DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS contextual_size_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS contextual_visual_similarity_left DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS contextual_visual_similarity_right DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS contextual_overall_confidence DECIMAL(4,3),
  ADD COLUMN IF NOT EXISTS contextual_notes TEXT,
  ADD COLUMN IF NOT EXISTS contextual_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS contextual_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contextual_left_neighbor_count INTEGER,
  ADD COLUMN IF NOT EXISTS contextual_right_neighbor_count INTEGER;

-- Add comment to table
COMMENT ON COLUMN branghunt_detections.contextual_brand IS 'Brand name inferred from neighboring products context';
COMMENT ON COLUMN branghunt_detections.contextual_brand_confidence IS 'Confidence score (0.0-1.0) for contextual brand inference';
COMMENT ON COLUMN branghunt_detections.contextual_brand_reasoning IS 'Explanation of why this brand was inferred';
COMMENT ON COLUMN branghunt_detections.contextual_size IS 'Size inferred from neighboring products context';
COMMENT ON COLUMN branghunt_detections.contextual_size_confidence IS 'Confidence score (0.0-1.0) for contextual size inference';
COMMENT ON COLUMN branghunt_detections.contextual_size_reasoning IS 'Explanation of why this size was inferred';
COMMENT ON COLUMN branghunt_detections.contextual_visual_similarity_left IS 'Visual similarity score (0.0-1.0) to left neighbors';
COMMENT ON COLUMN branghunt_detections.contextual_visual_similarity_right IS 'Visual similarity score (0.0-1.0) to right neighbors';
COMMENT ON COLUMN branghunt_detections.contextual_overall_confidence IS 'Overall confidence score (0.0-1.0) for contextual analysis';
COMMENT ON COLUMN branghunt_detections.contextual_notes IS 'Additional notes or observations from contextual analysis';
COMMENT ON COLUMN branghunt_detections.contextual_prompt_version IS 'Version of prompt used (v1, v2, v3) for this analysis';
COMMENT ON COLUMN branghunt_detections.contextual_analyzed_at IS 'Timestamp when contextual analysis was performed';
COMMENT ON COLUMN branghunt_detections.contextual_left_neighbor_count IS 'Number of left neighbors used in analysis';
COMMENT ON COLUMN branghunt_detections.contextual_right_neighbor_count IS 'Number of right neighbors used in analysis';

