# Authentication System Documentation

## Overview
Added comprehensive authentication system using Supabase Auth with email/password authentication, Row Level Security (RLS), and protected API routes.

## Implementation Date
November 5, 2025

## Features

### 1. User Authentication Pages

#### Login Page (`/login`)
- Email and password authentication
- Real-time error handling
- Loading states during authentication
- Redirect to homepage after successful login
- Link to signup page
- Beautiful gradient UI matching app design

#### Signup Page (`/signup`)
- New user registration with email/password
- Password confirmation validation
- Minimum 6-character password requirement
- Success message with auto-redirect
- Real-time error handling
- Link to login page

### 2. Authentication Infrastructure

#### Client-Side Authentication (`lib/supabase-browser.ts`)
```typescript
import { createBrowserClient } from '@supabase/ssr';

export const createClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
};
```

#### Server-Side Authentication (`lib/auth.ts`)
```typescript
// Get authenticated user from cookies
export async function getAuthUser()

// Require authentication (throws error if not authenticated)
export async function requireAuth()
```

Uses cookies for session management with Next.js SSR support.

### 3. AuthNav Component

Navigation component showing authentication status:
- **Logged Out**: Shows "Login" and "Sign Up" buttons
- **Logged In**: Shows user email and "Logout" button
- Real-time authentication state updates
- Smooth loading states

Placed in header of homepage for easy access.

### 4. Database Schema Changes

#### Added user_id Column
```sql
ALTER TABLE branghunt_images 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_branghunt_images_user_id ON branghunt_images(user_id);
```

**Purpose**: Link each uploaded image to the user who uploaded it.

### 5. Row Level Security (RLS)

#### branghunt_images Policies
```sql
-- Enable RLS
ALTER TABLE branghunt_images ENABLE ROW LEVEL SECURITY;

-- Users can only view their own images
CREATE POLICY "Users can view own images"
ON branghunt_images FOR SELECT
USING (auth.uid() = user_id);

-- Users can only insert/update/delete their own images
-- (separate policies for INSERT, UPDATE, DELETE)
```

#### branghunt_detections Policies
Users can only access detections for images they own:
```sql
CREATE POLICY "Users can view own detections"
ON branghunt_detections FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM branghunt_images
    WHERE branghunt_images.id = branghunt_detections.image_id
    AND branghunt_images.user_id = auth.uid()
  )
);
```

#### branghunt_foodgraph_results Policies
Users can only access FoodGraph results for their own detections:
```sql
CREATE POLICY "Users can view own foodgraph results"
ON branghunt_foodgraph_results FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM branghunt_detections
    JOIN branghunt_images ON branghunt_images.id = branghunt_detections.image_id
    WHERE branghunt_detections.id = branghunt_foodgraph_results.detection_id
    AND branghunt_images.user_id = auth.uid()
  )
);
```

### 6. Protected API Routes

#### Upload Route (`/api/upload`)
Now requires authentication:
```typescript
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth();
    
    // ... upload logic ...
    
    // Store with user_id
    const { data, error } = await supabase
      .from('branghunt_images')
      .insert({
        user_id: user.id,  // ← Set user_id
        // ... other fields ...
      });
  } catch (error) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ 
        error: 'Authentication required' 
      }, { status: 401 });
    }
  }
}
```

**Result**: Users must be logged in to upload images.

## Security Benefits

### 1. Data Isolation
- Each user can only see and manage their own data
- RLS enforced at database level (can't be bypassed)
- Prevents unauthorized access to other users' images

### 2. Authentication Required
- Upload functionality requires login
- API routes protected with server-side authentication
- Session-based authentication using secure HTTP-only cookies

### 3. Automatic User Tracking
- Every uploaded image is automatically linked to the user
- Audit trail of who uploaded what
- Enables user-specific galleries and history

## User Flow

### New User Flow
```
1. Visit homepage
2. Click "Sign Up" → /signup
3. Enter email and password
4. Click "Sign Up"
5. Account created → Auto-redirect to homepage
6. Now logged in, can upload images
```

### Returning User Flow
```
1. Visit homepage
2. Click "Login" → /login
3. Enter email and password
4. Click "Sign In"
5. Redirected to homepage
6. Can see profile and upload images
```

### Upload Flow (Authenticated)
```
1. User is logged in
2. Select image to upload
3. Click "Upload Image"
4. API verifies authentication
5. Image saved with user_id
6. Only this user can see their image
```

### Upload Flow (Not Authenticated)
```
1. User is NOT logged in
2. Select image to upload
3. Click "Upload Image"
4. API returns 401 Unauthorized
5. Error message: "Authentication required - Please log in"
6. User redirected to login
```

## Technical Details

### Dependencies Added
```json
{
  "@supabase/ssr": "latest"  // Server-side rendering support
}
```

### Environment Variables Required
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Database Migrations Applied
1. `add_user_id_to_branghunt_images` - Added user_id column
2. `enable_rls_branghunt_images` - Enabled RLS with policies
3. `enable_rls_branghunt_detections` - Enabled RLS with policies
4. `enable_rls_branghunt_foodgraph_results` - Enabled RLS with policies

## Files Created/Modified

### New Files
- `lib/supabase-browser.ts` - Client-side Supabase client
- `lib/auth.ts` - Server-side auth helpers
- `app/login/page.tsx` - Login page
- `app/signup/page.tsx` - Signup page
- `components/AuthNav.tsx` - Authentication navigation component

### Modified Files
- `app/page.tsx` - Added AuthNav component
- `app/api/upload/route.ts` - Added authentication requirement
- `package.json` - Added @supabase/ssr dependency

## Testing

### Test Scenarios

#### 1. Signup Flow
- [x] Visit /signup
- [x] Enter valid email and password
- [x] Password confirmation works
- [x] Account created successfully
- [x] Auto-redirect to homepage
- [x] User shown as logged in

#### 2. Login Flow
- [x] Visit /login
- [x] Enter credentials
- [x] Successful login
- [x] Redirect to homepage
- [x] User email displayed in nav

#### 3. Protected Upload
- [x] Try to upload without login
- [x] Receive 401 error
- [x] Login and upload works
- [x] user_id correctly set

#### 4. Data Isolation
- [x] User A uploads image
- [x] User B cannot see User A's image
- [x] RLS policies enforce isolation

#### 5. Logout
- [x] Click logout button
- [x] Session cleared
- [x] Redirect to homepage
- [x] AuthNav shows login buttons

## Future Enhancements

### Possible Improvements
1. **Password Reset**: Add forgot password functionality
2. **Email Verification**: Require email confirmation
3. **Social OAuth**: Add Google/GitHub login
4. **Profile Page**: Dedicated user profile with settings
5. **Gallery Page**: User-specific image gallery
6. **Admin Panel**: Admin users with elevated permissions
7. **API Keys**: Generate API keys for programmatic access

### Additional Security
1. **Rate Limiting**: Prevent brute force attacks
2. **2FA**: Two-factor authentication
3. **Session Expiry**: Auto-logout after inactivity
4. **IP Tracking**: Log authentication attempts
5. **Account Lockout**: Lock account after failed attempts

## Troubleshooting

### Common Issues

#### Issue: "Unauthorized" error when uploading
**Solution**: Make sure user is logged in. Check browser cookies are enabled.

#### Issue: RLS blocking queries
**Solution**: Ensure user_id is set correctly in branghunt_images table.

#### Issue: Can't see uploaded images
**Solution**: Check that RLS policies are applied correctly. Run:
```sql
SELECT * FROM branghunt_images WHERE user_id = auth.uid();
```

#### Issue: Session not persisting
**Solution**: Check that cookies are working. Clear browser cache and try again.

## Git Commits

### Main Commit
```
ba30d1a - Add authentication system with Supabase Auth
```

**Changes**:
- 9 files changed
- 525 insertions
- Full authentication system implementation

## Support

### Resources
- Supabase Auth Docs: https://supabase.com/docs/guides/auth
- RLS Documentation: https://supabase.com/docs/guides/auth/row-level-security
- Next.js Auth: https://supabase.com/docs/guides/auth/server-side/nextjs

### Contact
- GitHub Issues: https://github.com/paulalexeevich/BrandHunt/issues
- Supabase Dashboard: https://supabase.com/dashboard

---

**Implementation Status**: ✅ Complete  
**Deployment Date**: November 5, 2025  
**Commit**: ba30d1a

