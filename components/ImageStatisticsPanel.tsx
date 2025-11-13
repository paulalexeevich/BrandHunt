/**
 * ImageStatisticsPanel Component
 * Displays processing and match statistics for detected products
 */

import React from 'react';
import { Detection, FilterType } from '@/types/analyze';

interface ImageStatisticsPanelProps {
  detections: Detection[];
  activeFilter: FilterType;
  setActiveFilter: (filter: FilterType) => void;
}

export function ImageStatisticsPanel({ 
  detections, 
  activeFilter, 
  setActiveFilter 
}: ImageStatisticsPanelProps) {
  // Calculate statistics
  const totalProducts = detections.length;
  const notProduct = detections.filter(d => d.is_product === false).length;
  const actualProducts = totalProducts - notProduct;
  
  // Processing Status
  const notProcessed = detections.filter(d => 
    (d.is_product === true || d.is_product === null) && 
    !d.brand_name
  ).length;
  const processed = detections.filter(d => 
    (d.is_product === true || d.is_product === null) && 
    d.brand_name
  ).length;
  
  // Match Status (only for processed products)
  // Matched = ONLY products with selected_foodgraph_gtin (actually saved)
  const matchedDetections = detections.filter(d => 
    d.selected_foodgraph_gtin && d.selected_foodgraph_gtin.trim() !== ''
  );
  const matched = matchedDetections.length;
  
  // Not Matched = Products that are processed but NOT saved (no selected_foodgraph_gtin)
  const notMatchedDetections = detections.filter(d => 
    d.brand_name && 
    (!d.selected_foodgraph_gtin || d.selected_foodgraph_gtin.trim() === '')
  );
  const notMatched = notMatchedDetections.length;
  
  // Debug logging
  console.log('📊 STATISTICS DEBUG:');
  console.log(`   Total detections: ${detections.length}`);
  console.log(`   Processed (has brand): ${processed}`);
  console.log(`   Matched: ${matched}`);
  console.log(`   Not Matched: ${notMatched}`);
  console.log('   Matched products:', matchedDetections.map(d => ({
    idx: d.detection_index,
    brand: d.brand_name,
    fully_analyzed: d.fully_analyzed,
    has_gtin: !!d.selected_foodgraph_gtin,
    results_count: d.foodgraph_results?.length || 0
  })));
  console.log('   Not Matched products:', notMatchedDetections.map(d => ({
    idx: d.detection_index,
    brand: d.brand_name,
    fully_analyzed: d.fully_analyzed,
    has_gtin: !!d.selected_foodgraph_gtin,
    results_count: d.foodgraph_results?.length || 0
  })));
  
  // 2+ Matches = Products with multiple results needing manual review
  const multipleMatches = detections.filter(d => 
    d.brand_name && 
    !d.fully_analyzed && 
    !d.selected_foodgraph_gtin &&
    d.foodgraph_results && 
    d.foodgraph_results.length >= 2
  ).length;

  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
        📊 Product Statistics
      </h3>
      
      {/* Two-block layout: Processing Status & Match Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Block 1: Processing Status */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-sm p-2.5 border border-indigo-200">
          <h4 className="text-[10px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">Processing Status</h4>
          <div className="space-y-1.5">
            <button
              onClick={() => setActiveFilter('processed')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded border-2 transition-all hover:scale-[1.01] ${
                activeFilter === 'processed' 
                  ? 'bg-blue-100 border-blue-500 ring-1 ring-blue-300' 
                  : 'bg-white border-blue-200 hover:border-blue-300'
              }`}
            >
              <span className="text-xs font-medium text-gray-700">Processed</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-blue-600">{processed}</span>
                {activeFilter === 'processed' && <span className="text-[10px] text-blue-600 font-semibold">● Active</span>}
              </div>
            </button>
            
            <button
              onClick={() => setActiveFilter('not_identified')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded border-2 transition-all hover:scale-[1.01] ${
                activeFilter === 'not_identified' 
                  ? 'bg-gray-100 border-gray-500 ring-1 ring-gray-300' 
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="text-xs font-medium text-gray-700">Not Processed</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-gray-600">{notProcessed}</span>
                {activeFilter === 'not_identified' && <span className="text-[10px] text-gray-600 font-semibold">● Active</span>}
              </div>
            </button>
            
            <button
              onClick={() => setActiveFilter('not_product')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded border-2 transition-all hover:scale-[1.01] ${
                activeFilter === 'not_product' 
                  ? 'bg-red-100 border-red-500 ring-1 ring-red-300' 
                  : 'bg-white border-red-200 hover:border-red-300'
              }`}
            >
              <span className="text-xs font-medium text-gray-700">Not Product</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-red-600">{notProduct}</span>
                {activeFilter === 'not_product' && <span className="text-[10px] text-red-600 font-semibold">● Active</span>}
              </div>
            </button>
          </div>
        </div>

        {/* Block 2: Match Status */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-sm p-2.5 border border-green-200">
          <h4 className="text-[10px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">Match Status</h4>
          <div className="space-y-1.5">
            <button
              onClick={() => setActiveFilter('one_match')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded border-2 transition-all hover:scale-[1.01] ${
                activeFilter === 'one_match' 
                  ? 'bg-green-100 border-green-500 ring-1 ring-green-300' 
                  : 'bg-white border-green-200 hover:border-green-300'
              }`}
            >
              <span className="text-xs font-medium text-gray-700">✓ Matched</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-green-600">{matched}</span>
                {activeFilter === 'one_match' && <span className="text-[10px] text-green-600 font-semibold">● Active</span>}
              </div>
            </button>
            
            <button
              onClick={() => setActiveFilter('no_match')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded border-2 transition-all hover:scale-[1.01] ${
                activeFilter === 'no_match' 
                  ? 'bg-yellow-100 border-yellow-500 ring-1 ring-yellow-300' 
                  : 'bg-white border-yellow-200 hover:border-yellow-300'
              }`}
            >
              <span className="text-xs font-medium text-gray-700">Not Matched</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-yellow-600">{notMatched}</span>
                {activeFilter === 'no_match' && <span className="text-[10px] text-yellow-600 font-semibold">● Active</span>}
              </div>
            </button>
            
            <button
              onClick={() => setActiveFilter('multiple_matches')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded border-2 transition-all hover:scale-[1.01] ${
                activeFilter === 'multiple_matches' 
                  ? 'bg-purple-100 border-purple-500 ring-1 ring-purple-300' 
                  : 'bg-white border-purple-200 hover:border-purple-300'
              }`}
            >
              <span className="text-xs font-medium text-gray-700">2+ Matches</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-purple-600">{multipleMatches}</span>
                {activeFilter === 'multiple_matches' && <span className="text-[10px] text-purple-600 font-semibold">● Active</span>}
              </div>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

