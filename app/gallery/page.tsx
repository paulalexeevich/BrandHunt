'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Image as ImageIcon, Loader2, Trash2, Lock, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { User } from '@supabase/supabase-js';

interface Image {
  id: string;
  original_filename: string;
  uploaded_at: string;
  processed: boolean;
  processing_status: string;
  file_path: string;
}

export default function Gallery() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; filename: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check authentication first
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      
      // Only fetch images if authenticated
      if (session?.user) {
        fetchImages();
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchImages();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const fetchImages = async () => {
    try {
      const response = await fetch('/api/images');
      const data = await response.json();
      setImages(data.images || []);
    } catch (error) {
      console.error('Failed to fetch images:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { text: string; color: string }> = {
      pending: { text: 'Pending', color: 'bg-gray-500' },
      processing: { text: 'Processing', color: 'bg-blue-500' },
      completed: { text: 'Completed', color: 'bg-green-500' },
      error_detection: { text: 'Error', color: 'bg-red-500' },
    };

    const badge = badges[status] || { text: status, color: 'bg-gray-500' };

    return (
      <span className={`px-2 py-1 text-xs font-semibold text-white rounded ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  const handleDeleteImage = async () => {
    if (!deleteConfirm) return;

    setDeleting(true);

    try {
      const response = await fetch(`/api/images/${deleteConfirm.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to delete image');
      }

      // Remove image from state
      setImages(prev => prev.filter(img => img.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete image:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete image');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900">Processed Images</h1>
        </div>

        {/* Auth Loading State */}
        {authLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        )}

        {/* Login Required Message */}
        {!authLoading && !user && (
          <div className="bg-white rounded-2xl shadow-xl p-12">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 rounded-full mb-6">
                <Lock className="w-10 h-10 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Authentication Required
              </h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Please sign in to view your processed images and analysis results
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

        {/* Loading State */}
        {!authLoading && user && loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        )}

        {/* Empty State */}
        {!authLoading && user && !loading && images.length === 0 && (
          <div className="text-center py-12">
            <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No images yet</h3>
            <p className="text-gray-500 mb-4">Upload your first image to get started</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Upload Image
            </Link>
          </div>
        )}

        {/* Images Grid */}
        {!authLoading && user && !loading && images.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {images.map((image) => (
              <div
                key={image.id}
                className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow relative group"
              >
                <Link href={`/analyze/${image.id}`}>
                  <div className="aspect-square bg-gray-200 relative">
                    <img
                      src={`data:image/jpeg;base64,${image.file_path}`}
                      alt={image.original_filename}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2">
                      {getStatusBadge(image.processing_status)}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 truncate mb-1">
                      {image.original_filename}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {new Date(image.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
                {/* Delete Button - always visible */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setDeleteConfirm({ id: image.id, filename: image.original_filename });
                  }}
                  className="absolute top-2 left-2 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 z-10 shadow-lg"
                  title="Delete image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
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
                Are you sure you want to delete <strong>{deleteConfirm.filename}</strong>? 
                This will permanently remove the image and all its associated detections and FoodGraph results.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
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

