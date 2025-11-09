-- Delete BrangHunt Data Using DELETE (works with RLS)
-- Date: November 9, 2025
-- Description: Uses DELETE instead of TRUNCATE to work with Row Level Security
--
-- IMPORTANT: This script will delete ALL BrangHunt data but keep:
--   - User accounts (auth.users)
--   - Authentication sessions
--   - Table structures, indexes, and policies

-- =====================================================
-- METHOD 1: DELETE with CASCADE behavior
-- =====================================================

-- Step 1: Delete all FoodGraph results (leaf table)
DELETE FROM branghunt_foodgraph_results;

-- Step 2: Delete all detections
DELETE FROM branghunt_detections;

-- Step 3: Delete all images
DELETE FROM branghunt_images;

-- Step 4: Delete all projects
DELETE FROM branghunt_projects;

-- =====================================================
-- VERIFY DELETION
-- =====================================================

-- Display row counts to confirm all tables are empty
SELECT 
    'branghunt_projects' AS table_name,
    COUNT(*) AS row_count
FROM branghunt_projects
UNION ALL
SELECT 
    'branghunt_images',
    COUNT(*)
FROM branghunt_images
UNION ALL
SELECT 
    'branghunt_detections',
    COUNT(*)
FROM branghunt_detections
UNION ALL
SELECT 
    'branghunt_foodgraph_results',
    COUNT(*)
FROM branghunt_foodgraph_results
ORDER BY table_name;

-- =====================================================
-- IF ABOVE DOESN'T WORK: Disable RLS temporarily
-- =====================================================
-- Uncomment these lines if you still have data and run as superuser:

/*
-- Disable RLS temporarily
ALTER TABLE branghunt_projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE branghunt_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE branghunt_detections DISABLE ROW LEVEL SECURITY;
ALTER TABLE branghunt_foodgraph_results DISABLE ROW LEVEL SECURITY;

-- Delete all data
DELETE FROM branghunt_foodgraph_results;
DELETE FROM branghunt_detections;
DELETE FROM branghunt_images;
DELETE FROM branghunt_projects;

-- Re-enable RLS
ALTER TABLE branghunt_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE branghunt_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE branghunt_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE branghunt_foodgraph_results ENABLE ROW LEVEL SECURITY;

-- Verify
SELECT 'Projects' AS table_name, COUNT(*) AS rows FROM branghunt_projects
UNION ALL SELECT 'Images', COUNT(*) FROM branghunt_images
UNION ALL SELECT 'Detections', COUNT(*) FROM branghunt_detections
UNION ALL SELECT 'FoodGraph', COUNT(*) FROM branghunt_foodgraph_results;
*/

