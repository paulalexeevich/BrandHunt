'use client';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadedImageId, setUploadedImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setSuccess(false);
      setUploadedImageId(null);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);

    try {
      // Upload image
      const formData = new FormData();
      formData.append('image', selectedFile);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadResponse.json();
      const imageId = uploadData.imageId;
      setUploadedImageId(imageId);
      setUploading(false);

      // Start processing
      setProcessing(true);

      const processResponse = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageId }),
      });

      if (!processResponse.ok) {
        throw new Error('Processing failed');
      }

      const processData = await processResponse.json();
      setProcessing(false);
      setSuccess(true);
      
      console.log('Processing completed:', processData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setUploading(false);
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setUploadedImageId(null);
    setError(null);
    setSuccess(false);
    setUploading(false);
    setProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">BrangHunt</h1>
          <p className="text-lg text-gray-600">
            AI-powered product detection and brand recognition
          </p>
        </div>

        {/* Main Upload Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          {!preview ? (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-indigo-500 transition-colors">
              <Upload className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                Upload Product Image
              </h3>
              <p className="text-gray-500 mb-4">
                Select an image to detect products and find brand information
              </p>
              <label className="cursor-pointer inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                Choose Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div>
              {/* Image Preview */}
              <div className="mb-6">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-w-full max-h-96 mx-auto rounded-lg shadow-md"
                />
              </div>

              {/* Status Messages */}
              {uploading && (
                <div className="flex items-center justify-center gap-2 text-blue-600 mb-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Uploading image...</span>
                </div>
              )}

              {processing && (
                <div className="flex items-center justify-center gap-2 text-indigo-600 mb-4">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing image (detecting products, extracting brands, searching FoodGraph)...</span>
                </div>
              )}

              {error && (
                <div className="flex items-center justify-center gap-2 text-red-600 mb-4">
                  <XCircle className="w-5 h-5" />
                  <span>{error}</span>
                </div>
              )}

              {success && uploadedImageId && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-green-700 mb-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">Processing completed!</span>
                  </div>
                  <Link
                    href={`/results/${uploadedImageId}`}
                    className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    View Results
                  </Link>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center">
                {!uploading && !processing && !success && (
                  <>
                    <button
                      onClick={handleUpload}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                    >
                      Process Image
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-semibold"
                    >
                      Cancel
                    </button>
                  </>
                )}

                {success && (
                  <button
                    onClick={handleReset}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                  >
                    Process Another Image
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Recent Images Link */}
        <div className="text-center">
          <Link
            href="/gallery"
            className="text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            View All Processed Images →
          </Link>
        </div>
      </div>
    </div>
  );
}
