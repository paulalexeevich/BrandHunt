/**
 * Type definitions for FoodGraph integration
 */

import type { ProcessingStage, MatchStatus } from './batch';

/**
 * FoodGraph product result stored in database
 */
export interface FoodGraphResult {
  id: string;
  detection_id: string;
  product_gtin: string;
  product_name: string;
  front_image_url: string;
  is_match: boolean;
  processing_stage: ProcessingStage;
  match_status: MatchStatus | null;
  match_reason: string | null;
  created_at: string;
  // Full API response data
  full_data?: FoodGraphProductData;
}

/**
 * Full product data from FoodGraph API
 */
export interface FoodGraphProductData {
  title: string;
  companyBrand: string;
  measures: string;
  keys: {
    GTIN14: string;
    [key: string]: string;
  };
  [key: string]: any;
}

/**
 * Extracted fields from FoodGraph result (for display)
 */
export interface FoodGraphDisplayFields {
  brand: string;
  size: string;
  title: string;
  gtin: string | null;
}

/**
 * FoodGraph search options
 */
export interface FoodGraphSearchOptions {
  brand?: string;
  productName?: string;
  category?: string;
  limit?: number;
}

/**
 * Pre-filter criteria
 */
export interface PreFilterCriteria {
  requiredBrandMatch?: boolean;
  requiredCategoryMatch?: boolean;
  minTitleSimilarity?: number;
  productName?: string;
  brandName?: string;
  category?: string;
}

/**
 * Visual match selection options
 */
export interface VisualMatchOptions {
  minConfidence?: number;
  candidates: FoodGraphResult[];
  croppedImage: string;
  extractedInfo?: {
    brand?: string;
    productName?: string;
    size?: string;
    flavor?: string;
  };
}

