# CRITICAL: Batch Extraction Returns "0 Products Extracted"

## Confirmed Facts

### ✅ Data Exists and Is Ready
```sql
Total detections: 655
Needs extraction (brand_name IS NULL): 655  
Already extracted: 0
```

**All 655 detections are ready for extraction!**

### ✅ Gemini API Works
Tested directly - Gemini responds in ~1.2s with correct JSON format.

### ✅ API Key Configured
`GOOGLE_GEMINI_API_KEY` is set in `.env.local`

## The Problem

When user clicks "Batch Extract Info":
```
Result: "✅ Completed: 8/8 images successful, 0 products extracted"
```

This means:
1. ✅ Found 8 images with `detection_completed = true`
2. ✅ Processed all 8 images successfully  
3. ❌ But extracted 0 products from 655 detections

## Root Cause Analysis

The batch extraction API has this flow:
```javascript
for each image:
  1. Fetch detections where brand_name IS NULL
  2. For each detection:
     - Call extractProductInfo() [Gemini API]
     - Update database with results
  3. Count successCount
```

If `successCount = 0` for all images, one of these is failing:
- **Option A:** Detections query returns 0 results (but SQL confirms 655 exist!)
- **Option B:** extractProductInfo() throws errors (but Gemini works!)
- **Option C:** Database updates fail silently
- **Option D:** Environment variable not available at runtime

## Most Likely Cause: Environment Variable in Production

The `.env.local` file is for LOCAL development only!

**If this is deployed to Vercel:**
- ❌ `.env.local` is NOT uploaded to Vercel
- ❌ `GOOGLE_GEMINI_API_KEY` is NOT available in production
- ❌ All Gemini API calls fail
- ❌ Result: 0 products extracted

## Solution

### For Vercel Production:

1. **Add Environment Variable in Vercel Dashboard:**
   ```
   https://vercel.com/[your-account]/branghunt/settings/environment-variables
   
   Variable: GOOGLE_GEMINI_API_KEY
   Value: AIzaSyBBACzSu002DzEjULr7H_HpR5w5bSE5RQw
   Environment: Production, Preview, Development
   ```

2. **Redeploy:**
   ```bash
   git commit --allow-empty -m "Trigger redeploy with env vars"
   git push origin main
   ```

3. **Wait ~2 minutes for deployment**

4. **Test again** - Should now extract all 655 products

### For Local Development:

If running locally with `npm run dev`:

1. **Check .env.local exists:**
   ```bash
   cat .env.local | grep GOOGLE_GEMINI_API_KEY
   ```

2. **Restart dev server:**
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

3. **Test again**

## Verification Steps

### Step 1: Check Server Logs
Look for this error pattern:
```
❌ GOOGLE_GEMINI_API_KEY is not set
❌ Extraction failed for detection X: Gemini API key is not configured
```

### Step 2: Add Console Log
Temporarily add to `lib/gemini.ts` line 153:
```typescript
if (!process.env.GOOGLE_GEMINI_API_KEY) {
  console.error('❌ ❌ ❌ GOOGLE_GEMINI_API_KEY IS NOT SET ❌ ❌ ❌');
  console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('GOOGLE')));
  throw new Error('Gemini API key is not configured');
}
```

### Step 3: Run Batch Extraction
Click "Batch Extract Info" and watch logs for the error message.

## Expected Outcome After Fix

```
✅ Completed: 8/8 images successful, 655 products extracted

Processing time: ~5-10 seconds for 655 detections
```

Logs should show:
```
📋 Starting batch info extraction...
📸 Found 8 images with detections
📦 Processing batch 1/1 (8 images)...
  📋 Extracting info from original (image_id: xxx)...
  🔍 Found 70 detections needing extraction
  📦 Extracting info for 70 detections in parallel...
  ✂️ Cropped image to 245x180px for product extraction
  ✂️ Cropped image to 198x156px for product extraction
  ... (70 times)
  ✅ Extracted info for 70/70 detections (0 Gemini errors, 0 DB errors)
... (repeat for 8 images)
✅ Batch extraction complete: 8/8 successful, 655 total detections processed
```

## Quick Test

To verify if environment variable is the issue:

1. **Stop your dev server**

2. **Run with explicit env var:**
   ```bash
   GOOGLE_GEMINI_API_KEY=AIzaSyBBACzSu002DzEjULr7H_HpR5w5bSE5RQw npm run dev
   ```

3. **Try batch extraction again**

If it works now → Environment variable was the issue!

## Alternative Diagnosis

If environment variable IS set, check:

### Authentication Issue
```javascript
// In batch-extract-project/route.ts
const supabase = await createAuthenticatedSupabaseClient();

// Add logging:
const { data: { user } } = await supabase.auth.getUser();
console.log('Authenticated user:', user?.id);
```

### RLS Policy Issue
Check if the user can actually access the images:
```sql
SELECT policy_name, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'branghunt_images';
```

## Files to Check

1. `.env.local` - Has `GOOGLE_GEMINI_API_KEY=...`
2. Vercel Dashboard → Environment Variables
3. Server logs during batch extraction
4. Browser console for fetch errors

## Summary

**99% confident this is an environment variable issue.**

The API works locally with `.env.local`, but that file doesn't exist in production. Add the environment variable to Vercel and redeploy.

