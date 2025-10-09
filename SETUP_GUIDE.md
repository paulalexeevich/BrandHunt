# BrangHunt Setup Guide

## Quick Start

Follow these steps to get BrangHunt running locally.

### 1. Get API Keys

You'll need the following credentials:

#### Supabase
- Project URL: `https://ybzoioqgbvcxqiejopja.supabase.co` (already configured)
- Anon Key: Available in your Supabase project settings

#### Google Gemini API
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create or select a project
3. Generate an API key
4. Copy the key for the next step

#### FoodGraph API
1. Sign up at [FoodGraph](https://www.foodgraph.com/)
2. Get your account credentials (email and password)
3. These will be used for API authentication

### 2. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cd /Users/pavelp/Desktop/branghunt
cp .env.local.example .env.local
```

Edit `.env.local` and add your credentials:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://ybzoioqgbvcxqiejopja.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key_here

# Google Gemini
GOOGLE_GEMINI_API_KEY=your_actual_gemini_key_here

# FoodGraph
FOODGRAPH_EMAIL=your_actual_email@example.com
FOODGRAPH_PASSWORD=your_actual_password_here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Verify Database Schema

The database schema has already been created in Supabase. Verify it's there:

1. Go to Supabase Dashboard
2. Navigate to Table Editor
3. Confirm these tables exist:
   - `branghunt_images`
   - `branghunt_detections`
   - `branghunt_foodgraph_results`

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing the Application

### Test Upload Flow

1. **Upload Image**:
   - Click "Choose Image" on the home page
   - Select a product image (e.g., food product photo)
   - Click "Process Image"

2. **Monitor Processing**:
   - Watch status messages:
     - "Uploading image..."
     - "Processing image..."
   - Processing includes:
     - Product detection with Gemini
     - Brand extraction
     - FoodGraph search (TOP 50)

3. **View Results**:
   - Click "View Results" when processing completes
   - See detected products with bounding boxes
   - Browse FoodGraph matches

### Expected Behavior

**Good Images**:
- Clear product photos with visible brands
- Well-lit with minimal blur
- Products occupy significant portion of image

**Processing Time**:
- Small images with 1-2 products: 10-30 seconds
- Large images with 5+ products: 1-2 minutes
- Time increases with number of detected products

**Results**:
- Each detected product gets a bounding box
- Brand names extracted for each product
- Top 50 FoodGraph results per detection (top 10 displayed)

## Troubleshooting

### "Upload failed"
- Check Supabase credentials in `.env.local`
- Verify Supabase project is active
- Check browser console for errors

### "Processing failed"
- **Gemini API**: Verify API key is valid
- **FoodGraph**: Check email/password are correct
- Check API rate limits haven't been exceeded
- Look at server console logs

### No products detected
- Try a clearer image
- Ensure products are prominent in image
- Check that image contains recognizable products
- Gemini works best with common consumer products

### FoodGraph returns no results
- Brand name might not be in FoodGraph database
- Try more generic search terms
- FoodGraph specializes in food/beverage products

### Database errors
- Verify all three tables exist in Supabase
- Check foreign key relationships are intact
- Review Supabase logs for constraint violations

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# View Git history
git log --oneline

# Check Git status
git status
```

## API Endpoints Reference

### Upload Image
```bash
POST /api/upload
Content-Type: multipart/form-data
Body: { image: File }
Response: { success: true, imageId: string }
```

### Process Image
```bash
POST /api/process
Content-Type: application/json
Body: { imageId: string }
Response: { success: true, detectionsCount: number }
```

### Get All Images
```bash
GET /api/images
Response: { images: Image[] }
```

### Get Results
```bash
GET /api/results/[imageId]
Response: { image: Image, detections: Detection[] }
```

## Performance Tips

1. **Image Size**: Compress images before upload for faster processing
2. **API Limits**: Monitor Gemini and FoodGraph usage
3. **Database**: Base64 storage can grow large - consider file storage for production
4. **Caching**: FoodGraph token cached for 50 minutes to reduce auth calls

## Production Deployment

### Vercel (Recommended)

1. **Install Vercel CLI**:
```bash
npm i -g vercel
```

2. **Deploy**:
```bash
vercel
```

3. **Add Environment Variables**:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add GOOGLE_GEMINI_API_KEY
vercel env add FOODGRAPH_EMAIL
vercel env add FOODGRAPH_PASSWORD
```

4. **Deploy to Production**:
```bash
vercel --prod
```

### Other Platforms

- Configure environment variables in platform settings
- Ensure Node.js 18+ runtime
- Set build command: `npm run build`
- Set start command: `npm start`

## Next Steps

1. Test with various product images
2. Monitor API usage and costs
3. Customize UI styling to match branding
4. Add additional features (see DEVELOPMENT_NOTES.md)
5. Set up error monitoring (Sentry, etc.)
6. Configure analytics (Google Analytics, etc.)

## Support Resources

- **Next.js**: https://nextjs.org/docs
- **Supabase**: https://supabase.com/docs
- **Gemini API**: https://ai.google.dev/gemini-api/docs
- **FoodGraph**: https://api.foodgraph.com/api
- **Tailwind CSS**: https://tailwindcss.com/docs

## Quick Reference

### Project Structure
```
branghunt/
├── app/
│   ├── api/              # API routes
│   ├── gallery/          # Gallery page
│   ├── results/          # Results page
│   ├── page.tsx          # Home/upload page
│   └── layout.tsx        # Root layout
├── lib/
│   ├── supabase.ts       # Supabase client
│   ├── gemini.ts         # Gemini API
│   └── foodgraph.ts      # FoodGraph API
├── .env.local            # Environment variables
└── README.md             # Documentation
```

### Database Schema
```
branghunt_images (parent)
  └── branghunt_detections (child)
      └── branghunt_foodgraph_results (child)
```

### Processing Flow
```
Upload → Detect → Extract Brands → Search FoodGraph → Display Results
```

---

**Happy hunting! 🎯**

For issues or questions, check the documentation files:
- `README.md` - Overview and features
- `DEVELOPMENT_NOTES.md` - Technical details
- This file - Setup instructions





