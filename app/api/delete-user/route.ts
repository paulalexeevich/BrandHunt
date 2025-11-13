import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/auth';

/**
 * DELETE USER API
 * Temporary endpoint to delete a user by email
 * This will CASCADE delete all related data
 */

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    console.log('🔍 Searching for user:', email);

    // Step 1: Find the user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('❌ Error listing users:', listError);
      return NextResponse.json(
        { error: 'Failed to list users', details: listError.message },
        { status: 500 }
      );
    }

    const userToDelete = users.find((u: any) => u.email === email);

    if (!userToDelete) {
      return NextResponse.json(
        { error: 'User not found', email },
        { status: 404 }
      );
    }

    console.log('✅ Found user:', {
      id: userToDelete.id,
      email: userToDelete.email,
      created_at: userToDelete.created_at
    });

    // Step 2: Check what data they have
    const { data: projects } = await supabase
      .from('branghunt_projects')
      .select('id, name')
      .eq('user_id', userToDelete.id);

    const { data: memberships } = await supabase
      .from('branghunt_project_members')
      .select('id, project_id')
      .eq('user_id', userToDelete.id);

    console.log('📊 Data associated with this user:');
    console.log('   Projects owned:', projects?.length || 0);
    console.log('   Project memberships:', memberships?.length || 0);

    // Step 3: Delete the user
    console.log('🗑️  Deleting user...');
    
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userToDelete.id);

    if (deleteError) {
      console.error('❌ Error deleting user:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete user', details: deleteError.message },
        { status: 500 }
      );
    }

    console.log('✅ User deleted successfully!');

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
      user: {
        id: userToDelete.id,
        email: userToDelete.email
      },
      deleted: {
        projects: projects?.length || 0,
        memberships: memberships?.length || 0
      }
    });

  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

