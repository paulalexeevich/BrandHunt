/**
 * ProcessingBlocksPanel Component
 * Extracted from analyze page - handles Block 1 (Extract Information) and Block 2 (Product Matching)
 */

import React from 'react';
import { Loader2, ChevronDown, Settings } from 'lucide-react';
import type { Detection } from '@/types/analyze';

interface ProgressInfo {
  success: number;
  total: number;
  noMatch?: number;
  errors: number;
}

interface ProgressDetail {
  detectionIndex: number;
  product: string;
  stage: string;
  message: string;
}

interface ProcessingBlocksPanelProps {
  // Visibility and state
  showProcessingBlocks: boolean;
  productsDetected: boolean;
  detections: Detection[];
  showBlock2: boolean;
  setShowBlock2: (show: boolean) => void;
  
  // Processing states
  processingStep1: boolean;
  processingStep2: boolean;
  processingStep3: boolean;
  processingPipelineAI: boolean;
  processingPipelineVisual: boolean;
  activePipeline: 'ai' | 'visual' | null;
  
  // Progress data
  step1Progress: ProgressInfo | null;
  step2Progress: ProgressInfo | null;
  step3Progress: ProgressInfo | null;
  pipelineProgress: ProgressInfo | null;
  step3Details: ProgressDetail[];
  pipelineDetails: ProgressDetail[];
  
  // Statistics for progress bar
  matched: number;
  totalProducts: number;
  
  // Handlers
  handleExtractInfoAll: () => void;
  handleExtractPriceAll: () => void;
  handlePipelineAI: (concurrency: number) => void;
  handlePipelineVisual: (concurrency: number) => void;
}

export function ProcessingBlocksPanel({
  showProcessingBlocks,
  productsDetected,
  detections,
  showBlock2,
  setShowBlock2,
  processingStep1,
  processingStep2,
  processingStep3,
  processingPipelineAI,
  processingPipelineVisual,
  activePipeline,
  step1Progress,
  step2Progress,
  step3Progress,
  pipelineProgress,
  step3Details,
  pipelineDetails,
  matched,
  totalProducts,
  handleExtractInfoAll,
  handleExtractPriceAll,
  handlePipelineAI,
  handlePipelineVisual,
}: ProcessingBlocksPanelProps) {
  
  if (!showProcessingBlocks || !productsDetected) {
    return null;
  }

  const needsInfo = detections.filter(d => !d.brand_name).length;
  const needsPrice = detections.filter(d => d.brand_name && (!d.price || d.price === 'Unknown')).length;
  const hasExtractionWork = needsInfo > 0 || needsPrice > 0;
  
  const needsSearch = detections.filter(d => d.brand_name && !d.fully_analyzed).length;
  const isProcessing = processingPipelineAI || processingPipelineVisual;

  return (
    <>
      {/* BLOCK 2: Product Matching with FoodGraph */}
      {needsSearch > 0 && (
        <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-lg shadow p-4 mb-4 border-2 border-indigo-300">
          {/* Collapsible Header */}
          <button
            onClick={() => setShowBlock2(!showBlock2)}
            className="w-full flex items-center justify-between mb-3 hover:bg-white/50 rounded-lg p-2 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <div className={`transform transition-transform ${showBlock2 ? 'rotate-180' : ''}`}>
                <ChevronDown className="w-5 h-5 text-indigo-600" />
              </div>
              <Settings className={`w-5 h-5 text-indigo-600 ${isProcessing ? 'animate-spin' : 'group-hover:rotate-90 transition-transform'}`} />
              <div className="text-left">
                <h2 className="text-base font-bold text-gray-900">
                  🔍 Product Matching with FoodGraph
                </h2>
                <p className="text-xs text-gray-600">
                  Search, pre-filter, visual match, and save product matches from FoodGraph database
                </p>
              </div>
            </div>
            <div className="px-3 py-1 bg-indigo-600 text-white rounded-full text-xs font-semibold">
              {needsSearch} ready
            </div>
          </button>
          
          {/* Collapsible Content */}
          {showBlock2 && (
            <>
              {/* Pipeline: Progress + Start Button in One Line */}
              <div className="bg-white rounded-lg p-3 mb-3 border-2 border-emerald-300">
                <div className="flex items-center gap-3">
                  {/* Progress Bar */}
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                      <span className="font-medium">Processing Progress</span>
                      <span className="font-semibold">{matched} / {totalProducts} Saved ({Math.round((matched / totalProducts) * 100)}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500 ease-out flex items-center justify-end pr-0.5"
                        style={{ width: `${(matched / totalProducts) * 100}%` }}
                      >
                        {matched > 0 && (
                          <span className="text-[10px] font-bold text-white">✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Start Pipeline Button */}
                  <button
                    onClick={() => handlePipelineVisual(100)}
                    disabled={isProcessing || needsSearch === 0}
                    className="flex-shrink-0 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all font-semibold disabled:opacity-50 text-sm whitespace-nowrap shadow-md"
                  >
                    {processingPipelineVisual && activePipeline === 'visual' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                        Processing...
                      </>
                    ) : (
                      '⚡⚡⚡ Start Pipeline (100)'
                    )}
                  </button>
                </div>
              </div>

              {/* Processing Status */}
              {isProcessing && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    <span className="font-semibold text-blue-900 text-xs">
                      🎯 Product Matching Pipeline Running...
                    </span>
                  </div>
                  {pipelineProgress && (
                    <p className="text-[10px] text-blue-800 font-mono">
                      {pipelineProgress.success}/{pipelineProgress.total} processed | {pipelineProgress.noMatch} no match | {pipelineProgress.errors} errors
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Pipeline Progress */}
      {((processingPipelineAI || processingPipelineVisual || pipelineProgress) || (processingStep3 || step3Progress)) && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-blue-900 mb-3">
            📊 Pipeline Progress: {activePipeline === 'visual' ? '🎯 Product Matching' : 'FoodGraph Matching'}
          </h3>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className={`bg-white rounded-lg p-3 border-2 ${
              pipelineProgress ? 'border-green-500' : 
              step3Progress ? 'border-green-500' : 
              (processingPipelineAI || processingPipelineVisual || processingStep3) ? 'border-blue-500' : 
              'border-gray-300'
            }`}>
              <div className="text-xs font-semibold text-gray-600 mb-1">
                🎯 Product Matching Pipeline
              </div>
              <div className={`text-lg font-bold ${
                pipelineProgress ? 'text-green-600' : 
                step3Progress ? 'text-green-600' : 
                (processingPipelineAI || processingPipelineVisual || processingStep3) ? 'text-blue-600' : 
                'text-gray-400'
              }`}>
                {pipelineProgress ? `${pipelineProgress.success}/${pipelineProgress.total}` : 
                 step3Progress ? `${step3Progress.success}/${step3Progress.total}` : 
                 (processingPipelineAI || processingPipelineVisual || processingStep3) ? 'Running...' : '—'}
              </div>
              <div className="text-xs text-gray-500">
                {pipelineProgress ? `✓ Saved ${pipelineProgress.success}, No Match ${pipelineProgress.noMatch}, Errors ${pipelineProgress.errors}` : 
                 step3Progress ? `✓ Saved ${step3Progress.success}, No Match ${step3Progress.noMatch}` : 
                 (processingPipelineAI || processingPipelineVisual || processingStep3) ? 'In Progress...' : 
                 'Not Started'}
              </div>
            </div>
          </div>
          
          {/* Detailed Per-Product Progress */}
          {((processingPipelineAI || processingPipelineVisual) && pipelineDetails.length > 0) || (processingStep3 && step3Details.length > 0) ? (
            <div className="mt-4 bg-white rounded-lg p-4 border border-blue-200">
              <h4 className="font-semibold text-sm text-gray-700 mb-2">📦 Product Progress</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {((processingPipelineAI || processingPipelineVisual) ? pipelineDetails : step3Details).map((detail, idx) => (
                  <div key={`progress-${detail.detectionIndex}-${idx}`} className="flex items-center gap-2 text-xs py-1 px-2 bg-gray-50 rounded">
                    <span className="font-mono text-gray-500">#{detail.detectionIndex}</span>
                    <span className="flex-1 truncate text-gray-700">{detail.product}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      detail.stage === 'done' ? 'bg-green-100 text-green-700' :
                      detail.stage === 'searching' ? 'bg-blue-100 text-blue-700' :
                      detail.stage === 'prefiltering' ? 'bg-orange-100 text-orange-700' :
                      detail.stage === 'filtering' ? 'bg-purple-100 text-purple-700' :
                      detail.stage === 'visual-matching' ? 'bg-cyan-100 text-cyan-700' :
                      detail.stage === 'saving' ? 'bg-yellow-100 text-yellow-700' :
                      detail.stage === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {detail.stage === 'searching' ? '🔍' :
                       detail.stage === 'prefiltering' ? '⚡' : 
                       detail.stage === 'filtering' ? '🤖' :
                       detail.stage === 'visual-matching' ? '🎯' : 
                       detail.stage === 'saving' ? '💾' : 
                       detail.stage === 'done' ? '✓' : 
                       detail.stage === 'error' ? '✗' : '⏳'}
                      {detail.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

