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
  const router = useRouter();
  const [image, setImage] = useState<ImageData | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedDetection, setSelectedDetection] = useState<string | null>(null);
  const [foodgraphResults, setFoodgraphResults] = useState<FoodGraphResult[]>([]);
  const [currentStep, setCurrentStep] = useState<Step>('detect');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ request?: string; response?: string; error?: string } | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [extractionDebug, setExtractionDebug] = useState<{detectionId: string; response: unknown} | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [showCoordinateDebug, setShowCoordinateDebug] = useState(false); // Debug off by default
  const [showOriginalSize, setShowOriginalSize] = useState(false); // Toggle for original vs scaled image
  const [extractingPrice, setExtractingPrice] = useState(false);
  const [showProductLabels, setShowProductLabels] = useState(true); // Toggle for product labels on image
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
          const container = img.parentElement;
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
          console.log('📐 Image dimensions updated:', dims);
          console.log('📦 Container dimensions:', {
            width: container?.clientWidth,
            height: container?.clientHeight,
            offsetWidth: container?.offsetWidth,
            offsetHeight: container?.offsetHeight,
          });
          console.log('🔍 Image element:', {
            offsetWidth: img.offsetWidth,
            offsetHeight: img.offsetHeight,
            clientWidth: img.clientWidth,
            clientHeight: img.clientHeight,
            boundingRect: img.getBoundingClientRect(),
          });
          setImageDimensions(dims);
        }
      };
      
      // Update on load
      const img = imageRef.current;
      if (img.complete && img.naturalWidth > 0) {
        console.log('✅ Image already loaded, updating dimensions immediately');
        updateDimensions();
      } else {
        console.log('⏳ Waiting for image to load...');
        img.addEventListener('load', updateDimensions);
      }
      
      // Update on resize
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
    console.log('🎯 Starting detection for image:', resolvedParams.imageId);

    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: resolvedParams.imageId }),
      });

      console.log('📡 Detection response status:', response.status);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          throw new Error(`Detection failed with status ${response.status}`);
        }
        console.error('❌ Detection error:', errorData);
        throw new Error(errorData.details || errorData.error || 'Detection failed');
      }

      const data = await response.json();
      console.log('✅ Detection successful:', data.detectionsCount, 'products found');
      setDetections(data.detections);
      setCurrentStep('brand');
    } catch (err) {
      console.error('❌ Detection error caught:', err);
      const errorMessage = err instanceof Error ? err.message : 'Detection failed';
      setError(errorMessage);
      alert(`Detection failed: ${errorMessage}`); // Show alert for visibility
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
                    onClick={() => currentStep === 'brand' && handleExtractBrand(detection.id)}
                    className={`absolute cursor-pointer ${currentStep === 'brand' ? 'hover:border-yellow-500' : ''}`}
                    style={{
                      left: `${leftPx}px`,
                      top: `${topPx}px`,
                      width: `${widthPx}px`,
                      height: `${heightPx}px`,
                      border: `3px solid ${isSelected ? '#4F46E5' : detection.brand_name ? '#10B981' : '#F59E0B'}`,
                      backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.1)' : 'rgba(16, 185, 129, 0.05)',
                      display: imageDimensions ? 'block' : 'none', // Hide until dimensions loaded
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
                <div className="space-y-2 mb-4">
                  {detections.map((detection, index) => (
                    <div
                      key={detection.id}
                      className={`p-3 border-2 rounded-lg ${detection.brand_name ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold">Product #{index + 1}</span>
                          {detection.label && !detection.brand_name && (
                            <span className="ml-2 text-xs text-gray-500">({detection.label})</span>
                          )}
                        </div>
                        {detection.brand_name ? (
                          <div className="flex flex-col items-end">
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              {detection.product_name || detection.brand_name}
                            </span>
                            <div className="text-xs text-gray-600 text-right">
                              <div>{detection.brand_name}</div>
                              {detection.category && <div>{detection.category}</div>}
                              {detection.flavor && <div className="text-purple-600">Flavor: {detection.flavor}</div>}
                              {detection.size && <div className="text-blue-600">Size: {detection.size}</div>}
                              {detection.price && detection.price !== 'Unknown' && (
                                <div className="text-green-700 font-semibold mt-1">
                                  Price: {detection.price_currency === 'USD' ? '$' : detection.price_currency}{detection.price}
                                  {detection.price_confidence && detection.price_confidence > 0 && (
                                    <span className="text-xs text-gray-500 ml-1">
                                      ({Math.round(detection.price_confidence * 100)}%)
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {!detection.price && (
                              <button
                                onClick={() => handleExtractPrice(detection.id)}
                                disabled={extractingPrice}
                                className="mt-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs disabled:bg-gray-400"
                              >
                                {extractingPrice ? '💰 Extracting...' : '💰 Extract Price'}
                              </button>
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
                
                {/* Extraction Debug Info */}
                {extractionDebug && (
                  <div className="mt-4 p-4 bg-gray-900 rounded-lg text-white font-mono text-xs">
                    <h4 className="font-bold text-green-400 mb-2">🔍 Last Extraction Result</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-yellow-400">Brand Name:</span>{' '}
                        <span className="text-green-300">{(extractionDebug.response as Record<string, string>).brandName || 'null'}</span>
                      </div>
                      <div>
                        <span className="text-yellow-400">Product Name:</span>{' '}
                        <span className="text-green-300">{(extractionDebug.response as Record<string, string>).productName || 'null'}</span>
                      </div>
                      <div>
                        <span className="text-yellow-400">Category:</span>{' '}
                        <span className="text-green-300">{(extractionDebug.response as Record<string, string>).category || 'null'}</span>
                      </div>
                      <div>
                        <span className="text-yellow-400">Flavor:</span>{' '}
                        <span className="text-green-300">{(extractionDebug.response as Record<string, string>).flavor || 'null'}</span>
                      </div>
                      <div>
                        <span className="text-yellow-400">Size:</span>{' '}
                        <span className="text-green-300">{(extractionDebug.response as Record<string, string>).size || 'null'}</span>
                      </div>
                      <div>
                        <span className="text-yellow-400">Description:</span>{' '}
                        <span className="text-green-300">{(extractionDebug.response as Record<string, string>).description || 'null'}</span>
                      </div>
                      <div>
                        <span className="text-yellow-400">SKU:</span>{' '}
                        <span className="text-green-300">{(extractionDebug.response as Record<string, string>).sku || 'null'}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Continue to FoodGraph button */}
                {detections.some(d => d.brand_name) && !loading && (
                  <button
                    onClick={() => setCurrentStep('foodgraph')}
                    className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold flex items-center justify-center gap-2"
                  >
                    Continue to FoodGraph Search →
                  </button>
                )}
              </div>
            )}

            {/* Step 3: FoodGraph Search */}
            {currentStep === 'foodgraph' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-gray-600">
                    Select a product with extracted brand to search FoodGraph catalog.
                  </p>
                  <button
                    onClick={() => setCurrentStep('brand')}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    ← Back to Extract
                  </button>
                </div>
                <div className="space-y-2 mb-4">
                  {detections.filter(d => d.brand_name).map((detection, index) => (
                    <button
                      key={detection.id}
                      onClick={() => setSelectedDetection(detection.id)}
                      className={`w-full p-4 border-2 rounded-lg text-left ${
                        selectedDetection === detection.id
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-semibold text-base">Product #{detection.detection_index + 1}</span>
                          {detection.category && (
                            <span className="ml-2 text-xs text-gray-500">({detection.category})</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        {detection.product_name && (
                          <div className="text-sm">
                            <span className="font-semibold text-indigo-600">{detection.product_name}</span>
                          </div>
                        )}
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">Brand:</span> {detection.brand_name}
                        </div>
                        {detection.flavor && detection.flavor !== 'Unknown' && (
                          <div className="text-xs text-purple-600">
                            <span className="font-medium">Flavor:</span> {detection.flavor}
                          </div>
                        )}
                        {detection.size && detection.size !== 'Unknown' && (
                          <div className="text-xs text-blue-600">
                            <span className="font-medium">Size:</span> {detection.size}
                          </div>
                        )}
                        {detection.sku && detection.sku !== 'Unknown' && (
                          <div className="text-xs text-green-600 font-mono">
                            <span className="font-medium">SKU:</span> {detection.sku}
                          </div>
                        )}
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

                {/* Loading State */}
                {loading && currentStep === 'foodgraph' && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <p className="text-sm text-blue-700">Searching FoodGraph...</p>
                  </div>
                )}

                {/* No Results Message */}
                {!loading && foodgraphResults.length === 0 && selectedDetection && currentStep === 'foodgraph' && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Click &quot;Search FoodGraph&quot; button to find matching products</p>
                  </div>
                )}

                {/* Debug Panel */}
                {debugInfo && (
                  <div className="mt-6">
                    <button
                      onClick={() => setShowDebugInfo(!showDebugInfo)}
                      className="mb-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                    >
                      🔍 {showDebugInfo ? 'Hide' : 'Show'} Debug Information
                    </button>
                    
                    {showDebugInfo && (
                      <div className="p-4 bg-gray-900 rounded-lg text-white font-mono text-xs overflow-auto max-h-96">
                        <h4 className="font-bold text-green-400 mb-2">🔍 Debug Information</h4>
                        
                        {debugInfo.request && (
                          <div className="mb-4">
                            <p className="text-yellow-400 font-semibold mb-1">📤 Request to /api/search-foodgraph:</p>
                            <pre className="bg-gray-800 p-2 rounded overflow-x-auto text-green-300">
                              {debugInfo.request}
                            </pre>
                          </div>
                        )}
                        
                        {debugInfo.response && (
                          <div className="mb-4">
                            <p className="text-blue-400 font-semibold mb-1">📥 Response from FoodGraph API:</p>
                            <pre className="bg-gray-800 p-2 rounded overflow-x-auto text-blue-300">
                              {debugInfo.response}
                            </pre>
                          </div>
                        )}
                        
                        {debugInfo.error && (
                          <div>
                            <p className="text-red-400 font-semibold mb-1">❌ Error:</p>
                            <pre className="bg-red-900 p-2 rounded overflow-x-auto text-red-200">
                              {debugInfo.error}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* FoodGraph Results - Visual Comparison */}
                {foodgraphResults.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">
                        Top 50 FoodGraph Matches ({foodgraphResults.length} found)
                        {filteredCount !== null && (
                          <span className="ml-2 text-sm text-green-600">
                            - AI Filtered to {filteredCount} match{filteredCount !== 1 ? 'es' : ''}
                          </span>
                        )}
                      </h3>
                      <button
                        onClick={handleFilterResults}
                        disabled={filtering}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 flex items-center gap-2 text-sm"
                      >
                        {filtering ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            AI Filtering...
                          </>
                        ) : (
                          <>
                            🤖 Filter with AI
                          </>
                        )}
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {foodgraphResults.slice(0, 50).map((result, index) => (
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
                    {foodgraphResults.length > 50 && (
                      <p className="text-sm text-gray-500 text-center mt-3">
                        + {foodgraphResults.length - 50} more results available
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
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
