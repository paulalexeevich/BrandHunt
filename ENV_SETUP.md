# Environment Variables Setup

This document describes the environment variables required for BrangHunt to function correctly.

## Required Environment Variables

Create a `.env.local` file in the root directory with the following variables:

### Supabase Configuration

Get these values from your Supabase project settings: `https://app.supabase.com/project/_/settings/api`

```bash
# Public URL - Safe to expose to the client
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here

# Anonymous Key - Safe to expose to the client (has RLS restrictions)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Service Role Key - ⚠️ KEEP SECRET! Only use server-side
# This key bypasses Row Level Security and should NEVER be exposed to the client
# Required for batch processing operations that need to write data on behalf of users
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

### Google Gemini API

Get your key from: `https://aistudio.google.com/app/apikey`

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

## Why Service Role Key is Needed

The `SUPABASE_SERVICE_ROLE_KEY` is required for batch processing operations where:

1. **Batch FoodGraph Search** (`/api/batch-search-foodgraph`)
   - Writes search results to `branghunt_foodgraph_results` table
   - Needs to bypass RLS to write results for detections across projects

2. **Batch Search & AI Filter** (`/api/batch-search-and-save`)
   - Updates results through multiple processing stages (search → pre-filter → AI filter)
   - Uses UPSERT to prevent duplicates as results progress through stages
   - Needs admin access to write results reliably

Without the service role key, these operations will fail silently due to Row Level Security policies, resulting in:
- ✅ Detection metadata saved (e.g., `selected_foodgraph_gtin`)
- ❌ FoodGraph results NOT saved to `branghunt_foodgraph_results`
- ❌ UI shows "No FoodGraph Results Found" despite finding matches

## Security Notes

- ⚠️ **NEVER commit `.env.local` to git** (it's in `.gitignore`)
- ⚠️ **NEVER expose service role key to the client**
- ✅ Service role key should ONLY be used in server-side API routes
- ✅ Regular user operations use the anon key with RLS protection

## Vercel Deployment

For production deployment, add these environment variables in Vercel:

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add each variable listed above
4. Redeploy your application

## Troubleshooting

### "Missing Supabase URL or service role key" error

**Cause:** The `SUPABASE_SERVICE_ROLE_KEY` is not set in your environment.

**Solution:** 
1. Go to Supabase project settings → API
2. Copy the "service_role" key (under "Project API keys")
3. Add it to your `.env.local` file
4. Restart your development server

### FoodGraph results not appearing after batch processing

**Symptoms:**
- Product card shows "📦 FoodGraph Match" at top
- Filter buttons show "Search (0)", "Pre-filter (0)", "AI Filter (0)"
- Console shows "Loaded 0 FoodGraph results on-demand"

**Cause:** Service role key not configured, causing UPSERT operations to fail silently due to RLS.

**Solution:** 
1. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`
2. Restart server
3. Re-run batch processing on the image

