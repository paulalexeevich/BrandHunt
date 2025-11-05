import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthenticatedSupabaseClient } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    const { data: images, error } = await supabase
      .from('branghunt_images')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
    }

    return NextResponse.json({ images });
  } catch (error) {
    console.error('Fetch error:', error);
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ 
        error: 'Authentication required',
        details: 'Please log in to view images'
      }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
  }
}





