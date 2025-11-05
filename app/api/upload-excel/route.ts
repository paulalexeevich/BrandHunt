import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthenticatedSupabaseClient } from '@/lib/auth';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  console.log('[Upload Excel] Starting Excel upload process...');
  try {
    // Require authentication
    console.log('[Upload Excel] Checking authentication...');
    const user = await requireAuth();
    console.log('[Upload Excel] User authenticated:', user.id);

    // Create authenticated Supabase client with user session
    const supabase = await createAuthenticatedSupabaseClient();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No Excel file provided' }, { status: 400 });
    }

    // Validate file type
    const validExtensions = ['.xlsx', '.xls'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(fileExtension)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' 
      }, { status: 400 });
    }

    console.log('[Upload Excel] Reading Excel file:', file.name);
    
    // Read Excel file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);
    
    console.log('[Upload Excel] Parsed', jsonData.length, 'rows from Excel');

    if (jsonData.length === 0) {
      return NextResponse.json({ 
        error: 'Excel file is empty or has no data rows' 
      }, { status: 400 });
    }

    // Track results
    const results = {
      total: jsonData.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ row: number; error: string; storeName?: string }>,
    };

    // Process each row
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNumber = i + 2; // Excel row number (accounting for header)

      try {
        // Extract required fields
        const imageUrl = row['Probe Image Path'];
        const storeName = row['Store Name'];

        // Validate required fields
        if (!imageUrl) {
          results.failed++;
          results.errors.push({ 
            row: rowNumber, 
            error: 'Missing "Probe Image Path" column',
            storeName 
          });
          continue;
        }

        if (!storeName) {
          results.failed++;
          results.errors.push({ 
            row: rowNumber, 
            error: 'Missing "Store Name" column',
            storeName 
          });
          continue;
        }

        console.log(`[Upload Excel] Processing row ${rowNumber}: ${storeName}`);

        // Fetch image from URL
        let base64: string;
        let fileSize: number;
        let mimeType: string;
        let filename: string;

        try {
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          base64 = buffer.toString('base64');
          fileSize = buffer.length;
          mimeType = response.headers.get('content-type') || 'image/jpeg';

          // Extract filename from URL
          const urlParts = imageUrl.split('/');
          filename = urlParts[urlParts.length - 1] || `image-${rowNumber}.jpg`;

          // Validate it's an image
          if (!mimeType.startsWith('image/')) {
            throw new Error('URL does not point to an image');
          }
        } catch (fetchError) {
          results.failed++;
          results.errors.push({ 
            row: rowNumber, 
            error: `Failed to fetch image: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
            storeName 
          });
          continue;
        }

        // Store image metadata in Supabase with store_name
        const { error: dbError } = await supabase
          .from('branghunt_images')
          .insert({
            user_id: user.id,
            original_filename: filename,
            file_path: base64,
            file_size: fileSize,
            mime_type: mimeType,
            store_name: storeName,
            width: null,
            height: null,
            processing_status: 'pending',
            processed: false,
          });

        if (dbError) {
          console.error(`[Upload Excel] Database error for row ${rowNumber}:`, dbError);
          results.failed++;
          results.errors.push({ 
            row: rowNumber, 
            error: `Database error: ${dbError.message}`,
            storeName 
          });
          continue;
        }

        results.successful++;
        console.log(`[Upload Excel] Row ${rowNumber} uploaded successfully`);

      } catch (rowError) {
        console.error(`[Upload Excel] Error processing row ${rowNumber}:`, rowError);
        results.failed++;
        results.errors.push({ 
          row: rowNumber, 
          error: rowError instanceof Error ? rowError.message : 'Unknown error',
          storeName: row['Store Name'] 
        });
      }
    }

    console.log('[Upload Excel] Completed:', results);

    return NextResponse.json({ 
      success: true,
      message: `Processed ${results.total} rows: ${results.successful} successful, ${results.failed} failed`,
      results,
    });

  } catch (error) {
    console.error('[Upload Excel] Fatal error:', error);
    
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ 
        error: 'Authentication required',
        details: 'Please log in to upload images'
      }, { status: 401 });
    }

    return NextResponse.json({ 
      error: 'Excel upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Enable Node.js runtime for Fluid Compute
export const runtime = 'nodejs';
// Set timeout to 5 minutes for large Excel files with many images
export const maxDuration = 300;

