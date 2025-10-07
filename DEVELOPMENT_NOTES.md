# BrangHunt Development Notes

## Project Overview

BrangHunt is an AI-powered product detection and brand recognition platform that processes uploaded images to:
1. Detect products using Google Gemini 2.5 Flash
2. Extract brand names from detected products
3. Search FoodGraph API for matching products (TOP 50 results)
4. Display results with interactive bounding boxes

## Technology Stack

- **Framework**: Next.js 15 with App Router and TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **AI Model**: Google Gemini 2.5 Flash API
- **Product Data**: FoodGraph API
- **Icons**: Lucide React
- **Image Storage**: Base64 in Supabase (for simplicity)

## Database Architecture

### Schema Design

Three main tables with relationships:

1. **branghunt_images** (parent)
   - Stores uploaded images with metadata
   - Base64 encoded image data for simplicity
   - Processing status tracking

2. **branghunt_detections** (child of images)
   - One record per detected product
   - Bounding box in normalized coordinates (0-1000)
   - Brand name extracted by Gemini

3. **branghunt_foodgraph_results** (child of detections)
   - Top 50 FoodGraph search results per detection
   - Includes product name, brand, category, images

### Key Design Decisions

- **Base64 Storage**: Simplified deployment without separate file storage
- **Normalized Coordinates**: Bounding boxes use 0-1000 scale for easy percentage conversion
- **JSONB Fields**: Flexible storage for full API responses
- **Foreign Key Cascade**: Deleting an image removes all related data

## API Integration Details

### Google Gemini 2.5 Flash

**Product Detection**:
- Model: `gemini-2.5-flash`
- Temperature: 0.1 (deterministic)
- Input: Base64 image + prompt
- Output: JSON array of detections with bounding boxes
- Format: `[{box_2d: [y0, x0, y1, x1], label: "description"}]`

**Brand Extraction**:
- Same model with focused prompt
- Provides bounding box context to focus on specific product
- Fallback to product label if extraction fails

### FoodGraph API

**Authentication**:
- Token-based authentication with email/password
- Token caching with 50-minute expiry (safe margin before 60min expiry)
- Automatic re-authentication on token expiration

**Product Search**:
- Endpoint: `/v1/catalog/products/search/terms`
- Limit: 50 products (TOP 50 requirement)
- Search term: Brand name or product label
- Response includes: GTIN, name, brand, category, images

**Image Extraction**:
- Prioritizes "front" perspective images
- Falls back to first available image
- Supports both desktop and mobile URLs

## Application Flow

### 1. Upload Phase
```
User selects image → 
Preview displayed → 
POST /api/upload → 
Store in branghunt_images → 
Return imageId
```

### 2. Processing Phase
```
POST /api/process with imageId →
Fetch image from database →
Gemini product detection →
For each detection:
  - Extract brand with Gemini
  - Save to branghunt_detections
  - Search FoodGraph (TOP 50)
  - Save results to branghunt_foodgraph_results
  - 100ms delay between API calls
Update image status to 'completed'
```

### 3. Results Display
```
GET /api/results/[imageId] →
Fetch image + detections + FoodGraph results →
Display with:
  - Interactive bounding boxes
  - Detection selector
  - Product matches with images
```

## Key Implementation Patterns

### Error Handling
- Try-catch blocks around all API calls
- Graceful degradation (continue if one detection fails)
- Status tracking in database (pending/processing/completed/error)

### Rate Limiting
- 100ms delay between FoodGraph API calls
- Token caching to reduce authentication requests
- Sequential processing to avoid overwhelming APIs

### UI/UX Features
- Real-time status updates during processing
- Interactive bounding box visualization
- Toggle to show/hide bounding boxes
- Click detection to view details
- Top 10 products displayed (out of 50 stored)

## Configuration Requirements

### Environment Variables

Required for deployment:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ybzoioqgbvcxqiejopja.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_key>
GOOGLE_GEMINI_API_KEY=<your_key>
FOODGRAPH_EMAIL=<your_email>
FOODGRAPH_PASSWORD=<your_password>
```

### Next.js Configuration

- Uses App Router (Next.js 15)
- API routes in `/app/api/`
- Dynamic routes for results: `/results/[imageId]/`
- Max duration: 300s for processing endpoint

## Common Issues and Solutions

### 1. Project Naming
**Issue**: npm doesn't allow capital letters in project names
**Solution**: Renamed directory from "BrangHunt" to "branghunt"

### 2. JSON Parsing from Gemini
**Issue**: Gemini sometimes wraps JSON in markdown code blocks
**Solution**: Clean response by removing ```json and ``` markers

### 3. Token Expiry
**Issue**: FoodGraph tokens expire after 60 minutes
**Solution**: Cache token and set expiry to 50 minutes for safety margin

### 4. Processing Timeout
**Issue**: Multiple detections with FoodGraph searches can be slow
**Solution**: Set maxDuration to 300s in API route

### 5. Bounding Box Coordinates
**Issue**: Need to convert normalized coordinates (0-1000) to percentages
**Solution**: Divide by 1000 and multiply by 100 for CSS positioning

## Performance Optimizations

1. **Token Caching**: Reduces authentication overhead
2. **Minimal Delays**: Only 100ms between FoodGraph calls
3. **Parallel Database Inserts**: Use Promise.all where possible
4. **Base64 Storage**: Eliminates need for file upload services
5. **Limited Display**: Show top 10 of 50 results for faster rendering

## Future Enhancement Ideas

1. **Bulk Upload**: Process multiple images in batch
2. **Image Cropping**: Allow users to crop to specific products
3. **Advanced Filtering**: Filter results by category, brand, etc.
4. **Export**: Download results as JSON/CSV
5. **Analytics**: Track most common brands/products
6. **Comparison**: Side-by-side comparison of detections
7. **Cloud Storage**: Move from base64 to S3/Supabase Storage for large files

## Git Workflow

- Initial commit includes complete working application
- All core features implemented and tested
- Comprehensive documentation included
- .gitignore configured to exclude sensitive data

## Deployment Checklist

- [ ] Set all environment variables
- [ ] Verify Supabase connection
- [ ] Test Gemini API key
- [ ] Validate FoodGraph credentials
- [ ] Run `npm install`
- [ ] Run `npm run build` to test production build
- [ ] Deploy to Vercel/similar platform
- [ ] Test upload and processing flow

## API Rate Limits to Monitor

**Gemini API**:
- Free tier: Check Google AI Studio limits
- Paid tier: Higher throughput available

**FoodGraph API**:
- Check account plan limits
- Monitor API usage in dashboard

**Supabase**:
- Database connections: Monitor active connections
- Storage: Base64 can consume more space than file storage
- API requests: Check plan limits

## Success Metrics

- ✅ Image upload working
- ✅ Product detection accurate
- ✅ Brand extraction successful
- ✅ FoodGraph integration returning results
- ✅ Bounding boxes displaying correctly
- ✅ Results page interactive and informative
- ✅ All data persisted in Supabase
- ✅ Error handling robust
- ✅ Documentation comprehensive

## Maintenance Notes

- **Token Expiry**: Monitor FoodGraph token caching effectiveness
- **API Costs**: Track Gemini API usage for cost optimization
- **Database Size**: Base64 storage grows quickly - consider migration to file storage
- **Performance**: Monitor processing times and optimize if needed
- **Error Logs**: Implement comprehensive logging for production debugging

