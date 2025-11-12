# Setup Service Role Key

## The Issue
The `/api/users` endpoint needs the `SUPABASE_SERVICE_ROLE_KEY` to access the auth.users table. This key is currently missing from your `.env.local` file.

## How to Get Your Service Role Key

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/ybzoioqgbvcxqiejopja/settings/api

2. Scroll down to the "Project API keys" section

3. Find the key labeled **"service_role"** (⚠️ This is a secret key - never share it publicly!)

4. Click "Reveal" to show the key

5. Copy the service_role key

## How to Add It to Your Project

Open your `.env.local` file and add this line (replace YOUR_SERVICE_ROLE_KEY with the actual key):

```bash
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Your `.env.local` should look like:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ybzoioqgbvcxqiejopja.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Add this line
```

## After Adding the Key

1. **Restart your development server** (the key is loaded at startup)
   - Stop the current server (Ctrl+C)
   - Run `npm run dev` again

2. The "Add Member" dropdown should now work!

## Security Notes

⚠️ **IMPORTANT**: 
- Never commit the service_role key to git
- This key bypasses Row Level Security (RLS)
- Only use it in server-side code (API routes)
- Keep `.env.local` in your `.gitignore`

## Quick Command to Add the Key

After copying the key from Supabase, run:

```bash
echo "SUPABASE_SERVICE_ROLE_KEY=your_actual_key_here" >> .env.local
```

Replace `your_actual_key_here` with the actual key from the dashboard.

