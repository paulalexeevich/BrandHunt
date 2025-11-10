-- Check if match_reason column exists in branghunt_foodgraph_results table
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'branghunt_foodgraph_results'
  AND column_name = 'match_reason';

-- Also list all columns to see structure
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'branghunt_foodgraph_results'
ORDER BY ordinal_position;
