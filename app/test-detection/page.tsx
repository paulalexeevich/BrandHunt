'use client';

import { useState } from 'react';
import Image from 'next/image';

interface BoundingBox {
  y0: number;
  x0: number;
  y1: number;
  x1: number;
}

interface DetectedProduct {
  label: string;
  bounding_box: BoundingBox;
}

interface DetectionResult {
  products: DetectedProduct[];
}

export default function TestDetectionPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [imageUrl] = useState('https://traxus.s3.amazonaws.com/sksignals/Probe_Images/20251009/20222/20251009023912-f26ae84f-ccfa-4426-9fd2-24e96e25ab2e/original');
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
    });
  };

  const testDetection = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Fetch the image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error('Failed to fetch image');
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');

      // Call the detect API
      const detectResponse = await fetch('/api/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: base64Image,
          mimeType: 'image/jpeg',
        }),
      });

      if (!detectResponse.ok) {
        const errorData = await detectResponse.json();
        throw new Error(errorData.error || 'Detection failed');
      }

      const data = await detectResponse.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Gemini Detection Test</h1>
        
        {/* Test Image URL */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-3">Test Image URL</h2>
          <p className="text-sm text-gray-600 break-all mb-4">{imageUrl}</p>
          <button
            onClick={testDetection}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Detecting Products...' : 'Run Detection Test'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">
            <h3 className="font-semibold mb-1">Error</h3>
            <p>{error}</p>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Image with Bounding Boxes */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Visual Results</h2>
              <div className="relative inline-block">
                <img
                  src={imageUrl}
                  alt="Test"
                  onLoad={handleImageLoad}
                  className="max-w-full h-auto"
                  style={{ maxHeight: '800px' }}
                />
                {imageDimensions && result.products.map((product, idx) => {
                  const { x0, y0, x1, y1 } = product.bounding_box;
                  const leftPx = (x0 / 1000) * imageDimensions.width;
                  const topPx = (y0 / 1000) * imageDimensions.height;
                  const widthPx = ((x1 - x0) / 1000) * imageDimensions.width;
                  const heightPx = ((y1 - y0) / 1000) * imageDimensions.height;

                  return (
                    <div
                      key={idx}
                      className="absolute border-2 border-green-500"
                      style={{
                        left: `${leftPx}px`,
                        top: `${topPx}px`,
                        width: `${widthPx}px`,
                        height: `${heightPx}px`,
                      }}
                    >
                      <div className="absolute -top-6 left-0 bg-green-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                        #{idx + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
              {imageDimensions && (
                <p className="text-sm text-gray-600 mt-4">
                  Image Dimensions: {imageDimensions.width} × {imageDimensions.height} px
                </p>
              )}
            </div>

            {/* Raw Data */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">
                Detection Results ({result.products.length} products)
              </h2>
              <div className="space-y-4 overflow-y-auto" style={{ maxHeight: '800px' }}>
                {result.products.map((product, idx) => (
                  <div key={idx} className="border border-gray-200 p-4 rounded">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-green-600">Product #{idx + 1}</h3>
                    </div>
                    <p className="text-sm mb-3">{product.label}</p>
                    <div className="bg-gray-50 p-3 rounded text-xs font-mono">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-gray-600">y0 (top):</span>
                          <span className="ml-2 font-semibold">{product.bounding_box.y0}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">x0 (left):</span>
                          <span className="ml-2 font-semibold">{product.bounding_box.x0}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">y1 (bottom):</span>
                          <span className="ml-2 font-semibold">{product.bounding_box.y1}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">x1 (right):</span>
                          <span className="ml-2 font-semibold">{product.bounding_box.x1}</span>
                        </div>
                      </div>
                      {imageDimensions && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-gray-700 mb-1">Pixel Coordinates:</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-gray-600">Left:</span>
                              <span className="ml-2">
                                {Math.round((product.bounding_box.x0 / 1000) * imageDimensions.width)}px
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Top:</span>
                              <span className="ml-2">
                                {Math.round((product.bounding_box.y0 / 1000) * imageDimensions.height)}px
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Width:</span>
                              <span className="ml-2">
                                {Math.round(((product.bounding_box.x1 - product.bounding_box.x0) / 1000) * imageDimensions.width)}px
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Height:</span>
                              <span className="ml-2">
                                {Math.round(((product.bounding_box.y1 - product.bounding_box.y0) / 1000) * imageDimensions.height)}px
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Raw JSON */}
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Raw JSON Response</h3>
                <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

