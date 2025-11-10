'use client';

import React, { useState, useEffect, use, useRef } from 'react';
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
  // Classification fields
  is_product: boolean | null;
  details_visible: boolean | null;
  extraction_notes: string | null;
  // Product fields
  brand_name: string | null;
  category: string | null;
  sku: string | null;
  product_name: string | null;
  flavor: string | null;
  size: string | null;
  description: string | null;
  // Confidence scores
  brand_confidence: number | null;
  product_name_confidence: number | null;
  category_confidence: number | null;
  flavor_confidence: number | null;
  size_confidence: number | null;
  description_confidence: number | null;
  sku_confidence: number | null;
  // Price fields
  price: string | null;
  price_currency: string | null;
  price_confidence: number | null;
  // FoodGraph match fields
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
  key?: string;
  title?: string;
  product_name: string | null;
  brand_name: string | null;
  front_image_url: string | null;
  result_rank: number;
  is_match?: boolean | null;
  match_confidence?: number | null;
  companyBrand?: string | null;
  companyManufacturer?: string | null;
  measures?: string | null;
  category?: string | null;
  ingredients?: string;
}

interface ImageData {
  id: string;
  original_filename: string;
  file_path: string;
  processing_status: string;
  store_name?: string | null;
  project_id?: string | null;
}

export default function AnalyzePage({ params }: { params: Promise<{ imageId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [image, setImage] = useState<ImageData | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedDetection, setSelectedDetection] = useState<string | null>(null);
  const [foodgraphResults, setFoodgraphResults] = useState<FoodGraphResult[]>([]);
  const [foodgraphSearchTerm, setFoodgraphSearchTerm] = useState<string | null>(null);
  const [productsDetected, setProductsDetected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [showingAllWithConfidence, setShowingAllWithConfidence] = useState(false);
  const [preFiltering, setPreFiltering] = useState(false);
  const [preFilteredCount, setPreFilteredCount] = useState<number | null>(null);
  const [consolidationApplied, setConsolidationApplied] = useState(false);
  const [matchStatusCounts, setMatchStatusCounts] = useState<{ identical: number; almostSame: number } | null>(null);
  const [showProductLabels, setShowProductLabels] = useState(true);
  const [extractingPrice, setExtractingPrice] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [savedResultId, setSavedResultId] = useState<string | null>(null);
  const [processingStep1, setProcessingStep1] = useState(false);
  const [processingStep2, setProcessingStep2] = useState(false);
  const [processingStep3, setProcessingStep3] = useState(false);
  const [step1Progress, setStep1Progress] = useState<{ success: number; total: number; errors: number } | null>(null);
  const [step2Progress, setStep2Progress] = useState<{ success: number; total: number; errors: number } | null>(null);
  const [step3Progress, setStep3Progress] = useState<{ success: number; total: number; noMatch: number; errors: number } | null>(null);
  const [step3Details, setStep3Details] = useState<Array<{ detectionIndex: number; product: string; stage: string; message: string }>>([]);
  const [detectionMethod, setDetectionMethod] = useState<'gemini' | 'yolo'>('yolo');
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
        setPreFilteredCount(null); // Also reset pre-filter count
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
      // Choose API endpoint based on detection method
      const endpoint = detectionMethod === 'yolo' ? '/api/detect-yolo' : '/api/detect';
      
      const response = await fetch(endpoint, {
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
      
      // Show detection time info
      if (data.processing_time_ms) {
        console.log(`Detection completed in ${data.processing_time_ms}ms using ${data.detection_method || detectionMethod.toUpperCase()}`);
      }
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
    setFoodgraphSearchTerm(null); // Clear search term when switching products
    setFilteredCount(null);
    setPreFilteredCount(null); // Clear pre-filter count when switching products
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
    setPreFilteredCount(null); // Reset pre-filter count on new search
    setFilteredCount(null); // Reset AI filter count on new search
    setConsolidationApplied(false); // Reset consolidation flag
    setMatchStatusCounts(null); // Reset match status counts

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
      console.log('Search term used:', data.searchTerm);
      
      setFoodgraphResults(data.products || []);
      setFoodgraphSearchTerm(data.searchTerm || null);
    } catch (err) {
      console.error('FoodGraph search error:', err);
      const errorMessage = err instanceof Error ? err.message : 'FoodGraph search failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePreFilter = async () => {
    if (!selectedDetection) return;

    const detection = detections.find(d => d.id === selectedDetection);
    if (!detection) return;

    setPreFiltering(true);
    setError(null);

    try {
      // Import the pre-filter function
      const { preFilterFoodGraphResults } = await import('@/lib/foodgraph');
      
      // Transform database results to match FoodGraph API format
      // The pre-filter function expects raw FoodGraph structure (companyBrand, measures, sourcePdpUrls)
      // But database stores transformed structure (brand_name, measures, full_data)
      const transformedResults = foodgraphResults.map((result: any, index: number) => {
        // If result already has full_data, use it as base and overlay with DB fields
        if (result.full_data) {
          return {
            ...result.full_data,
            // Overlay DB fields that might be missing in full_data
            measures: result.measures || result.full_data.measures,
            companyBrand: result.brand_name || result.full_data.companyBrand,
            // Keep track of original index for mapping back
            __originalIndex: index,
            __originalId: result.id
          };
        }
        // Otherwise, transform DB structure to FoodGraph structure
        return {
          companyBrand: result.brand_name,
          measures: result.measures,
          title: result.product_name,
          sourcePdpUrls: result.full_data?.sourcePdpUrls || [],
          category: result.category,
          __originalIndex: index,
          __originalId: result.id,
          ...result // Include all other fields
        };
      });
      
      // Pre-filter results based on extracted product info and retailer
      const filteredResults = preFilterFoodGraphResults(
        transformedResults, 
        {
          brand: detection.brand_name || undefined,
          size: detection.size || undefined,
          productName: detection.product_name || undefined,
          sizeConfidence: detection.size_confidence || undefined
        },
        image?.store_name || undefined // Pass store name for retailer matching
      ) as any;

      console.log('✅ Pre-filtered results:', {
        originalCount: foodgraphResults.length,
        filteredCount: filteredResults.length
      });

      // Map filtered results back to original database structure
      // Preserve database IDs and fields while adding similarity scores
      const mappedResults = filteredResults.map((filtered: any) => {
        // Find original result using the tracked index
        const originalIndex = filtered.__originalIndex;
        const original = foodgraphResults[originalIndex];
        
        return {
          ...original, // Keep all original database fields (id, detection_id, etc.)
          similarityScore: filtered.similarityScore,
          matchReasons: filtered.matchReasons
        };
      });

      // Update the foodgraph results to show only pre-filtered ones
      setFoodgraphResults(mappedResults);
      setPreFilteredCount(mappedResults.length);
    } catch (err) {
      console.error('❌ Pre-filter error:', err);
      setError(err instanceof Error ? err.message : 'Pre-filter failed');
    } finally {
      setPreFiltering(false);
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

      // Extract IDs of pre-filtered results to ensure AI only processes these
      const preFilteredResultIds = foodgraphResults.map(r => r.id);
      console.log(`🎯 Sending ${preFilteredResultIds.length} pre-filtered result IDs to AI filter`);

      // Call the filter API
      const response = await fetch('/api/filter-foodgraph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detectionId: selectedDetection,
          croppedImageBase64,
          preFilteredResultIds // Pass the pre-filtered result IDs
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to filter results');
      }

      const data = await response.json();
      console.log('Filter results:', data);
      
      // Update the results with filtered ones (now includes ALL with confidence scores)
      setFoodgraphResults(data.filteredResults || []);
      setFilteredCount(data.totalFiltered);
      setShowingAllWithConfidence(data.showingAllWithConfidence || false);
      setConsolidationApplied(data.consolidationApplied || false);
      setMatchStatusCounts({
        identical: data.identicalCount || 0,
        almostSame: data.almostSameCount || 0
      });
      
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

  const handleExtractInfoAll = async () => {
    setProcessingStep1(true);
    setError(null);
    setStep1Progress(null);

    try {
      console.log('🚀 Starting Step 1: Extract Info for All Products');
      
      const response = await fetch('/api/batch-extract-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: resolvedParams.imageId }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Step 1 complete:', data);
        setStep1Progress({
          success: data.success,
          total: data.total,
          errors: data.errors
        });

        // Reload the page data to show updated products
        await fetchImage();

        alert(`✅ Extract Info Complete!\n\n📋 Processed: ${data.total} products\n✓ Success: ${data.success}\n✗ Errors: ${data.errors}`);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to extract info');
      }
      
    } catch (err) {
      console.error('❌ Extract Info failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to extract info');
      alert(`Failed to extract info: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingStep1(false);
    }
  };

  const handleExtractPriceAll = async () => {
    setProcessingStep2(true);
    setError(null);
    setStep2Progress(null);

    try {
      console.log('🚀 Starting Step 2: Extract Prices for All Products');
      
      const response = await fetch('/api/batch-extract-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: resolvedParams.imageId }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Step 2 complete:', data);
        setStep2Progress({
          success: data.success,
          total: data.total,
          errors: data.errors
        });

        // Reload the page data to show updated products
        await fetchImage();

        alert(`✅ Extract Price Complete!\n\n💰 Processed: ${data.total} products\n✓ Success: ${data.success}\n✗ Errors: ${data.errors}`);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to extract prices');
      }
      
    } catch (err) {
      console.error('❌ Extract Price failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to extract prices');
      alert(`Failed to extract prices: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingStep2(false);
    }
  };

  const handleSearchAndSaveAll = async (concurrency?: number) => {
    setProcessingStep3(true);
    setError(null);
    setStep3Progress(null);
    setStep3Details([]);

    try {
      const concurrencyLabel = concurrency === 999999 ? 'ALL' : concurrency || 3;
      console.log(`🚀 Starting Step 3: Search & Save for All Products (Concurrency: ${concurrencyLabel})`);
      
      const response = await fetch('/api/batch-search-and-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageId: resolvedParams.imageId,
          concurrency: concurrency
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to search and save');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            console.log('📡 Progress update:', data);

            if (data.type === 'progress') {
              // Update detailed progress
              setStep3Details(prev => {
                const existing = prev.findIndex(p => p.detectionIndex === data.detectionIndex);
                const newItem = {
                  detectionIndex: data.detectionIndex,
                  product: data.currentProduct || '',
                  stage: data.stage || '',
                  message: data.message || ''
                };
                
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = newItem;
                  return updated;
                } else {
                  return [...prev, newItem];
                }
              });

              // Update summary progress
              if (data.processed !== undefined && data.total !== undefined) {
                setStep3Progress({
                  success: data.success || 0,
                  total: data.total,
                  noMatch: data.noMatch || 0,
                  errors: data.errors || 0
                });
              }

              // Update individual detection when it completes (stage='done' or stage='error')
              if (data.stage === 'done' || data.stage === 'error' || data.stage === 'no-match') {
                // Reload the specific detection from database to get saved match data
                if (data.stage === 'done') {
                  // Find the detection ID for this index
                  const detectionToReload = detections[data.detectionIndex];
                  if (detectionToReload) {
                    fetch(`/api/results/${resolvedParams.imageId}`)
                      .then(res => res.json())
                      .then(refreshedData => {
                        if (refreshedData.detections) {
                          // Update just this one detection with fresh data from DB
                          setDetections(prev => prev.map((det, idx) => {
                            if (idx === data.detectionIndex) {
                              return refreshedData.detections[idx];
                            }
                            return det;
                          }));
                        }
                      })
                      .catch(err => console.error('Failed to refresh detection:', err));
                  }
                } else {
                  // For errors/no-match, just update the fully_analyzed flag
                  setDetections(prev => prev.map((det, idx) => {
                    if (idx === data.detectionIndex) {
                      return { ...det, fully_analyzed: false };
                    }
                    return det;
                  }));
                }
              }
            } else if (data.type === 'complete') {
              console.log('✅ Step 3 complete:', data);
              setStep3Progress({
                success: data.success,
                total: data.total,
                noMatch: data.noMatch,
                errors: data.errors
              });

              // Reload the page data to show updated products
              await fetchImage();

              alert(`✅ Search & Save Complete!\n\n🔍 Processed: ${data.total} products\n✓ Saved: ${data.success}\n⚠️ No Match: ${data.noMatch}\n✗ Errors: ${data.errors}`);
            }
          }
        }
      }
      
    } catch (err) {
      console.error('❌ Search & Save failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to search and save');
      alert(`Failed to search and save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingStep3(false);
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
            <Link 
              href={image?.project_id ? `/projects/${image.project_id}` : '/projects'} 
              className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800"
            >
              <ArrowLeft className="w-4 h-4" />
              {image?.project_id ? 'Back to Project' : 'Back to Projects'}
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
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{image.original_filename}</h1>
            {image.store_name && (
              <p className="text-sm text-gray-600 mt-1 flex items-center">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                {image.store_name}
              </p>
            )}
          </div>
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
            <div className="flex gap-3 items-center">
              {!productsDetected && (
                <React.Fragment key="detection-controls">
                  {/* Detection Method Toggle */}
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setDetectionMethod('yolo')}
                      disabled={loading}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        detectionMethod === 'yolo'
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      ⚡ YOLO
                    </button>
                    <button
                      onClick={() => setDetectionMethod('gemini')}
                      disabled={loading}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        detectionMethod === 'gemini'
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      🤖 Gemini
                    </button>
                  </div>
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
                </React.Fragment>
              )}
              {productsDetected && detections.some(d => !d.fully_analyzed) && (() => {
                // Calculate eligible products for each step
                const needsInfo = detections.filter(d => !d.brand_name).length;
                const needsPrice = detections.filter(d => d.brand_name && (!d.price || d.price === 'Unknown')).length;
                const needsSearch = detections.filter(d => d.brand_name && !d.fully_analyzed).length;
                
                return (
                  <div className="flex gap-2">
                    <button
                      onClick={handleExtractInfoAll}
                      disabled={processingStep1 || needsInfo === 0}
                      className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-all font-semibold disabled:opacity-50 flex items-center gap-2 shadow-md text-sm"
                      title={needsInfo === 0 ? 'All products have info extracted' : `Extract info for ${needsInfo} products`}
                    >
                      {processingStep1 ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        `📋 Extract Info (${needsInfo})`
                      )}
                    </button>
                    <button
                      onClick={handleExtractPriceAll}
                      disabled={processingStep2 || needsPrice === 0}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold disabled:opacity-50 flex items-center gap-2 shadow-md text-sm"
                      title={needsPrice === 0 ? 'All products have prices' : `Extract price for ${needsPrice} products (requires Step 1)`}
                    >
                      {processingStep2 ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        `💰 Extract Price (${needsPrice})`
                      )}
                    </button>
                    
                    {/* Step 3: Search & Save - Multiple Concurrency Options for Testing */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">🔍 Search & Save ({needsSearch})</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleSearchAndSaveAll(3)}
                          disabled={processingStep3 || needsSearch === 0}
                          className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all font-medium disabled:opacity-50 text-xs"
                          title="Process 3 products at a time (safe)"
                        >
                          {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '⚡ 3 at once'}
                        </button>
                        <button
                          onClick={() => handleSearchAndSaveAll(10)}
                          disabled={processingStep3 || needsSearch === 0}
                          className="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all font-medium disabled:opacity-50 text-xs"
                          title="Process 10 products at a time"
                        >
                          {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '⚡⚡ 10 at once'}
                        </button>
                        <button
                          onClick={() => handleSearchAndSaveAll(20)}
                          disabled={processingStep3 || needsSearch === 0}
                          className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all font-medium disabled:opacity-50 text-xs"
                          title="Process 20 products at a time"
                        >
                          {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '⚡⚡⚡ 20 at once'}
                        </button>
                        <button
                          onClick={() => handleSearchAndSaveAll(50)}
                          disabled={processingStep3 || needsSearch === 0}
                          className="px-3 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all font-medium disabled:opacity-50 text-xs"
                          title="Process 50 products at a time"
                        >
                          {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '🚀 50 at once'}
                        </button>
                        <button
                          onClick={() => handleSearchAndSaveAll(999999)}
                          disabled={processingStep3 || needsSearch === 0}
                          className="px-3 py-2 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg hover:from-red-600 hover:to-orange-600 transition-all font-bold disabled:opacity-50 text-xs col-span-2"
                          title="Process ALL products simultaneously (maximum speed, high resource usage)"
                        >
                          {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '🔥 ALL AT ONCE 🔥'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {(processingStep1 || processingStep2 || processingStep3 || step1Progress || step2Progress || step3Progress) && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 rounded-lg p-4 mb-6">
            <h3 className="font-bold text-blue-900 mb-3">📊 Batch Processing Progress</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className={`bg-white rounded-lg p-3 border-2 ${step1Progress ? 'border-green-500' : processingStep1 ? 'border-yellow-500' : 'border-gray-300'}`}>
                <div className="text-xs font-semibold text-gray-600 mb-1">📋 Extract Info</div>
                <div className={`text-lg font-bold ${step1Progress ? 'text-green-600' : processingStep1 ? 'text-yellow-600' : 'text-gray-400'}`}>
                  {step1Progress ? `${step1Progress.success}/${step1Progress.total}` : processingStep1 ? 'Running...' : '—'}
                </div>
                <div className="text-xs text-gray-500">
                  {step1Progress ? `✓ Done (${step1Progress.errors} errors)` : processingStep1 ? 'In Progress...' : 'Not Started'}
                </div>
              </div>
              <div className={`bg-white rounded-lg p-3 border-2 ${step2Progress ? 'border-green-500' : processingStep2 ? 'border-green-500' : 'border-gray-300'}`}>
                <div className="text-xs font-semibold text-gray-600 mb-1">💰 Extract Price</div>
                <div className={`text-lg font-bold ${step2Progress ? 'text-green-600' : processingStep2 ? 'text-green-600' : 'text-gray-400'}`}>
                  {step2Progress ? `${step2Progress.success}/${step2Progress.total}` : processingStep2 ? 'Running...' : '—'}
                </div>
                <div className="text-xs text-gray-500">
                  {step2Progress ? `✓ Done (${step2Progress.errors} errors)` : processingStep2 ? 'In Progress...' : 'Not Started'}
                </div>
              </div>
              <div className={`bg-white rounded-lg p-3 border-2 ${step3Progress ? 'border-green-500' : processingStep3 ? 'border-blue-500' : 'border-gray-300'}`}>
                <div className="text-xs font-semibold text-gray-600 mb-1">🔍 Search & Save</div>
                <div className={`text-lg font-bold ${step3Progress ? 'text-green-600' : processingStep3 ? 'text-blue-600' : 'text-gray-400'}`}>
                  {step3Progress ? `${step3Progress.success}/${step3Progress.total}` : processingStep3 ? 'Running...' : '—'}
                </div>
                <div className="text-xs text-gray-500">
                  {step3Progress ? `✓ Saved ${step3Progress.success}, No Match ${step3Progress.noMatch}` : processingStep3 ? 'In Progress...' : 'Not Started'}
                </div>
              </div>
            </div>
            
            {/* Detailed Per-Product Progress for Step 3 */}
            {processingStep3 && step3Details.length > 0 && (
              <div className="mt-4 bg-white rounded-lg p-4 border border-blue-200">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">📦 Product Progress (3 at a time)</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {step3Details.map((detail) => (
                    <div key={detail.detectionIndex} className="flex items-center gap-2 text-xs py-1 px-2 bg-gray-50 rounded">
                      <span className="font-mono text-gray-500">#{detail.detectionIndex}</span>
                      <span className="flex-1 truncate text-gray-700">{detail.product}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        detail.stage === 'done' ? 'bg-green-100 text-green-700' :
                        detail.stage === 'searching' ? 'bg-blue-100 text-blue-700' :
                        detail.stage === 'filtering' ? 'bg-purple-100 text-purple-700' :
                        detail.stage === 'saving' ? 'bg-yellow-100 text-yellow-700' :
                        detail.stage === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {detail.stage === 'searching' ? '🔍' : 
                         detail.stage === 'filtering' ? '🤖' : 
                         detail.stage === 'saving' ? '💾' : 
                         detail.stage === 'done' ? '✓' : 
                         detail.stage === 'error' ? '✗' : '⏳'}
                        {detail.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Product Statistics Panel */}
        {productsDetected && detections.length > 0 && (() => {
          // Calculate statistics
          const totalProducts = detections.length;
          const notProduct = detections.filter(d => d.is_product === false).length;
          const detailsNotVisible = detections.filter(d => d.is_product === true && d.details_visible === false).length;
          const validNotProcessed = detections.filter(d => 
            (d.is_product === true || d.is_product === null) && 
            (d.details_visible === true || d.details_visible === null) &&
            !d.brand_name
          ).length;
          const validWithMatch = detections.filter(d => d.fully_analyzed === true).length;
          const validNoMatch = detections.filter(d => 
            d.brand_name && 
            !d.fully_analyzed && 
            d.foodgraph_results && 
            d.foodgraph_results.length === 0
          ).length;
          const validMultipleMatches = detections.filter(d => 
            d.brand_name && 
            !d.fully_analyzed && 
            d.foodgraph_results && 
            d.foodgraph_results.length > 1
          ).length;

          return (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-md p-6 mb-6 border border-indigo-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                📊 Product Statistics
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {/* Total Products */}
                <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                  <div className="text-2xl font-bold text-gray-900">{totalProducts}</div>
                  <div className="text-xs text-gray-600 mt-1">Total Products</div>
                </div>

                {/* Not Product */}
                <div className="bg-red-50 rounded-lg p-4 shadow-sm border border-red-200">
                  <div className="text-2xl font-bold text-red-700">{notProduct}</div>
                  <div className="text-xs text-red-600 mt-1">Not Product</div>
                </div>

                {/* Details Not Visible */}
                <div className="bg-orange-50 rounded-lg p-4 shadow-sm border border-orange-200">
                  <div className="text-2xl font-bold text-orange-700">{detailsNotVisible}</div>
                  <div className="text-xs text-orange-600 mt-1">Details Not Visible</div>
                </div>

                {/* Valid Not Processed */}
                <div className="bg-gray-50 rounded-lg p-4 shadow-sm border border-gray-300">
                  <div className="text-2xl font-bold text-gray-700">{validNotProcessed}</div>
                  <div className="text-xs text-gray-600 mt-1">Not Identified</div>
                </div>

                {/* Valid with ONE Match */}
                <div className="bg-green-50 rounded-lg p-4 shadow-sm border border-green-200">
                  <div className="text-2xl font-bold text-green-700">{validWithMatch}</div>
                  <div className="text-xs text-green-600 mt-1">✓ ONE Match</div>
                </div>

                {/* Valid NO Match */}
                <div className="bg-yellow-50 rounded-lg p-4 shadow-sm border border-yellow-200">
                  <div className="text-2xl font-bold text-yellow-700">{validNoMatch}</div>
                  <div className="text-xs text-yellow-600 mt-1">NO Match</div>
                </div>

                {/* Valid 2+ Matches */}
                <div className="bg-purple-50 rounded-lg p-4 shadow-sm border border-purple-200">
                  <div className="text-2xl font-bold text-purple-700">{validMultipleMatches}</div>
                  <div className="text-xs text-purple-600 mt-1">2+ Matches</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Processing Progress</span>
                  <span>{validWithMatch} / {totalProducts} Completed ({Math.round((validWithMatch / totalProducts) * 100)}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500 ease-out flex items-center justify-end pr-1"
                    style={{ width: `${(validWithMatch / totalProducts) * 100}%` }}
                  >
                    {validWithMatch > 0 && (
                      <span className="text-[10px] font-bold text-white">✓</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

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
              {imageDimensions ? detections.map((detection, index) => {
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
                    {/* Product number badge */}
                    <div 
                      key={`badge-${detection.id}`}
                      className={`absolute -top-6 left-0 px-2 py-1 text-xs font-bold text-white rounded ${isSelected ? 'bg-indigo-600' : detection.brand_name ? 'bg-green-600' : 'bg-yellow-600'}`}
                    >
                      #{index + 1}
                    </div>
                    {/* Product label */}
                    {detection.brand_name && showProductLabels && (
                      <div 
                        key={`label-${detection.id}`}
                        className="absolute -bottom-8 left-0 right-0 px-2 py-1 text-xs font-semibold bg-white border-2 border-green-600 rounded text-center truncate"
                      >
                        {detection.product_name || detection.brand_name}
                        {detection.category && <span key={`category-${detection.id}`} className="text-gray-500"> • {detection.category}</span>}
                      </div>
                    )}
                  </div>
                );
              }) : null}
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
                      <span className={`px-2 py-1 rounded ${(foodgraphResults.length > 0 || detection.fully_analyzed) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {(foodgraphResults.length > 0 || detection.fully_analyzed) ? '✓' : '○'} Search
                      </span>
                      <span className={`px-2 py-1 rounded ${(preFilteredCount !== null || detection.fully_analyzed) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {(preFilteredCount !== null || detection.fully_analyzed) ? '✓' : '○'} Pre-Filter
                      </span>
                      <span className={`px-2 py-1 rounded ${(filteredCount !== null || detection.fully_analyzed) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {(filteredCount !== null || detection.fully_analyzed) ? '✓' : '○'} AI Filter
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
                      
                      {/* Classification Badges */}
                      {(detection.is_product !== null || detection.details_visible !== null) && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {detection.is_product === false && (
                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                              ❌ Not a Product
                            </span>
                          )}
                          {detection.is_product === true && detection.details_visible === false && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
                              ⚠️ Details Not Visible
                            </span>
                          )}
                          {detection.is_product === true && detection.details_visible === true && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                              ✅ Valid Product
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Extraction Notes */}
                      {detection.extraction_notes && (
                        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                          💡 {detection.extraction_notes}
                        </div>
                      )}
                      
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
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-semibold text-gray-700">Product:</span> <span className="text-indigo-600 font-semibold">{detection.product_name}</span>
                            </div>
                            {detection.product_name_confidence !== null && detection.product_name_confidence > 0 && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                                detection.product_name_confidence >= 0.9 ? 'bg-green-100 text-green-800' :
                                detection.product_name_confidence >= 0.7 ? 'bg-green-100 text-green-700' :
                                detection.product_name_confidence >= 0.5 ? 'bg-yellow-100 text-yellow-800' :
                                detection.product_name_confidence >= 0.3 ? 'bg-orange-100 text-orange-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {Math.round(detection.product_name_confidence * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-semibold text-gray-700">Brand:</span> {detection.brand_name}
                          </div>
                          {detection.brand_confidence !== null && detection.brand_confidence > 0 && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                              detection.brand_confidence >= 0.9 ? 'bg-green-100 text-green-800' :
                              detection.brand_confidence >= 0.7 ? 'bg-green-100 text-green-700' :
                              detection.brand_confidence >= 0.5 ? 'bg-yellow-100 text-yellow-800' :
                              detection.brand_confidence >= 0.3 ? 'bg-orange-100 text-orange-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {Math.round(detection.brand_confidence * 100)}%
                            </span>
                          )}
                        </div>
                        {detection.category && (
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-semibold text-gray-700">Category:</span> {detection.category}
                            </div>
                            {detection.category_confidence !== null && detection.category_confidence > 0 && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                                detection.category_confidence >= 0.9 ? 'bg-green-100 text-green-800' :
                                detection.category_confidence >= 0.7 ? 'bg-green-100 text-green-700' :
                                detection.category_confidence >= 0.5 ? 'bg-yellow-100 text-yellow-800' :
                                detection.category_confidence >= 0.3 ? 'bg-orange-100 text-orange-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {Math.round(detection.category_confidence * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                        {detection.flavor && detection.flavor !== 'Unknown' && (
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-semibold text-gray-700">Flavor:</span> <span className="text-purple-600">{detection.flavor}</span>
                            </div>
                            {detection.flavor_confidence !== null && detection.flavor_confidence > 0 && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                                detection.flavor_confidence >= 0.9 ? 'bg-green-100 text-green-800' :
                                detection.flavor_confidence >= 0.7 ? 'bg-green-100 text-green-700' :
                                detection.flavor_confidence >= 0.5 ? 'bg-yellow-100 text-yellow-800' :
                                detection.flavor_confidence >= 0.3 ? 'bg-orange-100 text-orange-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {Math.round(detection.flavor_confidence * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                        {detection.size && detection.size !== 'Unknown' && (
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-semibold text-gray-700">Size:</span> <span className="text-blue-600">{detection.size}</span>
                            </div>
                            {detection.size_confidence !== null && detection.size_confidence > 0 && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                                detection.size_confidence >= 0.9 ? 'bg-green-100 text-green-800' :
                                detection.size_confidence >= 0.7 ? 'bg-green-100 text-green-700' :
                                detection.size_confidence >= 0.5 ? 'bg-yellow-100 text-yellow-800' :
                                detection.size_confidence >= 0.3 ? 'bg-orange-100 text-orange-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {Math.round(detection.size_confidence * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                        {detection.price && detection.price !== 'Unknown' && (
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-semibold text-gray-700">Price:</span> <span className="text-green-700 font-bold">{detection.price_currency === 'USD' ? '$' : detection.price_currency}{detection.price}</span>
                            </div>
                            {detection.price_confidence && detection.price_confidence > 0 && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                                detection.price_confidence >= 0.9 ? 'bg-green-100 text-green-800' :
                                detection.price_confidence >= 0.7 ? 'bg-green-100 text-green-700' :
                                detection.price_confidence >= 0.5 ? 'bg-yellow-100 text-yellow-800' :
                                detection.price_confidence >= 0.3 ? 'bg-orange-100 text-orange-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {Math.round(detection.price_confidence * 100)}%
                              </span>
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
                    
                    {detection.brand_name && foodgraphResults.length === 0 && !detection.fully_analyzed && (
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
                    
                    {foodgraphResults.length > 0 && preFilteredCount === null && !detection.fully_analyzed && (
                      <button
                        onClick={handlePreFilter}
                        disabled={preFiltering}
                        className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                      >
                        {preFiltering ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Pre-filtering...
                          </>
                        ) : (
                          <>
                            📊 Pre-Filter by Brand/Size/Retailer ({foodgraphResults.length} results)
                            <span className="ml-2 text-xs bg-orange-600 text-white px-2 py-0.5 rounded-full">≥85%</span>
                          </>
                        )}
                      </button>
                    )}
                    
                    {preFilteredCount !== null && filteredCount === null && !detection.fully_analyzed && (
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
                  {foodgraphResults.length > 0 && !detection.fully_analyzed && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">
                          FoodGraph Matches ({foodgraphResults.length})
                          {preFilteredCount !== null && filteredCount === null && (
                            <span className="ml-2 text-sm text-orange-600">→ Pre-filtered to {preFilteredCount} (≥85% match)</span>
                          )}
                          {filteredCount !== null && (
                            <span className="ml-2 text-sm text-green-600">
                              → {filteredCount} passed 70% AI threshold {filteredCount === 0 && '(showing all with scores)'}
                            </span>
                          )}
                        </h4>
                      </div>
                      
                      {/* Info banner when showing all with confidence */}
                      {showingAllWithConfidence && (
                        <div className="mb-3 p-3 bg-blue-50 border-l-4 border-blue-400 rounded">
                          <div className="flex items-start gap-2">
                            <span className="text-blue-600 text-lg">ℹ️</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-blue-800">Sorted by visual similarity (highest first)</p>
                              <p className="text-xs text-blue-700 mt-1">
                                Green ✓ IDENTICAL = Exact same product. 
                                Yellow ≈ ALMOST SAME = Close variant (different size/flavor). 
                                Gray ✗ FAIL = No match. 
                                Check Visual Similarity % to see how close each option is.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Match Status Breakdown */}
                      {matchStatusCounts && filteredCount !== null && (
                        <div className="mb-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-purple-400 rounded">
                          <div className="flex items-start gap-2">
                            <span className="text-purple-600 text-lg">📊</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-purple-900">AI Match Status Breakdown</p>
                              <div className="flex flex-wrap gap-3 mt-2 text-xs">
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-medium">
                                  ✓ Identical: {matchStatusCounts.identical}
                                </span>
                                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-medium">
                                  ≈ Almost Same: {matchStatusCounts.almostSame}
                                </span>
                                <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded font-medium">
                                  ✗ Not Match: {foodgraphResults.length - matchStatusCounts.identical - matchStatusCounts.almostSame}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Consolidation Applied Banner */}
                      {consolidationApplied && (
                        <div className="mb-3 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-500 rounded">
                          <div className="flex items-start gap-2">
                            <span className="text-yellow-600 text-lg">🔄</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-yellow-900">Consolidation Applied</p>
                              <p className="text-xs text-yellow-800 mt-1">
                                No identical matches found, but exactly 1 &quot;almost same&quot; match detected. 
                                This close variant has been promoted to final match (same brand/product, different size or flavor).
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Display the search term used */}
                      {foodgraphSearchTerm && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <span className="text-blue-600 font-semibold text-sm">🔍 Search Term:</span>
                          </div>
                          <div className="mt-1 text-sm text-gray-700 font-mono bg-white px-3 py-2 rounded border border-blue-100">
                            {foodgraphSearchTerm}
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                        {(() => {
                          // If AI filtered, show all results (with confidence scores). Otherwise show first 50
                          const resultsToShow = filteredCount !== null
                            ? foodgraphResults // Show all (already sorted by confidence from backend)
                            : foodgraphResults.slice(0, 50);
                          
                          return resultsToShow.map((result, index) => {
                            const isSaved = detection.selected_foodgraph_result_id === result.id;
                            const passedThreshold = result.is_match === true; // Passed 70% AI confidence
                            const matchStatus = (result as any).match_status as string | undefined; // Three-tier status: identical, almost_same, not_match
                            
                            // Display FoodGraph product fields
                            // Try to get from direct fields first, then from full_data JSON
                            const fgBrand = (result as any).companyBrand || (result as any).brand_name || (result as any).full_data?.companyBrand || 'N/A';
                            const fgSize = (result as any).measures || (result as any).full_data?.measures || 'N/A';
                            const fgTitle = result.product_name || result.title || (result as any).full_data?.title || 'N/A';
                            
                            // Extract retailers for comparison
                            const imageRetailer = image?.store_name ? extractRetailerFromStoreName(image.store_name) : null;
                            const fgUrls = (result as any).full_data?.sourcePdpUrls || [];
                            const fgRetailers = extractRetailersFromUrls(fgUrls);
                            const retailerMatch = imageRetailer && fgRetailers.includes(imageRetailer);
                            
                            // Helper functions for retailer extraction (inline for now)
                            function extractRetailerFromStoreName(storeName: string): string | null {
                              if (!storeName) return null;
                              const normalized = storeName.toLowerCase().trim();
                              const retailers = ['target', 'walmart', 'walgreens', 'cvs', 'kroger'];
                              for (const retailer of retailers) {
                                if (normalized.includes(retailer)) return retailer;
                              }
                              return normalized.split(/\s+/)[0] || null;
                            }
                            
                            function extractRetailersFromUrls(urls: string[]): string[] {
                              if (!urls || urls.length === 0) return [];
                              const retailers = new Set<string>();
                              for (const url of urls) {
                                const urlLower = url.toLowerCase();
                                if (urlLower.includes('walmart.com')) retailers.add('walmart');
                                if (urlLower.includes('target.com')) retailers.add('target');
                                if (urlLower.includes('walgreens.com')) retailers.add('walgreens');
                                if (urlLower.includes('cvs.com')) retailers.add('cvs');
                                if (urlLower.includes('kroger.com')) retailers.add('kroger');
                              }
                              return Array.from(retailers);
                            }
                            
                            return (
                            <div 
                              key={result.id}
                              className={`bg-white rounded-lg border-2 ${
                                isSaved ? 'border-green-500 ring-2 ring-green-300' : 
                                matchStatus === 'identical' && filteredCount !== null ? 'border-green-400 bg-green-50' :
                                matchStatus === 'almost_same' && filteredCount !== null ? 'border-yellow-400 bg-yellow-50' :
                                passedThreshold && filteredCount !== null ? 'border-green-400 bg-green-50' : 
                                'border-gray-200'
                              } overflow-hidden hover:border-indigo-400 transition-colors relative`}
                            >
                          {/* Match Status badge (only show after AI filtering) */}
                          {filteredCount !== null && (
                            <div className="absolute top-2 right-2 z-10">
                              {matchStatus === 'identical' ? (
                                <span className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-full flex items-center gap-1">
                                  ✓ IDENTICAL
                                </span>
                              ) : matchStatus === 'almost_same' ? (
                                <span className="px-2 py-1 bg-yellow-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                                  ≈ ALMOST SAME
                                </span>
                              ) : passedThreshold ? (
                                <span className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded-full flex items-center gap-1">
                                  ✓ PASS
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-gray-600 text-white text-xs font-bold rounded-full flex items-center gap-1">
                                  ✗ FAIL
                                </span>
                              )}
                            </div>
                          )}
                          
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
                                {/* Visual Match Status - Prominent Display */}
                                {filteredCount !== null && result.match_confidence !== undefined && (
                                  <div className="mb-2 flex items-center justify-between">
                                    {matchStatus === 'identical' ? (
                                      <>
                                        <span className="text-lg font-bold text-green-600">
                                          {Math.round(result.match_confidence * 100)}%
                                        </span>
                                        <span className="text-[10px] font-semibold text-green-600">
                                          IDENTICAL
                                        </span>
                                      </>
                                    ) : matchStatus === 'almost_same' ? (
                                      <>
                                        <span className="text-lg font-bold text-yellow-600">
                                          {Math.round(result.match_confidence * 100)}%
                                        </span>
                                        <span className="text-[10px] font-semibold text-yellow-600">
                                          ALMOST SAME
                                        </span>
                                      </>
                                    ) : passedThreshold ? (
                                      <>
                                        <span className="text-lg font-bold text-green-600">
                                          {Math.round(result.match_confidence * 100)}%
                                        </span>
                                        <span className="text-[10px] font-semibold text-green-600">
                                          MATCH
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-lg font-bold text-red-600">
                                          NO MATCH
                                        </span>
                                        <span className="text-[10px] font-semibold text-gray-500">
                                          {Math.round(result.match_confidence * 100)}% confident
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
                                
                                <p className="text-xs font-semibold text-gray-900 truncate" title={result.product_name || 'Unnamed'}>
                              {result.product_name || 'Unnamed Product'}
                            </p>
                            <p className="text-xs text-gray-600 truncate">
                              {result.brand_name || 'Unknown Brand'}
                            </p>
                            <p className="text-xs text-indigo-600 font-semibold mt-1">
                              #{index + 1}
                            </p>
                            
                            {/* Comparison: Extracted vs FoodGraph */}
                            <div className="mt-2 space-y-1 text-[10px] bg-blue-50 border border-blue-200 p-1.5 rounded">
                              <div className="font-semibold text-blue-900 mb-1">Extracted → FoodGraph</div>
                              <div className="space-y-0.5">
                                <div>
                                  <span className="text-gray-600">Brand:</span>
                                  <div className="flex justify-between items-center ml-2">
                                    <span className="font-mono text-blue-600" title={detection.brand_name || 'N/A'}>{(detection.brand_name || 'N/A').substring(0, 15)}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="font-mono text-purple-600" title={fgBrand}>{fgBrand.substring(0, 15)}</span>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-600">Size:</span>
                                  <div className="flex justify-between items-center ml-2">
                                    <span className="font-mono text-blue-600" title={detection.size || 'N/A'}>{(detection.size || 'N/A').substring(0, 15)}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="font-mono text-purple-600" title={fgSize}>{fgSize.substring(0, 15)}</span>
                                  </div>
                                </div>
                                {imageRetailer && (
                                  <div>
                                    <span className="text-gray-600">Retailer:</span>
                                    <div className="flex justify-between items-center ml-2">
                                      <span className="font-mono text-blue-600 capitalize" title={imageRetailer}>{imageRetailer}</span>
                                      <span className="text-gray-400">→</span>
                                      <span className={`font-mono font-semibold capitalize ${retailerMatch ? 'text-green-600' : 'text-red-500'}`} title={fgRetailers.join(', ') || 'No retailers'}>
                                        {fgRetailers.length > 0 ? fgRetailers.join(', ') : 'None'}
                                        {retailerMatch && ' ✓'}
                                        {!retailerMatch && fgRetailers.length > 0 && ' ✗'}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {(result as any).similarityScore !== undefined && (
                              <div className="mt-2">
                                <p className="text-xs text-orange-600 font-semibold mb-1">
                                  Total Match: {Math.round((result as any).similarityScore * 100)}%
                                </p>
                                {(result as any).matchReasons && (result as any).matchReasons.length > 0 && (
                                  <div className="space-y-0.5">
                                    {(result as any).matchReasons.map((reason: string, idx: number) => (
                                      <p key={idx} className="text-[10px] text-green-600 flex items-center gap-1">
                                        <span>✓</span>
                                        <span>{reason}</span>
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            
                {/* AI Assessment Details */}
                {result.match_confidence !== undefined && result.match_confidence !== null && filteredCount !== null && (
                  <div className={`mt-2 p-2 rounded border ${
                    matchStatus === 'identical' ? 'bg-green-50 border-green-300' :
                    matchStatus === 'almost_same' ? 'bg-yellow-50 border-yellow-300' :
                    passedThreshold ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-xs font-semibold ${
                        matchStatus === 'identical' ? 'text-green-900' :
                        matchStatus === 'almost_same' ? 'text-yellow-900' :
                        passedThreshold ? 'text-green-900' : 'text-red-900'
                      }`}>
                        🤖 AI Assessment
                      </p>
                      <p className={`text-[10px] font-semibold ${
                        matchStatus === 'identical' ? 'text-green-700' :
                        matchStatus === 'almost_same' ? 'text-yellow-700' :
                        passedThreshold ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {matchStatus === 'identical' ? 'Identical' :
                         matchStatus === 'almost_same' ? 'Almost Same' :
                         passedThreshold ? `${Math.round(result.match_confidence * 100)}% Match` : 'No Match'}
                      </p>
                    </div>
                    {/* Visual Similarity Score */}
                    {(result as any).visual_similarity !== undefined && (result as any).visual_similarity !== null && (
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-gray-600">
                          Visual Similarity:
                        </p>
                        <p className="text-[10px] font-semibold text-purple-600">
                          {Math.round((result as any).visual_similarity * 100)}%
                        </p>
                      </div>
                    )}
                    {(result as any).match_reason && (
                      <p className="text-[10px] text-gray-600 italic leading-tight">
                        {(result as any).match_reason}
                      </p>
                    )}
                  </div>
                )}
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
