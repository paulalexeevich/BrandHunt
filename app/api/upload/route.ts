import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthenticatedSupabaseClient } from '@/lib/auth';

export async function POST(request: NextRequest) {
  console.log('[Upload] Starting upload process...');
  try {
    // Require authentication
    console.log('[Upload] Checking authentication...');
    const user = await requireAuth();
    console.log('[Upload] User authenticated:', user.id);

    // Create authenticated Supabase client with user session
    const supabase = await createAuthenticatedSupabaseClient();

    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const imageUrl = formData.get('imageUrl') as string | null;
    const storeName = formData.get('storeName') as string | null;
    const projectId = formData.get('projectId') as string | null;

    if (!file && !imageUrl) {
      return NextResponse.json({ error: 'No file or URL provided' }, { status: 400 });
    }

    let base64: string | null = null;
    let filename: string;
    let fileSize: number;
    let mimeType: string;
    let storageType: 's3_url' | 'base64' = 'base64';
    let s3Url: string | null = null;

    if (imageUrl) {
      // Store S3 URL directly without fetching/converting to base64
      console.log('[Upload] Storing S3 URL directly:', imageUrl);
      
      // Extract filename from URL
      const urlParts = imageUrl.split('/');
      filename = urlParts[urlParts.length - 1] || 'image-from-url.jpg';
      
      // Store the S3 URL
      s3Url = imageUrl;
      storageType = 's3_url';
      
      // Try to fetch just the headers to get file size and mime type (HEAD request is faster)
      try {
        const response = await fetch(imageUrl, { method: 'HEAD' });
        if (!response.ok) {
          console.warn('[Upload] Failed to fetch image metadata, using defaults');
          fileSize = 0;
          mimeType = 'image/jpeg';
        } else {
          const contentLength = response.headers.get('content-length');
          fileSize = contentLength ? parseInt(contentLength) : 0;
          mimeType = response.headers.get('content-type') || 'image/jpeg';
          
          // Validate it's an image
          if (!mimeType.startsWith('image/')) {
            return NextResponse.json({ error: 'URL does not point to an image' }, { status: 400 });
          }
        }
      } catch (error) {
        console.warn('[Upload] Failed to fetch image metadata:', error);
        // Continue with defaults
        fileSize = 0;
        mimeType = 'image/jpeg';
      }
    } else if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
      }

      // Read file as base64 (legacy mode for local file uploads)
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      base64 = buffer.toString('base64');
      filename = file.name;
      fileSize = file.size;
      mimeType = file.type;
      storageType = 'base64';
    } else {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Store image metadata in Supabase
    console.log('[Upload] Saving to database...');
    console.log('[Upload] Storage type:', storageType);
    console.log('[Upload] Image size:', fileSize, 'bytes, MIME:', mimeType);
    if (storeName) {
      console.log('[Upload] Store name:', storeName);
    }
    if (projectId) {
      console.log('[Upload] Project ID:', projectId);
    }
    if (s3Url) {
      console.log('[Upload] S3 URL:', s3Url);
    }
    
    const { data, error } = await supabase
      .from('branghunt_images')
      .insert({
        user_id: user.id,
        original_filename: filename,
        file_path: base64,
        s3_url: s3Url,
        storage_type: storageType,
        file_size: fileSize,
        mime_type: mimeType,
        store_name: storeName || null,
        project_id: projectId || null,
        width: null,
        height: null,
        status: 'uploaded',
        processing_status: 'pending',
        processed: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[Upload] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to save image' }, { status: 500 });
    }

    console.log('[Upload] Image saved successfully! ID:', data.id);
    return NextResponse.json({ 
      success: true, 
      imageId: data.id,
      message: 'Image uploaded successfully',
      source: imageUrl ? 'url' : 'file'
    });
  } catch (error) {
    console.error('Upload error:', error);
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ 
        error: 'Authentication required',
        details: 'Please log in to upload images'
      }, { status: 401 });
    }
    return NextResponse.json({ 
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Enable Node.js runtime for Fluid Compute
export const runtime = 'nodejs';
// Set timeout to 30 seconds for large image uploads
export const maxDuration = 30;
