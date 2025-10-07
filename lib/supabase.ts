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
  confidence_score: number | null;
  brand_name: string | null;
  category: string | null;
  sku: string | null;
  brand_extraction_prompt: string | null;
  brand_extraction_response: string | null;
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

