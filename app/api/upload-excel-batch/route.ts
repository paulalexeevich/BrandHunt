import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthenticatedSupabaseClient } from '@/lib/auth';

interface BatchRow {
  imageUrl: string;
  storeName: string;
  rowNumber: number;
}

interface BatchUploadRequest {
  rows: BatchRow[];
  projectId?: string;
  batchNumber: number;
  totalBatches: number;
}

export async function POST(request: NextRequest) {
  console.log('[Upload Excel Batch] Starting batch upload...');
  try {
    // Require authentication
    const user = await requireAuth();
    console.log('[Upload Excel Batch] User authenticated:', user.id);

    // Create authenticated Supabase client with user session
    const supabase = await createAuthenticatedSupabaseClient();

    const body: BatchUploadRequest = await request.json();
    const { rows, projectId, batchNumber, totalBatches } = body;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided in batch' }, { status: 400 });
    }

    console.log(`[Upload Excel Batch] Processing batch ${batchNumber}/${totalBatches} with ${rows.length} rows`);

    // Process single row (extracted for parallel processing)
    const processRow = async (row: BatchRow) => {
      const { imageUrl, storeName, rowNumber } = row;

      // Validate required fields
      if (!imageUrl) {
        return { 
          success: false, 
          row: rowNumber, 
          error: 'Missing image URL',
          storeName 
        };
      }

      if (!storeName) {
        return { 
          success: false, 
          row: rowNumber, 
          error: 'Missing store name',
          storeName 
        };
      }

      console.log(`[Upload Excel Batch] Processing row ${rowNumber}: ${storeName}`);

      // Store S3 URL directly without fetching
      let fileSize: number = 0;
      let mimeType: string = 'image/jpeg';
      let filename: string;

      // Extract filename from URL
      const urlParts = imageUrl.split('/');
      filename = urlParts[urlParts.length - 1] || `image-${rowNumber}.jpg`;

      // Try to fetch just headers (HEAD request) to get file size and mime type
      try {
        const response = await fetch(imageUrl, { method: 'HEAD' });
        if (response.ok) {
          const contentLength = response.headers.get('content-length');
          fileSize = contentLength ? parseInt(contentLength) : 0;
          mimeType = response.headers.get('content-type') || 'image/jpeg';

          // Validate it's an image
          if (!mimeType.startsWith('image/')) {
            return { 
              success: false, 
              row: rowNumber, 
              error: 'URL does not point to an image',
              storeName 
            };
          }
        }
      } catch (fetchError) {
        console.warn(`[Upload Excel Batch] Failed to fetch metadata for row ${rowNumber}, using defaults:`, fetchError);
        // Continue with defaults - don't fail the upload
      }

      // Store image metadata in Supabase
      try {
        const { error: dbError } = await supabase
          .from('branghunt_images')
          .insert({
            user_id: user.id,
            original_filename: filename,
            file_path: null,
            s3_url: imageUrl,
            storage_type: 's3_url',
            file_size: fileSize,
            mime_type: mimeType,
            store_name: storeName,
            project_id: projectId || null,
            width: null,
            height: null,
            processing_status: 'pending',
            processed: false,
          });

        if (dbError) {
          console.error(`[Upload Excel Batch] Database error for row ${rowNumber}:`, dbError);
          return { 
            success: false, 
            row: rowNumber, 
            error: `Database error: ${dbError.message}`,
            storeName 
          };
        }

        console.log(`[Upload Excel Batch] Row ${rowNumber} uploaded successfully`);
        return { success: true, row: rowNumber, storeName };
      } catch (dbError) {
        return { 
          success: false, 
          row: rowNumber, 
          error: dbError instanceof Error ? dbError.message : 'Database error',
          storeName 
        };
      }
    };

    // Process all rows in parallel using Promise.allSettled
    console.log(`[Upload Excel Batch] Starting parallel processing of ${rows.length} images...`);
    const startTime = Date.now();
    
    const rowResults = await Promise.allSettled(
      rows.map(row => processRow(row))
    );

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Upload Excel Batch] Parallel processing completed in ${processingTime}s`);

    // Collect results
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; storeName?: string }>,
    };

    rowResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const rowResult = result.value;
        if (rowResult.success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push({
            row: rowResult.row,
            error: rowResult.error || 'Unknown error',
            storeName: rowResult.storeName
          });
        }
      } else {
        // Promise was rejected (shouldn't happen with our error handling, but just in case)
        results.failed++;
        results.errors.push({
          row: rows[index].rowNumber,
          error: result.reason instanceof Error ? result.reason.message : 'Promise rejected',
          storeName: rows[index].storeName
        });
      }
    });

    console.log(`[Upload Excel Batch] Batch ${batchNumber}/${totalBatches} completed:`, results);
    console.log(`[Upload Excel Batch] Processing speed: ${(rows.length / parseFloat(processingTime)).toFixed(2)} images/second`);

    return NextResponse.json({ 
      success: true,
      batchNumber,
      totalBatches,
      results,
    });

  } catch (error) {
    console.error('[Upload Excel Batch] Fatal error:', error);
    
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ 
        error: 'Authentication required',
        details: 'Please log in to upload images'
      }, { status: 401 });
    }

    return NextResponse.json({ 
      error: 'Batch upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Enable Node.js runtime for Fluid Compute
export const runtime = 'nodejs';
// Set timeout to 2 minutes per batch (50 images * ~2s each = 100s + buffer)
export const maxDuration = 120;

