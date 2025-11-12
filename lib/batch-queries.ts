/**
 * Common database queries for batch processing
 * Centralizes filtering logic to avoid duplication
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DetectionFilters {
  /** Filter by image ID */
  imageId?: string;
  /** Filter by project ID (fetches across all images in project) */
  projectId?: string;
  /** Include only products (true), non-products (false), or all (null) */
  isProduct?: boolean | null;
  /** Require brand_name to be set */
  hasExtractedInfo?: boolean;
  /** Require fully_analyzed to be true */
  fullyAnalyzed?: boolean;
  /** Require NOT fully_analyzed (pending items) */
  notFullyAnalyzed?: boolean;
  /** Filter by specific detection IDs */
  detectionIds?: string[];
}

/**
 * Fetch detections with common filters
 * Handles the complex .or() logic for is_product filtering
 * 
 * @example
 * // Get all products in an image that need FoodGraph search
 * const detections = await fetchDetections(supabase, {
 *   imageId: 'img-123',
 *   isProduct: true,
 *   hasExtractedInfo: true,
 *   notFullyAnalyzed: true
 * });
 */
export async function fetchDetections(
  supabase: SupabaseClient,
  filters: DetectionFilters
) {
  let query = supabase
    .from('branghunt_detections')
    .select('*')
    .order('detection_index', { ascending: true });

  // Image or Project filter
  if (filters.imageId) {
    query = query.eq('image_id', filters.imageId);
  }
  
  if (filters.detectionIds && filters.detectionIds.length > 0) {
    query = query.in('id', filters.detectionIds);
  }

  // Product filter (handles NULL values correctly)
  if (filters.isProduct === true) {
    // Include both NULL (not yet classified) and TRUE (confirmed products)
    // Exclude only FALSE (confirmed non-products)
    query = query.or('is_product.is.null,is_product.eq.true');
  } else if (filters.isProduct === false) {
    // Only confirmed non-products
    query = query.eq('is_product', false);
  }
  // If null or undefined, include all (no filter)

  // Extracted info filter
  if (filters.hasExtractedInfo === true) {
    query = query.not('brand_name', 'is', null);
  } else if (filters.hasExtractedInfo === false) {
    query = query.is('brand_name', null);
  }

  // Fully analyzed filters
  if (filters.fullyAnalyzed) {
    query = query.eq('fully_analyzed', true);
  } else if (filters.notFullyAnalyzed) {
    query = query.or('fully_analyzed.is.null,fully_analyzed.eq.false');
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch detections: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetch detections across multiple images in a project
 * Returns Map<imageId, Detection[]> for efficient lookup
 */
export async function fetchDetectionsByProject(
  supabase: SupabaseClient,
  projectId: string,
  filters: Omit<DetectionFilters, 'imageId' | 'projectId'> = {}
) {
  // First, fetch all images in project
  const { data: images, error: imagesError } = await supabase
    .from('branghunt_images')
    .select('id')
    .eq('project_id', projectId);

  if (imagesError) {
    throw new Error(`Failed to fetch images: ${imagesError.message}`);
  }

  if (!images || images.length === 0) {
    return { detections: [], imageMap: new Map(), imageIds: [] };
  }

  const imageIds = images.map(img => img.id);

  // Fetch all detections for these images
  let query = supabase
    .from('branghunt_detections')
    .select('*')
    .in('image_id', imageIds)
    .order('detection_index', { ascending: true });

  // Apply other filters
  if (filters.isProduct === true) {
    query = query.or('is_product.is.null,is_product.eq.true');
  } else if (filters.isProduct === false) {
    query = query.eq('is_product', false);
  }

  if (filters.hasExtractedInfo === true) {
    query = query.not('brand_name', 'is', null);
  } else if (filters.hasExtractedInfo === false) {
    query = query.is('brand_name', null);
  }

  if (filters.fullyAnalyzed) {
    query = query.eq('fully_analyzed', true);
  } else if (filters.notFullyAnalyzed) {
    query = query.or('fully_analyzed.is.null,fully_analyzed.eq.false');
  }

  const { data: detections, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch detections: ${error.message}`);
  }

  // Create map for efficient image lookup
  const imageMap = new Map();
  for (const detection of detections || []) {
    if (!imageMap.has(detection.image_id)) {
      imageMap.set(detection.image_id, []);
    }
    imageMap.get(detection.image_id).push(detection);
  }

  return {
    detections: detections || [],
    imageMap,
    imageIds
  };
}

/**
 * Fetch image data for detections
 * Returns Map<imageId, ImageData> for efficient lookup
 */
export async function fetchImagesForDetections(
  supabase: SupabaseClient,
  imageIds: string[]
) {
  if (imageIds.length === 0) {
    return new Map();
  }

  const { data: images, error } = await supabase
    .from('branghunt_images')
    .select('id, s3_url, file_path, storage_type, mime_type, original_filename, width, height')
    .in('id', imageIds);

  if (error) {
    throw new Error(`Failed to fetch images: ${error.message}`);
  }

  const imageMap = new Map();
  for (const img of images || []) {
    imageMap.set(img.id, img);
  }

  return imageMap;
}

/**
 * Count detections matching filters
 * Useful for showing counts before processing
 */
export async function countDetections(
  supabase: SupabaseClient,
  filters: DetectionFilters
): Promise<number> {
  let query = supabase
    .from('branghunt_detections')
    .select('id', { count: 'exact', head: true });

  if (filters.imageId) {
    query = query.eq('image_id', filters.imageId);
  }

  if (filters.detectionIds && filters.detectionIds.length > 0) {
    query = query.in('id', filters.detectionIds);
  }

  if (filters.isProduct === true) {
    query = query.or('is_product.is.null,is_product.eq.true');
  } else if (filters.isProduct === false) {
    query = query.eq('is_product', false);
  }

  if (filters.hasExtractedInfo === true) {
    query = query.not('brand_name', 'is', null);
  } else if (filters.hasExtractedInfo === false) {
    query = query.is('brand_name', null);
  }

  if (filters.fullyAnalyzed) {
    query = query.eq('fully_analyzed', true);
  } else if (filters.notFullyAnalyzed) {
    query = query.or('fully_analyzed.is.null,fully_analyzed.eq.false');
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to count detections: ${error.message}`);
  }

  return count || 0;
}

