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
      
      // Store extraction debug info
      setExtractionDebug({
        detectionId,
        response: data
      });
      
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

    // Store request for debugging
    setDebugInfo({ request: JSON.stringify(requestBody, null, 2) });

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
        setDebugInfo(prev => ({ ...prev, error: JSON.stringify(errorData, null, 2) }));
        throw new Error(errorData.details || 'FoodGraph search failed');
      }

      const data = await response.json();
      console.log('FoodGraph API response:', data);
      console.log('Products found:', data.products?.length || 0);
      
      // Store response for debugging
      setDebugInfo(prev => ({ ...prev, response: JSON.stringify(data, null, 2) }));
      
      setFoodgraphResults(data.products || []);
    } catch (err) {
      console.error('FoodGraph search error:', err);
      const errorMessage = err instanceof Error ? err.message : 'FoodGraph search failed';
      setError(errorMessage);
      setDebugInfo(prev => ({ ...prev, error: errorMessage }));
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
              <div className="flex gap-2">
                <button
                  onClick={() => setShowProductLabels(!showProductLabels)}
                  className={`px-3 py-1 text-xs ${showProductLabels ? 'bg-purple-600' : 'bg-gray-400'} text-white rounded hover:opacity-80`}
                >
                  {showProductLabels ? '🏷️ Hide' : '🏷️ Show'} Labels
                </button>
                <button
                  onClick={() => setShowOriginalSize(!showOriginalSize)}
                  className={`px-3 py-1 text-xs ${showOriginalSize ? 'bg-green-600' : 'bg-blue-600'} text-white rounded hover:opacity-80`}
                >
                  {showOriginalSize ? '🔍 Original' : '📏 Scaled'} Size
                </button>
                <button
                  onClick={() => setShowCoordinateDebug(!showCoordinateDebug)}
                  className="px-3 py-1 text-xs bg-gray-800 text-white rounded hover:bg-gray-700"
                >
                  {showCoordinateDebug ? '🔍 Hide' : '🔍 Show'} Debug
                </button>
              </div>
            </div>
            
            {/* Debug panel - Google's official method: divide by 1000, multiply by dimension */}
            {showCoordinateDebug && imageDimensions && detections.length > 0 && (
              <div className="mb-4 p-3 bg-gray-900 rounded text-white font-mono text-xs">
                <div className="font-bold text-green-400 mb-1">✅ Using Google&apos;s Official Coordinate Method</div>
                <div className="text-gray-300 text-[10px] mb-2">Format: [ymin, xmin, ymax, xmax] normalized 0-1000</div>
                <div className={`font-bold mb-1 ${showOriginalSize ? 'text-green-400' : 'text-blue-400'}`}>
                  📐 {showOriginalSize ? 'SHOWING ORIGINAL SIZE' : 'SHOWING SCALED SIZE'}
                </div>
                <div className="font-bold text-yellow-400 mb-1">Image Dimensions:</div>
                <div>Natural (sent to Gemini): {imageDimensions.natural.width}x{imageDimensions.natural.height}px</div>
                <div>Displayed (on screen): {imageDimensions.displayed.width}x{imageDimensions.displayed.height}px</div>
                <div className="mt-1 text-blue-400">
                  Aspect Ratio: {(imageDimensions.natural.width / imageDimensions.natural.height).toFixed(3)} 
                  ({imageDimensions.natural.width / imageDimensions.natural.height < 1 ? 'Portrait' : 'Landscape'})
                </div>
                <div className="text-purple-400">
                  Scale Factor: {(imageDimensions.displayed.width / imageDimensions.natural.width * 100).toFixed(1)}% of original
                </div>
                <div className="mt-2 font-bold text-green-400">Detections: {detections.length}</div>
                {detections[0] && (
                  <div className="mt-2 border-t border-gray-700 pt-2">
                    <div className="font-bold text-cyan-400 mb-1">🔍 Sample Box #1: {detections[0].label}</div>
                    <div className="text-yellow-300">Normalized [0-1000]: x0={detections[0].bounding_box.x0}, y0={detections[0].bounding_box.y0}, x1={detections[0].bounding_box.x1}, y1={detections[0].bounding_box.y1}</div>
                    {showOriginalSize ? (
                      <>
                        <div className="text-green-300">
                          Pixel Coords (Original): left={(detections[0].bounding_box.x0/1000*imageDimensions.natural.width).toFixed(1)}px, 
                          top={(detections[0].bounding_box.y0/1000*imageDimensions.natural.height).toFixed(1)}px
                        </div>
                        <div className="text-cyan-300">
                          Box Size (Original): {((detections[0].bounding_box.x1-detections[0].bounding_box.x0)/1000*imageDimensions.natural.width).toFixed(1)}px × 
                          {((detections[0].bounding_box.y1-detections[0].bounding_box.y0)/1000*imageDimensions.natural.height).toFixed(1)}px
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-green-300">
                          Pixel Coords (Scaled): left={(detections[0].bounding_box.x0/1000*imageDimensions.displayed.width).toFixed(1)}px, 
                          top={(detections[0].bounding_box.y0/1000*imageDimensions.displayed.height).toFixed(1)}px
                        </div>
                        <div className="text-cyan-300">
                          Box Size (Scaled): {((detections[0].bounding_box.x1-detections[0].bounding_box.x0)/1000*imageDimensions.displayed.width).toFixed(1)}px × 
                          {((detections[0].bounding_box.y1-detections[0].bounding_box.y0)/1000*imageDimensions.displayed.height).toFixed(1)}px
                        </div>
                      </>
                    )}
                    <div className="text-orange-300 text-[10px] mt-1">
                      Expected position: {((detections[0].bounding_box.x0/1000)*100).toFixed(1)}% from left, {((detections[0].bounding_box.y0/1000)*100).toFixed(1)}% from top
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="relative inline-block" style={{ maxWidth: showOriginalSize ? 'none' : '100%', overflow: showOriginalSize ? 'auto' : 'visible' }}>
              <img
                ref={imageRef}
                src={`data:image/jpeg;base64,${image.file_path}`}
                alt={image.original_filename}
                className="rounded-lg"
                style={{ 
                  display: 'block',
                  width: showOriginalSize ? 'auto' : '100%',
                  height: 'auto',
                  maxWidth: showOriginalSize ? 'none' : '100%'
                }}
              />
              {detections.map((detection, index) => {
                const box = detection.bounding_box;
                const isSelected = detection.id === selectedDetection;
                
                // Google's official coordinate conversion method:
                // Gemini returns [ymin, xmin, ymax, xmax] normalized 0-1000
                // Convert to pixels: coordinate / 1000 * dimension
                let leftPx, topPx, widthPx, heightPx;
                
                if (imageDimensions) {
                  // Use original size dimensions when showing original, otherwise use displayed
                  const imgWidth = showOriginalSize ? imageDimensions.natural.width : imageDimensions.displayed.width;
                  const imgHeight = showOriginalSize ? imageDimensions.natural.height : imageDimensions.displayed.height;
                  
                  // Simple conversion (Google's official method)
                  leftPx = (box.x0 / 1000) * imgWidth;
                  topPx = (box.y0 / 1000) * imgHeight;
                  widthPx = ((box.x1 - box.x0) / 1000) * imgWidth;
                  heightPx = ((box.y1 - box.y0) / 1000) * imgHeight;
                  
                  // Log first box for debugging
                  if (index === 0 && showCoordinateDebug) {
                    console.log(`✅ Box #1 Google Method (${showOriginalSize ? 'ORIGINAL' : 'SCALED'}): [${box.x0},${box.y0},${box.x1},${box.y1}] -> [${leftPx.toFixed(0)}px,${topPx.toFixed(0)}px,${widthPx.toFixed(0)}x${heightPx.toFixed(0)}px]`);
                  }
                } else {
                  // Hide boxes until dimensions are loaded
                  leftPx = 0;
                  topPx = 0;
                  widthPx = 0;
                  heightPx = 0;
                  
                  if (index === 0) {
                    console.log('⚠️ Image dimensions not loaded yet, boxes hidden');
                  }
                }
                
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
                    {/* Debug coordinates overlay */}
                    {showCoordinateDebug && imageDimensions && (
                      <div className="absolute top-0 left-0 px-2 py-1 text-[10px] bg-black bg-opacity-90 text-white font-mono rounded-br leading-tight">
                        <div className="text-yellow-300">#{index + 1} [{box.x0},{box.y0},{box.x1},{box.y1}]</div>
                        <div className="text-cyan-300">
                          {Math.round(leftPx)},{Math.round(topPx)} {Math.round(widthPx)}x{Math.round(heightPx)}px
                        </div>
                        <div className="text-purple-300 text-[8px] truncate max-w-[120px]">{detection.label}</div>
                      </div>
                    )}
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
                        {foodgraphResults.slice(0, 50).map((result, index) => {
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
                        })}
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
