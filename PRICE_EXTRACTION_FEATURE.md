# Price Extraction Feature

## Overview
Added price extraction capability to BrangHunt that uses Gemini AI to extract price information from price tags located below detected products in retail shelf images.

## Feature Details

### 1. How It Works
- **Bounding Box Expansion**: When extracting price for a product, the system expands the product's bounding box downward by 50% to capture the price tag area below the product
- **Context-Aware Extraction**: Sends product information (brand, product name, label) to Gemini AI to help identify the correct price tag
- **Confidence Scoring**: Returns a confidence score (0.0 to 1.0) indicating how confident the AI is about the extracted price

### 2. Database Changes
Added three new columns to `branghunt_detections` table:
- `price` (TEXT): The extracted price value (e.g., "2.49", "5.99")
- `price_currency` (TEXT): Currency code (default: "USD")
- `price_confidence` (DECIMAL): Confidence score from 0.0 to 1.0

**Migration File**: `migrations/add_price_columns.sql`

### 3. API Endpoint
**Route**: `/api/extract-price`
- **Method**: POST
- **Body**: `{ detectionId: string }`
- **Response**: 
  ```json
  {
    "success": true,
    "price": "2.49",
    "currency": "USD",
    "confidence": 0.85
  }
  ```
- **Timeout**: 300 seconds (5 minutes)

### 4. Gemini AI Integration
**New Function**: `extractPrice()` in `lib/gemini.ts`
- Uses Gemini 2.5 Flash model
- Temperature: 0 (deterministic)
- Response format: JSON
- Expands bounding box by 50% downward to capture price tags
- Includes product context in prompt for accurate price identification

### 5. UI Changes
Located in `/app/analyze/[imageId]/page.tsx`:

**Step 2 - Brand Extraction View**:
- After extracting product information, an "💰 Extract Price" button appears
- Button shows loading state: "💰 Extracting..."
- Once extracted, price displays with currency symbol and confidence percentage
- Format: `Price: $2.49 (85%)`
- Price shown in green color with confidence score in gray

### 6. TypeScript Interface Updates
Updated `Detection` interface in:
- `lib/supabase.ts` (BranghuntDetection)
- `app/analyze/[imageId]/page.tsx` (Detection)

Added fields:
```typescript
price: string | null;
price_currency: string | null;
price_confidence: number | null;
```

## Usage Flow

1. **Detect Products**: Run product detection to identify all products in image
2. **Extract Brand**: Click on a product to extract brand, category, and other details
3. **Extract Price**: Click "💰 Extract Price" button to extract the price from the tag below the product
4. **View Results**: Price appears below the product details with confidence score

## Example Prompt to Gemini

```
Analyze this retail shelf image and extract the PRICE for "Betty Crocker Fudge Brownie Mix".

The product is located in the upper portion of this image, and the price tag should be BELOW the product.

Extract the following information:
1. Price (numeric value only, e.g., "2.49", "5.99", "12.99")
2. Currency (e.g., "USD", "EUR", "GBP")
3. Confidence (0.0 to 1.0) - how confident you are about this price

Look for:
- Price tags below the product
- Digital displays showing prices
- Paper labels with prices
- Any text indicating price (including $ symbols)
```

## Technical Implementation Details

### Bounding Box Expansion Logic
```typescript
const productHeight = boundingBox.y1 - boundingBox.y0;
const expandedBox = {
  x0: boundingBox.x0,
  y0: boundingBox.y0,
  x1: boundingBox.x1,
  y1: Math.min(1000, boundingBox.y1 + (productHeight * 0.5)), // Expand down by 50%
};
```

### Error Handling
- Returns `{ price: "Unknown", currency: "USD", confidence: 0 }` if no price found
- Handles Gemini API failures gracefully
- Validates detection and image data before processing
- Provides detailed error messages to UI

## Files Modified

1. `lib/gemini.ts` - Added `extractPrice()` function
2. `app/api/extract-price/route.ts` - New API endpoint
3. `lib/supabase.ts` - Updated interface with price fields
4. `app/analyze/[imageId]/page.tsx` - Added UI button and price display
5. `migrations/add_price_columns.sql` - Database schema update

## Future Enhancements

Potential improvements:
1. Support for price ranges (e.g., "$2.49 - $3.99")
2. Sale price detection (original + discounted price)
3. Unit price extraction (e.g., "$0.15/oz")
4. Multi-currency support with conversion
5. Price history tracking over time
6. Bulk price extraction for all products

## Testing

To test the feature:
1. Upload a retail shelf image
2. Run product detection
3. Extract brand information for a product
4. Click "💰 Extract Price" button
5. Verify the price appears with confidence score

## Performance

- Average extraction time: 5-10 seconds per product
- Uses same Gemini 2.5 Flash model as brand extraction
- Cropped region reduces API processing time
- Price extraction is independent and doesn't block other operations

