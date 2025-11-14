# API Routes Project Type Update Checklist

## Overview
This checklist tracks which API routes have been updated to support project type (regular/test) for separate Gemini API key usage.

## Status Legend
- ✅ **COMPLETE**: Route updated and tested
- 🔄 **IN PROGRESS**: Route being updated
- ⏳ **PENDING**: Route needs update

## Routes Using Gemini Functions

### Product Extraction Routes
| Route | Status | Gemini Function | Notes |
|-------|--------|----------------|-------|
| `/api/extract-brand` | ✅ COMPLETE | `extractProductInfo()` | Updated to fetch project_type from query |
| `/api/batch-extract-project` | ✅ COMPLETE | `extractProductInfo()` | Updated with projectType parameter |
| `/api/batch-extract-info` | ⏳ PENDING | `extractProductInfo()` | Needs update |

### AI Filtering Routes
| Route | Status | Gemini Function | Notes |
|-------|--------|----------------|-------|
| `/api/filter-foodgraph` | ⏳ PENDING | `compareProductImages()` | Needs update |
| `/api/batch-filter-ai` | ⏳ PENDING | `compareProductImages()` | Needs update |

### Pipeline Routes
| Route | Status | Gemini Function | Notes |
|-------|--------|----------------|-------|
| `/api/batch-search-and-save` | ⏳ PENDING | `compareProductImages()`, `selectBestMatchFromMultiple()` | Pipeline 1 - AI Filter |
| `/api/batch-search-visual` | ⏳ PENDING | `selectBestMatchFromMultiple()` | Pipeline 2 - Visual Only |
| `/api/batch-search-visual-timed` | ⏳ PENDING | `selectBestMatchFromMultiple()` | Performance testing version |

### Contextual Analysis Routes
| Route | Status | Gemini Function | Notes |
|-------|--------|----------------|-------|
| `/api/contextual-analysis` | ⏳ PENDING | `extractProductInfo()` | Manual contextual analysis |
| `/api/batch-contextual-project` | ⏳ PENDING | `extractProductInfo()` | Batch contextual analysis |

### Price Extraction Routes
| Route | Status | Gemini Function | Notes |
|-------|--------|----------------|-------|
| `/api/extract-price` | ⏳ PENDING | `extractPrice()` | Needs update |

### Detection Routes
| Route | Status | Gemini Function | Notes |
|-------|--------|----------------|-------|
| `/api/detect-gemini` | ⏳ PENDING | `detectProducts()` | Manual detection |
| `/api/batch-detect-project` | ⏳ PENDING | `detectProducts()` | Batch detection |

### Validation Routes
| Route | Status | Gemini Function | Notes |
|-------|--------|----------------|-------|
| `/api/validate-image` | ⏳ PENDING | `validateImageQuality()` | Image quality check |

## Update Pattern

For each route, follow this pattern:

### 1. Fetch Project Type
```typescript
// Option A: From projectId (batch operations)
const { data: project } = await supabase
  .from('branghunt_projects')
  .select('project_type')
  .eq('id', projectId)
  .single();

const projectType = (project?.project_type as 'regular' | 'test') || 'regular';

// Option B: From imageId (single operations)  
const { data: detection, error } = await supabase
  .from('branghunt_detections')
  .select('*, image:branghunt_images(*, project:branghunt_projects(id, project_type))')
  .eq('id', detectionId)
  .single();

const projectType = (detection.image?.project?.project_type as 'regular' | 'test') || 'regular';
```

### 2. Pass to Gemini Functions
```typescript
// extractProductInfo
const productInfo = await extractProductInfo(
  imageBase64,
  mimeType,
  boundingBox,
  projectId,
  projectType  // ← Add this parameter
);

// compareProductImages
const comparison = await compareProductImages(
  originalImageBase64,
  foodgraphImageUrl,
  true,  // returnDetails
  projectId,
  projectType  // ← Add this parameter
);

// extractPrice
const priceInfo = await extractPrice(
  imageBase64,
  mimeType,
  boundingBox,
  productInfo,
  projectType  // ← Add this parameter
);

// selectBestMatchFromMultiple
const selection = await selectBestMatchFromMultiple(
  croppedBase64,
  extractedInfo,
  candidates,
  projectId,
  projectType  // ← Add this parameter
);

// detectProducts
const detections = await detectProducts(
  imageBase64,
  mimeType,
  projectType  // ← Add this parameter
);

// validateImageQuality
const validation = await validateImageQuality(
  imageBase64,
  mimeType,
  projectType  // ← Add this parameter
);
```

### 3. Add Console Logging
```typescript
console.log(`🔑 Using ${projectType} project - API key: ${projectType === 'test' ? 'TEST' : 'REGULAR'}`);
```

## Testing Plan

After updating all routes:

1. **Create Test Project**: Add UI to create project with type='test'
2. **Upload Test Images**: Upload images to test project
3. **Run Each Operation**: Test each API route with test project
4. **Verify Console Logs**: Check for 🧪 emoji in console confirming test API key usage
5. **Monitor Token Usage**: Check Google Cloud Console for separate usage stats

## Next Steps

1. ✅ Update lib/gemini.ts (DONE)
2. ✅ Update extract-brand and batch-extract-project (DONE)
3. ⏳ Update remaining 11 API routes
4. ⏳ Add project type selector to UI
5. ⏳ Test implementation
6. ⏳ Deploy to production

