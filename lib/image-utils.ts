/**
 * Image Utilities
 * Helpers for handling images stored as either S3 URLs or base64 data
 */

export interface ImageData {
  file_path: string | null;
  s3_url: string | null;
  storage_type?: 's3_url' | 'base64';
  mime_type?: string | null;
}

/**
 * Get the image URL for display
 * Handles both S3 URLs and base64 encoded images
 * 
 * @param image - Image data from database
 * @returns URL or data URI for the image
 */
export function getImageUrl(image: ImageData): string {
  // Check storage type if available
  if (image.storage_type === 's3_url' && image.s3_url) {
    return image.s3_url;
  }
  
  if (image.storage_type === 'base64' && image.file_path) {
    const mimeType = image.mime_type || 'image/jpeg';
    return `data:${mimeType};base64,${image.file_path}`;
  }
  
  // Fallback: Determine by which field has data
  if (image.s3_url) {
    return image.s3_url;
  }
  
  if (image.file_path) {
    // Legacy: file_path contains base64
    const mimeType = image.mime_type || 'image/jpeg';
    return `data:${mimeType};base64,${image.file_path}`;
  }
  
  // No image data available
  return '';
}

/**
 * Get the image data for processing (base64)
 * If stored as S3 URL, this will need to be fetched
 * 
 * @param image - Image data from database
 * @returns Base64 encoded image data
 */
export function getImageBase64(image: ImageData): string | null {
  if (image.storage_type === 'base64' && image.file_path) {
    return image.file_path;
  }
  
  if (!image.s3_url && image.file_path) {
    // Legacy: file_path contains base64
    return image.file_path;
  }
  
  // For S3 URLs, the backend will need to fetch the image
  return null;
}

/**
 * Check if image needs to be fetched from S3
 * 
 * @param image - Image data from database
 * @returns True if image is stored as S3 URL
 */
export function isS3Image(image: ImageData): boolean {
  return image.storage_type === 's3_url' || (!image.file_path && !!image.s3_url);
}

