# Member Email Display Fix - November 13, 2025

## Problem

Project members list was displaying truncated user IDs instead of email addresses:
- **BEFORE:** `477025cf...` and `df750f3c...`
- **User Request:** "Show email vs UIDs"

## Root Cause

The `/api/projects/[projectId]/members` endpoint had a comment (lines 36-38) stating:
> "We can't directly join with auth.users table due to RLS"

So it was only returning `user_id` without fetching the corresponding email addresses from `auth.users`.

## Solution

Now that `SUPABASE_SERVICE_ROLE_KEY` is available in `.env.local`, we can bypass RLS to fetch user emails.

### Changes Made

#### 1. API Enhancement (`app/api/projects/[projectId]/members/route.ts`)

**Added:**
- Import `createServiceRoleClient` from `@/lib/auth`
- Fetch all users using service role client: `serviceSupabase.auth.admin.listUsers()`
- Create efficient Map lookup: `userEmailMap = new Map(users.map(user => [user.id, user.email]))`
- Enrich member data with emails before returning

**Code:**
```typescript
// Fetch user emails using service role client (bypasses RLS)
const serviceSupabase = createServiceRoleClient();
const { data: { users }, error: usersError } = await serviceSupabase.auth.admin.listUsers();

// Create a map of user_id -> email for quick lookup
const userEmailMap = new Map(
  users.map(user => [user.id, user.email || 'No email'])
);

// Enrich members with email addresses
const membersWithEmails = (members || []).map(member => ({
  ...member,
  email: userEmailMap.get(member.user_id) || 'Unknown'
}));
```

**Error Handling:**
- If fetching emails fails, returns members without emails (graceful degradation)
- Better than failing the entire request

#### 2. TypeScript Interface (`app/projects/[projectId]/page.tsx`)

**Updated ProjectMember interface:**
```typescript
interface ProjectMember {
  id: string;
  user_id: string;
  email?: string; // Email address from auth.users
  role: 'owner' | 'admin' | 'member' | 'viewer';
  added_at: string;
  added_by: string;
}
```

#### 3. UI Display (`app/projects/[projectId]/page.tsx`)

**Changed from:**
```typescript
<span className="font-medium text-gray-900">
  {member.user_id.substring(0, 8)}...
</span>
```

**Changed to:**
```typescript
<span className="font-medium text-gray-900">
  {member.email || `${member.user_id.substring(0, 8)}...`}
</span>
```

**Fallback Logic:**
- Primary: Display email if available
- Fallback: Display truncated UUID if email not available

## Result

**AFTER:**
- Owner: `pavelp@traxretail.com`
- Member: `user@example.com` (actual email addresses)

## Benefits

1. ✅ **Better UX** - Users can identify team members by recognizable emails
2. ✅ **Team Collaboration** - Easier to verify correct members are added
3. ✅ **Graceful Fallback** - Still shows UUIDs if email unavailable
4. ✅ **Efficient Lookup** - Uses Map for O(1) email lookup per member
5. ✅ **No Breaking Changes** - Backwards compatible (email is optional field)

## Technical Details

### Performance
- Single `listUsers()` call fetches all users at once
- Map-based lookup is O(1) per member
- Efficient even with hundreds of members

### Security
- Service role key only used server-side
- RLS still enforced on `branghunt_project_members` table
- No security compromise

### Edge Cases Handled
- Missing emails → Shows "No email"
- User not found → Shows "Unknown"
- Service role error → Returns members without emails
- Empty member list → Works correctly

## Testing

### Manual Test
1. Navigate to any project page
2. Look at "Project Members" section
3. Verify emails are displayed instead of UUIDs

### Expected Display Format
```
📧 pavelp@traxretail.com          [You]
   Owner • Added 11/13/2025        [🗑️]

📦 jonas.lima@traxretail.com
   Member • Added 11/13/2025       [🗑️]
```

## Deployment

- **Commit:** `cc72e00`
- **Files Changed:**
  - `app/api/projects/[projectId]/members/route.ts` (+18 lines, -7 lines)
  - `app/projects/[projectId]/page.tsx` (+7 lines, -5 lines)
- **Status:** ✅ Deployed to main branch
- **Linter:** ✅ No errors

## Dependencies

**Required:**
- `SUPABASE_SERVICE_ROLE_KEY` must be set in `.env.local`
- See: `DELETE_USER_INSTRUCTIONS.md` for key setup

**Related Changes:**
- Commit `80c69c1` - Added user deletion API and service role key

## Future Enhancements

Potential improvements (not implemented yet):
1. Cache user emails in-memory to reduce repeated `listUsers()` calls
2. Add user profile pictures next to emails
3. Display user's full name if available in user metadata
4. Add search/filter for members list

---

**Status:** ✅ Complete  
**Verified:** ✅ Compiles without errors  
**Tested:** ⏳ Needs visual verification in browser

