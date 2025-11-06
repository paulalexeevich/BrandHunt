'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function TestCropPage() {
  const [imageId, setImageId] = useState('a756888b-c820-4cb6-9eb8-ab653626d759');
  const [detectionIndex, setDetectionIndex] = useState('1');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testCrop = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // First, get the detection ID from the detection index
      const detectionsResponse = await fetch(`/api/images/${imageId}`);
      if (!detectionsResponse.ok) {
        throw new Error('Failed to fetch image data');
      }
      
      const imageData = await detectionsResponse.json();
      console.log('Image data:', imageData);
      
      // Find detection by index
      const detection = imageData.detections.find((d: any) => d.detection_index === parseInt(detectionIndex));
      if (!detection) {
        throw new Error(`No detection found with index ${detectionIndex}`);
      }

      console.log('Testing crop for detection:', detection);

      // Test the crop
      const response = await fetch('/api/test-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageId,
          detectionId: detection.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to test crop');
      }

      const data = await response.json();
      console.log('Crop result:', data);
      setResult(data);

    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link 
          href="/projects"
          className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Projects
        </Link>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            🔍 Test Image Crop
          </h1>
          <p className="text-gray-600 mb-8">
            Verify that product images are being cropped correctly for AI comparison
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image ID
              </label>
              <input
                type="text"
                value={imageId}
                onChange={(e) => setImageId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter image ID"
              />
              <p className="text-xs text-gray-500 mt-1">
                From the URL: /analyze/[imageId]
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Detection Index (Product Number)
              </label>
              <input
                type="number"
                value={detectionIndex}
                onChange={(e) => setDetectionIndex(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter detection index (e.g., 1, 5, 10)"
              />
              <p className="text-xs text-gray-500 mt-1">
                The product number you see on the bounding boxes
              </p>
            </div>

            <button
              onClick={testCrop}
              disabled={loading || !imageId || !detectionIndex}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? '🔄 Testing Crop...' : '✂️ Test Crop'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <p className="text-red-700 font-medium">Error</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              <div className="bg-green-50 border-l-4 border-green-500 p-4">
                <p className="text-green-700 font-medium">✅ Crop Successful!</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="font-medium text-gray-700 mb-2">Original Image</p>
                  <p className="text-gray-600">
                    {result.originalDimensions.width} × {result.originalDimensions.height} px
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="font-medium text-gray-700 mb-2">Cropped Image</p>
                  <p className="text-gray-600">
                    {result.croppedDimensions.width} × {result.croppedDimensions.height} px
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium text-gray-700 mb-2">Bounding Box Coordinates</p>
                <div className="grid grid-cols-4 gap-2 text-sm text-gray-600">
                  <div>
                    <span className="font-medium">y0:</span> {result.boundingBox.y0}
                  </div>
                  <div>
                    <span className="font-medium">x0:</span> {result.boundingBox.x0}
                  </div>
                  <div>
                    <span className="font-medium">y1:</span> {result.boundingBox.y1}
                  </div>
                  <div>
                    <span className="font-medium">x1:</span> {result.boundingBox.x1}
                  </div>
                </div>
              </div>

              <div>
                <p className="font-medium text-gray-700 mb-4">Cropped Product Image:</p>
                <div className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50">
                  <img 
                    src={result.croppedImageDataUrl} 
                    alt="Cropped product"
                    className="max-w-full h-auto mx-auto"
                    style={{ maxHeight: '600px' }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  This is the exact image that will be sent to Gemini for AI comparison
                </p>
              </div>

              <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
                <p className="text-blue-700 font-medium">✨ What to Check:</p>
                <ul className="text-blue-600 text-sm mt-2 space-y-1">
                  <li>• Is this the correct product from the shelf?</li>
                  <li>• Is the entire product visible (not cut off)?</li>
                  <li>• Are other products excluded from the crop?</li>
                  <li>• Is the product centered and clear?</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

