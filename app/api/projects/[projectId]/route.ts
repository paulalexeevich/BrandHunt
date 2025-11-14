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

    // Fetch model selections from branghunt_projects table
    const { data: projectData, error: projectError } = await supabase
      .from('branghunt_projects')
      .select('extraction_model, visual_match_model')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('Error fetching project data:', projectError);
      // Continue without model data if this fails
    }

    // Get page and limit from query params
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10'); // Reduced to 10 for better performance
    const offset = (page - 1) * limit;

    // Fetch images for this project (paginated)
    // Using smaller page size (10) to avoid loading too much base64 data at once
    const { data: images, error: imagesError } = await supabase
      .from('branghunt_images')
      .select(`
        id,
        file_path,
        s3_url,
        storage_type,
        mime_type,
        width,
        height,
        store_name,
        status,
        detection_completed,
        detection_completed_at,
        created_at
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

    console.log(`[DEBUG] Images query result: ${images?.length || 0} images`);
    if (images?.length === 0) {
      console.log(`[DEBUG] No images returned - possible RLS issue`);
      console.log(`[DEBUG] Query: project_id=${projectId}, offset=${offset}, limit=${limit}`);
      
      // Try to fetch without project filter to debug RLS
      const { data: testImages, error: testError } = await supabase
        .from('branghunt_images')
        .select('id, project_id')
        .limit(5);
      console.log(`[DEBUG] Test query (no filter): ${testImages?.length || 0} images accessible`);
      console.log(`[DEBUG] Sample IDs:`, testImages?.map(img => ({ id: img.id, project_id: img.project_id })));
    }

    // Fetch detection counts for these images
    const imageIds = (images || []).map(img => img.id);
    let detectionCounts: Record<string, number> = {};
    
    if (imageIds.length > 0) {
      const { data: detections } = await supabase
        .from('branghunt_detections')
        .select('image_id')
        .in('image_id', imageIds);
      
      // Count detections per image
      (detections || []).forEach(detection => {
        detectionCounts[detection.image_id] = (detectionCounts[detection.image_id] || 0) + 1;
      });
    }

    // Format images with detection counts (keep original fields for S3 URL support)
    const formattedImages = (images || []).map(img => ({
      ...img,
      // Keep all fields for frontend to determine image source (s3_url or file_path)
      detections: [{ count: detectionCounts[img.id] || 0 }]
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
      },
      // Include model selections
      extraction_model: projectData?.extraction_model || 'gemini-2.5-flash',
      visual_match_model: projectData?.visual_match_model || 'gemini-2.5-flash'
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

// PATCH /api/projects/[projectId] - Update model selections
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createAuthenticatedSupabaseClient();
    const { projectId } = await params;

    // Parse request body
    const body = await request.json();
    const { extraction_model, visual_match_model } = body;

    // Validate model values
    const validModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite-preview'];
    
    if (extraction_model && !validModels.includes(extraction_model)) {
      return NextResponse.json(
        { error: 'Invalid extraction model' },
        { status: 400 }
      );
    }

    if (visual_match_model && !validModels.includes(visual_match_model)) {
      return NextResponse.json(
        { error: 'Invalid visual match model' },
        { status: 400 }
      );
    }

    // Build update object dynamically
    const updates: Record<string, string> = {};
    if (extraction_model) updates.extraction_model = extraction_model;
    if (visual_match_model) updates.visual_match_model = visual_match_model;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No model fields to update' },
        { status: 400 }
      );
    }

    // Update project models
    const { data: project, error } = await supabase
      .from('branghunt_projects')
      .update(updates)
      .eq('id', projectId)
      .select('id, name, extraction_model, visual_match_model')
      .single();

    if (error) {
      console.error('Error updating project models:', error);
      return NextResponse.json(
        { error: 'Failed to update project models', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Error in PATCH /api/projects/[projectId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

