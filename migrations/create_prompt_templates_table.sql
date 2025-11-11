-- Create table for storing Gemini API prompt templates
-- This allows users to customize instructions for different processing steps

CREATE TABLE IF NOT EXISTS branghunt_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES branghunt_projects(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL, -- 'extract_info', 'ai_filter', etc.
  prompt_template TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Ensure only one active prompt per project per step
  CONSTRAINT unique_active_prompt UNIQUE (project_id, step_name, is_active) 
    WHERE is_active = true
);

-- Create index for faster lookups
CREATE INDEX idx_prompt_templates_project_step ON branghunt_prompt_templates(project_id, step_name);
CREATE INDEX idx_prompt_templates_active ON branghunt_prompt_templates(project_id, step_name, is_active) WHERE is_active = true;

-- Add RLS policies
ALTER TABLE branghunt_prompt_templates ENABLE ROW LEVEL SECURITY;

-- Users can view prompts for projects they own
CREATE POLICY "Users can view their project prompts"
  ON branghunt_prompt_templates FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM branghunt_projects 
      WHERE user_id = auth.uid()
    )
  );

-- Users can insert prompts for projects they own
CREATE POLICY "Users can insert prompts for their projects"
  ON branghunt_prompt_templates FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM branghunt_projects 
      WHERE user_id = auth.uid()
    )
  );

-- Users can update prompts for projects they own
CREATE POLICY "Users can update their project prompts"
  ON branghunt_prompt_templates FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM branghunt_projects 
      WHERE user_id = auth.uid()
    )
  );

-- Users can delete prompts for projects they own
CREATE POLICY "Users can delete their project prompts"
  ON branghunt_prompt_templates FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM branghunt_projects 
      WHERE user_id = auth.uid()
    )
  );

-- Add comment
COMMENT ON TABLE branghunt_prompt_templates IS 'Stores customizable prompt templates for Gemini API processing steps. Allows versioning and per-project customization.';
COMMENT ON COLUMN branghunt_prompt_templates.step_name IS 'The processing step this prompt is for: extract_info, ai_filter, price_extraction, etc.';
COMMENT ON COLUMN branghunt_prompt_templates.is_active IS 'Only one prompt per project+step can be active at a time';
COMMENT ON COLUMN branghunt_prompt_templates.version IS 'Version number for tracking prompt iterations';

