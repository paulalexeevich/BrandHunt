# Changelog

All notable changes to BrangHunt will be documented in this file.

## [Unreleased] - 2025-10-07

### Added
- **SKU Extraction**: Added SKU (Stock Keeping Unit) extraction to product detection workflow
  - Updated Gemini API prompt to extract brand, category, AND SKU from product images
  - Added `sku` column to `branghunt_detections` database table
  - Updated TypeScript interfaces across all components
  - Enhanced UI to display SKU information in analysis and results pages
  - SKU displays with blue color highlighting to differentiate from other fields
  - Shows "Unknown" as fallback when SKU cannot be determined

### Changed
- Updated `ProductInfo` interface to include SKU field
- Modified `extractProductInfo` function prompt to request 3 data points (brand, category, SKU)
- Updated all API routes to handle SKU data
- Enhanced product information display in UI components
- Updated PROJECT_SUMMARY.md to reflect SKU addition

### Technical Details
- Database migration: `migrations/add_sku_column.sql`
- Files modified:
  - `lib/gemini.ts` - Added SKU to ProductInfo interface and extraction prompt
  - `lib/supabase.ts` - Added SKU to BranghuntDetection interface
  - `app/api/detect/route.ts` - Initialize SKU as null for new detections
  - `app/api/extract-brand/route.ts` - Store and return SKU in API response
  - `app/analyze/[imageId]/page.tsx` - Display SKU in bounding box labels and product list
  - `app/results/[imageId]/page.tsx` - Display SKU in product information panel
  - `PROJECT_SUMMARY.md` - Updated schema documentation

## [1.0.0] - 2025-10-07

### Initial Release
- Complete AI-powered product detection system
- Google Gemini 2.5 Flash integration for object detection
- Brand name and category extraction
- FoodGraph API integration for product catalog search
- Interactive bounding box visualization
- Comprehensive database schema with Supabase
- Image upload with preview
- Gallery and results pages
- Full documentation (README, SETUP_GUIDE, DEVELOPMENT_NOTES)

