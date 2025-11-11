import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// GET - Fetch prompt templates for a project
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get project_id from query params
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const stepName = searchParams.get('step_name'); // optional filter
    
    if (!projectId) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      );
    }

    // Verify user owns the project
    const { data: project, error: projectError } = await supabase
      .from('branghunt_projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Build query
    let query = supabase
      .from('branghunt_prompt_templates')
      .select('*')
      .eq('project_id', projectId)
      .order('step_name', { ascending: true })
      .order('version', { ascending: false });

    // Filter by step_name if provided
    if (stepName) {
      query = query.eq('step_name', stepName);
    }

    const { data: templates, error: templatesError } = await query;

    if (templatesError) {
      console.error('Error fetching templates:', templatesError);
      return NextResponse.json(
        { error: 'Failed to fetch prompt templates' },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates }, { status: 200 });
  } catch (error) {
    console.error('Error in GET /api/prompt-templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create or update a prompt template
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { project_id, step_name, prompt_template } = body;

    // Validate required fields
    if (!project_id || !step_name || !prompt_template) {
      return NextResponse.json(
        { error: 'project_id, step_name, and prompt_template are required' },
        { status: 400 }
      );
    }

    // Verify user owns the project
    const { data: project, error: projectError } = await supabase
      .from('branghunt_projects')
      .select('id, user_id')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Get current active template to determine next version
    const { data: currentTemplate } = await supabase
      .from('branghunt_prompt_templates')
      .select('version')
      .eq('project_id', project_id)
      .eq('step_name', step_name)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = currentTemplate ? currentTemplate.version + 1 : 1;

    // Deactivate all previous versions for this step
    await supabase
      .from('branghunt_prompt_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('project_id', project_id)
      .eq('step_name', step_name);

    // Insert new template version
    const { data: newTemplate, error: insertError } = await supabase
      .from('branghunt_prompt_templates')
      .insert({
        project_id,
        step_name,
        prompt_template,
        version: nextVersion,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting template:', insertError);
      return NextResponse.json(
        { error: 'Failed to create prompt template' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        template: newTemplate,
        message: `Created version ${nextVersion} for ${step_name}`
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST /api/prompt-templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Activate a specific template version
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { template_id } = body;

    if (!template_id) {
      return NextResponse.json(
        { error: 'template_id is required' },
        { status: 400 }
      );
    }

    // Get the template and verify ownership
    const { data: template, error: templateError } = await supabase
      .from('branghunt_prompt_templates')
      .select('*, branghunt_projects!inner(user_id)')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // @ts-ignore - branghunt_projects is joined
    if (template.branghunt_projects.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Deactivate all other versions for this step
    await supabase
      .from('branghunt_prompt_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('project_id', template.project_id)
      .eq('step_name', template.step_name);

    // Activate this template
    const { data: updatedTemplate, error: updateError } = await supabase
      .from('branghunt_prompt_templates')
      .update({ 
        is_active: true, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', template_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error activating template:', updateError);
      return NextResponse.json(
        { error: 'Failed to activate template' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        template: updatedTemplate,
        message: `Activated version ${template.version} for ${template.step_name}`
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in PUT /api/prompt-templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

