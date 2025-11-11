'use client';

import React, { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle, Package, Trash2 } from 'lucide-react';
import { getImageUrl } from '@/lib/image-utils';

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
  processing_stage?: 'search' | 'pre_filter' | 'ai_filter' | null;
  companyBrand?: string | null;
  companyManufacturer?: string | null;
  measures?: string | null;
  category?: string | null;
  ingredients?: string;
}

interface ImageData {
  id: string;
  original_filename: string;
  file_path: string | null;
  s3_url: string | null;
  storage_type?: 's3_url' | 'base64';
  mime_type?: string | null;
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
  const [stageFilter, setStageFilter] = useState<'search' | 'pre_filter' | 'ai_filter'>('search');
  const [matchStatusCounts, setMatchStatusCounts] = useState<{ identical: number; almostSame: number } | null>(null);
  const [extractingPrice, setExtractingPrice] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [savedResultId, setSavedResultId] = useState<string | null>(null);
  const [showNoMatch, setShowNoMatch] = useState(false);
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'not_product' | 'details_clear' | 'details_partial' | 'details_none' | 'not_identified' | 'one_match' | 'no_match' | 'multiple_matches'>('all');
  const [isFetching, setIsFetching] = useState(false);

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

  // Track foodgraphResults state changes
  useEffect(() => {
    console.log(`📊 foodgraphResults state changed: ${foodgraphResults.length} results`, {
      filteredCount,
      preFilteredCount,
      selectedDetection
    });
  }, [foodgraphResults, filteredCount, preFilteredCount, selectedDetection]);

  // Load FoodGraph results when a detection is selected
  useEffect(() => {
    const loadFoodGraphResults = async () => {
      if (selectedDetection && detections.length > 0) {
        const detection = detections.find(d => d.id === selectedDetection);
        console.log(`🔄 useEffect - Selected detection changed:`, {
          selectedDetection,
          has_detection: !!detection,
          has_results: !!detection?.foodgraph_results,
          results_length: detection?.foodgraph_results?.length || 0
        });
        
        if (detection && detection.foodgraph_results && detection.foodgraph_results.length > 0) {
          // Load existing FoodGraph results
          console.log(`📦 useEffect - Loading ${detection.foodgraph_results.length} FoodGraph results from cache`);
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
            setFilteredCount(detection.foodgraph_results.length);
          }
          setPreFilteredCount(detection.foodgraph_results.length);
        } else if (detection && detection.fully_analyzed) {
          // Detection is fully analyzed but results weren't loaded - fetch them on demand
          console.log(`📥 Fetching FoodGraph results on-demand for detection ${detection.id}`);
          try {
            const response = await fetch(`/api/foodgraph-results/${detection.id}`);
            if (response.ok) {
              const data = await response.json();
              console.log(`📦 Loaded ${data.results?.length || 0} FoodGraph results on-demand`);
              
              // Update the detection in state with the loaded results
              setDetections(prev => prev.map(d => 
                d.id === detection.id ? { ...d, foodgraph_results: data.results } : d
              ));
              
              // ALWAYS set state, even for 0 results (NO MATCH case)
              if (data.results) {
                setFoodgraphResults(data.results);
                const hasFilteredResults = data.results.some((r: any) => r.hasOwnProperty('is_match'));
                if (hasFilteredResults) {
                  const matchedCount = data.results.filter((r: any) => r.is_match === true).length;
                  setFilteredCount(matchedCount);
                } else {
                  setFilteredCount(data.results.length);
                }
                setPreFilteredCount(data.results.length);
              }
            }
          } catch (error) {
            console.error('Failed to fetch FoodGraph results:', error);
          }
        } else {
          // No existing results, reset state
          console.log(`🔄 useEffect - No FoodGraph results, clearing state`);
          setFoodgraphResults([]);
          setFilteredCount(null);
          setPreFilteredCount(null); // Also reset pre-filter count
        }
      }
    };
    
    loadFoodGraphResults();
  }, [selectedDetection, detections]);

  const fetchImage = async () => {
    // Prevent concurrent/rapid fetches
    if (isFetching) {
      console.log('⚠️ Fetch already in progress, skipping...');
      return;
    }

    setIsFetching(true);
    const fetchStart = Date.now();
    console.log(`🚀 Starting fetch for image ${resolvedParams.imageId}`);
    
    try {
      const response = await fetch(`/api/results/${resolvedParams.imageId}`);
      const fetchTime = Date.now() - fetchStart;
      console.log(`⏱️ API fetch completed in ${fetchTime}ms`);
      
      const parseStart = Date.now();
      const data = await response.json();
      console.log(`⏱️ JSON parse completed in ${Date.now() - parseStart}ms`);
      
      setImage(data.image);
      
      if (data.detections && data.detections.length > 0) {
        setDetections(data.detections);
        setProductsDetected(true);
        
        // Log detections with foodgraph results
        const detectionsWithResults = data.detections.filter((d: Detection) => d.foodgraph_results && d.foodgraph_results.length > 0);
        console.log(`📊 Loaded ${data.detections.length} detections, ${detectionsWithResults.length} have FoodGraph results`);
        detectionsWithResults.forEach((d: Detection) => {
          console.log(`   - Detection #${d.detection_index}: ${d.foodgraph_results?.length} results, fully_analyzed=${d.fully_analyzed}`);
        });
      }
      
      const totalTime = Date.now() - fetchStart;
      console.log(`⏱️ 🎯 TOTAL FRONTEND TIME: ${totalTime}ms`);
    } catch (error) {
      console.error('Failed to fetch image:', error);
      const totalTime = Date.now() - fetchStart;
      console.error(`⏱️ ❌ Failed after ${totalTime}ms`);
    } finally {
      setIsFetching(false);
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
    
    // Load existing foodgraph_results from the detection if available
    const detection = detections.find(d => d.id === detectionId);
    console.log(`🔍 Clicked on detection:`, {
      id: detection?.id,
      detection_index: detection?.detection_index,
      fully_analyzed: detection?.fully_analyzed,
      has_foodgraph_results: !!detection?.foodgraph_results,
      foodgraph_results_length: detection?.foodgraph_results?.length || 0,
      foodgraph_results_sample: detection?.foodgraph_results?.[0]
    });
    
    if (detection && detection.foodgraph_results && detection.foodgraph_results.length > 0) {
      // Detection has saved FoodGraph results (e.g., from batch processing)
      console.log(`📦 Loading ${detection.foodgraph_results.length} saved FoodGraph results for product #${detection.detection_index}`);
      setFoodgraphResults(detection.foodgraph_results);
      // Set filtered count to indicate AI filtering was done during batch processing
      setFilteredCount(detection.foodgraph_results.length);
      setPreFilteredCount(detection.foodgraph_results.length);
      console.log(`✅ State updated - foodgraphResults should now have ${detection.foodgraph_results.length} items`);
    } else {
      // No saved results, clear state for manual workflow
      console.log(`⚠️ No saved FoodGraph results found - clearing state`);
      setFoodgraphResults([]);
      setFoodgraphSearchTerm(null);
      setFilteredCount(null);
      setPreFilteredCount(null);
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
                // Reload ALL detections from database to get updated statistics
                // This ensures the statistics panel updates in real-time during batch processing
                fetch(`/api/results/${resolvedParams.imageId}`)
                  .then(res => res.json())
                  .then(refreshedData => {
                    if (refreshedData.detections) {
                      // Update all detections with fresh data from DB
                      setDetections(refreshedData.detections);
                      // This will automatically update the statistics panel
                    }
                  })
                  .catch(err => console.error('Failed to refresh detections:', err));
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

      // Redirect to project after successful deletion
      if (image?.project_id) {
        router.push(`/projects/${image.project_id}`);
      } else {
        router.push('/projects');
      }
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
          </div>
        </div>

        {/* BLOCK 1: Image Upload & Detection */}
        {!productsDetected && (
          <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl shadow-lg p-6 mb-6 border-2 border-orange-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  📸 Block 1: Image Upload & Detection
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Detect products and extract information from the image
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Detection Method Toggle */}
              <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-sm">
                <button
                  onClick={() => setDetectionMethod('yolo')}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    detectionMethod === 'yolo'
                      ? 'bg-orange-500 text-white shadow-sm'
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
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  🤖 Gemini
                </button>
              </div>
              
              <button
                onClick={handleDetectProducts}
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-orange-500 to-yellow-500 text-white rounded-lg hover:from-orange-600 hover:to-yellow-600 transition-all font-bold disabled:bg-gray-400 flex items-center gap-2 shadow-lg"
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
            </div>
          </div>
        )}

        {/* BLOCK 1 (continued): Extract Information - Only show after detection */}
        {productsDetected && (() => {
          const needsInfo = detections.filter(d => !d.brand_name).length;
          const needsPrice = detections.filter(d => d.brand_name && (!d.price || d.price === 'Unknown')).length;
          const hasExtractionWork = needsInfo > 0 || needsPrice > 0;

          return hasExtractionWork ? (
            <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg shadow p-4 mb-4 border-2 border-orange-200">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-gray-900">
                    📋 Block 1: Extract Information
                  </h2>
                  <p className="text-xs text-gray-600">
                    Extract product details (brand, name, size, price) from detected products
                  </p>
                </div>
                
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={handleExtractInfoAll}
                    disabled={processingStep1 || needsInfo === 0}
                    className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-all font-semibold disabled:opacity-50 flex items-center gap-2 text-sm"
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
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold disabled:opacity-50 flex items-center gap-2 text-sm"
                    title={needsPrice === 0 ? 'All products have prices' : `Extract price for ${needsPrice} products`}
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
                </div>
              </div>
            </div>
          ) : null;
        })()}

        {/* BLOCK 2: Product Matching with FoodGraph */}
        {productsDetected && (() => {
          const needsSearch = detections.filter(d => d.brand_name && !d.fully_analyzed).length;
          
          return needsSearch > 0 ? (
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg shadow p-4 mb-4 border-2 border-blue-300">
              <div className="mb-3">
                <h2 className="text-base font-bold text-gray-900">
                  🔍 Block 2: Product Matching with FoodGraph
                </h2>
                <p className="text-xs text-gray-600">
                  Search, pre-filter, AI filter, and save product matches from FoodGraph database
                </p>
              </div>
              
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">
                  🔍 Search & Save ({needsSearch} products ready)
                </p>
                <div className="grid grid-cols-5 gap-2">
                  <button
                    onClick={() => handleSearchAndSaveAll(3)}
                    disabled={processingStep3 || needsSearch === 0}
                    className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all font-semibold disabled:opacity-50 text-xs"
                    title="Process 3 products at a time (safe)"
                  >
                    {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '⚡ 3 at once'}
                  </button>
                  <button
                    onClick={() => handleSearchAndSaveAll(10)}
                    disabled={processingStep3 || needsSearch === 0}
                    className="px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all font-semibold disabled:opacity-50 text-xs"
                    title="Process 10 products at a time"
                  >
                    {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '⚡⚡ 10 at once'}
                  </button>
                  <button
                    onClick={() => handleSearchAndSaveAll(20)}
                    disabled={processingStep3 || needsSearch === 0}
                    className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all font-semibold disabled:opacity-50 text-xs"
                    title="Process 20 products at a time"
                  >
                    {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '⚡⚡⚡ 20 at once'}
                  </button>
                  <button
                    onClick={() => handleSearchAndSaveAll(50)}
                    disabled={processingStep3 || needsSearch === 0}
                    className="px-3 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all font-semibold disabled:opacity-50 text-xs"
                    title="Process 50 products at a time"
                  >
                    {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '🚀 50 at once'}
                  </button>
                  <button
                    onClick={() => handleSearchAndSaveAll(999999)}
                    disabled={processingStep3 || needsSearch === 0}
                    className="px-3 py-2 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg hover:from-red-600 hover:to-orange-600 transition-all font-bold disabled:opacity-50 text-xs"
                    title="Process ALL products simultaneously"
                  >
                    {processingStep3 ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : '🔥 ALL 🔥'}
                  </button>
                </div>
              </div>
            </div>
          ) : null;
        })()}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {/* Batch Processing Progress - Split by Blocks */}
        {(processingStep1 || processingStep2 || step1Progress || step2Progress) && (
          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-300 rounded-lg p-4 mb-6">
            <h3 className="font-bold text-orange-900 mb-3">📊 Block 1 Progress: Extraction</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
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
            </div>
          </div>
        )}

        {(processingStep3 || step3Progress) && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 rounded-lg p-4 mb-6">
            <h3 className="font-bold text-blue-900 mb-3">📊 Block 2 Progress: FoodGraph Matching</h3>
            <div className="grid grid-cols-1 gap-3 text-sm">
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
                  {step3Details.map((detail, idx) => (
                    <div key={`step3-${detail.detectionIndex}-${idx}`} className="flex items-center gap-2 text-xs py-1 px-2 bg-gray-50 rounded">
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
          const validNotProcessed = detections.filter(d => 
            (d.is_product === true || d.is_product === null) && 
            !d.brand_name
          ).length;
          
          // Products with a selected match OR exactly 1 FoodGraph result (ONE Match)
          const validWithMatch = detections.filter(d => {
            // Already has a selected match
            if (d.fully_analyzed === true || (d.selected_foodgraph_gtin && d.selected_foodgraph_gtin.trim() !== '')) {
              return true;
            }
            // Has extraction and exactly 1 FoodGraph result (auto-match)
            if (d.brand_name && d.foodgraph_results && d.foodgraph_results.length === 1) {
              return true;
            }
            return false;
          }).length;
          
          // Products with extraction but no FoodGraph results found
          const validNoMatch = detections.filter(d => 
            d.brand_name && 
            !d.fully_analyzed && 
            !d.selected_foodgraph_gtin &&
            (!d.foodgraph_results || d.foodgraph_results.length === 0)
          ).length;
          
          // Products with extraction and 2+ FoodGraph results (needs manual review)
          const validMultipleMatches = detections.filter(d => 
            d.brand_name && 
            !d.fully_analyzed && 
            !d.selected_foodgraph_gtin &&
            d.foodgraph_results && 
            d.foodgraph_results.length >= 2
          ).length;

          return (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-md p-6 mb-6 border border-indigo-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                📊 Product Statistics
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {/* Total Products */}
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`bg-white rounded-lg p-4 shadow-sm border transition-all hover:scale-105 hover:shadow-md ${
                    activeFilter === 'all' ? 'border-gray-900 ring-2 ring-gray-900' : 'border-gray-200'
                  }`}
                >
                  <div className="text-2xl font-bold text-gray-900">{totalProducts}</div>
                  <div className="text-xs text-gray-600 mt-1">Total Products</div>
                  {activeFilter === 'all' && <div className="text-xs text-gray-900 font-semibold mt-1">● Active</div>}
                </button>

                {/* Not Product */}
                <button
                  onClick={() => setActiveFilter('not_product')}
                  className={`bg-red-50 rounded-lg p-4 shadow-sm border transition-all hover:scale-105 hover:shadow-md ${
                    activeFilter === 'not_product' ? 'border-red-900 ring-2 ring-red-900' : 'border-red-200'
                  }`}
                >
                  <div className="text-2xl font-bold text-red-700">{notProduct}</div>
                  <div className="text-xs text-red-600 mt-1">Not Product</div>
                  {activeFilter === 'not_product' && <div className="text-xs text-red-900 font-semibold mt-1">● Active</div>}
                </button>

                {/* Valid Not Processed */}
                <button
                  onClick={() => setActiveFilter('not_identified')}
                  className={`bg-gray-50 rounded-lg p-4 shadow-sm border transition-all hover:scale-105 hover:shadow-md ${
                    activeFilter === 'not_identified' ? 'border-gray-900 ring-2 ring-gray-900' : 'border-gray-300'
                  }`}
                >
                  <div className="text-2xl font-bold text-gray-700">{validNotProcessed}</div>
                  <div className="text-xs text-gray-600 mt-1">Not Identified</div>
                  {activeFilter === 'not_identified' && <div className="text-xs text-gray-900 font-semibold mt-1">● Active</div>}
                </button>

                {/* Valid with ONE Match */}
                <button
                  onClick={() => setActiveFilter('one_match')}
                  className={`bg-green-50 rounded-lg p-4 shadow-sm border transition-all hover:scale-105 hover:shadow-md ${
                    activeFilter === 'one_match' ? 'border-green-900 ring-2 ring-green-900' : 'border-green-200'
                  }`}
                >
                  <div className="text-2xl font-bold text-green-700">{validWithMatch}</div>
                  <div className="text-xs text-green-600 mt-1">✓ ONE Match</div>
                  {activeFilter === 'one_match' && <div className="text-xs text-green-900 font-semibold mt-1">● Active</div>}
                </button>

                {/* Valid NO Match */}
                <button
                  onClick={() => setActiveFilter('no_match')}
                  className={`bg-yellow-50 rounded-lg p-4 shadow-sm border transition-all hover:scale-105 hover:shadow-md ${
                    activeFilter === 'no_match' ? 'border-yellow-900 ring-2 ring-yellow-900' : 'border-yellow-200'
                  }`}
                >
                  <div className="text-2xl font-bold text-yellow-700">{validNoMatch}</div>
                  <div className="text-xs text-yellow-600 mt-1">NO Match</div>
                  {activeFilter === 'no_match' && <div className="text-xs text-yellow-900 font-semibold mt-1">● Active</div>}
                </button>

                {/* Valid 2+ Matches */}
                <button
                  onClick={() => setActiveFilter('multiple_matches')}
                  className={`bg-purple-50 rounded-lg p-4 shadow-sm border transition-all hover:scale-105 hover:shadow-md ${
                    activeFilter === 'multiple_matches' ? 'border-purple-900 ring-2 ring-purple-900' : 'border-purple-200'
                  }`}
                >
                  <div className="text-2xl font-bold text-purple-700">{validMultipleMatches}</div>
                  <div className="text-xs text-purple-600 mt-1">2+ Matches</div>
                  {activeFilter === 'multiple_matches' && <div className="text-xs text-purple-900 font-semibold mt-1">● Active</div>}
                </button>
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
            </div>

            {/* Active Filter Indicator */}
            {activeFilter !== 'all' && (() => {
              const filteredDetections = detections.filter((detection) => {
                if (activeFilter === 'not_product') return detection.is_product === false;
                if (activeFilter === 'not_identified') {
                  return (detection.is_product === true || detection.is_product === null) && 
                         !detection.brand_name;
                }
                if (activeFilter === 'one_match') {
                  // Has a selected match OR exactly 1 FoodGraph result
                  if (detection.fully_analyzed === true || (detection.selected_foodgraph_gtin && detection.selected_foodgraph_gtin.trim() !== '')) {
                    return true;
                  }
                  if (detection.brand_name && detection.foodgraph_results && detection.foodgraph_results.length === 1) {
                    return true;
                  }
                  return false;
                }
                if (activeFilter === 'no_match') {
                  return detection.brand_name && 
                         !detection.fully_analyzed && 
                         !detection.selected_foodgraph_gtin &&
                         (!detection.foodgraph_results || detection.foodgraph_results.length === 0);
                }
                if (activeFilter === 'multiple_matches') {
                  return detection.brand_name && 
                         !detection.fully_analyzed && 
                         !detection.selected_foodgraph_gtin &&
                         detection.foodgraph_results && 
                         detection.foodgraph_results.length >= 2;
                }
                return false;
              });

              const filterLabels = {
                'not_product': 'Not Product',
                'details_clear': 'Details: Clear',
                'details_partial': 'Details: Partial',
                'details_none': 'Details: None',
                'not_identified': 'Not Identified',
                'one_match': '✓ ONE Match',
                'no_match': 'NO Match',
                'multiple_matches': '2+ Matches'
              };

              const filterColors = {
                'not_product': 'bg-red-100 border-red-300 text-red-900',
                'details_clear': 'bg-blue-100 border-blue-300 text-blue-900',
                'details_partial': 'bg-yellow-100 border-yellow-300 text-yellow-900',
                'details_none': 'bg-orange-100 border-orange-300 text-orange-900',
                'not_identified': 'bg-gray-100 border-gray-300 text-gray-900',
                'one_match': 'bg-green-100 border-green-300 text-green-900',
                'no_match': 'bg-yellow-100 border-yellow-300 text-yellow-900',
                'multiple_matches': 'bg-purple-100 border-purple-300 text-purple-900'
              };

              return (
                <div className={`mb-4 p-3 rounded-lg border-2 ${filterColors[activeFilter]}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">🔍 Filter Active:</span>
                      <span className="font-bold">{filterLabels[activeFilter]}</span>
                      <span className="text-sm">({filteredDetections.length} of {detections.length} products shown)</span>
                    </div>
                    <button
                      onClick={() => setActiveFilter('all')}
                      className="px-3 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 font-medium"
                    >
                      Clear Filter
                    </button>
                  </div>
                </div>
              );
            })()}
            
            <div className="relative inline-block max-w-full">
              <img
                ref={imageRef}
                src={getImageUrl(image)}
                alt={image.original_filename}
                className="max-w-full h-auto rounded-lg"
                style={{ display: 'block' }}
              />
              {imageDimensions ? detections.filter((detection) => {
                // Filter based on active filter
                if (activeFilter === 'all') return true;
                if (activeFilter === 'not_product') return detection.is_product === false;
                if (activeFilter === 'not_identified') {
                  return (detection.is_product === true || detection.is_product === null) && 
                         !detection.brand_name;
                }
                if (activeFilter === 'one_match') {
                  // Has a selected match OR exactly 1 FoodGraph result
                  if (detection.fully_analyzed === true || (detection.selected_foodgraph_gtin && detection.selected_foodgraph_gtin.trim() !== '')) {
                    return true;
                  }
                  if (detection.brand_name && detection.foodgraph_results && detection.foodgraph_results.length === 1) {
                    return true;
                  }
                  return false;
                }
                if (activeFilter === 'no_match') {
                  return detection.brand_name && 
                         !detection.fully_analyzed && 
                         !detection.selected_foodgraph_gtin &&
                         (!detection.foodgraph_results || detection.foodgraph_results.length === 0);
                }
                if (activeFilter === 'multiple_matches') {
                  return detection.brand_name && 
                         !detection.fully_analyzed && 
                         !detection.selected_foodgraph_gtin &&
                         detection.foodgraph_results && 
                         detection.foodgraph_results.length >= 2;
                }
                return true;
              }).map((detection, index) => {
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
                    key={`detection-${detection.id}-${index}`}
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
                      className={`absolute -top-6 left-0 px-2 py-1 text-xs font-bold text-white rounded ${isSelected ? 'bg-indigo-600' : detection.brand_name ? 'bg-green-600' : 'bg-yellow-600'}`}
                    >
                      #{index + 1}
                    </div>
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
                </div>
                
                  {/* Extracted Product Information */}
                  {detection.brand_name ? (
                    <div className="bg-white border-2 border-gray-200 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <Package className="w-5 h-5 text-indigo-600" />
                        <h4 className="font-semibold text-gray-900">Product Information</h4>
                      </div>
                      
                      {/* Classification Badges - Always show when brand_name exists */}
                      <div className="mb-3 flex flex-wrap gap-2">
                        {detection.is_product === false && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                            ❌ Not a Product
                          </span>
                        )}
                        {detection.is_product === true && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                            ✅ Is Product
                          </span>
                        )}
                      </div>
                      
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
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-5 h-5 text-blue-600" />
                        <h4 className="font-semibold text-blue-900">Detection Info</h4>
                      </div>
                      {detection.label && (
                        <p className="text-sm text-blue-800 mb-2">
                          <span className="font-semibold">Detected as:</span> {detection.label}
                        </p>
                      )}
                      <p className="text-xs text-blue-700">
                        Click "Extract Brand & Info" below to analyze this product
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
                  {(foodgraphResults.length > 0 || (detection.fully_analyzed && preFilteredCount !== null)) && (
                    <div>
                      {/* Show banner for saved products indicating which was selected */}
                      {detection.fully_analyzed && detection.selected_foodgraph_result_id && (
                        <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-500 rounded">
                          <div className="flex items-start gap-2">
                            <span className="text-green-600 text-lg">✓</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-green-800">
                                Batch Processing Complete - Match Saved
                              </p>
                              <p className="text-xs text-green-700 mt-1">
                                The result marked with "🎯 SELECTED" below was automatically chosen and saved during batch processing. 
                                You can review all available options and their scores to verify the selection quality.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

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
                      
                      {/* Match Status Breakdown with Toggle - Only show when viewing AI Filter */}
                      {matchStatusCounts && filteredCount !== null && stageFilter === 'ai_filter' && (
                        <div className="mb-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-purple-400 rounded">
                          <div className="flex items-start gap-2">
                            <span className="text-purple-600 text-lg">📊</span>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-semibold text-purple-900">AI Match Status Breakdown</p>
                                {foodgraphResults.length - matchStatusCounts.identical - matchStatusCounts.almostSame > 0 && (
                                  <button
                                    onClick={() => setShowNoMatch(!showNoMatch)}
                                    className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs font-medium transition-colors"
                                  >
                                    {showNoMatch ? '👁️ Hide' : '👁️ Show'} No Match ({foodgraphResults.length - matchStatusCounts.identical - matchStatusCounts.almostSame})
                                  </button>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs">
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-medium">
                                  ✓ Identical: {matchStatusCounts.identical}
                                </span>
                                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-medium">
                                  ≈ Almost Same: {matchStatusCounts.almostSame}
                                </span>
                                <span className={`px-2 py-1 rounded font-medium ${showNoMatch ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-500'}`}>
                                  {showNoMatch ? '👁️' : ''} No Match: {foodgraphResults.length - matchStatusCounts.identical - matchStatusCounts.almostSame} {!showNoMatch && '(hidden)'}
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
                      
                      {/* Stage Filter Buttons - Always visible */}
                      {(() => {
                        // Calculate current stage counts for filtering logic
                        const searchCount = foodgraphResults.filter(r => r.processing_stage === 'search').length;
                        const preFilterCount = foodgraphResults.filter(r => r.processing_stage === 'pre_filter').length;
                        const aiFilterCount = foodgraphResults.filter(r => r.processing_stage === 'ai_filter').length;
                        
                        // Count only IDENTICAL or ALMOST SAME matches for AI filter display
                        const aiMatchesCount = foodgraphResults.filter(r => {
                          const matchStatus = (r as any).match_status;
                          return r.processing_stage === 'ai_filter' && 
                                 (matchStatus === 'identical' || matchStatus === 'almost_same');
                        }).length;
                        
                        // Use cumulative counts for button labels
                        const stageStats = {
                          search: searchCount + preFilterCount + aiFilterCount,  // All returned by FoodGraph (TOP 100)
                          pre_filter: preFilterCount + aiFilterCount,  // All that passed pre-filter (≥85%)
                          ai_filter: aiMatchesCount  // Only actual matches (identical or almost same)
                        };
                        
                        return (
                          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <p className="text-sm font-semibold text-gray-700 mb-2">Filter by Processing Stage:</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => setStageFilter('search')}
                                disabled={searchCount + preFilterCount + aiFilterCount === 0}
                                className={`px-3 py-1.5 text-sm rounded-lg transition-all font-medium ${
                                  stageFilter === 'search'
                                    ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-sm'
                                    : searchCount + preFilterCount + aiFilterCount > 0
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                                      : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                                }`}
                              >
                                🔍 Search ({stageStats.search})
                              </button>
                              <button
                                onClick={() => setStageFilter('pre_filter')}
                                disabled={preFilterCount + aiFilterCount === 0}
                                className={`px-3 py-1.5 text-sm rounded-lg transition-all font-medium ${
                                  stageFilter === 'pre_filter'
                                    ? 'bg-orange-600 text-white ring-2 ring-orange-300 shadow-sm'
                                    : preFilterCount + aiFilterCount > 0
                                      ? 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'
                                      : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                                }`}
                              >
                                ⚡ Pre-filter ({stageStats.pre_filter})
                              </button>
                              <button
                                onClick={() => setStageFilter('ai_filter')}
                                disabled={aiMatchesCount === 0}
                                className={`px-3 py-1.5 text-sm rounded-lg transition-all font-medium ${
                                  stageFilter === 'ai_filter'
                                    ? 'bg-purple-600 text-white ring-2 ring-purple-300 shadow-sm'
                                    : aiMatchesCount > 0
                                      ? 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                                      : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                                }`}
                              >
                                🤖 AI Filter ({stageStats.ai_filter})
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {(() => {
                          // Apply stage filter with cumulative logic (matching button counts)
                          let filteredResults;
                          if (stageFilter === 'search') {
                            // Show all results returned by FoodGraph (TOP 100, all stages)
                            filteredResults = foodgraphResults;
                          } else if (stageFilter === 'pre_filter') {
                            // Show results that passed pre-filter (≥85%) - includes both pre_filter and ai_filter stages
                            filteredResults = foodgraphResults.filter(r => 
                              r.processing_stage === 'pre_filter' || r.processing_stage === 'ai_filter'
                            );
                          } else if (stageFilter === 'ai_filter') {
                            // Show results that passed AI filter - only IDENTICAL or ALMOST SAME matches
                            filteredResults = foodgraphResults.filter(r => {
                              const matchStatus = (r as any).match_status;
                              return r.processing_stage === 'ai_filter' && 
                                     (matchStatus === 'identical' || matchStatus === 'almost_same');
                            });
                          } else {
                            filteredResults = foodgraphResults;
                          }
                          
                          // Sort by match status: identical first, then almost same, then no match
                          filteredResults = [...filteredResults].sort((a, b) => {
                            const aStatus = (a as any).match_status || 'not_match';
                            const bStatus = (b as any).match_status || 'not_match';
                            const aMatch = a.is_match === true;
                            const bMatch = b.is_match === true;
                            
                            // Priority: identical > almost_same > match > no_match
                            const statusOrder: Record<string, number> = {
                              'identical': 1,
                              'almost_same': 2,
                              'not_match': aMatch ? 3 : 4
                            };
                            
                            return (statusOrder[aStatus] || 4) - (statusOrder[bStatus] || 4);
                          });
                          
                          // Filter out NO MATCH results unless showNoMatch is true (only for AI Filter stage)
                          if (!showNoMatch && filteredCount !== null && stageFilter === 'ai_filter') {
                            filteredResults = filteredResults.filter(r => {
                              const matchStatus = (r as any).match_status;
                              return matchStatus === 'identical' || matchStatus === 'almost_same' || r.is_match === true;
                            });
                          }
                          
                          // If AI filtered, show all results (with confidence scores). Otherwise show first 50
                          const resultsToShow = filteredCount !== null
                            ? filteredResults // Show all (already sorted by confidence from backend)
                            : filteredResults.slice(0, 50);
                          
                          // Show empty state message if no results
                          if (resultsToShow.length === 0) {
                            return (
                              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6 text-center">
                                <div className="text-4xl mb-3">🔍</div>
                                <p className="text-lg font-semibold text-yellow-900 mb-2">No FoodGraph Results Found</p>
                                <p className="text-sm text-yellow-800">
                                  {stageFilter === 'search'
                                    ? 'The search completed but found no matching products in the FoodGraph database.'
                                    : `No results match the selected filter stage (${stageFilter}).`
                                  }
                                </p>
                                {detection.fully_analyzed && (
                                  <div className="mt-3 text-xs text-yellow-700 bg-yellow-100 px-3 py-2 rounded inline-block">
                                    ✓ Processing Complete - No Match Found
                                  </div>
                                )}
                              </div>
                            );
                          }
                          
                          return resultsToShow.map((result, index) => {
                            const isSaved = detection.selected_foodgraph_result_id === result.id;
                            const passedThreshold = result.is_match === true; // Passed 70% AI confidence
                            const matchStatus = (result as any).match_status as string | undefined; // Three-tier status: identical, almost_same, not_match
                            
                            // Display FoodGraph product fields
                            // Try to get from direct fields first, then from full_data JSON
                            const fgBrand = (result as any).companyBrand || (result as any).brand_name || (result as any).full_data?.companyBrand || 'N/A';
                            const fgSize = (result as any).measures || (result as any).full_data?.measures || 'N/A';
                            const fgTitle = result.product_name || result.title || (result as any).full_data?.title || 'N/A';
                            const fgGtin = result.key || (result as any).full_data?.keys?.GTIN14 || (result as any).gtin || null;
                            const matchReason = (result as any).match_reason || null;
                            
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
                              {/* Horizontal layout: image on left, content in middle, save button on right */}
                              <div className="flex gap-2 p-2">
                                {/* Left: Product Image */}
                                <div className="flex-shrink-0 relative">
                                  {/* SELECTED badge (for batch-processed saved products) */}
                                  {detection.fully_analyzed && result.id === detection.selected_foodgraph_result_id && (
                                    <div className="absolute -top-1 -left-1 z-10">
                                      <span className="px-2 py-0.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-[10px] font-bold rounded-full flex items-center gap-1 shadow-lg">
                                        🎯 SELECTED
                                      </span>
                                    </div>
                                  )}

                                  {/* Match Status badge (only show after AI filtering) - smaller */}
                                  {filteredCount !== null && (
                                    <div className="absolute -top-1 -right-1 z-10">
                                      {matchStatus === 'identical' ? (
                                        <span className="px-1.5 py-0.5 bg-green-600 text-white text-[10px] font-bold rounded flex items-center gap-1">
                                          ✓ IDENTICAL
                                        </span>
                                      ) : matchStatus === 'almost_same' ? (
                                        <span className="px-1.5 py-0.5 bg-yellow-500 text-white text-[10px] font-bold rounded flex items-center gap-1">
                                          ≈ ALMOST SAME
                                        </span>
                                      ) : passedThreshold ? (
                                        <span className="px-1.5 py-0.5 bg-green-600 text-white text-[10px] font-bold rounded flex items-center gap-1">
                                          ✓ PASS
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 bg-gray-400 text-white text-[10px] font-medium rounded">
                                          NO MATCH
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  
                                  {result.front_image_url ? (
                                    <img
                                      src={result.front_image_url}
                                      alt={result.product_name || 'Product'}
                                      className="w-24 h-24 object-contain bg-gray-50 rounded"
                                    />
                                  ) : (
                                    <div className="w-24 h-24 bg-gray-100 flex items-center justify-center rounded">
                                      <Package className="w-6 h-6 text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                
                                {/* Middle: Product Details */}
                              <div className="flex-1 min-w-0 flex flex-col justify-center">
                                {/* Product name and size - compact */}
                                <div className="space-y-0.5">
                                  {/* Product name - 2 lines */}
                                  <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight" title={fgTitle}>
                                    {fgTitle}
                                  </p>
                                  
                                  {/* Product size/measure */}
                                  <p className="text-xs text-gray-600">
                                    {fgSize}
                                  </p>
                                  
                                  {/* GTIN/UPC Code */}
                                  {fgGtin && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className="text-[10px] text-gray-500">UPC:</span>
                                      <span className="text-[10px] font-mono text-blue-600 font-semibold">
                                        {fgGtin}
                                      </span>
                                    </div>
                                  )}
                                  
                                  {/* AI Reasoning - only after AI filtering */}
                                  {matchReason && filteredCount !== null && (
                                    <div className="mt-1 p-1.5 bg-purple-50 border border-purple-200 rounded">
                                      <p className="text-[10px] text-purple-900 leading-tight italic">
                                        🤖 {matchReason}
                                      </p>
                                    </div>
                                  )}
                                </div>
                            
                            {/* Comparison: Extracted vs FoodGraph - HIDDEN for horizontal layout */}
                            {/* 
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
                            */}
                            
                                {/* Optional: Show visual similarity if available - hidden for compactness */}
                                {/* 
                                {(result as any).visual_similarity !== undefined && (result as any).visual_similarity !== null && (
                                  <p className="text-[10px] text-purple-600 mt-0.5">
                                    Visual: {Math.round((result as any).visual_similarity * 100)}%
                                  </p>
                                )}
                                */}
                              </div>
                              
                              {/* Right: Save Button */}
                              <div className="flex-shrink-0 flex items-center">
                                {isSaved ? (
                                  <div className="px-3 py-1 bg-green-500 text-white text-xs font-semibold rounded flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    Saved
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleSaveResult(result.id)}
                                    disabled={savingResult}
                                    className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                                  >
                                    {savingResult && savedResultId === result.id ? 'Saving...' : '💾 Save'}
                                  </button>
                                )}
                              </div>
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
