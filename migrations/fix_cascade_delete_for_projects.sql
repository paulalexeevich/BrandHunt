-- Fix Cascade Delete for Projects
-- Date: November 10, 2025
-- Description: Updates foreign key constraints so that deleting a project
--              also deletes all related images, detections, and foodgraph results

-- =====================================================
-- 1. FIX PROJECT -> IMAGES CASCADE
-- =====================================================

-- Drop the existing constraint
ALTER TABLE branghunt_images
DROP CONSTRAINT IF EXISTS branghunt_images_project_id_fkey;

-- Re-add with CASCADE delete
ALTER TABLE branghunt_images
ADD CONSTRAINT branghunt_images_project_id_fkey 
FOREIGN KEY (project_id) 
REFERENCES branghunt_projects(id) 
ON DELETE CASCADE;

-- =====================================================
-- 2. VERIFY/FIX IMAGES -> DETECTIONS CASCADE
-- =====================================================

-- Drop and recreate constraint if needed
ALTER TABLE branghunt_detections
DROP CONSTRAINT IF EXISTS branghunt_detections_image_id_fkey;

ALTER TABLE branghunt_detections
ADD CONSTRAINT branghunt_detections_image_id_fkey 
FOREIGN KEY (image_id) 
REFERENCES branghunt_images(id) 
ON DELETE CASCADE;

-- =====================================================
-- 3. VERIFY/FIX DETECTIONS -> FOODGRAPH RESULTS CASCADE
-- =====================================================

-- Drop and recreate constraint if needed
ALTER TABLE branghunt_foodgraph_results
DROP CONSTRAINT IF EXISTS branghunt_foodgraph_results_detection_id_fkey;

ALTER TABLE branghunt_foodgraph_results
ADD CONSTRAINT branghunt_foodgraph_results_detection_id_fkey 
FOREIGN KEY (detection_id) 
REFERENCES branghunt_detections(id) 
ON DELETE CASCADE;

-- =====================================================
-- SUMMARY
-- =====================================================
-- After this migration, deleting a project will:
-- 1. Delete all images in that project (CASCADE from branghunt_projects -> branghunt_images)
-- 2. Delete all detections for those images (CASCADE from branghunt_images -> branghunt_detections)
-- 3. Delete all foodgraph results for those detections (CASCADE from branghunt_detections -> branghunt_foodgraph_results)
--
-- This ensures complete cleanup with no orphaned data!

