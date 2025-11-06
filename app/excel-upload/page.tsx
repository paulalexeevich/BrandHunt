'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Home, Loader2, FolderOpen } from 'lucide-react';
import Link from 'next/link';

interface UploadResults {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ row: number; error: string; storeName?: string }>;
}

interface ProgressData {
  current: number;
  total: number;
  successful: number;
  failed: number;
  currentRow?: number;
  currentStore?: string;
}

function ExcelUploadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [results, setResults] = useState<UploadResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjectName = async () => {
      if (projectId) {
        try {
          const response = await fetch(`/api/projects/${projectId}`);
          if (response.ok) {
            const data = await response.json();
            setProjectName(data.project.project_name);
          }
        } catch (err) {
          console.error('Error fetching project:', err);
        }
      }
    };

    fetchProjectName();
  }, [projectId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file extension
      const validExtensions = ['.xlsx', '.xls'];
      const fileExtension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'));
      
      if (!validExtensions.includes(fileExtension)) {
        setError('Please select a valid Excel file (.xlsx or .xls)');
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError(null);
      setResults(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select an Excel file first');
      return;
    }

    setUploading(true);
    setError(null);
    setResults(null);
    setProgress(null);

    try {
      console.log('[Excel Upload] Starting upload...');
      
      // Create FormData and send file directly to server
      const formData = new FormData();
      formData.append('file', file);
      if (projectId) {
        formData.append('projectId', projectId);
      }

      const response = await fetch('/api/upload-excel', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.details || 'Upload failed');
      }

      // Read the streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream available');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('[Excel Upload] Stream completed');
          break;
        }

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete messages (separated by \n\n)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          if (message.trim().startsWith('data: ')) {
            const jsonStr = message.trim().substring(6); // Remove 'data: ' prefix
            
            try {
              const data = JSON.parse(jsonStr);
              
              if (data.type === 'progress') {
                // Update progress state
                setProgress({
                  current: data.current,
                  total: data.total,
                  successful: data.successful,
                  failed: data.failed,
                  currentRow: data.currentRow,
                  currentStore: data.currentStore,
                });
              } else if (data.type === 'complete') {
                // Set final results
                console.log('[Excel Upload] Upload completed:', data.results);
                setResults(data.results);
                
                // If all successful, redirect to gallery
                if (data.results.failed === 0) {
                  setTimeout(() => {
                    router.push('/gallery');
                  }, 3000);
                }
              }
            } catch (parseError) {
              console.error('[Excel Upload] Failed to parse message:', jsonStr, parseError);
            }
          }
        }
      }

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload Excel file');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4 transition-colors"
          >
            <Home className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Bulk Upload from Excel
          </h1>
          <p className="text-gray-600 mt-2">
            Upload multiple shelf images from an Excel file with store information
          </p>
          {projectId && projectName && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-800 rounded-full">
              <FolderOpen className="w-4 h-4" />
              <span className="text-sm font-semibold">Uploading to: {projectName}</span>
            </div>
          )}
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <div className="flex items-center mb-6">
            <FileSpreadsheet className="w-8 h-8 text-blue-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Select Excel File</h2>
          </div>

          {/* File Input */}
          <div className="mb-6">
            <label className="block mb-2 text-sm font-medium text-gray-700">
              Excel File (.xlsx or .xls)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 p-3"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Expected Format Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-2">Required Excel Columns:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><code className="bg-blue-100 px-1.5 py-0.5 rounded">Probe Image Path</code> - URL to the image</li>
                  <li><code className="bg-blue-100 px-1.5 py-0.5 rounded">Store Name</code> - Store name and location</li>
                </ul>
                <p className="mt-2 text-xs">
                  The system will automatically download images from the provided URLs and save them with store information.
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <XCircle className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Processing Excel File...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Upload and Process Images
              </>
            )}
          </button>
        </div>

        {/* Progress Card */}
        {uploading && progress && (
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Upload Progress</h2>
            
            {/* Progress Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-blue-600 font-medium">Processed</span>
                  <span className="text-2xl font-bold text-blue-700">
                    {progress.current} / {progress.total}
                  </span>
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-green-600 font-medium">Successful</span>
                  <span className="text-2xl font-bold text-green-700">{progress.successful}</span>
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-red-600 font-medium">Failed</span>
                  <span className="text-2xl font-bold text-red-700">{progress.failed}</span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                <span className="text-sm font-bold text-blue-600">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-600 to-purple-600 h-4 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>

            {/* Current Processing */}
            {progress.currentStore && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <Loader2 className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0 animate-spin" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">
                      Processing Row {progress.currentRow}: {progress.currentStore}
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Processing images one by one for maximum reliability
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results Card */}
        {results && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Upload Results</h2>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-blue-600 font-medium">Total Rows</span>
                  <span className="text-2xl font-bold text-blue-700">{results.total}</span>
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-green-600 font-medium">Successful</span>
                  <span className="text-2xl font-bold text-green-700">{results.successful}</span>
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-red-600 font-medium">Failed</span>
                  <span className="text-2xl font-bold text-red-700">{results.failed}</span>
                </div>
              </div>
            </div>

            {/* Success Message */}
            {results.failed === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-green-800 font-medium">
                      All images uploaded successfully!
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Redirecting to gallery in 3 seconds...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Details */}
            {results.errors.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  <XCircle className="w-5 h-5 text-red-600 mr-2" />
                  Error Details ({results.errors.length} errors)
                </h3>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {results.errors.map((err, idx) => (
                    <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-900">
                            Row {err.row}
                            {err.storeName && (
                              <span className="text-red-700 font-normal"> - {err.storeName}</span>
                            )}
                          </p>
                          <p className="text-xs text-red-700 mt-1">{err.error}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 mt-6">
              <button
                onClick={() => router.push('/gallery')}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                View Gallery
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  setResults(null);
                  setError(null);
                }}
                className="flex-1 bg-gray-200 text-gray-800 py-3 px-6 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Upload Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExcelUploadPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              <span className="ml-3 text-gray-600">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    }>
      <ExcelUploadContent />
    </Suspense>
  );
}


