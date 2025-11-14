-- Migration: Update Gemini model constraints to only Flash and Flash-Lite
-- Purpose: Simplify model selection to two options based on user preference
-- Date: Nov 14, 2025

-- Drop old constraints
ALTER TABLE branghunt_projects
DROP CONSTRAINT IF EXISTS branghunt_projects_extraction_model_check;

ALTER TABLE branghunt_projects
DROP CONSTRAINT IF EXISTS branghunt_projects_visual_match_model_check;

-- Add new constraints with only two models
ALTER TABLE branghunt_projects
ADD CONSTRAINT branghunt_projects_extraction_model_check
CHECK (extraction_model IN (
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite-preview'
));

ALTER TABLE branghunt_projects
ADD CONSTRAINT branghunt_projects_visual_match_model_check
CHECK (visual_match_model IN (
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite-preview'
));

