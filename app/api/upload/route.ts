import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();

    // Create authenticated Supabase client with user session
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch (error) {
              // Ignore - setAll can be called from API routes
            }
          },
        },
      }
    );

    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const imageUrl = formData.get('imageUrl') as string | null;

    if (!file && !imageUrl) {
      return NextResponse.json({ error: 'No file or URL provided' }, { status: 400 });
    }

    let base64: string;
    let filename: string;
    let fileSize: number;
    let mimeType: string;

    if (imageUrl) {
      // Fetch image from S3 URL
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          return NextResponse.json({ error: 'Failed to fetch image from URL' }, { status: 400 });
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        base64 = buffer.toString('base64');
        
        // Extract filename from URL
        const urlParts = imageUrl.split('/');
        filename = urlParts[urlParts.length - 1] || 'image-from-url.jpg';
        fileSize = buffer.length;
        mimeType = response.headers.get('content-type') || 'image/jpeg';

        // Validate it's an image
        if (!mimeType.startsWith('image/')) {
          return NextResponse.json({ error: 'URL does not point to an image' }, { status: 400 });
        }
      } catch (error) {
        console.error('Error fetching image from URL:', error);
        return NextResponse.json({ error: 'Failed to fetch image from URL' }, { status: 400 });
      }
    } else if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
      }

      // Read file as base64
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      base64 = buffer.toString('base64');
      filename = file.name;
      fileSize = file.size;
      mimeType = file.type;
    } else {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Store image metadata in Supabase
    const { data, error } = await supabase
      .from('branghunt_images')
      .insert({
        user_id: user.id,
        original_filename: filename,
        file_path: base64,
        file_size: fileSize,
        mime_type: mimeType,
        width: null,
        height: null,
        processing_status: 'pending',
        processed: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Failed to save image' }, { status: 500 });
    }

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
