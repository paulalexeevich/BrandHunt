# BrangHunt Deployment Information

## 🚀 Latest Deployment - October 11, 2025

### GitHub Repository
- **Repository**: https://github.com/paulalexeevich/BrandHunt
- **Branch**: main
- **Latest Commits**: 3 commits pushed
  1. Price extraction feature implementation
  2. README documentation update
  3. Label toggle feature

### Vercel Production Deployment
- **Status**: ✅ Ready (Production)
- **Latest URL**: https://branghunt-1fsaiwmsi-paulalexeevichs-projects.vercel.app
- **Build Time**: 57 seconds
- **Build Status**: ✓ Compiled successfully
- **Deployed**: October 11, 2025

### New Features Deployed

#### 1. Price Extraction Feature 💰
- Extract price information from price tags below products
- Expands bounding box 50% downward to capture price tag area
- Context-aware extraction using product information
- Displays price with currency symbol and confidence score
- Average processing time: 5-10 seconds per product
- High accuracy: 90%+ confidence scores

**Database Changes:**
- Added `price` column (TEXT)
- Added `price_currency` column (TEXT, default: USD)
- Added `price_confidence` column (DECIMAL 3,2)

**API Endpoints:**
- `POST /api/extract-price` - Extract price from price tag below product

#### 2. Label Toggle Feature 🏷️
- New toggle button: "Show/Hide Labels"
- Hides product name labels on bounding boxes
- Allows clear visibility of actual price tags on shelf
- Labels shown by default, can be hidden on demand

### Build Configuration
- **Framework**: Next.js 15.5.4
- **Build Time**: ~60 seconds
- **Output**: Static + Server-Side Rendering
- **Region**: Washington, D.C., USA (East) – iad1
- **Machine**: 2 cores, 8 GB RAM

### Routes Deployed
```
Route (app)                                 Size  First Load JS
┌ ○ /                                    2.31 kB         108 kB
├ ○ /_not-found                            994 B         103 kB
├ ƒ /analyze/[imageId]                   7.11 kB         113 kB
├ ƒ /api/detect                            149 B         102 kB
├ ƒ /api/extract-brand                     149 B         102 kB
├ ƒ /api/extract-price                     149 B         102 kB  [NEW]
├ ƒ /api/filter-foodgraph                  149 B         102 kB
├ ƒ /api/images                            149 B         102 kB
├ ƒ /api/images/[imageId]                  149 B         102 kB
├ ƒ /api/process                           149 B         102 kB
├ ƒ /api/results/[imageId]                 149 B         102 kB
├ ƒ /api/search-foodgraph                  149 B         102 kB
├ ƒ /api/upload                            149 B         102 kB
├ ○ /gallery                             1.35 kB         107 kB
├ ƒ /results/[imageId]                   1.39 kB         107 kB
└ ○ /test-detection                     11.5 kB         117 kB
```

### Environment Variables Required
✅ All environment variables configured in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_GEMINI_API_KEY`
- `FOODGRAPH_EMAIL`
- `FOODGRAPH_PASSWORD`

### Deployment Commands Used

```bash
# Push to GitHub
git push origin main

# Deploy to Vercel (Production)
npx vercel --prod --yes

# Check deployment status
npx vercel ls
```

### Testing the Deployment

1. **Access the App**: https://branghunt-1fsaiwmsi-paulalexeevichs-projects.vercel.app
2. **Upload Image**: Use the home page to upload a retail shelf image
3. **Detect Products**: Navigate to analyze page and detect products
4. **Extract Brand**: Click on products to extract brand information
5. **Extract Price**: Click "💰 Extract Price" button for products with extracted brands
6. **Toggle Labels**: Click "🏷️ Hide Labels" to see actual price tags on shelf

### Performance Notes

- Build completed successfully in 57 seconds
- No linting errors
- Type checking passed
- All routes compiled successfully
- Static page generation completed (16/16 pages)

### Documentation

- `PRICE_EXTRACTION_FEATURE.md` - Complete technical documentation for price extraction
- `README.md` - Updated with new features
- `DEPLOYMENT.md` - This file

### Support

For issues or questions:
- GitHub Issues: https://github.com/paulalexeevich/BrandHunt/issues
- Check deployment logs: `npx vercel inspect [deployment-url] --logs`

---

**Last Updated**: October 11, 2025  
**Deployment ID**: branghunt-1fsaiwmsi-paulalexeevichs-projects  
**Status**: ✅ Live and Ready

