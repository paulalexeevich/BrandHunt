import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface BranghuntImage {
  id: string;
  original_filename: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  uploaded_at: string;
  processed: boolean;
  processing_status: string;
  is_blurry: boolean | null;
  blur_confidence: number | null;
  estimated_product_count: number | null;
  product_count_confidence: number | null;
  quality_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BranghuntDetection {
  id: string;
  image_id: string;
  detection_index: number;
  bounding_box: {
    y0: number;
    x0: number;
    y1: number;
    x1: number;
  };
  label: string | null; // Initial detection label
  confidence_score: number | null;
  // Classification fields
  is_product: boolean | null; // Whether this is actually a product
  details_visible: boolean | null; // Whether product details are visible
  extraction_notes: string | null; // Notes about extraction quality/issues
  // Product fields
  brand_name: string | null;
  category: string | null;
  sku: string | null;
  product_name: string | null; // Full product name
  flavor: string | null; // Flavor or variant
  size: string | null; // Size or weight
  description: string | null; // Product description
  // Confidence scores
  brand_confidence: number | null;
  product_name_confidence: number | null;
  category_confidence: number | null;
  flavor_confidence: number | null;
  size_confidence: number | null;
  description_confidence: number | null;
  sku_confidence: number | null;
  // Price fields
  price: string | null; // Extracted price value
  price_currency: string | null; // Currency code (USD, EUR, etc.)
  price_confidence: number | null; // Confidence score for price extraction
  brand_extraction_prompt: string | null;
  brand_extraction_response: string | null;
  // Saved FoodGraph match columns
  selected_foodgraph_gtin: string | null;
  selected_foodgraph_product_name: string | null;
  selected_foodgraph_brand_name: string | null;
  selected_foodgraph_category: string | null;
  selected_foodgraph_image_url: string | null;
  selected_foodgraph_result_id: string | null;
  selection_method: 'visual_matching' | 'auto_select' | 'consolidation' | null;
  fully_analyzed: boolean | null;
  analysis_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BranghuntFoodGraphResult {
  id: string;
  detection_id: string;
  search_term: string;
  result_rank: number;
  product_gtin: string | null;
  product_name: string | null;
  brand_name: string | null;
  category: string | null;
  front_image_url: string | null;
  full_data: Record<string, unknown>;
  created_at: string;
}

