# Where to See Project Type Selection

## ✅ Implementation Complete!

The project type selector has been successfully added to your application. Here's where you'll see it:

## 1. Create New Project Modal

When you click **"Create New Project"** button, you'll see a modal with:

1. **Project Name** field (required)
2. **Project Type** dropdown (NEW! ⭐)
   - 🏢 Regular (Production)
   - 🧪 Test (Token Tracking)
3. **Description** field (optional)

The Project Type dropdown appears **between** Project Name and Description fields.

### What It Looks Like:
```
┌─────────────────────────────────────┐
│   Create New Project                │
│                                     │
│   Project Name *                    │
│   [Walgreens Q4 2025]              │
│                                     │
│   Project Type *                    │
│   [🏢 Regular (Production) ▼]      │  ← NEW FIELD!
│   Test projects use a separate API │
│   key for token usage tracking...  │
│                                     │
│   Description (optional)            │
│   [Brief description...]           │
│                                     │
│   [Cancel]         [Create]        │
└─────────────────────────────────────┘
```

## 2. Project Cards Display

After creating a test project, you'll see a **🧪 TEST** badge on the project card:

```
┌─────────────────────────────────────┐
│  🗂️ Test Project Name  [🧪 TEST]   │  ← Badge appears here
│  pavelp@traxretail.com • Created... │
│                                     │
│  📊 Images: 10    🎯 Products: 82  │
│  ...statistics...                   │
└─────────────────────────────────────┘
```

Regular projects won't have any badge (cleaner look for production).

## 3. Next Steps to Start Using It

### Step 1: Add Test API Key (REQUIRED)
Open `/Users/pavelp/Desktop/BrangHunt/.env.local` and add:

```bash
# Existing production key
GOOGLE_GEMINI_API_KEY=your_existing_key

# NEW: Test API key for token tracking
GOOGLE_GEMINI_API_KEY_TEST=AIzaSyBmskmNxJywENV9E1U6Te13Q9DmoNPGQCY
```

### Step 2: Restart Dev Server
```bash
# Stop current server (Ctrl+C)
npm run dev
```

### Step 3: Create Your First Test Project
1. Go to Projects page
2. Click "Create New Project"
3. Fill in Project Name
4. **Select "🧪 Test (Token Tracking)"** from dropdown
5. (Optional) Add description
6. Click Create

### Step 4: Test It Out
1. Upload some test images to your test project
2. Run batch extraction
3. Check console logs for: `🧪 Using TEST Gemini API key for token tracking`
4. Monitor token usage in [Google Cloud Console](https://console.cloud.google.com/)

## How It Works Behind the Scenes

When you process images in:

**Regular Projects:**
- Uses `GOOGLE_GEMINI_API_KEY`
- Console: `🔑 Project type: regular`
- For production workloads

**Test Projects:**
- Uses `GOOGLE_GEMINI_API_KEY_TEST`
- Console: `🧪 Using TEST Gemini API key for token tracking`
- For testing, development, cost tracking

## Updated API Routes

Currently updated (3/13 routes):
- ✅ `/api/extract-brand` - Single extraction
- ✅ `/api/batch-extract-project` - Batch extraction
- ✅ `/api/filter-foodgraph` - AI filtering

Remaining routes will continue using regular key until updated (see `API_ROUTES_UPDATE_CHECKLIST.md`).

## Benefits You Get Immediately

✅ **Separate Token Tracking** - See test vs production usage  
✅ **Cost Analysis** - Understand token consumption patterns  
✅ **Safe Testing** - Experiment without production quota impact  
✅ **Visual Clarity** - 🧪 TEST badge shows project type  
✅ **Easy Switching** - Just select type when creating project  

## Files Modified

- `app/projects/page.tsx` - Added UI selector and TEST badge
- `app/api/projects/route.ts` - Save project_type to database
- `lib/gemini.ts` - API key selection logic
- `app/api/extract-brand/route.ts` - Uses project type
- `app/api/batch-extract-project/route.ts` - Uses project type
- `app/api/filter-foodgraph/route.ts` - Uses project type

## Documentation Files

- `SETUP_TEST_API_KEY.md` - Environment setup guide
- `API_ROUTES_UPDATE_CHECKLIST.md` - Remaining routes to update
- `PROJECT_TYPE_IMPLEMENTATION_SUMMARY.md` - Complete overview
- `WHERE_TO_SEE_PROJECT_TYPE.md` - This guide

## Testing Checklist

- [ ] Add test API key to `.env.local`
- [ ] Restart dev server
- [ ] Create new project, verify dropdown shows both options
- [ ] Create test project (select Test option)
- [ ] Verify 🧪 TEST badge appears on project card
- [ ] Upload test images
- [ ] Run batch extraction
- [ ] Check console for 🧪 emoji confirmation
- [ ] Check Google Cloud Console for usage on test key

---

**Status:** ✅ UI Complete - Ready to Use  
**Time Saved:** Separate tracking will help optimize costs  
**Next:** Add test API key to `.env.local` and restart server

