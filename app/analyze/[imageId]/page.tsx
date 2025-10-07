'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle, Package } from 'lucide-react';

interface BoundingBox {
  y0: number;
  x0: number;
  y1: number;
  x1: number;
}

interface Detection {
  id: string;
  detection_index: number;
  bounding_box: BoundingBox;
  brand_name: string | null;
  category: string | null;
}

interface FoodGraphResult {
  id: string;
  product_name: string | null;
  brand_name: string | null;
  front_image_url: string | null;
  result_rank: number;
}

interface ImageData {
  id: string;
  original_filename: string;
  file_path: string;
  processing_status: string;
}

type Step = 'detect' | 'brand' | 'foodgraph';

export default function AnalyzePage({ params }: { params: Promise<{ imageId: string }> }) {
  const resolvedParams = use(params);
  const [image, setImage] = useState<ImageData | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedDetection, setSelectedDetection] = useState<string | null>(null);
  const [foodgraphResults, setFoodgraphResults] = useState<FoodGraphResult[]>([]);
  const [currentStep, setCurrentStep] = useState<Step>('detect');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchImage();
  }, [resolvedParams.imageId]);

  const fetchImage = async () => {
    try {
      const response = await fetch(`/api/results/${resolvedParams.imageId}`);
      const data = await response.json();
      setImage(data.image);
      
      if (data.detections && data.detections.length > 0) {
        setDetections(data.detections);
        // Check if any have brands
        const hasBrands = data.detections.some((d: Detection) => d.brand_name);
        if (hasBrands) {
          setCurrentStep('foodgraph');
        } else {
          setCurrentStep('brand');
        }
      }
    } catch (error) {
      console.error('Failed to fetch image:', error);
    }
  };

  const handleDetectProducts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: resolvedParams.imageId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Detection failed');
      }

      const data = await response.json();
      setDetections(data.detections);
      setCurrentStep('brand');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExtractBrand = async (detectionId: string) => {
    setLoading(true);
    setError(null);
    setSelectedDetection(detectionId);

    try {
      const response = await fetch('/api/extract-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detectionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Brand extraction failed');
      }

      const data = await response.json();
      
      // Update detection in state
      setDetections(prev => prev.map(d => 
        d.id === detectionId ? { ...d, brand_name: data.brandName, category: data.category } : d
      ));
      
      setCurrentStep('foodgraph');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brand extraction failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchFoodGraph = async () => {
    if (!selectedDetection) return;

    const detection = detections.find(d => d.id === selectedDetection);
    if (!detection?.brand_name) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/search-foodgraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          detectionId: selectedDetection,
          brandName: detection.brand_name 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'FoodGraph search failed');
      }

      const data = await response.json();
      setFoodgraphResults(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'FoodGraph search failed');
    } finally {
      setLoading(false);
    }
  };

  if (!image) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/gallery" className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Gallery
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{image.original_filename}</h1>
        </div>

        {/* Step Indicator */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2 ${currentStep === 'detect' ? 'text-indigo-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'detect' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="font-semibold">Detect Products</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4" />
            <div className={`flex items-center gap-2 ${currentStep === 'brand' ? 'text-indigo-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'brand' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="font-semibold">Extract Brand</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4" />
            <div className={`flex items-center gap-2 ${currentStep === 'foodgraph' ? 'text-indigo-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'foodgraph' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="font-semibold">Search Products</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Image with Bounding Boxes */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Image</h2>
            <div className="relative inline-block max-w-full">
              <img
                src={`data:image/jpeg;base64,${image.file_path}`}
                alt={image.original_filename}
                className="max-w-full h-auto rounded-lg"
                style={{ display: 'block' }}
              />
              {detections.map((detection, index) => {
                const box = detection.bounding_box;
                const isSelected = detection.id === selectedDetection;
                return (
                  <div
                    key={detection.id}
                    onClick={() => currentStep === 'brand' && handleExtractBrand(detection.id)}
                    className={`absolute cursor-pointer ${currentStep === 'brand' ? 'hover:border-yellow-500' : ''}`}
                    style={{
                      left: `${(box.x0 / 1000) * 100}%`,
                      top: `${(box.y0 / 1000) * 100}%`,
                      width: `${((box.x1 - box.x0) / 1000) * 100}%`,
                      height: `${((box.y1 - box.y0) / 1000) * 100}%`,
                      border: `3px solid ${isSelected ? '#4F46E5' : detection.brand_name ? '#10B981' : '#F59E0B'}`,
                      backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.1)' : 'rgba(16, 185, 129, 0.05)',
                    }}
                  >
                    <div className={`absolute -top-6 left-0 px-2 py-1 text-xs font-bold text-white rounded ${isSelected ? 'bg-indigo-600' : detection.brand_name ? 'bg-green-600' : 'bg-yellow-600'}`}>
                      #{index + 1}
                    </div>
                    {detection.brand_name && (
                      <div className="absolute -bottom-8 left-0 right-0 px-2 py-1 text-xs font-semibold bg-white border-2 border-green-600 rounded text-center truncate">
                        {detection.brand_name}
                        {detection.category && <span className="text-gray-500"> • {detection.category}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Controls and Results */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Actions</h2>

            {/* Step 1: Detect */}
            {currentStep === 'detect' && (
              <div>
                <p className="text-gray-600 mb-4">Click the button below to detect products in the image.</p>
                <button
                  onClick={handleDetectProducts}
                  disabled={loading}
                  className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Detecting...
                    </>
                  ) : (
                    'Detect Products'
                  )}
                </button>
              </div>
            )}

            {/* Step 2: Brand Extraction */}
            {currentStep === 'brand' && (
              <div>
                <p className="text-gray-600 mb-4">
                  {detections.length} product{detections.length !== 1 ? 's' : ''} detected. 
                  Click on a bounding box to extract the brand name.
                </p>
                {loading && selectedDetection && (
                  <div className="flex items-center justify-center gap-2 text-indigo-600 py-4">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Extracting brand...</span>
                  </div>
                )}
                <div className="space-y-2">
                  {detections.map((detection, index) => (
                    <div
                      key={detection.id}
                      className={`p-3 border-2 rounded-lg ${detection.brand_name ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Product #{index + 1}</span>
                        {detection.brand_name ? (
                          <div className="flex flex-col items-end">
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              {detection.brand_name}
                            </span>
                            {detection.category && (
                              <span className="text-xs text-gray-500">{detection.category}</span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleExtractBrand(detection.id)}
                            disabled={loading}
                            className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm disabled:bg-gray-400"
                          >
                            Extract Info
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: FoodGraph Search */}
            {currentStep === 'foodgraph' && (
              <div>
                <p className="text-gray-600 mb-4">
                  Select a product with extracted brand to search FoodGraph catalog.
                </p>
                <div className="space-y-2 mb-4">
                  {detections.filter(d => d.brand_name).map((detection, index) => (
                    <button
                      key={detection.id}
                      onClick={() => setSelectedDetection(detection.id)}
                      className={`w-full p-3 border-2 rounded-lg text-left ${
                        selectedDetection === detection.id
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold">Product #{detection.detection_index + 1}</span>
                          {detection.category && (
                            <span className="ml-2 text-xs text-gray-500">({detection.category})</span>
                          )}
                        </div>
                        <span className="text-indigo-600">{detection.brand_name}</span>
                      </div>
                    </button>
                  ))}
                </div>
                {selectedDetection && (
                  <button
                    onClick={handleSearchFoodGraph}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      'Search FoodGraph'
                    )}
                  </button>
                )}

                {/* FoodGraph Results - Visual Comparison */}
                {foodgraphResults.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold text-gray-900 mb-3">
                      Top 5 FoodGraph Matches
                    </h3>
                    <div className="grid grid-cols-5 gap-2">
                      {foodgraphResults.slice(0, 5).map((result, index) => (
                        <div key={result.id} className="bg-white rounded-lg border-2 border-gray-200 hover:border-indigo-400 transition-colors overflow-hidden">
                          {result.front_image_url ? (
                            <img
                              src={result.front_image_url}
                              alt={result.product_name || 'Product'}
                              className="w-full h-32 object-contain bg-gray-50"
                              title={`${result.product_name || 'Unnamed'} - ${result.brand_name || 'Unknown Brand'}`}
                            />
                          ) : (
                            <div className="w-full h-32 bg-gray-100 flex items-center justify-center">
                              <Package className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                          <div className="p-2 bg-gray-50">
                            <p className="text-xs font-semibold text-gray-900 truncate" title={result.product_name || 'Unnamed Product'}>
                              {result.product_name || 'Unnamed Product'}
                            </p>
                            <p className="text-xs text-gray-600 truncate">
                              {result.brand_name || 'Unknown Brand'}
                            </p>
                            <p className="text-xs text-indigo-600 font-semibold mt-1">
                              #{index + 1}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {foodgraphResults.length > 5 && (
                      <p className="text-sm text-gray-500 text-center mt-3">
                        + {foodgraphResults.length - 5} more results available
                      </p>
                    )}
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
