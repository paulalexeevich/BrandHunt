import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';

// DELETE /api/projects/[projectId]/members/[memberId] - Remove a member from a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  try {
    const { projectId, memberId } = await params;
    const supabase = await createAuthenticatedSupabaseClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Verify current user has permission to remove members (owner or admin)
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
        { error: 'Only project owners and admins can remove members' },
        { status: 403 }
      );
    }

    // Get the member to be removed
    const { data: memberToRemove, error: fetchError } = await supabase
      .from('branghunt_project_members')
      .select('role, user_id')
      .eq('id', memberId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !memberToRemove) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Cannot remove owner
    if (memberToRemove.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove project owner' },
        { status: 403 }
      );
    }

    // Cannot remove yourself unless you're leaving (not implemented yet)
    if (memberToRemove.user_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot remove yourself. Use leave project instead' },
        { status: 403 }
      );
    }

    // Remove the member
    const { error: deleteError } = await supabase
      .from('branghunt_project_members')
      .delete()
      .eq('id', memberId);

    if (deleteError) {
      console.error('Failed to remove member:', deleteError);
      return NextResponse.json(
        { error: 'Failed to remove member', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: 'Member removed successfully'
    });

  } catch (error) {
    console.error('Error in DELETE /api/projects/[projectId]/members/[memberId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId]/members/[memberId] - Update member role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; memberId: string }> }
) {
  try {
    const { projectId, memberId } = await params;
    const body = await request.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json(
        { error: 'Role is required' },
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

    // Verify current user is owner (only owners can change roles)
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

    if (currentMembership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only project owners can change member roles' },
        { status: 403 }
      );
    }

    // Update the member role
    const { data: updatedMember, error: updateError } = await supabase
      .from('branghunt_project_members')
      .update({ role })
      .eq('id', memberId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update member role:', updateError);
      return NextResponse.json(
        { error: 'Failed to update member role', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: 'Member role updated successfully',
      member: updatedMember
    });

  } catch (error) {
    console.error('Error in PATCH /api/projects/[projectId]/members/[memberId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

