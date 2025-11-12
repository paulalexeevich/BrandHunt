/**
 * Type definitions for batch processing operations
 */

export interface BatchProcessingRequest {
  imageId?: string;
  projectId?: string;
  concurrency?: number;
  skipNonProducts?: boolean;
}

export type BatchResultStatus = 'success' | 'error' | 'no_match' | 'skipped';

export interface BatchItemResult {
  detectionId: string;
  detectionIndex: number;
  status: BatchResultStatus;
  productName?: string;
  brandName?: string;
  message?: string;
  error?: string;
  savedMatch?: {
    productName: string;
    brandName: string;
    gtin: string;
    imageUrl: string;
  };
}

export interface BatchProgressUpdate {
  type: 'start' | 'progress' | 'complete' | 'error';
  message?: string;
  processed?: number;
  total?: number;
  success?: number;
  noMatch?: number;
  errors?: number;
  // Item-level details
  detectionIndex?: number;
  detectionId?: string;
  stage?: string;
  currentProduct?: string;
  // Results array
  results?: BatchItemResult[];
}

export interface BatchCompleteResult {
  success: number;
  noMatch: number;
  errors: number;
  details: BatchItemResult[];
  duration?: number;
}

/**
 * Processing stages for pipelines
 */
export type ProcessingStage = 'search' | 'pre_filter' | 'ai_filter' | 'visual_match';

/**
 * Match status from AI filtering
 */
export type MatchStatus = 'identical' | 'almost_same' | 'not_match';

/**
 * Selection method for matched products
 */
export type SelectionMethod = 'auto_select' | 'consolidation' | 'visual_matching' | 'manual';

