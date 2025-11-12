import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAuth } from '@/lib/auth';

// GET /api/users - List all users (for adding to projects)
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    // Use service role client to access auth.users
    const supabase = createServiceRoleClient();

    // Fetch all users from auth.users table
    const { data: users, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error('Failed to fetch users:', error);
      return NextResponse.json(
        { error: 'Failed to fetch users', details: error.message },
        { status: 500 }
      );
    }

    // Return simplified user data (id and email)
    const simplifiedUsers = users.users.map(user => ({
      id: user.id,
      email: user.email || 'No email',
      created_at: user.created_at
    }));

    return NextResponse.json({ users: simplifiedUsers });
  } catch (error) {
    console.error('Error in GET /api/users:', error);
    
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

