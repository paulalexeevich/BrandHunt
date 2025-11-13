# Vercel Deployment - November 13, 2025

## Deployment Status

✅ **Code Deployed:** Latest commits pushed to production  
⚠️ **Environment Variable Missing:** `SUPABASE_SERVICE_ROLE_KEY` not set in Vercel

## Recent Commits Deployed

```
0fda6cd - docs: add documentation for member email display fix
cc72e00 - feat: display email addresses instead of UIDs in project members list
80c69c1 - feat: add user deletion API and successfully delete jonas.lima@traxretail.com
851ab3b - docs: add comprehensive visual similarity badges user guide
a55d0d8 - fix: update batch-search-visual-project to use new saveVisualMatchResults
```

## Validation Results

### ✅ Site Accessibility
- **URL:** https://branghunt.vercel.app
- **Status:** HTTP/2 200
- **Server:** Vercel
- **Cache:** PRERENDER
- **Title:** BrangHunt - AI Product Detection

### ✅ Code Deployment
- New API endpoint `/api/delete-user` exists
- Members API updated with email enrichment
- All recent code changes are live

### ⚠️ Missing Environment Variable

**Problem:** API endpoints fail with:
```json
{"error":"Internal server error","details":"Missing Supabase URL or service role key"}
```

**Root Cause:** `SUPABASE_SERVICE_ROLE_KEY` is in `.env.local` (local) but not in Vercel environment variables (production).

## 🔧 Required Action: Add Environment Variable to Vercel

### Step 1: Access Vercel Environment Variables

Go to: [Vercel Project Settings - Environment Variables](https://vercel.com/paulalexeevichs-projects/branghunt/settings/environment-variables)

Or navigate manually:
1. Go to https://vercel.com/dashboard
2. Select project: **branghunt**
3. Go to **Settings** tab
4. Click **Environment Variables** in left sidebar

### Step 2: Add Service Role Key

Click **Add New** and enter:

**Name:**
```
SUPABASE_SERVICE_ROLE_KEY
```

**Value:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inliem9pb3FnYnZjeHFpZWpvcGphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzM4OTc1NywiZXhwIjoyMDYyOTY1NzU3fQ.LEUOEMyWfXA5UrcrjuEeSivett_sYv-Db7z-pXsfg6s
```

**Environment:**
- ✅ Production
- ✅ Preview
- ✅ Development

Click **Save**

### Step 3: Redeploy

After adding the environment variable, Vercel will ask if you want to redeploy.

**Option A: Automatic Redeploy (Recommended)**
- Click **Redeploy** when prompted by Vercel

**Option B: Manual Redeploy**
1. Go to **Deployments** tab
2. Find the latest deployment
3. Click **•••** menu → **Redeploy**

**Option C: Trigger New Deployment**
- Make a small commit and push (Vercel will auto-deploy)

### Step 4: Wait for Deployment

⏱️ Deployment typically takes 1-3 minutes

Monitor progress:
- Go to **Deployments** tab
- Watch for "Building..." → "Completed"
- Note the new deployment URL

## Validation Steps (After Redeployment)

### 1. Check Site is Live

```bash
curl -I https://branghunt.vercel.app
# Expected: HTTP/2 200
```

### 2. Test User Management API

```bash
curl -s https://branghunt.vercel.app/api/users
# Expected: Should NOT return "Missing Supabase URL or service role key"
# Expected: Requires authentication (401 if not logged in)
```

### 3. Test Members API with Email

This requires authentication, so test via browser:
1. Login to https://branghunt.vercel.app
2. Go to any project
3. Check "Project Members" section
4. **Verify:** Emails display (not UIDs)

### 4. Verify User Deletion API Exists

```bash
curl -X POST https://branghunt.vercel.app/api/delete-user \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@test.com"}'
# Expected: {"error":"User not found"} or auth error
# NOT: "Missing Supabase URL or service role key"
```

## Features Requiring Service Role Key

The following features will **NOT work** until the environment variable is added:

1. ❌ **Add Member to Project** - Can't fetch user list
2. ❌ **Display Member Emails** - Shows UIDs instead
3. ❌ **Delete User** - API endpoint fails
4. ⚠️ **Some Batch Operations** - May fail if they need admin access

## Current Environment Variables in Vercel

You should have these set:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ybzoioqgbvcxqiejopja.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc... (public key)
GOOGLE_GEMINI_API_KEY=AIzaSy... (Gemini API)
FOODGRAPH_EMAIL=foodgraph@traxretail.com
FOODGRAPH_PASSWORD=f00dgr4ph_ap1!TRAX_p4wd_85
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... (ADD THIS ONE!)
```

## Security Notes

⚠️ **IMPORTANT:**
- The service role key bypasses Row Level Security (RLS)
- Only use it in API routes (server-side code)
- Never expose it in client-side code
- Vercel environment variables are secure and encrypted

## Deployment Timeline

- **11:30 AM** - Code pushed to GitHub (commits 80c69c1, cc72e00, 0fda6cd)
- **11:32 AM** - Vercel auto-deployed new code
- **11:33 AM** - Validation revealed missing environment variable
- **[PENDING]** - Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel
- **[PENDING]** - Redeploy and validate all features work

## Quick Validation Script

After adding the environment variable and redeploying, run:

```bash
#!/bin/bash
echo "🔍 Validating Vercel Deployment..."
echo ""

# Check site is up
echo "1. Site Accessibility:"
curl -I https://branghunt.vercel.app 2>&1 | grep "HTTP/2"

echo ""
echo "2. API Endpoint Exists:"
curl -s -X POST https://branghunt.vercel.app/api/delete-user \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' | grep -v "Missing Supabase URL"

echo ""
echo "✅ If no 'Missing Supabase URL' error above, deployment successful!"
echo "⚠️ If still seeing error, wait 1-2 minutes for deployment to complete"
```

## Rollback Plan

If something goes wrong:

1. Go to Vercel **Deployments** tab
2. Find the previous working deployment
3. Click **•••** menu → **Promote to Production**
4. Previous version will be restored immediately

## Related Documentation

- `DELETE_USER_INSTRUCTIONS.md` - How to delete users
- `USER_DELETION_NOV_13.md` - Recent user deletion completed
- `MEMBER_EMAIL_DISPLAY_FIX.md` - Email display feature details
- `setup-service-role-key.md` - Local setup instructions

---

**Next Steps:**
1. ✅ Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel environment variables
2. ⏳ Wait for automatic redeploy (or trigger manually)
3. ✅ Validate all features work in production
4. ✅ Test user management and member display features
5. ✅ Update this document with final validation results

**Status:** ⏳ Waiting for environment variable to be added to Vercel

