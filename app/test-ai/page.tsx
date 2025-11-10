'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TestAIPage() {
  const [imageId, setImageId] = useState('');
  const [detectionId, setDetectionId] = useState('');
  const [foodgraphResultId, setFoodgraphResultId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    if (!imageId || !detectionId) {
      setError('Please provide both Image ID and Detection ID');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/test-ai-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageId,
          detectionId,
          foodgraphResultId: foodgraphResultId || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Test failed');
      }

      setResult(data);
      console.log('Test result:', data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Test error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <Link 
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🧪 Gemini AI Comparison Test
          </h1>
          <p className="text-gray-600 mb-8">
            Test if Gemini API is providing correct AI comparison results for batch processing
          </p>

          {/* Input Form */}
          <div className="space-y-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={imageId}
                onChange={(e) => setImageId(e.target.value)}
                placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                Get this from the URL when viewing an image (e.g., /analyze/[imageId])
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Detection ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={detectionId}
                onChange={(e) => setDetectionId(e.target.value)}
                placeholder="e.g., 456e7890-e89b-12d3-a456-426614174111"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                Get this from database or browser console when selecting a product
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                FoodGraph Result ID <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={foodgraphResultId}
                onChange={(e) => setFoodgraphResultId(e.target.value)}
                placeholder="Leave empty to test first pre-filtered result"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                Defaults to first pre-filtered result if not specified
              </p>
            </div>

            <button
              onClick={runTest}
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? '🔄 Running Test...' : '🧪 Run AI Comparison Test'}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h3 className="text-red-800 font-semibold mb-1">❌ Test Failed</h3>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Success Result */}
          {result && result.success && (
            <div className="space-y-6">
              {/* Overall Status */}
              <div className={`border-2 rounded-lg p-6 ${
                result.ai_comparison_result.match_status === 'identical' 
                  ? 'bg-green-50 border-green-300'
                  : result.ai_comparison_result.match_status === 'almost_same'
                  ? 'bg-yellow-50 border-yellow-300'
                  : 'bg-gray-50 border-gray-300'
              }`}>
                <h3 className="text-xl font-bold mb-4">
                  {result.ai_comparison_result.match_status === 'identical' && '✅ IDENTICAL Match'}
                  {result.ai_comparison_result.match_status === 'almost_same' && '≈ ALMOST SAME'}
                  {result.ai_comparison_result.match_status === 'not_match' && '✗ NO MATCH'}
                </h3>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-gray-600">Confidence</div>
                    <div className="text-2xl font-bold">
                      {(result.ai_comparison_result.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Visual Similarity</div>
                    <div className="text-2xl font-bold">
                      {(result.ai_comparison_result.visual_similarity * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Processing Time</div>
                    <div className="text-2xl font-bold">
                      {result.ai_comparison_result.processing_time_ms}ms
                    </div>
                  </div>
                </div>

                <div className="bg-white bg-opacity-60 rounded-lg p-4">
                  <div className="text-sm font-semibold text-gray-700 mb-1">AI Reasoning:</div>
                  <div className="text-gray-900">{result.ai_comparison_result.reason}</div>
                </div>
              </div>

              {/* Interpretation */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">🎯 What This Means:</h4>
                <ul className="space-y-1 text-sm text-blue-800">
                  <li>• Is Match: <strong>{result.interpretation.is_match ? 'YES' : 'NO'}</strong></li>
                  <li>• Should Auto-Save: <strong>{result.interpretation.should_auto_save ? 'YES' : 'NO'}</strong></li>
                  <li>• Needs Review: <strong>{result.interpretation.needs_review ? 'YES' : 'NO'}</strong></li>
                  <li>• Should Reject: <strong>{result.interpretation.should_reject ? 'YES' : 'NO'}</strong></li>
                </ul>
              </div>

              {/* Product Details */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Detected Product */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">📷 Detected Product (from shelf)</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-600">Brand:</span>
                      <span className="ml-2 font-medium">{result.detected_product.brand}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Product:</span>
                      <span className="ml-2 font-medium">{result.detected_product.product}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Cropped Size:</span>
                      <span className="ml-2 font-mono text-xs">{result.detected_product.cropped_image_size}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Detection Index:</span>
                      <span className="ml-2 font-medium">#{result.test_info.detection_index}</span>
                    </div>
                  </div>
                </div>

                {/* FoodGraph Product */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">🗄️ FoodGraph Product (from database)</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-600">Brand:</span>
                      <span className="ml-2 font-medium">{result.foodgraph_product.brand}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Product:</span>
                      <span className="ml-2 font-medium">{result.foodgraph_product.product}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">GTIN:</span>
                      <span className="ml-2 font-mono text-xs">{result.foodgraph_product.gtin}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Result Rank:</span>
                      <span className="ml-2 font-medium">#{result.test_info.foodgraph_result_rank}</span>
                    </div>
                  </div>
                  {result.foodgraph_product.image_url && (
                    <div className="mt-3">
                      <img 
                        src={result.foodgraph_product.image_url} 
                        alt="FoodGraph product"
                        className="w-full h-40 object-contain bg-gray-50 rounded border"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Raw JSON */}
              <details className="border border-gray-200 rounded-lg">
                <summary className="px-4 py-3 cursor-pointer hover:bg-gray-50 font-medium text-gray-700">
                  🔍 View Raw JSON Response
                </summary>
                <pre className="p-4 bg-gray-900 text-gray-100 text-xs overflow-x-auto rounded-b-lg">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">📖 How to Use This Test:</h3>
          <ol className="space-y-2 text-sm text-blue-800">
            <li>1. Go to an analyze page with batch-processed products</li>
            <li>2. Copy the Image ID from the URL (e.g., /analyze/<strong>[imageId]</strong>)</li>
            <li>3. Click on a product and open browser console to find the Detection ID</li>
            <li>4. Paste both IDs above and click "Run Test"</li>
            <li>5. Review the AI comparison result and check if it makes sense</li>
          </ol>
          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-sm text-blue-800 font-medium">
              ✅ <strong>Expected Behavior:</strong> If the two products look the same, match_status should be "identical" or "almost_same". 
              If they look different, it should be "not_match". The reason should explain why.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

