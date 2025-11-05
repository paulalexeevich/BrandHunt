import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 10;

// GET /api/projects/[projectId] - Get a single project with stats and images
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createAuthenticatedSupabaseClient();
    const { projectId } = await params;

    // Fetch project with statistics
    const { data: projectStats, error: statsError } = await supabase
      .from('branghunt_project_stats')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (statsError) {
      console.error('Error fetching project stats:', statsError);
      return NextResponse.json(
        { error: 'Project not found', details: statsError.message },
        { status: 404 }
      );
    }

    // Get page and limit from query params
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    // Fetch images for this project with detection counts (paginated)
    const { data: images, error: imagesError } = await supabase
      .from('branghunt_images')
      .select(`
        id,
        file_path,
        mime_type,
        width,
        height,
        store_name,
        status,
        detection_completed,
        detection_completed_at,
        created_at,
        detections:branghunt_detections(count)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (imagesError) {
      console.error('Error fetching project images:', imagesError);
      return NextResponse.json(
        { error: 'Failed to fetch project images', details: imagesError.message },
        { status: 500 }
      );
    }

    console.log(`Fetched ${images?.length || 0} images for project ${projectId} (page ${page}, limit ${limit})`);

    // Format images with proper data URIs
    const formattedImages = (images || []).map(img => ({
      ...img,
      image_data: `data:${img.mime_type};base64,${img.file_path}`
    }));

    // Calculate pagination metadata
    const totalImages = projectStats.total_images || 0;
    const totalPages = Math.ceil(totalImages / limit);

    return NextResponse.json({ 
      project: projectStats,
      images: formattedImages,
      pagination: {
        page,
        limit,
        total: totalImages,
        totalPages,
        hasMore: page < totalPages
      }
    });
  } catch (error) {
    console.error('Error in GET /api/projects/[projectId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[projectId] - Update a project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createAuthenticatedSupabaseClient();
    const { projectId } = await params;

    // Parse request body
    const body = await request.json();
    const { name, description } = body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    // Update project
    const { data: project, error } = await supabase
      .from('branghunt_projects')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
      })
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Error updating project:', error);
      return NextResponse.json(
        { error: 'Failed to update project', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error in PUT /api/projects/[projectId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId] - Delete a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createAuthenticatedSupabaseClient();
    const { projectId } = await params;

    // Delete project (CASCADE will handle related images)
    const { error } = await supabase
      .from('branghunt_projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
      return NextResponse.json(
        { error: 'Failed to delete project', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/projects/[projectId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

