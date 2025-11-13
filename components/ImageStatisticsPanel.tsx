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
  
  // Human Validation: Incorrect matches
  const incorrectValidations = detections.filter(d => 
    d.human_validation === false
  ).length;

  return (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
        📊 Product Statistics
      </h3>
      
      {/* Horizontal Layout: All stats in one row */}
      <div className="bg-white rounded-lg shadow-sm p-3 border border-gray-200">
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
          {/* Processed */}
          <button
            onClick={() => setActiveFilter('processed')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:scale-105 ${
              activeFilter === 'processed' 
                ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-300' 
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <span className="text-3xl font-bold text-blue-600">{processed}</span>
            <span className="text-[10px] font-medium text-gray-600 mt-1 text-center">Processed</span>
            {activeFilter === 'processed' && <span className="text-[9px] text-blue-600 font-semibold mt-0.5">● Active</span>}
          </button>
          
          {/* Not Processed */}
          <button
            onClick={() => setActiveFilter('not_identified')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:scale-105 ${
              activeFilter === 'not_identified' 
                ? 'bg-gray-50 border-gray-500 ring-2 ring-gray-300' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className="text-3xl font-bold text-gray-600">{notProcessed}</span>
            <span className="text-[10px] font-medium text-gray-600 mt-1 text-center">Not Processed</span>
            {activeFilter === 'not_identified' && <span className="text-[9px] text-gray-600 font-semibold mt-0.5">● Active</span>}
          </button>
          
          {/* Not Product */}
          <button
            onClick={() => setActiveFilter('not_product')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:scale-105 ${
              activeFilter === 'not_product' 
                ? 'bg-red-50 border-red-500 ring-2 ring-red-300' 
                : 'border-gray-200 hover:border-red-300'
            }`}
          >
            <span className="text-3xl font-bold text-red-600">{notProduct}</span>
            <span className="text-[10px] font-medium text-gray-600 mt-1 text-center">Not Product</span>
            {activeFilter === 'not_product' && <span className="text-[9px] text-red-600 font-semibold mt-0.5">● Active</span>}
          </button>
          
          {/* Matched */}
          <button
            onClick={() => setActiveFilter('one_match')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:scale-105 ${
              activeFilter === 'one_match' 
                ? 'bg-green-50 border-green-500 ring-2 ring-green-300' 
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <span className="text-3xl font-bold text-green-600">{matched}</span>
            <span className="text-[10px] font-medium text-gray-600 mt-1 text-center">✓ Matched</span>
            {activeFilter === 'one_match' && <span className="text-[9px] text-green-600 font-semibold mt-0.5">● Active</span>}
          </button>
          
          {/* Not Matched */}
          <button
            onClick={() => setActiveFilter('no_match')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:scale-105 ${
              activeFilter === 'no_match' 
                ? 'bg-yellow-50 border-yellow-500 ring-2 ring-yellow-300' 
                : 'border-gray-200 hover:border-yellow-300'
            }`}
          >
            <span className="text-3xl font-bold text-yellow-600">{notMatched}</span>
            <span className="text-[10px] font-medium text-gray-600 mt-1 text-center">Not Matched</span>
            {activeFilter === 'no_match' && <span className="text-[9px] text-yellow-600 font-semibold mt-0.5">● Active</span>}
          </button>
          
          {/* 2+ Matches */}
          <button
            onClick={() => setActiveFilter('multiple_matches')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:scale-105 ${
              activeFilter === 'multiple_matches' 
                ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-300' 
                : 'border-gray-200 hover:border-purple-300'
            }`}
          >
            <span className="text-3xl font-bold text-purple-600">{multipleMatches}</span>
            <span className="text-[10px] font-medium text-gray-600 mt-1 text-center">2+ Matches</span>
            {activeFilter === 'multiple_matches' && <span className="text-[9px] text-purple-600 font-semibold mt-0.5">● Active</span>}
          </button>
          
          {/* Incorrect Validations */}
          <button
            onClick={() => setActiveFilter('incorrect')}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:scale-105 ${
              activeFilter === 'incorrect' 
                ? 'bg-orange-50 border-orange-500 ring-2 ring-orange-300' 
                : 'border-gray-200 hover:border-orange-300'
            }`}
          >
            <span className="text-3xl font-bold text-orange-600">{incorrectValidations}</span>
            <span className="text-[10px] font-medium text-gray-600 mt-1 text-center">✗ Incorrect</span>
            {activeFilter === 'incorrect' && <span className="text-[9px] text-orange-600 font-semibold mt-0.5">● Active</span>}
          </button>
        </div>
      </div>

    </div>
  );
}

