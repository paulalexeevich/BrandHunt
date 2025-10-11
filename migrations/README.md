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

### 2. add_product_details_columns.sql
**Date**: October 7, 2025  
**Description**: Adds comprehensive product information columns to branghunt_detections table

**Changes**:
- Adds `label`, `product_name`, `flavor`, `size`, `description` columns
- Captures all product information from Gemini AI
- Prevents data loss of product details

**Impact**: Non-breaking change - existing data remains intact

### 3. add_price_columns.sql
**Date**: October 7, 2025  
**Description**: Adds price extraction columns to branghunt_detections table

**Changes**:
- Adds `price`, `price_currency`, `price_confidence` columns
- Stores extracted price information from retail shelf images
- Supports multiple currencies

**Impact**: Non-breaking change - existing data remains intact

### 4. add_quality_validation_columns.sql
**Date**: October 11, 2025  
**Description**: Adds image quality validation columns to branghunt_images table

**Changes**:
- Adds `is_blurry`, `blur_confidence`, `estimated_product_count`, `product_count_confidence`, `quality_validated_at` columns
- Enables blur detection and product count validation before processing
- Includes indexes for faster filtering
- Prevents processing images with >50 products (Gemini API limitation)

**Impact**: Non-breaking change - existing data remains intact

## Migration History

| Date | File | Description | Status |
|------|------|-------------|--------|
| 2025-10-07 | add_sku_column.sql | Add SKU field to detections | ✅ Applied |
| 2025-10-07 | add_product_details_columns.sql | Add product detail fields | ✅ Applied |
| 2025-10-07 | add_price_columns.sql | Add price extraction fields | ✅ Applied |
| 2025-10-11 | add_quality_validation_columns.sql | Add image quality validation fields | ✅ Applied |

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

