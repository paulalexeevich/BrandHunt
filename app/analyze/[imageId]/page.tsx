'use client';

import React, { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CheckCircle, Package, Trash2, ChevronDown, Settings, Cpu, ChevronUp } from 'lucide-react';
import { getImageUrl } from '@/lib/image-utils';
import { ImageStatisticsPanel } from '@/components/ImageStatisticsPanel';
import { FoodGraphResultsList } from '@/components/FoodGraphResultsList';
import { ProcessingBlocksPanel } from '@/components/ProcessingBlocksPanel';
import type { 
  Detection, 
  FoodGraphResult, 
  ImageData, 
  FilterType, 
  ProcessingStage, 
  StageStats 
} from '@/types/analyze';

/**
 * CollapsibleReasoning Component
 * Shows truncated reasoning by default with expand/collapse functionality
 */
function CollapsibleReasoning({ reasoning }: { reasoning: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const PREVIEW_LENGTH = 50; // characters to show in preview
  
  const shouldTruncate = reasoning.length > PREVIEW_LENGTH;
  const displayText = isExpanded || !shouldTruncate 
    ? reasoning 
    : reasoning.slice(0, PREVIEW_LENGTH) + '...';
  
  return (
    <div>
      <p className="text-gray-800 leading-relaxed inline">
        {displayText}
      </p>
      {shouldTruncate && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="ml-2 text-xs text-purple-700 hover:text-purple-900 font-semibold inline-flex items-center gap-0.5 transition-colors"
          aria-label={isExpanded ? 'Hide reasoning' : 'Show full reasoning'}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Show
            </>
          )}
        </button>
      )}
    </div>
  );
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
  const [visualMatching, setVisualMatching] = useState(false);
  const [visualMatchResult, setVisualMatchResult] = useState<any | null>(null);
  const [stageFilter, setStageFilter] = useState<'search' | 'pre_filter' | 'ai_filter' | 'visual_match'>('search');
  const [matchStatusCounts, setMatchStatusCounts] = useState<{ identical: number; almostSame: number } | null>(null);
  const [loadedDetectionIds, setLoadedDetectionIds] = useState<Set<string>>(new Set());
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
  
  // Dual pipeline state
  const [processingPipelineAI, setProcessingPipelineAI] = useState(false);
  const [processingPipelineVisual, setProcessingPipelineVisual] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<{ success: number; total: number; noMatch: number; errors: number } | null>(null);
  const [pipelineDetails, setPipelineDetails] = useState<Array<{ detectionIndex: number; product: string; stage: string; message: string }>>([]);
  const [activePipeline, setActivePipeline] = useState<'ai' | 'visual' | null>(null);
  const [detectionMethod, setDetectionMethod] = useState<'gemini' | 'yolo'>('yolo');
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{ 
    natural: { width: number; height: number };
    displayed: { width: number; height: number };
  } | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [isFetching, setIsFetching] = useState(false);
  
  // Contextual analysis state
  const [contextualAnalysis, setContextualAnalysis] = useState<any>(null);
  const [analyzingContext, setAnalyzingContext] = useState(false);
  const [contextPromptVersion, setContextPromptVersion] = useState('v1');
  const [showContextAnalysis, setShowContextAnalysis] = useState(false);
  const [contextSaveResults, setContextSaveResults] = useState(true);
  const [showBlock2, setShowBlock2] = useState(false);
  const [showProcessingBlocks, setShowProcessingBlocks] = useState(false);
  const [showActions, setShowActions] = useState(false);

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
        } else if (detection && (detection.fully_analyzed || detection.selection_method === 'visual_matching') && !loadedDetectionIds.has(detection.id)) {
          // Detection is fully analyzed OR has visual matching but results weren't loaded - fetch them on demand (ONCE)
          console.log(`📥 Fetching FoodGraph results on-demand for detection ${detection.id} (fully_analyzed=${detection.fully_analyzed}, selection_method=${detection.selection_method})`);
          
          // Mark as loaded immediately to prevent re-fetching
          setLoadedDetectionIds(prev => new Set([...prev, detection.id]));
          
          try {
            const response = await fetch(`/api/foodgraph-results/${detection.id}`);
            if (response.ok) {
              const data = await response.json();
              console.log(`📦 Loaded ${data.results?.length || 0} FoodGraph results on-demand`);
              
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

  const fetchImage = async (includeFoodGraphResults: boolean = false) => {
    // Prevent concurrent/rapid fetches
    if (isFetching) {
      console.log('⚠️ Fetch already in progress, skipping...');
      return;
    }

    setIsFetching(true);
    const fetchStart = Date.now();
    console.log(`🚀 Starting fetch for image ${resolvedParams.imageId}${includeFoodGraphResults ? ' (including FoodGraph results)' : ''}`);
    
    try {
      const url = includeFoodGraphResults 
        ? `/api/results/${resolvedParams.imageId}?includeFoodGraphResults=true`
        : `/api/results/${resolvedParams.imageId}`;
      const response = await fetch(url);
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

  const handleContextualAnalysis = async (detectionId: string) => {
    setAnalyzingContext(true);
    setError(null);
    setContextualAnalysis(null);

    try {
      const detection = detections.find(d => d.id === detectionId);
      if (!detection) {
        throw new Error('Detection not found');
      }

      // First, fetch all detections to calculate expanded bounding box
      const allDetections = detections;
      
      // Find neighbors (same logic as API)
      const targetBox = detection.bounding_box;
      const targetCenterY = (targetBox.y0 + targetBox.y1) / 2;
      const targetHeight = targetBox.y1 - targetBox.y0;
      const yTolerance = targetHeight * 0.3;
      const maxHorizontalDistance = 500;
      
      const neighbors = allDetections
        .filter(det => det.id !== detection.id)
        .filter(det => {
          const centerY = (det.bounding_box.y0 + det.bounding_box.y1) / 2;
          return Math.abs(centerY - targetCenterY) <= yTolerance;
        });
      
      const left = neighbors
        .filter(det => det.bounding_box.x1 <= targetBox.x0)
        .filter(det => targetBox.x0 - det.bounding_box.x1 <= maxHorizontalDistance)
        .sort((a, b) => b.bounding_box.x1 - a.bounding_box.x1)
        .slice(0, 3);
      
      const right = neighbors
        .filter(det => det.bounding_box.x0 >= targetBox.x1)
        .filter(det => det.bounding_box.x0 - targetBox.x1 <= maxHorizontalDistance)
        .sort((a, b) => a.bounding_box.x0 - b.bounding_box.x0)
        .slice(0, 3);
      
      console.log(`Found ${left.length} left neighbors, ${right.length} right neighbors`);
      
      // Calculate expanded bounding box
      const boxes = [
        targetBox,
        ...left.map(d => d.bounding_box),
        ...right.map(d => d.bounding_box),
      ];
      
      const expandedBox = {
        y0: Math.min(...boxes.map(b => b.y0)),
        x0: Math.min(...boxes.map(b => b.x0)),
        y1: Math.max(...boxes.map(b => b.y1)),
        x1: Math.max(...boxes.map(b => b.x1)),
      };
      
      console.log('Expanded box:', expandedBox);
      
      // Generate expanded crop using canvas (same as AI filter)
      if (!image) {
        throw new Error('Image not loaded');
      }
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = getImageUrl(image);
      
      await new Promise((resolve, reject) => {
        img.onerror = reject;
        img.onload = resolve;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      const imageWidth = img.width;
      const imageHeight = img.height;
      
      const cropLeft = Math.round((expandedBox.x0 / 1000) * imageWidth);
      const cropTop = Math.round((expandedBox.y0 / 1000) * imageHeight);
      const cropWidth = Math.round(((expandedBox.x1 - expandedBox.x0) / 1000) * imageWidth);
      const cropHeight = Math.round(((expandedBox.y1 - expandedBox.y0) / 1000) * imageHeight);
      
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      ctx.drawImage(img, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      
      const expandedCropBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
      
      console.log('Generated expanded crop');

      const response = await fetch('/api/contextual-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          detectionId,
          expandedCropBase64,
          promptVersion: contextPromptVersion,
          minNeighbors: 3,
          saveResults: contextSaveResults
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Contextual analysis failed';
        try {
          const errorData = await response.json();
          errorMessage = errorData.details || errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('🔍 Contextual analysis result:', data);
      setContextualAnalysis(data);
      setShowContextAnalysis(true);
      
      // If results were saved, refresh the detection data to show updated brand/size
      if (contextSaveResults && data.saved) {
        console.log('✅ Refreshing detection data after contextual correction...');
        await fetchImage();
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Contextual analysis failed');
    } finally {
      setAnalyzingContext(false);
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

  const handleVisualMatch = async () => {
    if (!selectedDetection) return;

    const detection = detections.find(d => d.id === selectedDetection);
    if (!detection) return;

    setVisualMatching(true);
    setError(null);
    setVisualMatchResult(null);

    try {
      console.log(`🎯 Starting visual matching for detection ${selectedDetection}`);

      // Call the visual match API
      const response = await fetch('/api/visual-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detectionId: selectedDetection
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.message || 'Failed to perform visual matching');
      }

      const data = await response.json();
      console.log('Visual match result:', data);
      
      setVisualMatchResult(data);

      // If a match was selected, reload the detection to see updated fields
      if (data.selected) {
        await fetchImage();
      }
      
    } catch (err) {
      console.error('Visual matching error:', err);
      setError(err instanceof Error ? err.message : 'Failed to perform visual matching');
    } finally {
      setVisualMatching(false);
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
                      // Clear the loaded cache so updated detections can load their results
                      setLoadedDetectionIds(new Set());
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

  // Handler for Pipeline 1: With AI Filter
  const handlePipelineAI = async (concurrency?: number) => {
    setProcessingPipelineAI(true);
    setActivePipeline('ai');
    setError(null);
    setPipelineProgress(null);
    setPipelineDetails([]);

    try {
      const concurrencyLabel = concurrency === 999999 ? 'ALL' : concurrency || 3;
      console.log(`🤖 Starting Pipeline 1 (AI Filter): Concurrency=${concurrencyLabel}`);
      
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
        throw new Error(errorData.details || 'Failed to start AI Filter pipeline');
      }

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

            if (data.type === 'progress') {
              setPipelineDetails(prev => {
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

              if (data.processed !== undefined && data.total !== undefined) {
                setPipelineProgress({
                  success: data.success || 0,
                  total: data.total,
                  noMatch: data.noMatch || 0,
                  errors: data.errors || 0
                });
              }

              if (data.stage === 'done' || data.stage === 'error') {
                fetch(`/api/results/${resolvedParams.imageId}`)
                  .then(res => res.json())
                  .then(refreshedData => {
                    if (refreshedData.detections) {
                      setDetections(refreshedData.detections);
                      setLoadedDetectionIds(new Set());
                    }
                  })
                  .catch(err => console.error('Failed to refresh detections:', err));
              }
            } else if (data.type === 'complete') {
              setPipelineProgress({
                success: data.success || 0,
                total: data.processed || data.total || 0,
                noMatch: data.noMatch || 0,
                errors: data.errors || 0
              });

              // Fetch image WITH FoodGraph results to update Visual Match counts
              await fetchImage(true);

              alert(`✅ AI Filter Pipeline Complete!\n\n🔍 Processed: ${data.processed || data.total || 0} products\n✓ Saved: ${data.success || 0}\n⏸️ No Match: ${data.noMatch || 0}\n❌ Errors: ${data.errors || 0}`);
            }
          }
        }
      }
      
    } catch (err) {
      console.error('❌ AI Filter pipeline failed:', err);
      setError(err instanceof Error ? err.message : 'AI Filter pipeline failed');
      alert(`AI Filter pipeline failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingPipelineAI(false);
      setActivePipeline(null);
    }
  };

  // Handler for Pipeline 2: Visual-Only
  const handlePipelineVisual = async (concurrency?: number) => {
    setProcessingPipelineVisual(true);
    setActivePipeline('visual');
    setError(null);
    setPipelineProgress(null);
    setPipelineDetails([]);

    try {
      const concurrencyLabel = concurrency === 999999 ? 'ALL' : concurrency || 3;
      console.log(`🎯 Starting Pipeline 2 (Visual-Only): Concurrency=${concurrencyLabel}`);
      
      const response = await fetch('/api/batch-search-visual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageId: resolvedParams.imageId,
          concurrency: concurrency
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to start Visual-Only pipeline');
      }

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

            if (data.type === 'progress') {
              setPipelineDetails(prev => {
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

              if (data.processed !== undefined && data.total !== undefined) {
                setPipelineProgress({
                  success: data.success || 0,
                  total: data.total,
                  noMatch: data.noMatch || 0,
                  errors: data.errors || 0
                });
              }

              if (data.stage === 'done' || data.stage === 'error') {
                fetch(`/api/results/${resolvedParams.imageId}`)
                  .then(res => res.json())
                  .then(refreshedData => {
                    if (refreshedData.detections) {
                      setDetections(refreshedData.detections);
                      setLoadedDetectionIds(new Set());
                    }
                  })
                  .catch(err => console.error('Failed to refresh detections:', err));
              }
            } else if (data.type === 'complete') {
              setPipelineProgress({
                success: data.success || 0,
                total: data.processed || data.total || 0,
                noMatch: data.noMatch || 0,
                errors: data.errors || 0
              });

              // Fetch image WITH FoodGraph results to update Visual Match counts
              await fetchImage(true);

              alert(`✅ Visual-Only Pipeline Complete!\n\n🔍 Processed: ${data.processed || data.total || 0} products\n✓ Saved: ${data.success || 0}\n⏸️ No Match: ${data.noMatch || 0}\n❌ Errors: ${data.errors || 0}`);
            }
          }
        }
      }
      
    } catch (err) {
      console.error('❌ Visual-Only pipeline failed:', err);
      setError(err instanceof Error ? err.message : 'Visual-Only pipeline failed');
      alert(`Visual-Only pipeline failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingPipelineVisual(false);
      setActivePipeline(null);
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
          <div className="flex items-center justify-between">
            <Link 
              href={image?.project_id ? `/projects/${image.project_id}` : '/projects'} 
              className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800"
            >
              <ArrowLeft className="w-4 h-4" />
              {image?.project_id ? 'Back to Project' : 'Back to Projects'}
            </Link>
            <div className="flex items-center gap-4">
              {image.store_name && (
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-2 border-blue-200 rounded-lg">
                  <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                  <p className="text-sm text-gray-700 font-medium">
                    {image.store_name}
                  </p>
                </div>
              )}
              <button
                onClick={() => setShowProcessingBlocks(!showProcessingBlocks)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  showProcessingBlocks
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-2 border-indigo-300'
                }`}
              >
                <Cpu className="w-4 h-4" />
                Image Processing
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400"
              >
                <Trash2 className="w-4 h-4" />
                Delete Image
              </button>
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

        {/* Processing Blocks - Extracted to component */}
        <ProcessingBlocksPanel
          showProcessingBlocks={showProcessingBlocks}
          productsDetected={productsDetected}
          detections={detections}
          showBlock2={showBlock2}
          setShowBlock2={setShowBlock2}
          processingStep1={processingStep1}
          processingStep2={processingStep2}
          processingStep3={processingStep3}
          processingPipelineAI={processingPipelineAI}
          processingPipelineVisual={processingPipelineVisual}
          activePipeline={activePipeline}
          step1Progress={step1Progress}
          step2Progress={step2Progress}
          step3Progress={step3Progress}
          pipelineProgress={pipelineProgress}
          step3Details={step3Details}
          pipelineDetails={pipelineDetails}
          handleExtractInfoAll={handleExtractInfoAll}
          handleExtractPriceAll={handleExtractPriceAll}
          handlePipelineAI={handlePipelineAI}
          handlePipelineVisual={handlePipelineVisual}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {/* Product Statistics Panel */}
        {productsDetected && detections.length > 0 && (
          <ImageStatisticsPanel 
            detections={detections}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
          />
        )}

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
                if (activeFilter === 'processed') {
                  return (detection.is_product === true || detection.is_product === null) && detection.brand_name;
                }
                if (activeFilter === 'not_identified') {
                  return (detection.is_product === true || detection.is_product === null) && 
                         !detection.brand_name;
                }
                if (activeFilter === 'one_match') {
                  // MATCHED = has selected_foodgraph_gtin (actually saved)
                  return detection.selected_foodgraph_gtin && detection.selected_foodgraph_gtin.trim() !== '';
                }
                if (activeFilter === 'no_match') {
                  // NOT MATCHED = has brand but NO selected_foodgraph_gtin (not saved)
                  return detection.brand_name && 
                         (!detection.selected_foodgraph_gtin || detection.selected_foodgraph_gtin.trim() === '');
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
                'processed': 'Processed',
                'not_identified': 'Not Processed',
                'one_match': '✓ Matched',
                'no_match': 'Not Matched',
                'multiple_matches': '2+ Matches'
              };

              const filterColors = {
                'not_product': 'bg-red-100 border-red-300 text-red-900',
                'processed': 'bg-blue-100 border-blue-300 text-blue-900',
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
                if (activeFilter === 'processed') {
                  return (detection.is_product === true || detection.is_product === null) && detection.brand_name;
                }
                if (activeFilter === 'not_identified') {
                  return (detection.is_product === true || detection.is_product === null) && 
                         !detection.brand_name;
                }
                if (activeFilter === 'one_match') {
                  // MATCHED = has selected_foodgraph_gtin (actually saved)
                  return detection.selected_foodgraph_gtin && detection.selected_foodgraph_gtin.trim() !== '';
                }
                if (activeFilter === 'no_match') {
                  // NOT MATCHED = has brand but NO selected_foodgraph_gtin (not saved)
                  return detection.brand_name && 
                         (!detection.selected_foodgraph_gtin || detection.selected_foodgraph_gtin.trim() === '');
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
                
                // Determine match status for color coding
                const isMatched = detection.selected_foodgraph_gtin && detection.selected_foodgraph_gtin.trim() !== '';
                const isNotMatched = detection.fully_analyzed && detection.brand_name && !isMatched;
                const hasMultipleMatches = detection.fully_analyzed && !isMatched && 
                  detection.foodgraph_results && 
                  detection.foodgraph_results.length >= 2;
                
                // Color logic: Selected (indigo) > Matched (green) > Multiple Matches (purple) > Not Matched (yellow) > Not Processed (gray)
                let borderColor = '#9CA3AF'; // gray-400 for not processed
                let bgColor = 'rgba(156, 163, 175, 0.1)';
                let badgeColor = 'bg-gray-500';
                
                if (isSelected) {
                  borderColor = '#4F46E5'; // indigo-600
                  bgColor = 'rgba(79, 70, 229, 0.2)';
                  badgeColor = 'bg-indigo-600';
                } else if (isMatched) {
                  borderColor = '#10B981'; // green-500
                  bgColor = 'rgba(16, 185, 129, 0.1)';
                  badgeColor = 'bg-green-600';
                } else if (hasMultipleMatches) {
                  borderColor = '#A855F7'; // purple-500
                  bgColor = 'rgba(168, 85, 247, 0.1)';
                  badgeColor = 'bg-purple-600';
                } else if (isNotMatched) {
                  borderColor = '#F59E0B'; // amber-500
                  bgColor = 'rgba(245, 158, 11, 0.1)';
                  badgeColor = 'bg-yellow-600';
                }
                
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
                      border: `3px solid ${borderColor}`,
                      backgroundColor: bgColor,
                      display: imageDimensions ? 'block' : 'none',
                    }}
                  >
                    {/* Product number badge */}
                    <div 
                      className={`absolute -top-6 left-0 px-2 py-1 text-xs font-bold text-white rounded ${badgeColor}`}
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
                  {/* FoodGraph Match - Show if saved */}
                  {detection.fully_analyzed && detection.selected_foodgraph_image_url && (
                    <div className="bg-white border-2 border-blue-300 rounded-lg p-4 shadow-sm">
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
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-gray-700">Brand:</span> {detection.brand_name}
                            {detection.corrected_by_contextual && (
                              <span 
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-300"
                                title={detection.contextual_correction_notes || 'Brand corrected by contextual analysis'}
                              >
                                🔍 CONTEXTUAL
                              </span>
                            )}
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
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-700">Size:</span> <span className="text-blue-600">{detection.size}</span>
                              {detection.corrected_by_contextual && detection.contextual_correction_notes && detection.contextual_correction_notes.toLowerCase().includes('size') && (
                                <span 
                                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-300"
                                  title={detection.contextual_correction_notes}
                                >
                                  🔍 CONTEXTUAL
                                </span>
                              )}
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
                      
                      {/* Visual Match Result - Show after visual matching completes */}
                      {visualMatchResult && (
                        <div className={`mb-3 p-3 border-l-4 rounded ${
                          visualMatchResult.selected 
                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-500'
                            : 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-500'
                        }`}>
                          <div className="flex items-start gap-2">
                            <span className="text-2xl">{visualMatchResult.selected ? '✅' : '⚠️'}</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold mb-2 text-gray-900">
                                Visual Match {visualMatchResult.selected ? 'Selected' : 'Result'} {visualMatchResult.autoSelected && '(Auto-Selected)'}
                              </p>
                              
                              {visualMatchResult.selected && (
                                <div className="mb-3 p-2 bg-white/50 rounded border border-green-200">
                                  <p className="font-semibold text-green-900">{visualMatchResult.selected.productName}</p>
                                  <p className="text-sm text-green-800">{visualMatchResult.selected.brandName}</p>
                                  <p className="text-xs text-gray-600 mt-1">GTIN: {visualMatchResult.selected.gtin}</p>
                                </div>
                              )}
                              
                              <div className="space-y-2 text-xs">
                                <div className="flex gap-4">
                                  <span className="font-medium text-gray-700">Confidence:</span>
                                  <span className={`font-semibold ${
                                    visualMatchResult.confidence >= 0.8 ? 'text-green-700' :
                                    visualMatchResult.confidence >= 0.6 ? 'text-yellow-700' :
                                    'text-orange-700'
                                  }`}>
                                    {Math.round(visualMatchResult.confidence * 100)}%
                                  </span>
                                </div>
                                
                                {visualMatchResult.visualSimilarityScore !== undefined && (
                                  <div className="flex gap-4">
                                    <span className="font-medium text-gray-700">Visual Similarity:</span>
                                    <span className="font-semibold text-purple-700">
                                      {Math.round(visualMatchResult.visualSimilarityScore * 100)}%
                                    </span>
                                  </div>
                                )}
                                
                                {(visualMatchResult.brandMatch !== undefined || visualMatchResult.sizeMatch !== undefined || visualMatchResult.flavorMatch !== undefined) && (
                                  <div className="flex gap-4 flex-wrap">
                                    <span className="font-medium text-gray-700">Matches:</span>
                                    <div className="flex gap-2">
                                      {visualMatchResult.brandMatch !== undefined && (
                                        <span className={`px-2 py-0.5 rounded ${visualMatchResult.brandMatch ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                          {visualMatchResult.brandMatch ? '✓' : '✗'} Brand
                                        </span>
                                      )}
                                      {visualMatchResult.sizeMatch !== undefined && (
                                        <span className={`px-2 py-0.5 rounded ${visualMatchResult.sizeMatch ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                          {visualMatchResult.sizeMatch ? '✓' : '✗'} Size
                                        </span>
                                      )}
                                      {visualMatchResult.flavorMatch !== undefined && (
                                        <span className={`px-2 py-0.5 rounded ${visualMatchResult.flavorMatch ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                          {visualMatchResult.flavorMatch ? '✓' : '✗'} Flavor
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                <div className="pt-2 border-t border-gray-200">
                                  <p className="font-medium text-gray-700 mb-1">Reasoning:</p>
                                  <CollapsibleReasoning reasoning={visualMatchResult.reasoning} />
                                </div>
                                
                                {visualMatchResult.totalCandidates && (
                                  <p className="text-gray-600 italic">
                                    Analyzed {visualMatchResult.totalCandidates} candidates
                                  </p>
                                )}
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
                      
                      {/* FoodGraph Results List Component */}
                      <FoodGraphResultsList
                        detection={detection}
                        foodgraphResults={foodgraphResults}
                        stageFilter={stageFilter}
                        setStageFilter={setStageFilter}
                        showNoMatch={showNoMatch}
                        filteredCount={filteredCount}
                        handleSaveResult={handleSaveResult}
                        savingResult={savingResult}
                        savedResultId={savedResultId}
                        image={image}
                        onLoadResults={async () => {
                          console.log('📥 Loading FoodGraph results on-demand...');
                          await fetchImage(true);
                        }}
                      />
                      
                    {foodgraphResults.length > 50 && filteredCount === null && (
                      <p className="text-sm text-gray-500 text-center mt-3">
                        + {foodgraphResults.length - 50} more results available
                      </p>
                    )}
                  </div>
                )}

                  {/* Actions Button - Contains Search, Pre-filter, AI Filter, Contextual Analysis, Visual Match, Extract Price */}
                  {(() => {
                    const hasSearchAction = foodgraphResults.length === 0 && !detection.fully_analyzed && detection.brand_name;
                    const hasPreFilterAction = foodgraphResults.length > 0 && preFilteredCount === null && !detection.fully_analyzed;
                    const hasAIFilterAction = preFilteredCount !== null && filteredCount === null && !detection.fully_analyzed;
                    const hasContextualAnalysis = detection.brand_name;
                    const identicalCount = foodgraphResults.filter(r => (r as any).match_status === 'identical' || r.is_match === true).length;
                    const almostSameCount = foodgraphResults.filter(r => (r as any).match_status === 'almost_same').length;
                    const totalCandidates = identicalCount + almostSameCount;
                    const hasVisualMatch = totalCandidates >= 2 && !detection.selected_foodgraph_result_id;
                    const hasExtractPrice = detection.brand_name && (!detection.price || detection.price === 'Unknown');
                    
                    const hasAnyAction = hasSearchAction || hasPreFilterAction || hasAIFilterAction || hasContextualAnalysis || hasVisualMatch || hasExtractPrice;
                    
                    return hasAnyAction && (
                    <div className="mt-4">
                      <button
                        onClick={() => setShowActions(!showActions)}
                        className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-semibold flex items-center justify-center gap-2 shadow-md"
                      >
                        <ChevronDown className={`w-5 h-5 transition-transform ${showActions ? 'rotate-180' : ''}`} />
                        ⚙️ Actions
                        <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                          {[
                            // Search FoodGraph
                            (foodgraphResults.length === 0 && !detection.fully_analyzed) ? 'Search' : null,
                            // Pre-filter
                            (foodgraphResults.length > 0 && preFilteredCount === null && !detection.fully_analyzed) ? 'Pre-filter' : null,
                            // AI Filter
                            (preFilteredCount !== null && filteredCount === null && !detection.fully_analyzed) ? 'AI Filter' : null,
                            // Contextual Analysis
                            detection.brand_name ? 'Contextual Analysis' : null,
                            // Visual Match
                            (() => {
                              const identicalCount = foodgraphResults.filter(r => (r as any).match_status === 'identical' || r.is_match === true).length;
                              const almostSameCount = foodgraphResults.filter(r => (r as any).match_status === 'almost_same').length;
                              const totalCandidates = identicalCount + almostSameCount;
                              return totalCandidates >= 2 && !detection.selected_foodgraph_result_id ? 'Visual Match' : null;
                            })(),
                            // Extract Price
                            (!detection.price || detection.price === 'Unknown') ? 'Extract Price' : null
                          ].filter(Boolean).length}
                        </span>
                      </button>
                      
                      {showActions && (
                        <div className="mt-3 space-y-3">
                          {/* Search FoodGraph */}
                          {foodgraphResults.length === 0 && !detection.fully_analyzed && (
                            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-lg p-4 shadow-sm">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-2xl">🔍</span>
                                <div>
                                  <h4 className="font-semibold text-blue-900">Search FoodGraph</h4>
                                  <p className="text-xs text-blue-700">Find matching products in FoodGraph database</p>
                                </div>
                              </div>
                              <button
                                onClick={handleSearchFoodGraph}
                                disabled={loading}
                                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                              >
                                {loading ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Searching...
                                  </>
                                ) : (
                                  '🔍 Search FoodGraph'
                                )}
                              </button>
                            </div>
                          )}

                          {/* Pre-filter */}
                          {foodgraphResults.length > 0 && preFilteredCount === null && !detection.fully_analyzed && (
                            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300 rounded-lg p-4 shadow-sm">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-2xl">📊</span>
                                <div>
                                  <h4 className="font-semibold text-orange-900">Pre-filter Results</h4>
                                  <p className="text-xs text-orange-700">Filter by brand, size, and retailer (≥85% match)</p>
                                </div>
                              </div>
                              <button
                                onClick={handlePreFilter}
                                disabled={preFiltering}
                                className="w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                              >
                                {preFiltering ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Pre-filtering...
                                  </>
                                ) : (
                                  <>
                                    📊 Pre-Filter ({foodgraphResults.length} results)
                                    <span className="ml-2 text-xs bg-orange-800 text-white px-2 py-0.5 rounded-full">≥85%</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* AI Filter */}
                          {preFilteredCount !== null && filteredCount === null && !detection.fully_analyzed && (
                            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 rounded-lg p-4 shadow-sm">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-2xl">🤖</span>
                                <div>
                                  <h4 className="font-semibold text-purple-900">AI Filter</h4>
                                  <p className="text-xs text-purple-700">Use AI to compare each candidate with detected product</p>
                                </div>
                              </div>
                              <button
                                onClick={handleFilterResults}
                                disabled={filtering}
                                className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                              >
                                {filtering ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    AI Filtering...
                                  </>
                                ) : (
                                  <>🤖 Filter with AI ({foodgraphResults.length} results)</>
                                )}
                              </button>
                            </div>
                          )}

                          {/* Contextual Analysis - Experimental Feature */}
                          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-300 rounded-lg p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">🔬</span>
                                <div>
                                  <h4 className="font-semibold text-orange-900">Contextual Analysis (Experimental)</h4>
                                  <p className="text-xs text-orange-700">Use neighboring products to infer brand & size</p>
                                </div>
                              </div>
                              <button
                                onClick={() => setShowContextAnalysis(!showContextAnalysis)}
                                className="px-3 py-1 bg-orange-200 hover:bg-orange-300 text-orange-900 rounded text-sm font-medium transition-colors"
                              >
                                {showContextAnalysis ? 'Hide' : 'Show'}
                              </button>
                            </div>
                      
                      {showContextAnalysis && (
                        <div className="space-y-3">
                          <div className="p-3 bg-white rounded border border-orange-200">
                            <p className="text-xs text-gray-700 mb-2">
                              <strong>How it works:</strong> Analyzes a larger shelf area including 3+ products on each side. 
                              Gemini uses visual patterns and neighbor context to predict brand/size when labels are partially hidden.
                            </p>
                            <div className="mt-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-gray-700">Prompt Version:</label>
                                <select
                                  value={contextPromptVersion}
                                  onChange={(e) => setContextPromptVersion(e.target.value)}
                                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                                  disabled={analyzingContext}
                                >
                                  <option value="v1">V1 - Detailed Context</option>
                                  <option value="v2">V2 - Strategy-Based</option>
                                  <option value="v3">V3 - Concise</option>
                                </select>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="contextSaveResults"
                                  checked={contextSaveResults}
                                  onChange={(e) => setContextSaveResults(e.target.checked)}
                                  disabled={analyzingContext}
                                  className="rounded border-gray-300"
                                />
                                <label htmlFor="contextSaveResults" className="text-xs text-gray-700">
                                  Save results to database
                                </label>
                              </div>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => handleContextualAnalysis(detection.id)}
                            disabled={analyzingContext}
                            className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
                          >
                            {analyzingContext ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Analyzing Context...
                              </>
                            ) : (
                              '🔍 Analyze with Neighbors'
                            )}
                          </button>
                          
                          {/* Contextual Analysis Results */}
                          {contextualAnalysis && (
                            <div className="space-y-3">
                              {/* Saved Success Message */}
                              {contextualAnalysis.saved && (
                                <div className="p-3 bg-green-50 border-l-4 border-green-500 rounded">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <p className="text-sm font-semibold text-green-800">
                                      Results saved to database
                                    </p>
                                  </div>
                                  <p className="text-xs text-green-700 mt-1">
                                    Contextual analysis results have been stored and can be accessed later.
                                  </p>
                                </div>
                              )}
                              
                              {/* Expanded Crop Preview */}
                              {contextualAnalysis.expanded_crop_preview && (
                                <div className="p-3 bg-white rounded border border-orange-200">
                                  <p className="text-xs font-semibold text-gray-700 mb-2">📸 Expanded Crop (includes neighbors):</p>
                                  <img 
                                    src={contextualAnalysis.expanded_crop_preview} 
                                    alt="Expanded crop" 
                                    className="w-full rounded border border-gray-300"
                                  />
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <span className="font-semibold text-gray-600">Left neighbors:</span> {contextualAnalysis.neighbors.left.length}
                                    </div>
                                    <div>
                                      <span className="font-semibold text-gray-600">Right neighbors:</span> {contextualAnalysis.neighbors.right.length}
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {/* Neighbor Context */}
                              <div className="p-3 bg-white rounded border border-orange-200">
                                <p className="text-xs font-semibold text-gray-700 mb-2">📦 Neighbor Products:</p>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <p className="font-semibold text-gray-600 mb-1">← Left:</p>
                                    {contextualAnalysis.neighbors.left.length > 0 ? (
                                      <ul className="space-y-1">
                                        {contextualAnalysis.neighbors.left.map((n: any, i: number) => (
                                          <li key={i} className="text-gray-700">
                                            #{n.index}: {n.brand || 'unknown'} {n.size || ''}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-gray-500 italic">No left neighbors</p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-600 mb-1">Right →:</p>
                                    {contextualAnalysis.neighbors.right.length > 0 ? (
                                      <ul className="space-y-1">
                                        {contextualAnalysis.neighbors.right.map((n: any, i: number) => (
                                          <li key={i} className="text-gray-700">
                                            #{n.index}: {n.brand || 'unknown'} {n.size || ''}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-gray-500 italic">No right neighbors</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {/* AI Analysis Results */}
                              <div className="p-3 bg-white rounded border border-orange-200">
                                <p className="text-xs font-semibold text-gray-700 mb-2">🤖 Gemini Analysis:</p>
                                {contextualAnalysis.analysis.parse_error ? (
                                  <div className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded">
                                    {contextualAnalysis.analysis.raw_response}
                                  </div>
                                ) : (
                                  <div className="space-y-2 text-xs">
                                    {/* Brand Inference */}
                                    {(contextualAnalysis.analysis.inferred_brand || contextualAnalysis.analysis.brand) && (
                                      <div className="p-2 bg-blue-50 rounded border border-blue-200">
                                        <p className="font-semibold text-blue-900">
                                          Inferred Brand: {contextualAnalysis.analysis.inferred_brand || contextualAnalysis.analysis.brand}
                                        </p>
                                        {(contextualAnalysis.analysis.brand_confidence !== undefined) && (
                                          <p className="text-blue-700">
                                            Confidence: {Math.round((contextualAnalysis.analysis.brand_confidence || 0) * 100)}%
                                          </p>
                                        )}
                                        <div className="mt-1">
                                          <CollapsibleReasoning 
                                            reasoning={
                                              contextualAnalysis.analysis.brand_reasoning || 
                                              contextualAnalysis.analysis.brand_method || 
                                              contextualAnalysis.analysis.reasoning || 
                                              'No reasoning provided'
                                            }
                                          />
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Size Inference */}
                                    {(contextualAnalysis.analysis.inferred_size || contextualAnalysis.analysis.size) && (
                                      <div className="p-2 bg-green-50 rounded border border-green-200">
                                        <p className="font-semibold text-green-900">
                                          Inferred Size: {contextualAnalysis.analysis.inferred_size || contextualAnalysis.analysis.size}
                                        </p>
                                        {(contextualAnalysis.analysis.size_confidence !== undefined) && (
                                          <p className="text-green-700">
                                            Confidence: {Math.round((contextualAnalysis.analysis.size_confidence || 0) * 100)}%
                                          </p>
                                        )}
                                        <div className="mt-1">
                                          <CollapsibleReasoning 
                                            reasoning={
                                              contextualAnalysis.analysis.size_reasoning || 
                                              contextualAnalysis.analysis.size_method || 
                                              'No reasoning provided'
                                            }
                                          />
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Visual Similarity */}
                                    {contextualAnalysis.analysis.visual_similarity && (
                                      <div className="p-2 bg-purple-50 rounded border border-purple-200">
                                        <p className="font-semibold text-purple-900 mb-1">Visual Similarity:</p>
                                        <p className="text-purple-700">
                                          Left: {Math.round((contextualAnalysis.analysis.visual_similarity.left_similarity || contextualAnalysis.analysis.left_neighbor_similarity || 0) * 100)}% | 
                                          Right: {Math.round((contextualAnalysis.analysis.visual_similarity.right_similarity || contextualAnalysis.analysis.right_neighbor_similarity || 0) * 100)}%
                                        </p>
                                        {contextualAnalysis.analysis.visual_similarity.description && (
                                          <p className="text-purple-800 mt-1 text-xs">
                                            {contextualAnalysis.analysis.visual_similarity.description}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* Additional Notes */}
                                    {(contextualAnalysis.analysis.notes || contextualAnalysis.analysis.explanation) && (
                                      <div className="p-2 bg-gray-50 rounded border border-gray-200">
                                        <p className="text-gray-700">
                                          <strong>Notes:</strong> {contextualAnalysis.analysis.notes || contextualAnalysis.analysis.explanation}
                                        </p>
                                      </div>
                                    )}
                                    
                                    {/* Overall Confidence */}
                                    {contextualAnalysis.analysis.overall_confidence !== undefined && (
                                      <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
                                        <p className="text-yellow-900">
                                          <strong>Overall Confidence:</strong> {Math.round(contextualAnalysis.analysis.overall_confidence * 100)}%
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                          </div>

                          {/* Visual Match Selection Button */}
                          {(() => {
                            const identicalCount = foodgraphResults.filter(r => (r as any).match_status === 'identical' || r.is_match === true).length;
                            const almostSameCount = foodgraphResults.filter(r => (r as any).match_status === 'almost_same').length;
                            const totalCandidates = identicalCount + almostSameCount;
                            
                            return totalCandidates >= 2 && !detection.selected_foodgraph_result_id && (
                              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-lg p-4 shadow-sm">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-2xl">🎯</span>
                                  <div>
                                    <h4 className="font-semibold text-indigo-900">Visual Match Selection</h4>
                                    <p className="text-xs text-indigo-700">Automatically select best match from {totalCandidates} candidates</p>
                                  </div>
                                </div>
                                <button
                                  onClick={handleVisualMatch}
                                  disabled={visualMatching}
                                  className="w-full px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2 shadow-md"
                                >
                                  {visualMatching ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Visual Matching...
                                    </>
                                  ) : (
                                    <>
                                      🎯 Run Visual Match Selection
                                      <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                                        {totalCandidates} candidates
                                      </span>
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })()}

                          {/* Extract Price */}
                          {(!detection.price || detection.price === 'Unknown') && (
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-4 shadow-sm">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-2xl">💰</span>
                                <div>
                                  <h4 className="font-semibold text-green-900">Extract Price</h4>
                                  <p className="text-xs text-green-700">Extract price information from product image</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleExtractPrice(detection.id)}
                                disabled={extractingPrice}
                                className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
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
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })()}

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
