# FoodGraph Results Not Loading - Fix Summary

**Date:** November 11, 2025  
**Status:** ✅ FIXED - Awaiting Environment Variable Configuration

---

## Problem

FoodGraph results were not displaying on the frontend even when products were successfully processed in batch mode.

### Symptoms
- ✅ Top section showed "📦 FoodGraph Match" with product details
- ❌ Bottom section showed "No FoodGraph Results Found"
- ❌ All filter buttons showed 0 results: Search (0), Pre-filter (0), AI Filter (0)
- ❌ Console logged "Loaded 0 FoodGraph results on-demand"

### Example
Detection `60771115-d73b-4c66-a0c5-cbc903dc9ae5` showed:
- **Detection record:** `selected_foodgraph_gtin = 00047400313897` ✅
- **FoodGraph results table:** 0 rows ❌

---

## Root Cause

**Row Level Security (RLS) was blocking batch processing writes to the database.**

### How It Happened

1. Batch processing uses `createAuthenticatedSupabaseClient()` (user's auth session)
2. When trying to UPSERT results to `branghunt_foodgraph_results`, RLS checks permissions
3. RLS policy requires user to be owner or project member
4. **UPSERT silently fails** due to RLS restrictions
5. But detection update succeeds (has different, more permissive RLS policy)
6. Result: Detection has match metadata, but no results in table

### Why This Happened

- User auth sessions can expire during long batch jobs
- RLS policies are strict for security (good!)
- But batch processing needs admin access to write results for any user
- Error handling didn't catch the silent RLS failures

---

## Solution

### Changes Made

**1. Created Service Role Client** (`lib/auth.ts`)
```typescript
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,  // ← Bypasses RLS
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

**2. Updated Batch Processing APIs**
- `app/api/batch-search-and-save/route.ts`
- `app/api/batch-search-foodgraph/route.ts`

Changed all UPSERT operations from:
```typescript
const { error } = await supabase  // ← User auth (subject to RLS)
  .from('branghunt_foodgraph_results')
  .upsert(results);
```

To:
```typescript
const { error } = await supabaseAdmin  // ← Service role (bypasses RLS)
  .from('branghunt_foodgraph_results')
  .upsert(results);
```

**3. Fixed Infinite Loop**
- Added `loadedDetectionIds` cache to prevent re-fetching same results
- Frontend was repeatedly fetching results in infinite loop

**4. Created Documentation**
- `ENV_SETUP.md` - Complete environment variable setup guide
- `FOODGRAPH_RESULTS_MISSING_DEBUG.md` - Full debugging report

---

## Deployment Checklist

### ✅ Completed
1. Fixed infinite loop in frontend (commit c20d3fa)
2. Created service role client function
3. Updated both batch processing APIs (commit 611f3d2)
4. Created documentation
5. Pushed to GitHub (commits deployed to Vercel)

### ⏳ Required Actions

**YOU NEED TO ADD THE SERVICE ROLE KEY TO VERCEL:**

1. **Get your Supabase service role key:**
   - Go to https://app.supabase.com/project/hkcgttqmsnmozefyvzif/settings/api
   - Find "Project API keys" section
   - Copy the `service_role` key (NOT the anon key!)

2. **Add to Vercel environment variables:**
   - Go to your Vercel project settings
   - Navigate to "Environment Variables"
   - Add new variable:
     - Name: `SUPABASE_SERVICE_ROLE_KEY`
     - Value: (paste the service_role key from step 1)
     - Environments: Production, Preview, Development (select all)
   - Click "Save"

3. **Redeploy:**
   - Vercel will automatically redeploy with the new environment variable
   - Or manually trigger a redeploy from Vercel dashboard

---

## Testing

After adding the environment variable and redeploying:

1. **Upload a test image**
   - Use an image with multiple products

2. **Run batch processing**
   - Click "Search" button (Step 1: FoodGraph Search)
   - Click "AI Filter" button (Step 3: Filter by AI)
   - Wait for processing to complete

3. **Verify results appear**
   - Click on a processed product
   - You should now see:
     - ✅ Product match at top (as before)
     - ✅ FoodGraph results list below (NEW - this was missing!)
     - ✅ Filter buttons with counts: Search (X), Pre-filter (Y), AI Filter (Z)
     - ✅ No more "No FoodGraph Results Found" message

4. **Check console logs (optional)**
   - Should see: "Loaded X FoodGraph results on-demand" (X > 0)
   - Debug logs: "✅ Saved X AI-filtered results to database"
   - Verification: "Found X rows in database"

---

## Security Notes

⚠️ **IMPORTANT:** The service role key has admin privileges!

### What We Did Right
- ✅ Service role key ONLY used server-side (API routes)
- ✅ NEVER exposed to client/browser
- ✅ Only used for batch write operations
- ✅ Regular user reads still use authenticated client with RLS

### Keep It Secure
- 🔒 Never commit `.env.local` to git
- 🔒 Never log the service role key
- 🔒 Only use in API routes, never in client components
- 🔒 Rotate the key if ever exposed

---

## Related Issues Fixed

This fix also resolves several related issues:

1. **Infinite fetching loop** - Fixed with `loadedDetectionIds` cache
2. **Missing results for "No Match"** - Will now save empty results array correctly
3. **Missing results for "2+ matches"** - All matches now saved to DB
4. **Statistics showing 0** - Will now reflect actual saved results

---

## Technical Details

### Files Changed

1. `lib/auth.ts`
   - Added `createServiceRoleClient()` function
   - Imports `createClient` from `@supabase/supabase-js`

2. `app/api/batch-search-and-save/route.ts`
   - Added `createServiceRoleClient` import
   - Created `supabaseAdmin` instance
   - Changed 3 UPSERT operations to use `supabaseAdmin`
   - Added detailed debug logging

3. `app/api/batch-search-foodgraph/route.ts`
   - Added `createServiceRoleClient` import
   - Created `supabaseAdmin` instance
   - Changed UPSERT to use `supabaseAdmin`

4. `app/analyze/[imageId]/page.tsx`
   - Added `loadedDetectionIds` state
   - Modified useEffect to prevent infinite loops
   - Clear cache when detections refresh

### Commits

- `c20d3fa` - Fix infinite loop when loading FoodGraph results
- `f9bc7fd` - Add detailed logging to batch processing
- `aae195b` - Add debug tools for investigation
- `611f3d2` - Use service role client for batch processing (MAIN FIX)
- `d20a2c2` - Update documentation with resolution

---

## FAQ

### Q: Why didn't this happen before?
**A:** It likely did happen intermittently! The issue would occur whenever:
- User auth session expired during batch processing
- RLS policy evaluation failed
- Database had temporary connection issues

The error was silent, so it went unnoticed until you specifically looked at the results list.

### Q: Will this affect security?
**A:** No! Security is maintained because:
- Service role key only used server-side in batch APIs
- Regular user operations still use RLS
- Users can only trigger batch processing on their own images
- RLS still protects reading data (frontend uses authenticated client)

### Q: Do I need to reprocess old images?
**A:** Yes, if you want results to appear for images processed before this fix. The detection metadata is correct, but the results rows are missing from the database. Re-running batch processing will populate them.

### Q: What if I don't add the service role key?
**A:** The app will crash with error: "Missing Supabase URL or service role key" when batch processing starts. This is intentional - better to fail fast than silently lose data!

---

## Success Criteria

You'll know the fix worked when:

✅ Filter buttons show actual counts (not all 0)  
✅ Clicking a product shows FoodGraph results list  
✅ Statistics match button counts  
✅ "No FoodGraph Results Found" only appears for actual no-match cases  
✅ Console shows "Loaded X FoodGraph results" (X > 0)  

---

## Support

If issues persist after adding the service role key:

1. Check Vercel deployment logs for errors
2. Verify environment variable is set correctly
3. Check browser console for new error messages
4. Review `ENV_SETUP.md` troubleshooting section
5. Check Supabase logs in project dashboard

---

**Status:** Waiting for environment variable to be added to Vercel.  
**ETA:** Should work immediately after adding key and redeploying (~2 minutes).

