import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient, createServiceRoleClient } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 10;

// GET /api/projects - List all projects for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch projects with statistics from the view
    const { data: projects, error } = await supabase
      .from('branghunt_project_stats')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return NextResponse.json(
        { error: 'Failed to fetch projects', details: error.message },
        { status: 500 }
      );
    }

    // Fetch user emails using service role client
    const serviceSupabase = createServiceRoleClient();
    const uniqueUserIds = [...new Set(projects?.map((p) => p.user_id) || [])];
    const { data: usersData } = await serviceSupabase.auth.admin.listUsers();
    const userEmailMap = new Map(
      usersData?.users
        .filter((u) => uniqueUserIds.includes(u.id))
        .map((u) => [u.id, u.email || 'Unknown']) || []
    );

    // Fetch product statistics for each project
    const projectsWithStats = await Promise.all(
      (projects || []).map(async (project) => {
        const { data: detectionsData } = await supabase
          .from('branghunt_images')
          .select(`
            branghunt_detections (
              id,
              is_product,
              brand_name,
              fully_analyzed,
              selected_foodgraph_gtin,
              human_validation,
              branghunt_foodgraph_results (id)
            )
          `)
          .eq('project_id', project.project_id);

        const allDetections = detectionsData?.flatMap((img: any) => img.branghunt_detections || []) || [];

        const stats = {
          totalProducts: allDetections.length,
          processed: allDetections.filter((d: any) => 
            (d.is_product === true || d.is_product === null) && d.brand_name
          ).length,
          pending: allDetections.filter((d: any) => 
            (d.is_product === true || d.is_product === null) && !d.brand_name
          ).length,
          notProduct: allDetections.filter((d: any) => d.is_product === false).length,
          matched: allDetections.filter((d: any) => 
            d.selected_foodgraph_gtin && d.selected_foodgraph_gtin.trim() !== ''
          ).length,
          notMatched: allDetections.filter((d: any) => 
            d.brand_name && 
            (!d.selected_foodgraph_gtin || d.selected_foodgraph_gtin.trim() === '')
          ).length,
          multipleMatches: allDetections.filter((d: any) => 
            d.brand_name && 
            !d.fully_analyzed && 
            !d.selected_foodgraph_gtin &&
            d.branghunt_foodgraph_results && 
            d.branghunt_foodgraph_results.length >= 2
          ).length,
          incorrect: allDetections.filter((d: any) => d.human_validation === false).length
        };

        return { 
          ...project, 
          stats,
          owner_email: userEmailMap.get(project.user_id) || 'Unknown'
        };
      })
    );

    return NextResponse.json({ projects: projectsWithStats });
  } catch (error) {
    console.error('Error in GET /api/projects:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedSupabaseClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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

    // Insert project
    const { data: project, error } = await supabase
      .from('branghunt_projects')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return NextResponse.json(
        { error: 'Failed to create project', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/projects:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

