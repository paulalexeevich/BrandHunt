# Architecture Replication Guide

Quick reference for building similar AI-powered image analysis projects using the BrangHunt architectural patterns.

## Core Architecture Decisions

### 1. Image Storage Strategy: S3 URLs vs Database

**CRITICAL: Store S3 URLs in database, NOT base64 images**

**Implementation:**
```typescript
// Database schema
images_table: {
  id: uuid
  s3_url: text (nullable)        // Primary: S3 URL
  file_path: text (nullable)     // Legacy: base64 fallback
  storage_type: text             // 's3' or 'base64'
  mime_type: text
}

// Upload pattern (lib/image-processor.ts pattern)
1. Upload image to S3 bucket
2. Get presigned/public URL
3. Store only URL in database (1KB vs 2MB per image)
4. Use HEAD request to verify upload success

// Fetch pattern
1. If s3_url exists: fetch from S3 on-demand
2. If file_path exists: use base64 (legacy)
3. Helper: getImageUrl(image) for consistent display
```

**Benefits:**
- 2500x smaller database (1KB vs 2.5MB per image)
- 15x faster upload (4s vs 60s for 8 images)
- Scalable to 100K+ images

**Files to reference:**
- `lib/image-utils.ts`: getImageUrl() helper
- `lib/image-processor.ts`: getImageBase64ForProcessing()
- `app/api/upload-excel/route.ts`: S3 upload implementation

---

### 2. Parallel Processing: Batch Operations with Concurrency Control

**CRITICAL: Use detection-level parallelism with controlled concurrency**

**Pattern:**
```typescript
// Bad: Image-level parallelism
for (image of images) {
  for (detection of image.detections) {
    await processDetection() // Sequential!
  }
}

// Good: Detection-level parallelism
const allDetections = fetchAllDetectionsFromAllImages()
const concurrency = 20 // Adjust based on API limits

for (batch of chunk(allDetections, concurrency)) {
  const promises = batch.map(det => processDetection(det))
  
  // Sequential await for real-time progress
  for (const promise of promises) {
    const result = await promise
    sendProgress(currentIndex, total) // SSE update
  }
}
```

**Concurrency Limits:**
- Gemini API: 2000 RPM → use 50-100 concurrent
- Supabase Free: 20 connections → use 10-15 concurrent
- Supabase Pro: 60 connections → use 20-30 concurrent
- Custom Detection API: Test and adjust

**Key Files:**
- `app/api/batch-extract-project/route.ts`: Detection-level parallelism
- `app/api/batch-search-visual-project/route.ts`: Rolling window concurrency
- `CONCURRENCY_500_ERROR_FIX.md`: Critical lessons learned

---

### 3. Supabase Backend: RLS + Service Role Pattern

**Database Schema:**
```sql
-- Core tables with RLS
projects (
  id uuid PRIMARY KEY,
  name text,
  project_type text CHECK IN ('regular', 'test'),
  owner_id uuid REFERENCES auth.users,
  created_at timestamp
)

images (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES projects,
  s3_url text,
  storage_type text DEFAULT 's3',
  created_at timestamp
)

detections (
  id uuid PRIMARY KEY,
  image_id uuid REFERENCES images,
  bounding_box jsonb,  -- {x, y, width, height}
  confidence decimal(4,3),
  brand_name text,
  fully_analyzed boolean DEFAULT false,
  created_at timestamp
)

analysis_results (
  id uuid PRIMARY KEY,
  detection_id uuid REFERENCES detections,
  api_result jsonb,
  processing_stage text,
  UNIQUE(detection_id, external_id, processing_stage)
)
```

**Authentication Pattern:**
```typescript
// lib/auth.ts
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Regular client (RLS enforced)
export function createClient(cookies) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  )
}

// Service role client (bypasses RLS - admin only)
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Keep secret!
    { auth: { persistSession: false } }
  )
}
```

**When to use Service Role:**
- Fetching auth.users emails (not accessible via RLS)
- Batch operations across multiple users
- Admin operations like user deletion
- **NEVER** expose service role key to client

**Key Files:**
- `lib/auth.ts`: Client creation patterns
- `app/api/projects/route.ts`: RLS queries
- `app/api/users/route.ts`: Service role usage

---

### 4. Excel Upload: Parallel Image Processing

**Implementation:**
```typescript
// app/api/upload-excel/route.ts pattern

1. Parse Excel file with xlsx library
2. Extract image URLs from rows
3. Process in parallel batches (concurrency=10):
   - Download image
   - Upload to S3
   - Store URL in database
4. Stream progress via SSE

// Critical: Use streaming for large files
export const runtime = 'nodejs' // Required for SSE in Vercel

async function processExcel(file, projectId) {
  const workbook = xlsx.read(await file.arrayBuffer())
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheet])
  
  const imageUrls = rows.map(row => row.image_url)
  const concurrency = 10
  
  for (batch of chunk(imageUrls, concurrency)) {
    const promises = batch.map(async (url) => {
      const response = await fetch(url)
      const buffer = await response.arrayBuffer()
      const s3Url = await uploadToS3(buffer)
      await supabase.from('images').insert({
        project_id: projectId,
        s3_url: s3Url,
        storage_type: 's3'
      })
    })
    
    for (const promise of promises) {
      await promise
      sendProgress() // SSE update
    }
  }
}
```

**Key Files:**
- `app/api/upload-excel/route.ts`: Complete implementation
- `EXCEL_UPLOAD_FEATURE.md`: Feature documentation

---

### 5. Multi-Stage Processing Pipeline

**Architecture:**
```
Stage 1: Detection (Your Detection API)
  ↓
Stage 2: Extraction (Gemini API)
  ↓
Stage 3: Matching (External API + Gemini)
  ↓
Stage 4: Validation (Manual Review)
```

**Implementation Pattern:**
```typescript
// Each stage updates detection status
await supabase
  .from('detections')
  .update({
    brand_name: extracted.brand,
    confidence: extracted.confidence,
    fully_analyzed: true,
    analysis_completed_at: new Date()
  })
  .eq('id', detectionId)

// Store external API results separately
await supabase
  .from('analysis_results')
  .upsert({
    detection_id: detectionId,
    external_id: externalResult.id,
    processing_stage: 'search', // or 'filter', 'match'
    api_result: externalResult
  }, {
    onConflict: 'detection_id,external_id,processing_stage'
  })
```

**Key Pattern: UPSERT for progressive stages**
- Don't insert multiple rows per stage
- Update single row as it progresses
- Use separate table for multi-candidate results

---

### 6. API Key Management: Project Type System

**Environment Variables:**
```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Your Detection API
DETECTION_API_KEY=xxx
DETECTION_API_KEY_TEST=xxx  # Optional: for testing

# Gemini API (or your AI API)
GOOGLE_GEMINI_API_KEY=AIzaSy...
GOOGLE_GEMINI_API_KEY_TEST=AIzaSy...  # Optional: for token tracking

# External Matching API
EXTERNAL_API_KEY=xxx
```

**Project Type Pattern:**
```typescript
// Database: projects.project_type = 'regular' | 'test'

// lib/gemini.ts (adapt for your AI API)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!)
const genAITest = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY_TEST!)

export function getGenAI(projectType: 'regular' | 'test') {
  if (projectType === 'test') {
    console.log('🧪 Using TEST API key for token tracking')
    return genAITest
  }
  return genAI
}

// API routes: fetch project type and pass to functions
const { data: project } = await supabase
  .from('projects')
  .select('project_type')
  .eq('id', projectId)
  .single()

const ai = getGenAI(project.project_type)
```

**Benefits:**
- Separate quota tracking for production vs testing
- Safe experimentation without production impact
- Cost analysis per project type

---

### 7. Server-Sent Events (SSE) for Real-Time Progress

**CRITICAL: Required for batch operation UX**

**Backend Pattern:**
```typescript
// app/api/batch-*/route.ts
export const runtime = 'nodejs' // REQUIRED for Vercel

export async function POST(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      
      function send(event: string, data: any) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }
      
      try {
        send('start', { total: items.length })
        
        for (let i = 0; i < items.length; i++) {
          const result = await processItem(items[i])
          send('progress', { 
            current: i + 1, 
            total: items.length,
            item: result 
          })
        }
        
        send('complete', { results })
      } catch (error) {
        send('error', { message: error.message })
      } finally {
        controller.close()
      }
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
```

**Frontend Pattern:**
```typescript
// React component
const [progress, setProgress] = useState({ current: 0, total: 0 })

async function startBatch() {
  const response = await fetch('/api/batch-process', { method: 'POST' })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''
    
    for (const line of lines) {
      if (!line.trim()) continue
      
      const [eventLine, dataLine] = line.split('\n')
      const event = eventLine.replace('event: ', '')
      const data = JSON.parse(dataLine.replace('data: ', ''))
      
      if (event === 'progress') {
        setProgress({ current: data.current, total: data.total })
      }
    }
  }
}
```

**Key Files:**
- `app/api/batch-extract-project/route.ts`: SSE implementation
- `BATCH_PROGRESS_INDICATORS.md`: Complete documentation

---

## Quick Start Checklist

### 1. Database Setup
```sql
-- Run in Supabase SQL Editor
CREATE TABLE projects (...);
CREATE TABLE images (...);
CREATE TABLE detections (...);
CREATE TABLE analysis_results (...);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- Create policies (see app/api for examples)
```

### 2. Environment Setup
```bash
cp .env.example .env.local
# Fill in all API keys
npm install
npm run dev
```

### 3. Replace APIs

**Detection API:**
- Replace: `app/api/detect-yolo/route.ts` → `app/api/detect-custom/route.ts`
- Pattern: Accept image → Return bounding boxes + confidence
- Update: `app/api/batch-detect-project/route.ts`

**Extraction API (Gemini):**
- Keep: `lib/gemini.ts` structure
- Replace: API calls with your AI provider
- Maintain: Same input/output interfaces

**Matching API:**
- Replace: `lib/foodgraph.ts` → `lib/your-external-api.ts`
- Pattern: Search by criteria → Filter → Match
- Update: All `app/api/batch-*/route.ts` files

### 4. Test Pipeline
```bash
1. Upload images via Excel
2. Run batch detection (Stage 1)
3. Run batch extraction (Stage 2)
4. Run batch matching (Stage 3)
5. Manual review (Stage 4)
```

---

## Critical Files to Study

### Storage & Processing
- `lib/image-utils.ts` - Image URL handling
- `lib/image-processor.ts` - S3 fetch for processing
- `app/api/upload-excel/route.ts` - Excel upload

### Batch Processing
- `app/api/batch-extract-project/route.ts` - Detection-level parallelism
- `app/api/batch-search-visual-project/route.ts` - Rolling window concurrency
- `CONCURRENCY_500_ERROR_FIX.md` - Critical lessons

### API Integration
- `lib/gemini.ts` - AI API wrapper pattern
- `lib/foodgraph.ts` - External API wrapper pattern
- `lib/auth.ts` - Supabase client patterns

### Frontend
- `app/projects/page.tsx` - Project listing
- `app/analyze/[imageId]/page.tsx` - Analysis UI (2700 lines - refactor recommended)

---

## Performance Targets

- **Image Upload:** 2s per image (S3 parallel upload)
- **Detection:** 1-3s per image (depends on your API)
- **Extraction:** 2-3s per detection (Gemini 2.5 Flash)
- **Matching:** 0.1-0.3s per candidate (pre-filter + AI)

**Total for 100 images with 5 products each:**
- Upload: 200s (parallel)
- Detection: 200s (parallel, concurrency=20)
- Extraction: 500s (parallel, concurrency=50)
- Matching: 100s (parallel, concurrency=20)
- **Total: ~15-20 minutes**

---

## Common Pitfalls

1. **Don't store base64 in database** - Use S3 URLs
2. **Don't use image-level parallelism** - Use detection-level
3. **Don't forget `export const runtime = 'nodejs'`** - Required for SSE
4. **Don't use .not() on nullable booleans** - Use .or('field.is.null,field.eq.true')
5. **Don't fetch all data on page load** - Use lazy loading for large datasets
6. **Don't skip concurrency limits** - Start low (10-20), test, adjust
7. **Don't expose service role key** - Server-side only
8. **Don't insert duplicates** - Use UPSERT with proper unique constraints

---

## Documentation to Create

1. `SETUP_GUIDE.md` - Environment setup
2. `API_INTEGRATION.md` - Your specific API patterns
3. `DEPLOYMENT.md` - Vercel deployment steps
4. `TROUBLESHOOTING.md` - Common errors and fixes

---

## Migration from BrangHunt

**Search & Replace:**
- `detect-yolo` → `detect-yourapi`
- `foodgraph` → `yourmatchingapi`
- `branghunt_` → `yourproject_` (table prefixes)
- `YOLO_API_KEY` → `YOUR_DETECTION_API_KEY`

**Keep Same:**
- S3 storage pattern
- Parallel processing pattern
- SSE streaming pattern
- Supabase RLS patterns
- Project type system

---

## Questions?

Study these key documents in the codebase:
- `S3_URL_STORAGE_COMPLETE.md`
- `DETECTION_LEVEL_PARALLELISM_PROPOSAL.md`
- `BATCH_PROGRESS_INDICATORS.md`
- `CONCURRENCY_500_ERROR_FIX.md`
- `PROJECT_TYPE_IMPLEMENTATION_SUMMARY.md`

Good luck! 🚀

