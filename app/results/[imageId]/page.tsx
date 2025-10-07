'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Package, Image as ImageIcon } from 'lucide-react';

interface BoundingBox {
  y0: number;
  x0: number;
  y1: number;
  x1: number;
}

interface FoodGraphResult {
  id: string;
  result_rank: number;
  product_name: string | null;
  brand_name: string | null;
  category: string | null;
  front_image_url: string | null;
  product_gtin: string | null;
}

interface Detection {
  id: string;
  detection_index: number;
  bounding_box: BoundingBox;
  brand_name: string | null;
  foodgraph_results: FoodGraphResult[];
}

interface ImageData {
  id: string;
  original_filename: string;
  file_path: string;
  uploaded_at: string;
  processing_status: string;
}

export default function ResultsPage({ params }: { params: Promise<{ imageId: string }> }) {
  const resolvedParams = use(params);
  const [image, setImage] = useState<ImageData | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDetection, setSelectedDetection] = useState<number>(0);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);

  useEffect(() => {
    fetchResults();
  }, [resolvedParams.imageId]);

  const fetchResults = async () => {
    try {
      const response = await fetch(`/api/results/${resolvedParams.imageId}`);
      const data = await response.json();
      setImage(data.image);
      setDetections(data.detections || []);
    } catch (error) {
      console.error('Failed to fetch results:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!image) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Image not found</h2>
          <Link href="/gallery" className="text-indigo-600 hover:text-indigo-800">
            Return to Gallery
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/gallery"
            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Gallery
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{image.original_filename}</h1>
          <p className="text-gray-600">
            {detections.length} product{detections.length !== 1 ? 's' : ''} detected
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Image with Bounding Boxes */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Image</h2>
              <button
                onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
              >
                {showBoundingBoxes ? 'Hide' : 'Show'} Boxes
              </button>
            </div>
            <div className="relative">
              <img
                src={`data:image/jpeg;base64,${image.file_path}`}
                alt={image.original_filename}
                className="w-full rounded-lg"
              />
              {showBoundingBoxes && detections.map((detection, index) => {
                const box = detection.bounding_box;
                const isSelected = index === selectedDetection;
                return (
                  <div
                    key={detection.id}
                    onClick={() => setSelectedDetection(index)}
                    className="absolute cursor-pointer"
                    style={{
                      left: `${(box.x0 / 1000) * 100}%`,
                      top: `${(box.y0 / 1000) * 100}%`,
                      width: `${((box.x1 - box.x0) / 1000) * 100}%`,
                      height: `${((box.y1 - box.y0) / 1000) * 100}%`,
                      border: `3px solid ${isSelected ? '#4F46E5' : '#10B981'}`,
                      backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    }}
                  >
                    <div className={`absolute -top-6 left-0 px-2 py-1 text-xs font-bold text-white rounded ${isSelected ? 'bg-indigo-600' : 'bg-green-600'}`}>
                      #{index + 1}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column - Detection Details */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Detection Details</h2>

            {detections.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No products detected</p>
              </div>
            ) : (
              <div>
                {/* Detection Selector */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {detections.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedDetection(index)}
                      className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                        index === selectedDetection
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Product #{index + 1}
                    </button>
                  ))}
                </div>

                {/* Selected Detection Info */}
                {detections[selectedDetection] && (
                  <div>
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <h3 className="font-semibold text-gray-900 mb-2">Detected Brand</h3>
                      <p className="text-lg text-indigo-600 font-semibold">
                        {detections[selectedDetection].brand_name || 'Unknown'}
                      </p>
                    </div>

                    {/* FoodGraph Results */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">
                        FoodGraph Results ({detections[selectedDetection].foodgraph_results.length})
                      </h3>
                      
                      {detections[selectedDetection].foodgraph_results.length === 0 ? (
                        <div className="text-center py-4 text-gray-500">
                          <ImageIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                          <p className="text-sm">No matching products found</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {detections[selectedDetection].foodgraph_results.slice(0, 10).map((result) => (
                            <div key={result.id} className="bg-gray-50 rounded-lg p-3 flex gap-3">
                              {result.front_image_url ? (
                                <img
                                  src={result.front_image_url}
                                  alt={result.product_name || 'Product'}
                                  className="w-16 h-16 object-cover rounded"
                                />
                              ) : (
                                <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                                  <ImageIcon className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-gray-900 truncate">
                                  {result.product_name || 'Unnamed Product'}
                                </p>
                                <p className="text-xs text-gray-600">
                                  {result.brand_name || 'Unknown Brand'}
                                </p>
                                {result.category && (
                                  <p className="text-xs text-gray-500">{result.category}</p>
                                )}
                                <p className="text-xs text-indigo-600 font-semibold">
                                  Rank #{result.result_rank}
                                </p>
                              </div>
                            </div>
                          ))}
                          
                          {detections[selectedDetection].foodgraph_results.length > 10 && (
                            <p className="text-sm text-gray-500 text-center">
                              + {detections[selectedDetection].foodgraph_results.length - 10} more results
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

