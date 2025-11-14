-- Migration: Add Gemini model selection columns to branghunt_projects
-- Purpose: Allow per-project customization of Gemini models for extraction and visual matching
-- Date: Nov 14, 2025

-- Add extraction_model column for info extraction operations
ALTER TABLE branghunt_projects
ADD COLUMN extraction_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash'
CHECK (extraction_model IN (
  'gemini-2.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
));

-- Add visual_match_model column for visual matching operations
ALTER TABLE branghunt_projects
ADD COLUMN visual_match_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash'
CHECK (visual_match_model IN (
  'gemini-2.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
));

-- Add indexes for faster filtering
CREATE INDEX idx_branghunt_projects_extraction_model ON branghunt_projects(extraction_model);
CREATE INDEX idx_branghunt_projects_visual_match_model ON branghunt_projects(visual_match_model);

-- Add comments
COMMENT ON COLUMN branghunt_projects.extraction_model IS 'Gemini model for product info extraction (extractProductInfo, extractPrice, detectProducts)';
COMMENT ON COLUMN branghunt_projects.visual_match_model IS 'Gemini model for visual matching and AI filtering (compareProductImages, selectBestMatchFromMultiple)';

