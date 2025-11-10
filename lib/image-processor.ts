/**
 * Image Processor Utilities
 * Helper functions for processing images from either S3 URLs or base64 storage
 */

export interface ProcessableImage {
  file_path: string | null;
  s3_url: string | null;
  storage_type?: 's3_url' | 'base64';
  mime_type?: string | null;
}

/**
 * Get base64-encoded image data for processing
 * Handles both S3 URLs (fetches) and base64 storage (returns directly)
 * 
 * @param image - Image data from database
 * @returns Base64-encoded image string (without data URI prefix)
 * @throws Error if image cannot be fetched or no image data available
 */
export async function getImageBase64ForProcessing(image: ProcessableImage): Promise<string> {
  // Case 1: S3 URL storage - need to fetch the image
  if (image.storage_type === 's3_url' && image.s3_url) {
    console.log(`[Image Processor] Fetching S3 image: ${image.s3_url}`);
    try {
      const response = await fetch(image.s3_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch S3 image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      
      console.log(`[Image Processor] Successfully fetched S3 image (${buffer.length} bytes)`);
      return base64;
    } catch (error) {
      console.error('[Image Processor] Error fetching S3 image:', error);
      throw new Error(`Failed to fetch image from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Case 2: Base64 storage - return directly
  if (image.file_path) {
    console.log('[Image Processor] Using base64 image from file_path');
    return image.file_path;
  }

  // Case 3: S3 URL but no storage_type set (fallback)
  if (image.s3_url) {
    console.log(`[Image Processor] Fetching S3 image (fallback): ${image.s3_url}`);
    try {
      const response = await fetch(image.s3_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch S3 image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return buffer.toString('base64');
    } catch (error) {
      console.error('[Image Processor] Error fetching S3 image:', error);
      throw new Error(`Failed to fetch image from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // No image data available
  throw new Error('No image data available (neither file_path nor s3_url)');
}

/**
 * Check if image needs to be fetched from S3
 * Useful for caching decisions
 * 
 * @param image - Image data from database
 * @returns True if image is stored as S3 URL
 */
export function requiresS3Fetch(image: ProcessableImage): boolean {
  return image.storage_type === 's3_url' || (!image.file_path && !!image.s3_url);
}

/**
 * Get mime type for image processing
 * 
 * @param image - Image data from database
 * @returns Mime type string (defaults to 'image/jpeg')
 */
export function getImageMimeType(image: ProcessableImage): string {
  return image.mime_type || 'image/jpeg';
}

