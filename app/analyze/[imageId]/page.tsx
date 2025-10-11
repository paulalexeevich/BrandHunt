'use client';

import { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle, Package, Trash2 } from 'lucide-react';

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
  label: string | null;
  brand_name: string | null;
  category: string | null;
  sku: string | null;
  product_name: string | null;
  flavor: string | null;
  size: string | null;
  description: string | null;
  price: string | null;
  price_currency: string | null;
  price_confidence: number | null;
  selected_foodgraph_gtin: string | null;
  selected_foodgraph_product_name: string | null;
  selected_foodgraph_brand_name: string | null;
  selected_foodgraph_category: string | null;
  selected_foodgraph_image_url: string | null;
  selected_foodgraph_result_id: string | null;
  fully_analyzed: boolean | null;
  analysis_completed_at: string | null;
  foodgraph_results?: FoodGraphResult[];
}

interface FoodGraphResult {
  id: string;
  product_name: string | null;
  brand_name: string | null;
  front_image_url: string | null;
  result_rank: number;
  is_match?: boolean | null;
  match_confidence?: number | null;
}

interface ImageData {
  id: string;
  original_filename: string;
  file_path: string;
  processing_status: string;
}

export default function AnalyzePage({ params }: { params: Promise<{ imageId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [image, setImage] = useState<ImageData | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedDetection, setSelectedDetection] = useState<string | null>(null);
  const [foodgraphResults, setFoodgraphResults] = useState<FoodGraphResult[]>([]);
  const [productsDetected, setProductsDetected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [showProductLabels, setShowProductLabels] = useState(true);
  const [extractingPrice, setExtractingPrice] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [savedResultId, setSavedResultId] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{ 
    natural: { width: number; height: number };
    displayed: { width: number; height: number };
  } | null>(null);

  useEffect(() => {
    fetchImage();
  }, [resolvedParams.imageId]);

  // Track both natural and displayed image dimensions
  useEffect(() => {
    if (imageRef.current && image) {
      const updateDimensions = () => {
        if (imageRef.current) {
          const img = imageRef.current;
          const dims = {
            natural: {
              width: img.naturalWidth,
              height: img.naturalHeight,
            },
            displayed: {
              width: img.clientWidth,
              height: img.clientHeight,
            },
          };
          setImageDimensions(dims);
        }
      };
      
      const img = imageRef.current;
      if (img.complete && img.naturalWidth > 0) {
        updateDimensions();
      } else {
        img.addEventListener('load', updateDimensions);
      }
      
      window.addEventListener('resize', updateDimensions);
      
      return () => {
        window.removeEventListener('resize', updateDimensions);
        img.removeEventListener('load', updateDimensions);
      };
    }
  }, [image]);

  // Load FoodGraph results when a detection is selected
  useEffect(() => {
    if (selectedDetection && detections.length > 0) {
      const detection = detections.find(d => d.id === selectedDetection);
      if (detection && detection.foodgraph_results) {
        // Load existing FoodGraph results
        setFoodgraphResults(detection.foodgraph_results);
        
        // Check if results have been filtered (is_match exists on any result)
        const hasFilteredResults = detection.foodgraph_results.some((r: any) => 
          r.hasOwnProperty('is_match')
        );
        
        if (hasFilteredResults) {
          // Count how many matched
          const matchedCount = detection.foodgraph_results.filter((r: any) => 
            r.is_match === true
          ).length;
          setFilteredCount(matchedCount);
        } else {
          setFilteredCount(null);
        }
      } else {
        // No existing results, reset state
        setFoodgraphResults([]);
        setFilteredCount(null);
      }
    }
  }, [selectedDetection, detections]);

  const fetchImage = async () => {
    try {
      const response = await fetch(`/api/results/${resolvedParams.imageId}`);
      const data = await response.json();
      setImage(data.image);
      
      if (data.detections && data.detections.length > 0) {
        setDetections(data.detections);
        setProductsDetected(true);
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
        throw new Error(errorData.details || errorData.error || 'Detection failed');
      }

      const data = await response.json();
      setDetections(data.detections);
      setProductsDetected(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Detection failed';
      setError(errorMessage);
      alert(`Detection failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleBoundingBoxClick = (detectionId: string) => {
    setSelectedDetection(detectionId);
    setFoodgraphResults([]); // Clear results when switching products
    setFilteredCount(null);
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
        let errorMessage = 'Brand extraction failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.details || errorData.error || errorMessage;
        } catch (e) {
          // Response is not JSON, use status text
          errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Update detection in state with all product info
      setDetections(prev => prev.map(d => 
        d.id === detectionId ? { 
          ...d, 
          brand_name: data.brandName, 
          category: data.category,
          sku: data.sku,
          product_name: data.productName,
          flavor: data.flavor,
          size: data.size,
          description: data.description
        } : d
      ));
      
      // Don't auto-advance to foodgraph - let user extract more brands if needed
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brand extraction failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExtractPrice = async (detectionId: string) => {
    setExtractingPrice(true);
    setError(null);

    try {
      const response = await fetch('/api/extract-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detectionId }),
      });

      if (!response.ok) {
        let errorMessage = 'Price extraction failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.details || errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      console.log('💰 Price extraction result:', data);
      
      // Update detection in state with price info
      setDetections(prev => prev.map(d => 
        d.id === detectionId ? { 
          ...d, 
          price: data.price,
          price_currency: data.currency,
          price_confidence: data.confidence
        } : d
      ));
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Price extraction failed');
    } finally {
      setExtractingPrice(false);
    }
  };

  const handleSearchFoodGraph = async () => {
    console.log('handleSearchFoodGraph called');
    
    if (!selectedDetection) {
      console.log('No detection selected');
      return;
    }

    const detection = detections.find(d => d.id === selectedDetection);
    console.log('Found detection:', detection);
    
    if (!detection?.brand_name) {
      console.log('No brand name found');
      return;
    }

    console.log('Searching FoodGraph for:', detection.brand_name);
    setLoading(true);
    setError(null);

    const requestBody = { 
      detectionId: selectedDetection,
      brandName: detection.brand_name 
    };

    try {
      const response = await fetch('/api/search-foodgraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      console.log('FoodGraph API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('FoodGraph API error:', errorData);
        throw new Error(errorData.details || 'FoodGraph search failed');
      }

      const data = await response.json();
      console.log('FoodGraph API response:', data);
      console.log('Products found:', data.products?.length || 0);
      
      setFoodgraphResults(data.products || []);
    } catch (err) {
      console.error('FoodGraph search error:', err);
      const errorMessage = err instanceof Error ? err.message : 'FoodGraph search failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterResults = async () => {
    if (!selectedDetection || !image) return;

    const detection = detections.find(d => d.id === selectedDetection);
    if (!detection) return;

    setFiltering(true);
    setError(null);

    try {
      // Get the cropped image data
      // We need to crop the image again for comparison
      const imageBase64 = image.file_path;
      const boundingBox = detection.bounding_box;

      // Crop the image using Canvas API
      const img = new Image();
      img.src = `data:image/jpeg;base64,${imageBase64}`;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      const imageWidth = img.width;
      const imageHeight = img.height;
      
      const left = Math.round((boundingBox.x0 / 1000) * imageWidth);
      const top = Math.round((boundingBox.y0 / 1000) * imageHeight);
      const width = Math.round(((boundingBox.x1 - boundingBox.x0) / 1000) * imageWidth);
      const height = Math.round(((boundingBox.y1 - boundingBox.y0) / 1000) * imageHeight);
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
      
      const croppedImageBase64 = canvas.toDataURL('image/jpeg').split(',')[1];

      // Call the filter API
      const response = await fetch('/api/filter-foodgraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detectionId: selectedDetection,
          croppedImageBase64
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to filter results');
      }

      const data = await response.json();
      console.log('Filter results:', data);
      
      // Update the results with filtered ones
      setFoodgraphResults(data.filteredResults || []);
      setFilteredCount(data.totalFiltered);
      
    } catch (err) {
      console.error('Filter error:', err);
      setError(err instanceof Error ? err.message : 'Failed to filter results');
    } finally {
      setFiltering(false);
    }
  };

  const handleSaveResult = async (foodgraphResultId: string) => {
    if (!selectedDetection) return;

    setSavingResult(true);
    setError(null);

    try {
      const response = await fetch('/api/save-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detectionId: selectedDetection,
          foodgraphResultId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to save result');
      }

      const data = await response.json();
      console.log('✅ Result saved successfully:', data);

      // Update the detection in state
      setDetections(prev => prev.map(d => 
        d.id === selectedDetection ? {
          ...d,
          selected_foodgraph_gtin: data.savedMatch.gtin,
          selected_foodgraph_product_name: data.savedMatch.productName,
          selected_foodgraph_brand_name: data.savedMatch.brandName,
          selected_foodgraph_category: data.savedMatch.category,
          selected_foodgraph_image_url: data.savedMatch.imageUrl,
          selected_foodgraph_result_id: foodgraphResultId,
          fully_analyzed: true,
          analysis_completed_at: new Date().toISOString(),
        } : d
      ));

      setSavedResultId(foodgraphResultId);
      
      // Show success message
      alert(`✅ Result saved successfully!\n\nProduct: ${data.savedMatch.productName}\nBrand: ${data.savedMatch.brandName}\n\nYou can now view this fully analyzed product in the Results page.`);
      
    } catch (err) {
      console.error('❌ Failed to save result:', err);
      setError(err instanceof Error ? err.message : 'Failed to save result');
      alert(`Failed to save result: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSavingResult(false);
    }
  };

  const handleDeleteImage = async () => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/images/${resolvedParams.imageId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to delete image');
      }

      // Redirect to gallery after successful deletion
      router.push('/gallery');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image');
      setDeleting(false);
      setShowDeleteConfirm(false);
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
          <div className="flex items-center justify-between mb-4">
            <Link href="/gallery" className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800">
              <ArrowLeft className="w-4 h-4" />
              Back to Gallery
            </Link>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400"
            >
              <Trash2 className="w-4 h-4" />
              Delete Image
            </button>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{image.original_filename}</h1>
        </div>

        {/* Status Bar */}
        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {!productsDetected ? 'Ready to analyze' : `${detections.length} products detected`}
              </span>
              {selectedDetection && (
                <span className="text-sm font-semibold text-indigo-600">
                  → Product #{detections.findIndex(d => d.id === selectedDetection) + 1} selected
                </span>
              )}
              </div>
            {!productsDetected && (
              <button
                onClick={handleDetectProducts}
                disabled={loading}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Detecting...
                  </>
                ) : (
                  '🎯 Detect Products'
                )}
              </button>
            )}
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Image</h2>
                <button
                  onClick={() => setShowProductLabels(!showProductLabels)}
                  className={`px-3 py-1 text-xs ${showProductLabels ? 'bg-purple-600' : 'bg-gray-400'} text-white rounded hover:opacity-80`}
                >
                  {showProductLabels ? '🏷️ Hide' : '🏷️ Show'} Labels
                </button>
            </div>
            
            <div className="relative inline-block max-w-full">
              <img
                ref={imageRef}
                src={`data:image/jpeg;base64,${image.file_path}`}
                alt={image.original_filename}
                className="max-w-full h-auto rounded-lg"
                style={{ display: 'block' }}
              />
              {imageDimensions && detections.map((detection, index) => {
                const box = detection.bounding_box;
                const isSelected = detection.id === selectedDetection;
                
                // Google's official coordinate conversion method:
                // Gemini returns [ymin, xmin, ymax, xmax] normalized 0-1000
                // Convert to pixels: coordinate / 1000 * dimension
                const imgWidth = imageDimensions.displayed.width;
                const imgHeight = imageDimensions.displayed.height;
                
                const leftPx = (box.x0 / 1000) * imgWidth;
                const topPx = (box.y0 / 1000) * imgHeight;
                const widthPx = ((box.x1 - box.x0) / 1000) * imgWidth;
                const heightPx = ((box.y1 - box.y0) / 1000) * imgHeight;
                
                return (
                  <div
                    key={detection.id}
                    onClick={() => handleBoundingBoxClick(detection.id)}
                    className="absolute cursor-pointer hover:opacity-80 transition-opacity"
                    style={{
                      left: `${leftPx}px`,
                      top: `${topPx}px`,
                      width: `${widthPx}px`,
                      height: `${heightPx}px`,
                      border: `3px solid ${isSelected ? '#4F46E5' : detection.brand_name ? '#10B981' : '#F59E0B'}`,
                      backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.2)' : detection.brand_name ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      display: imageDimensions ? 'block' : 'none',
                    }}
                  >
                    <div className={`absolute -top-6 left-0 px-2 py-1 text-xs font-bold text-white rounded ${isSelected ? 'bg-indigo-600' : detection.brand_name ? 'bg-green-600' : 'bg-yellow-600'}`}>
                      #{index + 1}
                    </div>
                    {detection.brand_name && showProductLabels && (
                      <div className="absolute -bottom-8 left-0 right-0 px-2 py-1 text-xs font-semibold bg-white border-2 border-green-600 rounded text-center truncate">
                        {detection.product_name || detection.brand_name}
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

            {/* No Product Selected */}
            {!selectedDetection && (
              <div className="text-center py-12">
                <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  {productsDetected ? 'Select a Product' : 'No Products Detected'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {productsDetected 
                    ? 'Click on any bounding box in the image to analyze that product' 
                    : 'Click "Detect Products" above to get started'}
                </p>
              </div>
            )}

            {/* Product Selected - Unified Actions Panel */}
            {selectedDetection && (() => {
              const detection = detections.find(d => d.id === selectedDetection);
              if (!detection) return null;
              const detectionIndex = detections.findIndex(d => d.id === selectedDetection);
              
              return (
                <div className="space-y-4">
                  {/* Product Header */}
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border-2 border-indigo-200">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xl font-bold text-indigo-900">
                        Product #{detectionIndex + 1}
                      </h3>
                      {detection.fully_analyzed && (
                        <span className="px-3 py-1 bg-green-500 text-white text-xs font-semibold rounded-full flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Saved
                        </span>
                          )}
                        </div>
                    
                    {/* Progress Indicators */}
                    <div className="flex gap-2 text-xs">
                      <span className={`px-2 py-1 rounded ${detection.brand_name ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {detection.brand_name ? '✓' : '○'} Info
                            </span>
                      <span className={`px-2 py-1 rounded ${detection.price && detection.price !== 'Unknown' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {detection.price && detection.price !== 'Unknown' ? '✓' : '○'} Price
                                    </span>
                      <span className={`px-2 py-1 rounded ${foodgraphResults.length > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {foodgraphResults.length > 0 ? '✓' : '○'} Search
                      </span>
                      <span className={`px-2 py-1 rounded ${filteredCount !== null ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {filteredCount !== null ? '✓' : '○'} Filter
                      </span>
                                </div>
                </div>
                
                  {/* Extracted Product Information */}
                  {detection.brand_name ? (
                    <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <h4 className="font-semibold text-green-900">Extracted Information</h4>
                      </div>
                      
                      {/* FoodGraph Match - Show if saved */}
                      {detection.fully_analyzed && detection.selected_foodgraph_image_url && (
                        <div className="mb-4 p-3 bg-blue-50 border-2 border-blue-300 rounded-lg">
                          <div className="flex gap-3">
                            <img
                              src={detection.selected_foodgraph_image_url}
                              alt={detection.selected_foodgraph_product_name || 'Product'}
                              className="w-24 h-24 object-contain bg-white rounded-lg shadow-sm flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-blue-900 mb-1">📦 FoodGraph Match</p>
                              <p className="text-sm font-bold text-blue-900 truncate">{detection.selected_foodgraph_product_name}</p>
                              <p className="text-xs text-blue-700">{detection.selected_foodgraph_brand_name}</p>
                              {detection.selected_foodgraph_gtin && (
                                <div className="mt-2 pt-2 border-t border-blue-200">
                                  <p className="text-xs text-gray-600">
                                    <span className="font-semibold">UPC/GTIN:</span> <span className="font-mono text-blue-600">{detection.selected_foodgraph_gtin}</span>
                                  </p>
                </div>
                          )}
                        </div>
                      </div>
                          </div>
                        )}
                      
                      {/* Extracted Data from Image */}
                      <div className="space-y-2 text-sm">
                        {detection.product_name && (
                          <div><span className="font-semibold text-gray-700">Product:</span> <span className="text-indigo-600 font-semibold">{detection.product_name}</span></div>
                        )}
                        <div><span className="font-semibold text-gray-700">Brand:</span> {detection.brand_name}</div>
                        {detection.category && <div><span className="font-semibold text-gray-700">Category:</span> {detection.category}</div>}
                        {detection.flavor && detection.flavor !== 'Unknown' && (
                          <div><span className="font-semibold text-gray-700">Flavor:</span> <span className="text-purple-600">{detection.flavor}</span></div>
                        )}
                        {detection.size && detection.size !== 'Unknown' && (
                          <div><span className="font-semibold text-gray-700">Size:</span> <span className="text-blue-600">{detection.size}</span></div>
                        )}
                        {detection.price && detection.price !== 'Unknown' && (
                          <div><span className="font-semibold text-gray-700">Price:</span> <span className="text-green-700 font-bold">{detection.price_currency === 'USD' ? '$' : detection.price_currency}{detection.price}</span>
                          {detection.price_confidence && detection.price_confidence > 0 && (
                            <span className="text-xs text-gray-500 ml-1">({Math.round(detection.price_confidence * 100)}%)</span>
                          )}
                          </div>
                        )}
                      </div>
                </div>
                  ) : (
                    <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                      <p className="text-sm text-yellow-800">
                        {detection.label ? `Detected as: ${detection.label}` : 'No information extracted yet'}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    {!detection.brand_name && (
                  <button
                        onClick={() => handleExtractBrand(detection.id)}
                    disabled={loading}
                        className="w-full px-4 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                            Extracting...
                      </>
                    ) : (
                          '📋 Extract Brand & Info'
                    )}
                  </button>
                )}

                    {detection.brand_name && (!detection.price || detection.price === 'Unknown') && (
                      <button
                        onClick={() => handleExtractPrice(detection.id)}
                        disabled={extractingPrice}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                      >
                        {extractingPrice ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Extracting Price...
                          </>
                        ) : (
                          '💰 Extract Price'
                        )}
                      </button>
                    )}
                    
                    {detection.brand_name && foodgraphResults.length === 0 && (
                    <button
                        onClick={handleSearchFoodGraph}
                        disabled={loading}
                        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Searching...
                          </>
                        ) : (
                          '🔍 Search FoodGraph'
                        )}
                    </button>
                    )}
                    
                    {foodgraphResults.length > 0 && filteredCount === null && (
                      <button
                        onClick={handleFilterResults}
                        disabled={filtering}
                        className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                      >
                        {filtering ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            AI Filtering...
                          </>
                        ) : (
                          <>🤖 Filter with AI ({foodgraphResults.length} results)</>
                        )}
                      </button>
                    )}
                    </div>

                  {/* FoodGraph Results */}
                  {foodgraphResults.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">
                          FoodGraph Matches ({foodgraphResults.length})
                          {filteredCount !== null && (
                            <span className="ml-2 text-sm text-green-600">→ Filtered to {filteredCount}</span>
                          )}
                        </h4>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                        {(() => {
                          // If filtered, show only matched results. Otherwise show all (up to 50)
                          const resultsToShow = filteredCount !== null
                            ? foodgraphResults.filter(r => r.is_match === true)
                            : foodgraphResults.slice(0, 50);
                          
                          return resultsToShow.map((result, index) => {
                            const isSaved = detection.selected_foodgraph_result_id === result.id;
                            
                            return (
                            <div 
                              key={result.id}
                              className={`bg-white rounded-lg border-2 ${isSaved ? 'border-green-500 ring-2 ring-green-300' : 'border-gray-200'} overflow-hidden hover:border-indigo-400 transition-colors`}
                            >
                          {result.front_image_url ? (
                            <img
                              src={result.front_image_url}
                              alt={result.product_name || 'Product'}
                                  className="w-full h-24 object-contain bg-gray-50"
                            />
                          ) : (
                                <div className="w-full h-24 bg-gray-100 flex items-center justify-center">
                              <Package className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                              <div className="p-2">
                                <p className="text-xs font-semibold text-gray-900 truncate" title={result.product_name || 'Unnamed'}>
                              {result.product_name || 'Unnamed Product'}
                            </p>
                            <p className="text-xs text-gray-600 truncate">
                              {result.brand_name || 'Unknown Brand'}
                            </p>
                            <p className="text-xs text-indigo-600 font-semibold mt-1">
                              #{index + 1}
                            </p>
                                {isSaved ? (
                                  <div className="mt-2 px-2 py-1 bg-green-500 text-white text-xs font-semibold rounded text-center flex items-center justify-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    Saved
                          </div>
                                ) : (
                                  <button
                                    onClick={() => handleSaveResult(result.id)}
                                    disabled={savingResult}
                                    className="mt-2 w-full px-2 py-1 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                                  >
                                    {savingResult && savedResultId === result.id ? 'Saving...' : '💾 Save'}
                                  </button>
                                )}
                        </div>
                    </div>
                            );
                          });
                        })()}
                      </div>
                      
                    {foodgraphResults.length > 50 && (
                      <p className="text-sm text-gray-500 text-center mt-3">
                        + {foodgraphResults.length - 50} more results available
                      </p>
                    )}
                  </div>
                )}
              </div>
              );
            })()}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Delete Image?</h3>
                  <p className="text-sm text-gray-600">This action cannot be undone</p>
                </div>
              </div>
              <p className="text-gray-700 mb-6">
                Are you sure you want to delete <strong>{image.original_filename}</strong>? 
                This will permanently remove the image and all its associated detections and FoodGraph results.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteImage}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
