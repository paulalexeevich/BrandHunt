-- Clear BrangHunt Data Tables
-- Date: November 9, 2025
-- Description: Clears all BrangHunt data tables while preserving table structure
--              and authentication/user data
-- 
-- IMPORTANT: This script will delete ALL BrangHunt data but keep:
--   - User accounts (auth.users)
--   - Authentication sessions
--   - Table structures, indexes, and policies
--
-- Order of deletion respects foreign key constraints:
--   1. branghunt_foodgraph_results (references detections)
--   2. branghunt_detections (references images)
--   3. branghunt_images (references projects)
--   4. branghunt_projects (root table)

-- =====================================================
-- DISABLE TRIGGERS (for performance)
-- =====================================================
SET session_replication_role = replica;

-- =====================================================
-- CLEAR DATA IN CORRECT ORDER
-- =====================================================

-- Step 1: Clear FoodGraph results (leaf table)
TRUNCATE TABLE branghunt_foodgraph_results CASCADE;

-- Step 2: Clear detections (depends on images)
TRUNCATE TABLE branghunt_detections CASCADE;

-- Step 3: Clear images (depends on projects)
TRUNCATE TABLE branghunt_images CASCADE;

-- Step 4: Clear projects (root table)
TRUNCATE TABLE branghunt_projects CASCADE;

-- =====================================================
-- RE-ENABLE TRIGGERS
-- =====================================================
SET session_replication_role = DEFAULT;

-- =====================================================
-- VERIFY TABLES ARE EMPTY
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
-- SUMMARY
-- =====================================================
-- All BrangHunt data has been cleared.
-- Table structures, indexes, and RLS policies remain intact.
-- User authentication data (auth.users) is preserved.
-- The branghunt_project_stats view will now return empty results.

