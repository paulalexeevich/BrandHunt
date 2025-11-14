-- Migration: Add project_type column to branghunt_projects table
-- Purpose: Enable separate Gemini API keys for regular vs test projects to track token usage
-- Date: Nov 14, 2025

-- Add project_type column with enum type
-- Default to 'regular' for all existing projects
ALTER TABLE branghunt_projects
ADD COLUMN project_type TEXT NOT NULL DEFAULT 'regular'
CHECK (project_type IN ('regular', 'test'));

-- Add index for faster filtering by project type
CREATE INDEX idx_branghunt_projects_project_type ON branghunt_projects(project_type);

-- Comment on column
COMMENT ON COLUMN branghunt_projects.project_type IS 'Project type: regular (uses main API key) or test (uses test API key for token tracking)';

