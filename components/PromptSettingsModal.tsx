'use client';

import { useState, useEffect } from 'react';
import { X, Save, RotateCcw, History } from 'lucide-react';
import { DEFAULT_EXTRACT_INFO_PROMPT, DEFAULT_AI_FILTER_PROMPT, DEFAULT_VISUAL_MATCH_PROMPT } from '@/lib/default-prompts';

interface PromptTemplate {
  id: string;
  step_name: string;
  prompt_template: string;
  version: number;
  is_active: boolean;
  created_at: string;
}

interface PromptSettingsModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ProjectModels {
  extraction_model: string;
  visual_match_model: string;
}

const AVAILABLE_MODELS = [
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Standard model - balanced performance',
  },
  {
    value: 'gemini-2.5-flash-lite-preview',
    label: 'Gemini 2.5 Flash-Lite',
    description: 'Cheaper & faster - 50% cost savings',
  },
];

const STEP_NAMES = {
  extract_info: 'Extract Product Information',
  ai_filter: 'AI Product Matching',
  visual_match: 'Visual Match Selection',
};

const STEP_DESCRIPTIONS = {
  extract_info: 'This prompt instructs the AI to extract product details (brand, name, category, etc.) from shelf images.',
  ai_filter: 'This prompt instructs the AI to compare product images and determine if they match.',
  visual_match: 'This prompt instructs the AI to select the best match from multiple product candidates using visual similarity and metadata.',
};

const DEFAULT_PROMPTS = {
  extract_info: DEFAULT_EXTRACT_INFO_PROMPT,
  ai_filter: DEFAULT_AI_FILTER_PROMPT,
  visual_match: DEFAULT_VISUAL_MATCH_PROMPT,
};

export default function PromptSettingsModal({ projectId, isOpen, onClose }: PromptSettingsModalProps) {
  const [templates, setTemplates] = useState<Record<string, PromptTemplate>>({});
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Model selection state
  const [models, setModels] = useState<ProjectModels>({
    extraction_model: 'gemini-2.5-flash',
    visual_match_model: 'gemini-2.5-flash',
  });
  const [savingModels, setSavingModels] = useState(false);

  // Fetch templates and models when modal opens
  useEffect(() => {
    if (isOpen && projectId) {
      fetchTemplates();
      fetchModels();
    }
  }, [isOpen, projectId]);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/prompt-templates?project_id=${projectId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Check if it's a table doesn't exist error (migrations not run)
        if (response.status === 500 || errorData.error?.includes('relation') || errorData.error?.includes('table')) {
          setError('⚠️ Database not initialized. Please run the migrations first:\n1. migrations/create_prompt_templates_table.sql\n2. migrations/seed_default_prompt_templates.sql');
          setLoading(false);
          return;
        }
        
        throw new Error(errorData.error || 'Failed to fetch prompts');
      }
      
      const data = await response.json();
      const templatesByStep: Record<string, PromptTemplate> = {};
      
      // Group by step_name, keep only active templates
      data.templates?.forEach((template: PromptTemplate) => {
        if (template.is_active) {
          templatesByStep[template.step_name] = template;
        }
      });
      
      setTemplates(templatesByStep);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load prompt templates. The database table may not exist yet.');
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        console.error('Failed to fetch project models');
        return;
      }
      
      const data = await response.json();
      if (data.extraction_model && data.visual_match_model) {
        setModels({
          extraction_model: data.extraction_model,
          visual_match_model: data.visual_match_model,
        });
      }
    } catch (err) {
      console.error('Error fetching models:', err);
    }
  };

  const saveModels = async () => {
    setSavingModels(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extraction_model: models.extraction_model,
          visual_match_model: models.visual_match_model,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save model selection');
      }

      setSuccessMessage('Model selection saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error saving models:', err);
      setError('Failed to save model selection');
    } finally {
      setSavingModels(false);
    }
  };

  const handleEdit = (stepName: string) => {
    setEditingStep(stepName);
    // Use existing custom prompt, or default to the default prompt
    setEditedPrompt(templates[stepName]?.prompt_template || DEFAULT_PROMPTS[stepName as keyof typeof DEFAULT_PROMPTS]);
    setError(null);
    setSuccessMessage(null);
  };

  const handleCancel = () => {
    setEditingStep(null);
    setEditedPrompt('');
    setError(null);
    setSuccessMessage(null);
  };

  const handleSave = async (stepName: string) => {
    if (!editedPrompt.trim()) {
      setError('Prompt cannot be empty');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/prompt-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          step_name: stepName,
          prompt_template: editedPrompt.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save prompt');
      }

      const data = await response.json();
      setSuccessMessage(`Saved version ${data.template.version} for ${STEP_NAMES[stepName as keyof typeof STEP_NAMES]}`);
      
      // Refresh templates
      await fetchTemplates();
      setEditingStep(null);
      setEditedPrompt('');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error saving template:', err);
      setError('Failed to save prompt template');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Gemini API Prompt Settings</h2>
            <p className="text-sm text-gray-600 mt-1">Customize AI instructions for different processing steps</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Model Selection Section */}
              <div className="border-2 border-indigo-200 rounded-lg p-4 bg-gradient-to-br from-indigo-50 to-purple-50">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                      Gemini Model Selection
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Choose which Gemini models to use for different AI tasks
                    </p>
                  </div>
                  <button
                    onClick={saveModels}
                    disabled={savingModels}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingModels ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Models
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Extraction Model Selection */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      🔍 Info Extraction Model
                    </label>
                    <p className="text-xs text-gray-600 mb-3">
                      Used for: Extract Product Info, Extract Price, Detect Products
                    </p>
                    <select
                      value={models.extraction_model}
                      onChange={(e) => setModels({ ...models, extraction_model: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    >
                      {AVAILABLE_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label} - {model.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Visual Match Model Selection */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      🎯 Visual Matching Model
                    </label>
                    <p className="text-xs text-gray-600 mb-3">
                      Used for: AI Product Matching, Visual Match Selection
                    </p>
                    <select
                      value={models.visual_match_model}
                      onChange={(e) => setModels({ ...models, visual_match_model: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    >
                      {AVAILABLE_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label} - {model.description}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    💡 <span className="font-semibold">Cost Savings:</span> Gemini 2.5 Flash-Lite is ~75% cheaper than standard Flash
                    ($0.075 vs $0.30 per 1M input tokens). Perfect for high-volume processing!
                  </p>
                </div>
              </div>

              {/* Success/Error Messages */}
              {successMessage && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-green-800">{successMessage}</span>
                </div>
              )}
              
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-red-800 whitespace-pre-line">{error}</p>
                      {error.includes('migrations') && (
                        <div className="mt-3 p-3 bg-red-100 rounded text-xs text-red-900 font-mono">
                          <p className="font-semibold mb-2">Run these SQL files in Supabase:</p>
                          <p>📄 migrations/create_prompt_templates_table.sql</p>
                          <p>📄 migrations/seed_default_prompt_templates.sql</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Prompt Cards */}
              {Object.entries(STEP_NAMES).map(([stepName, stepTitle]) => {
                const template = templates[stepName];
                const isEditing = editingStep === stepName;
                
                return (
                  <div key={stepName} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Card Header */}
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{stepTitle}</h3>
                        <p className="text-xs text-gray-600 mt-1">
                          {STEP_DESCRIPTIONS[stepName as keyof typeof STEP_DESCRIPTIONS]}
                        </p>
                        {template && (
                          <p className="text-xs text-gray-500 mt-1">
                            <History className="w-3 h-3 inline mr-1" />
                            Version {template.version} • Last updated {new Date(template.created_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => handleEdit(stepName)}
                          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="p-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          <textarea
                            value={editedPrompt}
                            onChange={(e) => setEditedPrompt(e.target.value)}
                            className="w-full h-96 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Enter prompt template..."
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={handleCancel}
                              disabled={saving}
                              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSave(stepName)}
                              disabled={saving}
                              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                              {saving ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4" />
                                  Save Version {(template?.version || 0) + 1}
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {!template && (
                            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <p className="text-sm text-blue-800">
                                <span className="font-semibold">Using Default Prompt</span> - No custom prompt configured yet. Click "Edit" to customize.
                              </p>
                            </div>
                          )}
                          <div className="bg-gray-50 rounded p-3 max-h-64 overflow-y-auto">
                            <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-words">
                              {template?.prompt_template || DEFAULT_PROMPTS[stepName as keyof typeof DEFAULT_PROMPTS]}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 flex justify-between items-center">
          <p className="text-xs text-gray-600">
            💡 Tip: Changes create new versions. Previous versions are preserved for history.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

