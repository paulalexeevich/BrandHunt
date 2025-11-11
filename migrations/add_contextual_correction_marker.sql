-- Migration: Add marker to track when brand/size was corrected by contextual analysis
-- Purpose: Track which products were improved by contextual analysis in batch processing
-- Date: November 11, 2025

-- Add flag to indicate contextual analysis corrected the extraction
ALTER TABLE branghunt_detections
  ADD COLUMN IF NOT EXISTS corrected_by_contextual BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS contextual_correction_notes TEXT;

-- Add comments
COMMENT ON COLUMN branghunt_detections.corrected_by_contextual IS 'TRUE if brand/size was overwritten by contextual analysis due to higher confidence';
COMMENT ON COLUMN branghunt_detections.contextual_correction_notes IS 'Details about what was corrected (e.g., "Brand changed from Unknown to Coca-Cola (85% confidence)")';

