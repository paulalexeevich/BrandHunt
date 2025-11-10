-- Migration: Add Project Collaboration
-- Description: Allow multiple users to be added to projects for shared access
-- Date: 2025-11-10

-- ============================================================================
-- 1. CREATE PROJECT MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS branghunt_project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES branghunt_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique user-project combinations
  UNIQUE(project_id, user_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON branghunt_project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON branghunt_project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_role ON branghunt_project_members(project_id, role);

-- Add comment
COMMENT ON TABLE branghunt_project_members IS 'Manages user access to projects - enables collaboration';
COMMENT ON COLUMN branghunt_project_members.role IS 'User role: owner (full control), admin (manage members), member (edit), viewer (read-only)';

-- ============================================================================
-- 2. ADD TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE TRIGGER update_branghunt_project_members_updated_at
  BEFORE UPDATE ON branghunt_project_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. AUTOMATICALLY ADD PROJECT OWNER AS MEMBER
-- ============================================================================

-- Function to add project owner as member automatically
CREATE OR REPLACE FUNCTION add_project_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
  -- Add the project owner as 'owner' role member
  INSERT INTO branghunt_project_members (project_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.user_id, 'owner', NEW.user_id)
  ON CONFLICT (project_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on project creation
CREATE TRIGGER trigger_add_project_owner_as_member
  AFTER INSERT ON branghunt_projects
  FOR EACH ROW
  EXECUTE FUNCTION add_project_owner_as_member();

-- Backfill existing projects - add owners as members
INSERT INTO branghunt_project_members (project_id, user_id, role, added_by)
SELECT id, user_id, 'owner', user_id
FROM branghunt_projects
ON CONFLICT (project_id, user_id) DO NOTHING;

-- ============================================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE branghunt_project_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS POLICIES FOR PROJECT MEMBERS TABLE
-- ============================================================================

-- Policy: Users can view project members if they are members of that project
DROP POLICY IF EXISTS "Users can view project members they belong to" ON branghunt_project_members;
CREATE POLICY "Users can view project members they belong to"
  ON branghunt_project_members
  FOR SELECT
  USING (
    project_id IN (
      SELECT project_id 
      FROM branghunt_project_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Project owners and admins can add members
DROP POLICY IF EXISTS "Project owners and admins can add members" ON branghunt_project_members;
CREATE POLICY "Project owners and admins can add members"
  ON branghunt_project_members
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id 
      FROM branghunt_project_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Project owners and admins can remove members (except owner can't be removed)
DROP POLICY IF EXISTS "Project owners and admins can remove members" ON branghunt_project_members;
CREATE POLICY "Project owners and admins can remove members"
  ON branghunt_project_members
  FOR DELETE
  USING (
    role != 'owner' -- Cannot remove owner
    AND project_id IN (
      SELECT project_id 
      FROM branghunt_project_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Project owners can update member roles
DROP POLICY IF EXISTS "Project owners can update member roles" ON branghunt_project_members;
CREATE POLICY "Project owners can update member roles"
  ON branghunt_project_members
  FOR UPDATE
  USING (
    project_id IN (
      SELECT project_id 
      FROM branghunt_project_members 
      WHERE user_id = auth.uid() 
        AND role = 'owner'
    )
  );

-- ============================================================================
-- 6. UPDATE RLS POLICIES FOR EXISTING TABLES
-- ============================================================================

-- ============================================================================
-- 6.1 PROJECTS TABLE - Allow access to project members
-- ============================================================================

-- Drop old policy
DROP POLICY IF EXISTS "Users can view their own projects" ON branghunt_projects;

-- New policy: Users can view projects they own OR are members of
CREATE POLICY "Users can view projects they have access to"
  ON branghunt_projects
  FOR SELECT
  USING (
    user_id = auth.uid() 
    OR id IN (
      SELECT project_id 
      FROM branghunt_project_members 
      WHERE user_id = auth.uid()
    )
  );

-- Update policy: Only owners can update projects
DROP POLICY IF EXISTS "Users can update their own projects" ON branghunt_projects;
CREATE POLICY "Project owners can update projects"
  ON branghunt_projects
  FOR UPDATE
  USING (user_id = auth.uid());

-- Delete policy: Only owners can delete projects
DROP POLICY IF EXISTS "Users can delete their own projects" ON branghunt_projects;
CREATE POLICY "Project owners can delete projects"
  ON branghunt_projects
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 6.2 IMAGES TABLE - Allow access to project members
-- ============================================================================

-- Drop old policy
DROP POLICY IF EXISTS "Users can view their own images" ON branghunt_images;

-- New policy: Users can view images they own OR from projects they're members of
CREATE POLICY "Users can view images they have access to"
  ON branghunt_images
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (
      project_id IS NOT NULL 
      AND project_id IN (
        SELECT project_id 
        FROM branghunt_project_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Insert policy: Members can add images to shared projects
DROP POLICY IF EXISTS "Users can insert their own images" ON branghunt_images;
CREATE POLICY "Users can insert images to accessible projects"
  ON branghunt_images
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (
      project_id IS NOT NULL 
      AND project_id IN (
        SELECT project_id 
        FROM branghunt_project_members 
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin', 'member') -- viewers can't add
      )
    )
  );

-- Update policy: Members can update images in shared projects
DROP POLICY IF EXISTS "Users can update their own images" ON branghunt_images;
CREATE POLICY "Users can update images they have access to"
  ON branghunt_images
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (
      project_id IS NOT NULL 
      AND project_id IN (
        SELECT project_id 
        FROM branghunt_project_members 
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin', 'member')
      )
    )
  );

-- Delete policy: Only image owners and project owners can delete
DROP POLICY IF EXISTS "Users can delete their own images" ON branghunt_images;
CREATE POLICY "Users can delete images they own or project owners can delete"
  ON branghunt_images
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR (
      project_id IS NOT NULL 
      AND project_id IN (
        SELECT project_id 
        FROM branghunt_project_members 
        WHERE user_id = auth.uid()
          AND role = 'owner'
      )
    )
  );

-- ============================================================================
-- 6.3 DETECTIONS TABLE - Allow access based on image access
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can view detections for their images" ON branghunt_detections;

-- New policy: Users can view detections for images they have access to
CREATE POLICY "Users can view detections for accessible images"
  ON branghunt_detections
  FOR SELECT
  USING (
    image_id IN (
      SELECT id FROM branghunt_images 
      WHERE user_id = auth.uid()
        OR (
          project_id IS NOT NULL 
          AND project_id IN (
            SELECT project_id 
            FROM branghunt_project_members 
            WHERE user_id = auth.uid()
          )
        )
    )
  );

-- Insert policy
DROP POLICY IF EXISTS "Users can insert detections for their images" ON branghunt_detections;
CREATE POLICY "Users can insert detections for accessible images"
  ON branghunt_detections
  FOR INSERT
  WITH CHECK (
    image_id IN (
      SELECT id FROM branghunt_images 
      WHERE user_id = auth.uid()
        OR (
          project_id IS NOT NULL 
          AND project_id IN (
            SELECT project_id 
            FROM branghunt_project_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
          )
        )
    )
  );

-- Update policy
DROP POLICY IF EXISTS "Users can update detections for their images" ON branghunt_detections;
CREATE POLICY "Users can update detections for accessible images"
  ON branghunt_detections
  FOR UPDATE
  USING (
    image_id IN (
      SELECT id FROM branghunt_images 
      WHERE user_id = auth.uid()
        OR (
          project_id IS NOT NULL 
          AND project_id IN (
            SELECT project_id 
            FROM branghunt_project_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
          )
        )
    )
  );

-- Delete policy
DROP POLICY IF EXISTS "Users can delete detections for their images" ON branghunt_detections;
CREATE POLICY "Users can delete detections for accessible images"
  ON branghunt_detections
  FOR DELETE
  USING (
    image_id IN (
      SELECT id FROM branghunt_images 
      WHERE user_id = auth.uid()
        OR (
          project_id IS NOT NULL 
          AND project_id IN (
            SELECT project_id 
            FROM branghunt_project_members 
            WHERE user_id = auth.uid()
              AND role = 'owner'
          )
        )
    )
  );

-- ============================================================================
-- 6.4 FOODGRAPH RESULTS TABLE - Allow access based on detection access
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can view FoodGraph results for their detections" ON branghunt_foodgraph_results;

-- New policy: Users can view FoodGraph results for accessible detections
CREATE POLICY "Users can view FoodGraph results for accessible detections"
  ON branghunt_foodgraph_results
  FOR SELECT
  USING (
    detection_id IN (
      SELECT d.id FROM branghunt_detections d
      INNER JOIN branghunt_images i ON i.id = d.image_id
      WHERE i.user_id = auth.uid()
        OR (
          i.project_id IS NOT NULL 
          AND i.project_id IN (
            SELECT project_id 
            FROM branghunt_project_members 
            WHERE user_id = auth.uid()
          )
        )
    )
  );

-- Insert policy
DROP POLICY IF EXISTS "Users can insert FoodGraph results for their detections" ON branghunt_foodgraph_results;
CREATE POLICY "Users can insert FoodGraph results for accessible detections"
  ON branghunt_foodgraph_results
  FOR INSERT
  WITH CHECK (
    detection_id IN (
      SELECT d.id FROM branghunt_detections d
      INNER JOIN branghunt_images i ON i.id = d.image_id
      WHERE i.user_id = auth.uid()
        OR (
          i.project_id IS NOT NULL 
          AND i.project_id IN (
            SELECT project_id 
            FROM branghunt_project_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
          )
        )
    )
  );

-- Update policy
DROP POLICY IF EXISTS "Users can update FoodGraph results for their detections" ON branghunt_foodgraph_results;
CREATE POLICY "Users can update FoodGraph results for accessible detections"
  ON branghunt_foodgraph_results
  FOR UPDATE
  USING (
    detection_id IN (
      SELECT d.id FROM branghunt_detections d
      INNER JOIN branghunt_images i ON i.id = d.image_id
      WHERE i.user_id = auth.uid()
        OR (
          i.project_id IS NOT NULL 
          AND i.project_id IN (
            SELECT project_id 
            FROM branghunt_project_members 
            WHERE user_id = auth.uid()
              AND role IN ('owner', 'admin', 'member')
          )
        )
    )
  );

-- Delete policy
DROP POLICY IF EXISTS "Users can delete FoodGraph results for their detections" ON branghunt_foodgraph_results;
CREATE POLICY "Users can delete FoodGraph results for accessible detections"
  ON branghunt_foodgraph_results
  FOR DELETE
  USING (
    detection_id IN (
      SELECT d.id FROM branghunt_detections d
      INNER JOIN branghunt_images i ON i.id = d.image_id
      WHERE i.user_id = auth.uid()
        OR (
          i.project_id IS NOT NULL 
          AND i.project_id IN (
            SELECT project_id 
            FROM branghunt_project_members 
            WHERE user_id = auth.uid()
              AND role = 'owner'
          )
        )
    )
  );

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify project members table
SELECT 'Project Members Table' as verification, COUNT(*) as row_count 
FROM branghunt_project_members;

-- Verify all projects have owners as members
SELECT 'Projects with owners as members' as verification,
  COUNT(DISTINCT p.id) as projects_count,
  COUNT(DISTINCT pm.project_id) as members_count
FROM branghunt_projects p
LEFT JOIN branghunt_project_members pm 
  ON pm.project_id = p.id AND pm.role = 'owner';

-- Show sample of project members
SELECT pm.*, p.name as project_name
FROM branghunt_project_members pm
INNER JOIN branghunt_projects p ON p.id = pm.project_id
ORDER BY pm.created_at DESC
LIMIT 5;

