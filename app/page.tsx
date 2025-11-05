'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Link as LinkIcon, LogIn, Lock, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import AuthNav from '@/components/AuthNav';
import { createClient } from '@/lib/supabase-browser';
import { User } from '@supabase/supabase-js';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadedImageId, setUploadedImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setImageUrl(event.target.value);
    setError(null);
    setSuccess(false);
    setUploadedImageId(null);
  };

  const handleUrlPreview = () => {
    if (imageUrl) {
      setPreview(imageUrl);
    }
  };

  const handleUpload = async () => {
    if (!imageUrl) {
      setError('Please enter an image URL');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Upload image
      const formData = new FormData();
      formData.append('imageUrl', imageUrl);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const uploadData = await uploadResponse.json();
      const imageId = uploadData.imageId;
      setUploadedImageId(imageId);
      setUploading(false);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setUploading(false);
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setImageUrl('');
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
        {/* Auth Nav */}
        <div className="flex justify-end mb-6">
          <AuthNav />
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">BrangHunt</h1>
          <p className="text-lg text-gray-600">
            AI-powered product detection and brand recognition
          </p>
        </div>

        {/* Auth Loading State */}
        {authLoading && (
          <div className="bg-white rounded-2xl shadow-xl p-16 mb-6">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        )}

        {/* Login Required Message - Show when not authenticated */}
        {!authLoading && !user && (
          <div className="bg-white rounded-2xl shadow-xl p-12 mb-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 rounded-full mb-6">
                <Lock className="w-10 h-10 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Authentication Required
              </h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Please sign in to upload images and analyze products with AI-powered detection
              </p>
              <div className="flex gap-4 justify-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-lg"
                >
                  <LogIn className="w-5 h-5" />
                  <span>Sign In</span>
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 px-8 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold text-lg"
                >
                  <span>Create Account</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Main Upload Card - Show only when authenticated */}
        {!authLoading && user && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          {!preview ? (
            <>
              {/* Upload Options */}
              <div className="flex gap-4 mb-8 justify-center">
                <Link
                  href="/excel-upload"
                  className="flex-1 max-w-xs px-6 py-4 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  Bulk Upload Excel
                </Link>
                <div className="flex-1 max-w-xs px-6 py-4 rounded-xl font-semibold bg-indigo-600 text-white shadow-lg flex items-center justify-center gap-2">
                  <LinkIcon className="w-5 h-5" />
                  S3 URL (Single Photo)
                </div>
              </div>

              {/* S3 URL Upload Interface */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-indigo-500 transition-colors">
                <LinkIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Enter S3 Image URL
                </h3>
                <p className="text-gray-500 mb-4">
                  Paste the S3 URL of a product image
                </p>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={handleUrlChange}
                  placeholder="https://traxus.s3.amazonaws.com/..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={handleUrlPreview}
                  disabled={!imageUrl}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Preview & Process
                </button>
              </div>
            </>
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
                    <span className="font-semibold">Upload completed!</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Your image is ready for analysis. Click below to start product detection.
                  </p>
                  <Link
                    href={`/analyze/${uploadedImageId}`}
                    className="inline-block px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Start Analysis
                  </Link>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center">
                {!uploading && !success && (
                  <>
                    <button
                      onClick={handleUpload}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                    >
                      Upload Image
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
                    Upload Another Image
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Gallery Link */}
        {!authLoading && user && (
          <div className="text-center">
            <Link
              href="/gallery"
              className="text-indigo-600 hover:text-indigo-800 font-semibold"
            >
              View Gallery →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
