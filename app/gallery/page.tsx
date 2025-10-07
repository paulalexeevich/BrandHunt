'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon, Loader2 } from 'lucide-react';

interface Image {
  id: string;
  original_filename: string;
  uploaded_at: string;
  processed: boolean;
  processing_status: string;
  file_path: string;
}

export default function Gallery() {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchImages();
  }, []);

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
            Back to Upload
          </Link>
          <h1 className="text-4xl font-bold text-gray-900">Processed Images</h1>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        )}

        {/* Empty State */}
        {!loading && images.length === 0 && (
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
        {!loading && images.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {images.map((image) => (
              <Link
                key={image.id}
                href={`/results/${image.id}`}
                className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow"
              >
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

