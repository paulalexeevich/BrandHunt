import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Read file as base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    // Get image dimensions using a simple approach
    let width: number | null = null;
    let height: number | null = null;

    // Store image metadata in Supabase
    const { data, error } = await supabase
      .from('branghunt_images')
      .insert({
        original_filename: file.name,
        file_path: base64, // Store base64 directly for simplicity
        file_size: file.size,
        mime_type: file.type,
        width,
        height,
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
      message: 'Image uploaded successfully' 
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

