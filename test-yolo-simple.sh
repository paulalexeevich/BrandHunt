#!/bin/bash

echo "🎯 YOLO API Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📡 Testing YOLO API at: http://157.180.25.214/api/detect"
echo ""

# Download image
echo "📥 Downloading test image..."
curl -s 'https://target-product-images.s3.us-west-1.amazonaws.com/images/Store+%231450+-+1727+Martin+Luther+King+Jr+Blvd%2C+Houma%2C+LA+70360/11-11-2025/IMG_3116.jpg' -o /tmp/test_shelf.jpg

if [ -f /tmp/test_shelf.jpg ]; then
    SIZE=$(du -h /tmp/test_shelf.jpg | cut -f1)
    echo "✅ Image downloaded ($SIZE)"
else
    echo "❌ Failed to download image"
    exit 1
fi

# Encode to base64
echo "🔄 Encoding to base64..."
BASE64_IMAGE=$(base64 -i /tmp/test_shelf.jpg)
echo "✅ Encoded (${#BASE64_IMAGE} characters)"

# Create JSON payload
echo "📦 Creating JSON payload..."
JSON_PAYLOAD=$(cat <<JSON
{
  "file": "$BASE64_IMAGE"
}
JSON
)

# Send to YOLO API
echo ""
echo "🚀 Sending to YOLO API..."
START=$(date +%s)

RESPONSE=$(curl -s -X POST http://157.180.25.214/api/detect \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD" \
  --max-time 30)

END=$(date +%s)
DURATION=$((END - START))

echo "✅ Response received in ${DURATION}s"
echo ""
echo "📊 YOLO API Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

# Parse results
DETECTIONS=$(echo "$RESPONSE" | grep -o '"total_detections":[0-9]*' | cut -d':' -f2)

if [ ! -z "$DETECTIONS" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ YOLO API TEST SUCCESSFUL"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⏱️  Processing time: ${DURATION}s"
    echo "🎯 Products detected: $DETECTIONS"
    echo "🔓 No authentication required"
    echo "✅ Ready for batch processing!"
else
    echo ""
    echo "⚠️  API responded but result format unexpected"
fi

# Cleanup
rm -f /tmp/test_shelf.jpg

