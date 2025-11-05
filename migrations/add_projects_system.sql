-- Add Projects System to BrangHunt
-- Date: November 5, 2025
-- Description: Creates projects table to organize images into projects,
--              tracks processing status for each image, and adds RLS policies

-- =====================================================
-- 1. CREATE PROJECTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS branghunt_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON branghunt_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON branghunt_projects(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE branghunt_projects IS 'Projects to organize and group shelf images for analysis';
COMMENT ON COLUMN branghunt_projects.id IS 'Unique identifier for the project';
COMMENT ON COLUMN branghunt_projects.user_id IS 'User who owns this project';
COMMENT ON COLUMN branghunt_projects.name IS 'Project name (e.g., "Walgreens Q4 2025", "Target Weekly Audit")';
COMMENT ON COLUMN branghunt_projects.description IS 'Optional description of the project';
COMMENT ON COLUMN branghunt_projects.created_at IS 'When the project was created';
COMMENT ON COLUMN branghunt_projects.updated_at IS 'When the project was last updated';

-- =====================================================
-- 2. ADD PROJECT_ID TO IMAGES TABLE
-- =====================================================

ALTER TABLE branghunt_images
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES branghunt_projects(id) ON DELETE SET NULL;

-- Add index for faster project-based queries
CREATE INDEX IF NOT EXISTS idx_images_project_id ON branghunt_images(project_id);

-- Add comment
COMMENT ON COLUMN branghunt_images.project_id IS 'Project this image belongs to (optional, for organization)';

-- =====================================================
-- 3. ADD PROCESSING STATUS TRACKING COLUMNS TO IMAGES
-- =====================================================

ALTER TABLE branghunt_images
ADD COLUMN IF NOT EXISTS detection_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS detection_completed_at TIMESTAMPTZ;

-- Add indexes for status tracking
CREATE INDEX IF NOT EXISTS idx_images_detection_completed 
ON branghunt_images(detection_completed) 
WHERE detection_completed = TRUE;

-- Add comments
COMMENT ON COLUMN branghunt_images.detection_completed IS 'Whether product detection has been completed for this image';
COMMENT ON COLUMN branghunt_images.detection_completed_at IS 'When detection was completed';

-- =====================================================
-- 4. ADD PROCESSING STATUS COLUMNS TO DETECTIONS
-- =====================================================

ALTER TABLE branghunt_detections
ADD COLUMN IF NOT EXISTS brand_extracted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS brand_extracted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS price_extracted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS price_extracted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS foodgraph_searched BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS foodgraph_searched_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_filtered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_filtered_at TIMESTAMPTZ;

-- Add indexes for status tracking
CREATE INDEX IF NOT EXISTS idx_detections_brand_extracted 
ON branghunt_detections(brand_extracted) 
WHERE brand_extracted = TRUE;

CREATE INDEX IF NOT EXISTS idx_detections_price_extracted 
ON branghunt_detections(price_extracted) 
WHERE price_extracted = TRUE;

CREATE INDEX IF NOT EXISTS idx_detections_foodgraph_searched 
ON branghunt_detections(foodgraph_searched) 
WHERE foodgraph_searched = TRUE;

CREATE INDEX IF NOT EXISTS idx_detections_ai_filtered 
ON branghunt_detections(ai_filtered) 
WHERE ai_filtered = TRUE;

-- Add comments
COMMENT ON COLUMN branghunt_detections.brand_extracted IS 'Whether brand and product info has been extracted';
COMMENT ON COLUMN branghunt_detections.brand_extracted_at IS 'When brand extraction was completed';
COMMENT ON COLUMN branghunt_detections.price_extracted IS 'Whether price has been extracted';
COMMENT ON COLUMN branghunt_detections.price_extracted_at IS 'When price extraction was completed';
COMMENT ON COLUMN branghunt_detections.foodgraph_searched IS 'Whether FoodGraph search has been performed';
COMMENT ON COLUMN branghunt_detections.foodgraph_searched_at IS 'When FoodGraph search was completed';
COMMENT ON COLUMN branghunt_detections.ai_filtered IS 'Whether AI filtering has been completed';
COMMENT ON COLUMN branghunt_detections.ai_filtered_at IS 'When AI filtering was completed';

-- =====================================================
-- 5. ENABLE ROW LEVEL SECURITY ON PROJECTS
-- =====================================================

ALTER TABLE branghunt_projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own projects
CREATE POLICY "Users can view own projects"
ON branghunt_projects
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own projects
CREATE POLICY "Users can insert own projects"
ON branghunt_projects
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own projects
CREATE POLICY "Users can update own projects"
ON branghunt_projects
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own projects
CREATE POLICY "Users can delete own projects"
ON branghunt_projects
FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- 6. CREATE FUNCTION TO UPDATE TIMESTAMPS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-update updated_at
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON branghunt_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. CREATE VIEW FOR PROJECT STATISTICS
-- =====================================================

CREATE OR REPLACE VIEW branghunt_project_stats AS
SELECT 
    p.id AS project_id,
    p.user_id,
    p.name AS project_name,
    p.description,
    p.created_at,
    p.updated_at,
    COUNT(DISTINCT i.id) AS total_images,
    COUNT(DISTINCT i.id) FILTER (WHERE i.detection_completed = TRUE) AS images_with_detection,
    COUNT(DISTINCT d.id) AS total_detections,
    COUNT(DISTINCT d.id) FILTER (WHERE d.brand_extracted = TRUE) AS detections_brand_extracted,
    COUNT(DISTINCT d.id) FILTER (WHERE d.price_extracted = TRUE) AS detections_price_extracted,
    COUNT(DISTINCT d.id) FILTER (WHERE d.foodgraph_searched = TRUE) AS detections_foodgraph_searched,
    COUNT(DISTINCT d.id) FILTER (WHERE d.ai_filtered = TRUE) AS detections_ai_filtered,
    COUNT(DISTINCT d.id) FILTER (WHERE d.fully_analyzed = TRUE) AS detections_fully_analyzed
FROM branghunt_projects p
LEFT JOIN branghunt_images i ON i.project_id = p.id
LEFT JOIN branghunt_detections d ON d.image_id = i.id
GROUP BY p.id, p.user_id, p.name, p.description, p.created_at, p.updated_at;

-- Add comment
COMMENT ON VIEW branghunt_project_stats IS 'Aggregated statistics for each project showing processing status';

-- Grant access to authenticated users
GRANT SELECT ON branghunt_project_stats TO authenticated;

