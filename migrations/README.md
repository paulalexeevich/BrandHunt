# Database Migrations

This directory contains SQL migration scripts for the BrangHunt database.

## How to Apply Migrations

### Using Supabase Dashboard (Recommended)

1. Go to your Supabase project: https://supabase.com/dashboard/project/ybzoioqgbvcxqiejopja
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the contents of the migration file
5. Click **Run** to execute the migration

### Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project
supabase link --project-ref ybzoioqgbvcxqiejopja

# Run the migration
supabase db push
```

## Available Migrations

### 1. add_sku_column.sql
**Date**: October 7, 2025  
**Description**: Adds SKU (Stock Keeping Unit) column to branghunt_detections table

**Changes**:
- Adds `sku` column (TEXT, nullable) to `branghunt_detections` table
- SKU stores product identifiers, barcodes, UPC, or product codes extracted from images
- Automatically handles existing rows (sets to NULL)

**Impact**: Non-breaking change - existing data remains intact

## Migration History

| Date | File | Description | Status |
|------|------|-------------|--------|
| 2025-10-07 | add_sku_column.sql | Add SKU field to detections | ✅ Pending |

## Rollback Instructions

To remove the SKU column if needed:

```sql
ALTER TABLE branghunt_detections
DROP COLUMN IF EXISTS sku;
```

⚠️ **Warning**: This will permanently delete all SKU data. Make sure to backup data before rolling back.

## Verification

After applying the migration, verify it was successful:

```sql
-- Check if SKU column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'branghunt_detections'
  AND column_name = 'sku';
```

Expected output:
```
column_name | data_type | is_nullable
------------|-----------|-------------
sku         | text      | YES
```

## Notes

- All migrations are designed to be non-breaking
- Migrations use `IF NOT EXISTS` to safely re-run if needed
- Always test migrations on a development database first
- Keep migrations in version control for team synchronization

