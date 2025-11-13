import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient, createServiceRoleClient } from '@/lib/auth';

// GET /api/projects/[projectId]/members - List all members of a project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch project members
    const { data: members, error } = await supabase
      .from('branghunt_project_members')
      .select(`
        id,
        project_id,
        user_id,
        role,
        added_by,
        added_at,
        created_at
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch project members:', error);
      return NextResponse.json(
        { error: 'Failed to fetch project members', details: error.message },
        { status: 500 }
      );
    }

    // Fetch user emails using service role client (bypasses RLS)
    const serviceSupabase = createServiceRoleClient();
    const { data: { users }, error: usersError } = await serviceSupabase.auth.admin.listUsers();

    if (usersError) {
      console.error('Failed to fetch user details:', usersError);
      // Return members without emails rather than failing completely
      return NextResponse.json({ members: members || [] });
    }

    // Create a map of user_id -> email for quick lookup
    const userEmailMap = new Map(
      users.map(user => [user.id, user.email || 'No email'])
    );

    // Enrich members with email addresses
    const membersWithEmails = (members || []).map(member => ({
      ...member,
      email: userEmailMap.get(member.user_id) || 'Unknown'
    }));
    
    return NextResponse.json({ members: membersWithEmails });
  } catch (error) {
    console.error('Error in GET /api/projects/[projectId]/members:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/members - Add a member to a project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { userId, role = 'member' } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be: admin, member, or viewer' },
        { status: 400 }
      );
    }

    const supabase = await createAuthenticatedSupabaseClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify current user has permission to add members (owner or admin)
    const { data: currentMembership, error: membershipError } = await supabase
      .from('branghunt_project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !currentMembership) {
      return NextResponse.json(
        { error: 'You do not have access to this project' },
        { status: 403 }
      );
    }

    if (!['owner', 'admin'].includes(currentMembership.role)) {
      return NextResponse.json(
        { error: 'Only project owners and admins can add members' },
        { status: 403 }
      );
    }

    // Add the member
    const { data: newMember, error: insertError } = await supabase
      .from('branghunt_project_members')
      .insert({
        project_id: projectId,
        user_id: userId,
        role: role,
        added_by: user.id
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'User is already a member of this project' },
          { status: 409 }
        );
      }
      console.error('Failed to add member:', insertError);
      return NextResponse.json(
        { error: 'Failed to add member', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: 'Member added successfully',
      member: newMember
    }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/projects/[projectId]/members:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/members/[memberId] handled in separate route

