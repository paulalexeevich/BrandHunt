# Setup Test Gemini API Key

## Overview
This guide explains how to add the test Gemini API key to your environment to enable separate token usage tracking for test vs regular projects.

## Steps

### 1. Add the API Key to .env.local

Open your `.env.local` file and add the new test API key:

```bash
# Existing regular API key
GOOGLE_GEMINI_API_KEY=your_existing_key_here

# New test API key for token tracking
GOOGLE_GEMINI_API_KEY_TEST=AIzaSyBmskmNxJywENV9E1U6Te13Q9DmoNPGQCY
```

### 2. Restart the Development Server

After adding the environment variable, restart your Next.js development server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## How It Works

### Project Types
Projects now have a `project_type` field that can be:
- **`regular`**: Uses the main `GOOGLE_GEMINI_API_KEY` (default)
- **`test`**: Uses the test `GOOGLE_GEMINI_API_KEY_TEST`

### API Key Selection
The system automatically selects the appropriate API key based on the project type:

```typescript
// In lib/gemini.ts
export function getGenAI(projectType: 'regular' | 'test' = 'regular'): GoogleGenerativeAI {
  if (projectType === 'test') {
    console.log('🧪 Using TEST Gemini API key for token tracking');
    return genAITest;
  }
  return genAI;
}
```

### Console Logging
When a test project is being processed, you'll see this log message:
```
🧪 Using TEST Gemini API key for token tracking
```

This helps you verify that the correct API key is being used.

## Benefits

1. **Separate Token Tracking**: Monitor API usage separately for production and test projects
2. **Cost Analysis**: Understand how much each type of project consumes
3. **Testing Safety**: Experiment with test projects without affecting production quotas
4. **Easy Identification**: Console logs clearly show which API key is in use

## Token Usage Monitoring

### Google Cloud Console
To view token usage per API key:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on each API key to view its usage metrics
4. Check the **Quotas** page for detailed usage statistics

### Recommended Setup
- **Regular Key**: For production data and client projects
- **Test Key**: For development, testing, and experimentation

## Next Steps

After adding the API key:
1. Create a test project in the UI (see project type selector)
2. Upload some test images
3. Run batch processing operations
4. Monitor token usage in Google Cloud Console
5. Compare usage between regular and test projects

## Troubleshooting

### "Missing Supabase URL or service role key" Error
If you see this error, make sure the API key is properly set in `.env.local` and the server has been restarted.

### API Key Not Working
1. Verify the key is correct in `.env.local`
2. Check that there are no extra spaces or quotes
3. Restart the development server
4. Check the console for the 🧪 emoji to confirm test key is being used

## Security Notes

⚠️ **Important**: 
- Never commit `.env.local` to Git (already in `.gitignore`)
- Keep both API keys confidential
- Regularly rotate API keys for security
- Monitor usage to detect any unusual activity

