/**
 * FoodGraphResultsList Component
 * Displays FoodGraph search results with stage filtering and product cards
 */

import React, { useState } from 'react';
import { Package, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { Detection, FoodGraphResult, ProcessingStage, ImageData } from '@/types/analyze';

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
    <div className="flex items-start gap-1">
      <p className="text-[10px] text-purple-900 leading-tight italic flex-1">
        🤖 {displayText}
      </p>
      {shouldTruncate && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 text-[10px] text-purple-700 hover:text-purple-900 font-semibold flex items-center gap-0.5 transition-colors"
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

interface FoodGraphResultsListProps {
  detection: Detection;
  foodgraphResults: FoodGraphResult[];
  stageFilter: ProcessingStage;
  setStageFilter: (stage: ProcessingStage) => void;
  showNoMatch: boolean;
  filteredCount: number | null;
  handleSaveResult: (resultId: string) => void;
  savingResult: boolean;
  savedResultId: string | null;
  image?: ImageData | null;
  onLoadResults?: () => Promise<void>;
}

export function FoodGraphResultsList({
  detection,
  foodgraphResults,
  stageFilter,
  setStageFilter,
  showNoMatch,
  filteredCount,
  handleSaveResult,
  savingResult,
  savedResultId,
  image,
  onLoadResults
}: FoodGraphResultsListProps) {
  
  // Calculate stage counts
  const searchCount = foodgraphResults.filter(r => r.processing_stage === 'search').length;
  const preFilterCount = foodgraphResults.filter(r => r.processing_stage === 'pre_filter').length;
  const aiFilterCount = foodgraphResults.filter(r => r.processing_stage === 'ai_filter').length;
  const visualMatchStageCount = foodgraphResults.filter(r => r.processing_stage === 'visual_match').length;
  
  // Count ONLY successful AI matches (identical or almost_same) - excludes not_match
  const aiMatchesCount = foodgraphResults.filter(r => {
    const matchStatus = (r as any).match_status;
    return r.processing_stage === 'ai_filter' && 
           (matchStatus === 'identical' || matchStatus === 'almost_same' || r.is_match === true);
  }).length;
  
  // Count products for visual matching (UNIVERSAL for both pipelines)
  const aiFilterCandidates = foodgraphResults.filter(r => {
    const matchStatus = (r as any).match_status;
    return r.processing_stage === 'ai_filter' && 
           (matchStatus === 'identical' || matchStatus === 'almost_same');
  }).length;
  
  const hasVisualMatchData = visualMatchStageCount > 0 || 
                             aiFilterCandidates >= 2 || 
                             detection.selection_method === 'visual_matching';
  
  // Calculate visual match count with proper fallback for Pipeline 2
  let visualMatchCount = 0;
  if (visualMatchStageCount > 0) {
    // Results are loaded - use actual count
    visualMatchCount = visualMatchStageCount;
  } else if (hasVisualMatchData) {
    // Results not loaded yet, but we know visual matching was done
    // Check if detection has a selected match (indicates at least 1 result exists)
    if (detection.selected_foodgraph_result_id || detection.selection_method === 'visual_matching') {
      // Use AI matches count if available (Pipeline 1), or fallback to 1 (Pipeline 2)
      visualMatchCount = aiMatchesCount > 0 ? aiMatchesCount : 1;
    } else {
      // Has candidates but no selection yet - use candidates count
      visualMatchCount = aiFilterCandidates > 0 ? aiFilterCandidates : 0;
    }
  }
  
  // Use cumulative counts for button labels (UNIVERSAL)
  const stageStats = {
    search: searchCount + preFilterCount + aiFilterCount + visualMatchStageCount,
    pre_filter: preFilterCount + aiFilterCount + visualMatchStageCount,
    ai_filter: aiMatchesCount,
    visual_match: visualMatchCount
  };
  
  // UNIVERSAL FILTER LOGIC
  let filteredResults: typeof foodgraphResults;
  if (stageFilter === 'search') {
    filteredResults = foodgraphResults;
  } else if (stageFilter === 'pre_filter') {
    filteredResults = foodgraphResults.filter(r => 
      r.processing_stage === 'pre_filter' || 
      r.processing_stage === 'ai_filter' ||
      r.processing_stage === 'visual_match'
    );
  } else if (stageFilter === 'ai_filter') {
    filteredResults = foodgraphResults.filter(r => r.processing_stage === 'ai_filter');
  } else if (stageFilter === 'visual_match') {
    const hasVisualMatchStage = foodgraphResults.some(r => r.processing_stage === 'visual_match');
    const candidateCount = foodgraphResults.filter(r => {
      const matchStatus = (r as any).match_status;
      return r.processing_stage === 'ai_filter' && 
             (matchStatus === 'identical' || matchStatus === 'almost_same');
    }).length;
    
    if (hasVisualMatchStage) {
      filteredResults = foodgraphResults.filter(r => r.processing_stage === 'visual_match');
    } else if (detection.selection_method === 'visual_matching' || candidateCount >= 2) {
      filteredResults = foodgraphResults.filter(r => r.processing_stage === 'ai_filter');
    } else {
      filteredResults = [];
    }
  } else {
    filteredResults = foodgraphResults;
  }
  
  // Sort by match status
  filteredResults = [...filteredResults].sort((a, b) => {
    const aStatus = (a as any).match_status || 'not_match';
    const bStatus = (b as any).match_status || 'not_match';
    const aMatch = a.is_match === true;
    const bMatch = b.is_match === true;
    
    const statusOrder: Record<string, number> = {
      'identical': 1,
      'almost_same': 2,
      'not_match': aMatch ? 3 : 4
    };
    
    return (statusOrder[aStatus] || 4) - (statusOrder[bStatus] || 4);
  });
  
  // Filter out NO MATCH results unless showNoMatch is true
  if (!showNoMatch && filteredCount !== null && stageFilter === 'ai_filter') {
    filteredResults = filteredResults.filter(r => {
      const matchStatus = (r as any).match_status;
      return matchStatus === 'identical' || matchStatus === 'almost_same' || r.is_match === true;
    });
  }
  
  // Show all or first 50
  const resultsToShow = filteredCount !== null
    ? filteredResults
    : filteredResults.slice(0, 50);
  
  return (
    <div>
      {/* Stage Filter Buttons */}
      <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-sm font-semibold text-gray-700 mb-2">Filter by Processing Stage:</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStageFilter('search')}
            disabled={searchCount + preFilterCount + aiFilterCount + visualMatchStageCount === 0}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all font-medium ${
              stageFilter === 'search'
                ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-sm'
                : searchCount + preFilterCount + aiFilterCount + visualMatchStageCount > 0
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
            }`}
          >
            🔍 Search ({stageStats.search})
          </button>
          <button
            onClick={() => setStageFilter('pre_filter')}
            disabled={preFilterCount + aiFilterCount + visualMatchStageCount === 0}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all font-medium ${
              stageFilter === 'pre_filter'
                ? 'bg-orange-600 text-white ring-2 ring-orange-300 shadow-sm'
                : preFilterCount + aiFilterCount + visualMatchStageCount > 0
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
          <button
            onClick={async () => {
              setStageFilter('visual_match');
              // If count shows results but they're not loaded yet, trigger loading
              if (visualMatchCount > 0 && visualMatchStageCount === 0 && onLoadResults) {
                console.log('🎯 Visual Match clicked - triggering on-demand load...');
                await onLoadResults();
              }
            }}
            disabled={visualMatchCount === 0}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all font-medium ${
              stageFilter === 'visual_match'
                ? 'bg-cyan-600 text-white ring-2 ring-cyan-300 shadow-sm'
                : visualMatchCount > 0
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
            }`}
          >
            🎯 Visual Match ({stageStats.visual_match})
          </button>
        </div>
      </div>
      
      {/* Results List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {resultsToShow.length === 0 ? (
          <EmptyState 
            stageFilter={stageFilter} 
            detection={detection} 
          />
        ) : (
          resultsToShow.map((result) => (
            <ProductCard
              key={result.id}
              result={result}
              detection={detection}
              filteredCount={filteredCount}
              handleSaveResult={handleSaveResult}
              savingResult={savingResult}
              savedResultId={savedResultId}
              image={image}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Empty State Component
function EmptyState({ 
  stageFilter, 
  detection 
}: { 
  stageFilter: ProcessingStage;
  detection: Detection;
}) {
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

// Product Card Component
function ProductCard({
  result,
  detection,
  filteredCount,
  handleSaveResult,
  savingResult,
  savedResultId,
  image
}: {
  result: FoodGraphResult;
  detection: Detection;
  filteredCount: number | null;
  handleSaveResult: (resultId: string) => void;
  savingResult: boolean;
  savedResultId: string | null;
  image?: ImageData | null;
}) {
  const isSaved = detection.selected_foodgraph_result_id === result.id;
  const passedThreshold = result.is_match === true;
  const matchStatus = (result as any).match_status as string | undefined;
  
  // Display FoodGraph product fields
  const fgBrand = (result as any).companyBrand || (result as any).brand_name || (result as any).full_data?.companyBrand || 'N/A';
  const fgSize = (result as any).measures || (result as any).full_data?.measures || 'N/A';
  const fgTitle = result.product_name || result.title || (result as any).full_data?.title || 'N/A';
  const fgGtin = result.key || (result as any).full_data?.keys?.GTIN14 || (result as any).gtin || null;
  const matchReason = (result as any).match_reason || null;
  
  return (
    <div 
      className={`bg-white rounded-lg border-2 ${
        isSaved ? 'border-green-500 ring-2 ring-green-300' : 
        matchStatus === 'identical' && filteredCount !== null ? 'border-green-400 bg-green-50' :
        matchStatus === 'almost_same' && filteredCount !== null ? 'border-yellow-400 bg-yellow-50' :
        passedThreshold && filteredCount !== null ? 'border-green-400 bg-green-50' : 
        'border-gray-200'
      } overflow-hidden hover:border-indigo-400 transition-colors relative`}
    >
      <div className="flex gap-2 p-2">
        {/* Left: Product Image */}
        <div className="flex-shrink-0 relative">
          {/* SELECTED badge */}
          {detection.fully_analyzed && result.id === detection.selected_foodgraph_result_id && (
            <div className="absolute -top-1 -left-1 z-10">
              <span className="px-2 py-0.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-[10px] font-bold rounded-full flex items-center gap-1 shadow-lg">
                🎯 SELECTED
              </span>
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
          <div className="space-y-0.5">
            {/* Product name */}
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
            
            {/* Visual Similarity Score with Match Status */}
            {(result as any).visual_similarity !== null && (result as any).visual_similarity !== undefined && filteredCount !== null && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] font-semibold text-indigo-700">
                  👁️ Visual Similarity:
                </span>
                
                {/* Match Status Badge */}
                {matchStatus === 'identical' ? (
                  <span className="px-1.5 py-0.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-[10px] font-bold rounded flex items-center gap-0.5 shadow-sm">
                    🎯 IDENTICAL
                  </span>
                ) : matchStatus === 'almost_same' ? (
                  <span className="px-1.5 py-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-[10px] font-bold rounded flex items-center gap-0.5 shadow-sm">
                    🔍 ALMOST SAME
                  </span>
                ) : passedThreshold ? (
                  <span className="px-1.5 py-0.5 bg-green-600 text-white text-[10px] font-bold rounded flex items-center gap-0.5">
                    ✓ PASS
                  </span>
                ) : null}
                
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                  (result as any).visual_similarity >= 0.9 ? 'bg-green-100 text-green-800' :
                  (result as any).visual_similarity >= 0.7 ? 'bg-blue-100 text-blue-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {((result as any).visual_similarity * 100).toFixed(1)}%
                </span>
              </div>
            )}
            
            {/* AI Reasoning */}
            {matchReason && filteredCount !== null && (
              <div className="mt-1 p-1.5 bg-purple-50 border border-purple-200 rounded">
                <CollapsibleReasoning reasoning={matchReason} />
              </div>
            )}
          </div>
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
}

