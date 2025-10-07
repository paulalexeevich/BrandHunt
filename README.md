# BrangHunt

AI-powered product detection and brand recognition platform using Google Gemini 2.5 Flash and FoodGraph API.

## Features

- **Image Upload**: Upload product images for AI analysis
- **Product Detection**: Automatically detect products in images using Gemini 2.5 Flash with bounding boxes
- **Brand Recognition**: Extract brand names from detected products using AI
- **FoodGraph Integration**: Search FoodGraph catalog for matching products (TOP 50 results)
- **Visual Results**: Interactive visualization with bounding boxes and product information
- **Image Gallery**: Browse all processed images and their results

## Tech Stack

- **Framework**: Next.js 15 with TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini 2.5 Flash API
- **Product Data**: FoodGraph API
- **Icons**: Lucide React

## Database Schema

### Tables

1. **branghunt_images**: Stores uploaded images
   - id, original_filename, file_path (base64), file_size, mime_type
   - width, height, uploaded_at, processed, processing_status

2. **branghunt_detections**: Stores detected products
   - id, image_id (FK), detection_index, bounding_box (JSONB)
   - confidence_score, brand_name, brand_extraction_prompt/response

3. **branghunt_foodgraph_results**: Stores FoodGraph search results
   - id, detection_id (FK), search_term, result_rank
   - product_gtin, product_name, brand_name, category
   - front_image_url, full_data (JSONB)

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the root directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
FOODGRAPH_EMAIL=your_foodgraph_email
FOODGRAPH_PASSWORD=your_foodgraph_password
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

The database schema has already been created in Supabase. Tables:
- branghunt_images
- branghunt_detections
- branghunt_foodgraph_results

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. **Upload**: User uploads a product image
2. **Detection**: Gemini 2.5 Flash detects all products in the image with bounding boxes
3. **Brand Extraction**: For each detected product, Gemini extracts the brand name
4. **Product Search**: Each brand is searched in FoodGraph API (TOP 50 results)
5. **Storage**: All results are stored in Supabase with relationships
6. **Visualization**: Results displayed with interactive bounding boxes and product matches

## API Endpoints

- `POST /api/upload` - Upload image
- `POST /api/process` - Process image (detection + brand extraction + FoodGraph search)
- `GET /api/images` - Get all processed images
- `GET /api/results/[imageId]` - Get detailed results for an image

## Pages

- `/` - Home page with image upload
- `/gallery` - Gallery of all processed images
- `/results/[imageId]` - Detailed results for a specific image

## Development Notes

### Key Libraries

- `@google/generative-ai` - Gemini API client
- `@supabase/supabase-js` - Supabase client
- `lucide-react` - Icon library

### Processing Flow

1. Image upload → Store in database with base64 encoding
2. Gemini object detection → Extract bounding boxes and labels
3. For each detection → Gemini brand extraction
4. For each brand → FoodGraph search (50 results)
5. Store all results → Display in interactive UI

### Rate Limiting

- 100ms delay between FoodGraph API requests
- FoodGraph token caching (50-minute expiry)

## Contributing

All development steps are documented in Git commits. See commit history for detailed implementation notes.

## License

Private project for internal use.
