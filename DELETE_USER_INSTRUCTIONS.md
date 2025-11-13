# Delete User Instructions

## Problem
Need to delete user `jonas.lima@traxretail.com` from the database.

## Current Status
- User ID `477025cf-e39e-481d-8d35-9fa82cfc22b7` exists with 5 projects
- Need service role key to confirm email and delete user

## Option 1: Use the Automated API (Recommended)

### Step 1: Get Service Role Key from Supabase

1. Go to: https://supabase.com/dashboard/project/ybzoioqgbvcxqiejopja/settings/api
2. Scroll to "Project API keys" section
3. Find the **"service_role"** key (⚠️ secret key)
4. Click "Reveal" and copy the key

### Step 2: Add to .env.local

```bash
# Add this line to .env.local
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Or run this command (replace with actual key):

```bash
echo "SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi..." >> .env.local
```

### Step 3: Restart Dev Server

```bash
# Kill existing server
pkill -f "next dev"

# Start fresh
npm run dev
```

### Step 4: Run the Deletion Script

```bash
node call-delete-user-api.js
```

This will:
- ✅ Find the user by email
- ✅ Show what data they have (projects, memberships)
- ✅ Delete the user (CASCADE deletes all related data)
- ✅ Confirm deletion was successful

---

## Option 2: Manual Dashboard Deletion

1. Go to: https://supabase.com/dashboard/project/ybzoioqgbvcxqiejopja/auth/users
2. Find user `jonas.lima@traxretail.com`
3. Click the "..." menu → Delete user
4. Confirm deletion

**Note**: This will automatically CASCADE delete:
- All projects owned by user
- All project memberships
- All images in those projects
- All detections in those images  
- All FoodGraph results

---

## Option 3: SQL Deletion (If you have Supabase SQL Editor access)

```sql
-- WARNING: This permanently deletes the user and all their data!

-- First, verify the user exists
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'jonas.lima@traxretail.com';

-- If confirmed, delete (replace USER_ID with actual ID)
DELETE FROM auth.users 
WHERE id = '477025cf-e39e-481d-8d35-9fa82cfc22b7';
```

---

## What Gets Deleted (CASCADE)

When the user is deleted, these tables are automatically cleaned up:

1. `auth.users` - User account ✅
2. `branghunt_projects` - All projects owned (5 projects) ✅
3. `branghunt_project_members` - All memberships ✅
4. `branghunt_images` - All images in owned projects ✅
5. `branghunt_detections` - All detections in those images ✅
6. `branghunt_foodgraph_results` - All FoodGraph results ✅

---

## Files Created

### API Endpoint
- `app/api/delete-user/route.ts` - Secure API to delete users

### Scripts
- `call-delete-user-api.js` - Node script to call the API
- `delete-user.js` - Alternative direct deletion script (not used)
- `delete-user.sh` - Shell wrapper (not used)

### Documentation
- `DELETE_USER_INSTRUCTIONS.md` - This file

---

## Security Notes

⚠️ **IMPORTANT**:
- Service role key bypasses Row Level Security (RLS)
- Keep it secret, never commit to git
- Only use in server-side code
- `.env.local` is already in `.gitignore`

---

## After Deletion

To verify deletion was successful:

```bash
# Should return empty
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
supabase.auth.admin.listUsers().then(({data}) => {
  const user = data.users.find(u => u.email === 'jonas.lima@traxretail.com');
  console.log(user ? '❌ User still exists' : '✅ User deleted');
});
"
```

---

## Cleanup (After Deletion)

You can optionally remove the temporary files:

```bash
rm app/api/delete-user/route.ts
rm call-delete-user-api.js
rm delete-user.js
rm delete-user.sh
rm DELETE_USER_INSTRUCTIONS.md
```

