/**
 * TypeScript interfaces for the Analyze page
 * Extracted from app/analyze/[imageId]/page.tsx for better maintainability
 */

export interface BoundingBox {
  y0: number;
  x0: number;
  y1: number;
  x1: number;
}

export interface Detection {
  id: string;
  detection_index: number;
  bounding_box: BoundingBox;
  label: string | null;
  // Classification fields
  is_product: boolean | null;
  extraction_notes: string | null;
  // Product fields
  brand_name: string | null;
  category: string | null;
  sku: string | null;
  product_name: string | null;
  flavor: string | null;
  size: string | null;
  description: string | null;
  // Confidence scores
  brand_confidence: number | null;
  product_name_confidence: number | null;
  category_confidence: number | null;
  flavor_confidence: number | null;
  size_confidence: number | null;
  description_confidence: number | null;
  sku_confidence: number | null;
  // Price fields
  price: string | null;
  price_currency: string | null;
  price_confidence: number | null;
  // FoodGraph match fields
  selected_foodgraph_gtin: string | null;
  selected_foodgraph_product_name: string | null;
  selected_foodgraph_brand_name: string | null;
  selected_foodgraph_category: string | null;
  selected_foodgraph_image_url: string | null;
  selected_foodgraph_result_id: string | null;
  selection_method: 'visual_matching' | 'auto_select' | 'consolidation' | null;
  fully_analyzed: boolean | null;
  analysis_completed_at: string | null;
  foodgraph_results?: FoodGraphResult[];
  // Contextual analysis fields
  corrected_by_contextual: boolean | null;
  contextual_correction_notes: string | null;
}

export interface FoodGraphResult {
  id: string;
  key?: string;
  title?: string;
  product_name: string | null;
  brand_name: string | null;
  front_image_url: string | null;
  result_rank: number;
  is_match?: boolean | null;
  match_confidence?: number | null;
  processing_stage?: 'search' | 'pre_filter' | 'ai_filter' | 'visual_match' | null;
  match_status?: 'identical' | 'almost_same' | 'not_match' | null;
  visual_similarity?: number | null;
  match_reason?: string | null;
  companyBrand?: string | null;
  companyManufacturer?: string | null;
  measures?: string | null;
  category?: string | null;
  ingredients?: string;
}

export interface ImageData {
  id: string;
  original_filename: string;
  file_path: string | null;
  s3_url: string | null;
  storage_type?: 's3_url' | 'base64';
  mime_type?: string | null;
  processing_status: string;
  store_name?: string | null;
  project_id?: string | null;
}

export type FilterType = 'all' | 'not_product' | 'processed' | 'not_identified' | 'one_match' | 'no_match' | 'multiple_matches';

export type ProcessingStage = 'search' | 'pre_filter' | 'ai_filter' | 'visual_match';

export interface StageStats {
  search: number;
  pre_filter: number;
  ai_filter: number;
  visual_match: number;
}

