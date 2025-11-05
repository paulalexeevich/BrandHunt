'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  FolderOpen,
  ArrowLeft,
  Loader2,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Upload,
  FileSpreadsheet,
  Link as LinkIcon,
  Target,
  DollarSign,
  Search,
  Filter,
  XCircle,
  Package,
} from 'lucide-react';
import AuthNav from '@/components/AuthNav';
import { createClient } from '@/lib/supabase-browser';
import { User } from '@supabase/supabase-js';

interface ProjectStats {
  project_id: string;
  user_id: string;
  project_name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  total_images: number;
  images_with_detection: number;
  total_detections: number;
  detections_brand_extracted: number;
  detections_price_extracted: number;
  detections_foodgraph_searched: number;
  detections_ai_filtered: number;
  detections_fully_analyzed: number;
}

interface ImageData {
  id: string;
  image_data: string;
  mime_type: string;
  width: number;
  height: number;
  store_name: string | null;
  status: 'uploaded' | 'detected' | 'extracted' | 'selected';
  detection_completed: boolean;
  detection_completed_at: string | null;
  created_at: string;
  detections: Array<{ count: number }>;
}

export default function ProjectViewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [project, setProject] = useState<ProjectStats | null>(null);
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);

      if (session?.user) {
        fetchProjectData();
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProjectData();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, projectId]);

  const fetchProjectData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch project data');
      }

      const data = await response.json();
      setProject(data.project);
      setImages(data.images || []);
    } catch (err) {
      console.error('Error fetching project data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch project data');
    } finally {
      setLoading(false);
    }
  };

  const getDetectionCount = (image: ImageData): number => {
    return image.detections && image.detections.length > 0 ? image.detections[0].count : 0;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-end mb-6">
            <AuthNav />
          </div>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-end mb-6">
            <AuthNav />
          </div>
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Authentication Required</h2>
            <p className="text-gray-600 mb-6">Please sign in to view this project</p>
            <Link
              href="/login"
              className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/projects" className="text-sm text-indigo-600 hover:text-indigo-800 mb-2 inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              Back to Projects
            </Link>
            {project && (
              <>
                <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3 mt-2">
                  <FolderOpen className="w-10 h-10 text-indigo-600" />
                  {project.project_name}
                </h1>
                {project.description && (
                  <p className="text-gray-600 mt-2">{project.description}</p>
                )}
              </>
            )}
          </div>
          <AuthNav />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Project Stats Dashboard */}
        {!loading && !error && project && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              {/* Total Images */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <ImageIcon className="w-6 h-6 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-700">Total Images</span>
                </div>
                <div className="text-3xl font-bold text-blue-700 mb-1">
                  {project.total_images}
                </div>
                <div className="text-sm text-gray-600">
                  {project.images_with_detection} with detection
                </div>
              </div>

              {/* Total Products */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Target className="w-6 h-6 text-purple-600" />
                  <span className="text-sm font-semibold text-gray-700">Total Products</span>
                </div>
                <div className="text-3xl font-bold text-purple-700 mb-1">
                  {project.total_detections}
                </div>
                <div className="text-sm text-gray-600">
                  {project.detections_fully_analyzed} fully analyzed
                </div>
              </div>

              {/* Brand Extracted */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="w-6 h-6 text-yellow-600" />
                  <span className="text-sm font-semibold text-gray-700">Brand Extracted</span>
                </div>
                <div className="text-3xl font-bold text-yellow-700 mb-1">
                  {project.detections_brand_extracted}
                </div>
                <div className="text-sm text-gray-600">
                  {Math.round((project.detections_brand_extracted / (project.total_detections || 1)) * 100)}% complete
                </div>
              </div>

              {/* Price Extracted */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <DollarSign className="w-6 h-6 text-green-600" />
                  <span className="text-sm font-semibold text-gray-700">Price Extracted</span>
                </div>
                <div className="text-3xl font-bold text-green-700 mb-1">
                  {project.detections_price_extracted}
                </div>
                <div className="text-sm text-gray-600">
                  {Math.round((project.detections_price_extracted / (project.total_detections || 1)) * 100)}% complete
                </div>
              </div>
            </div>

            {/* Processing Pipeline Status */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Processing Pipeline</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* FoodGraph Search */}
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Search className="w-8 h-8 text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-gray-900">FoodGraph Search</div>
                    <div className="text-sm text-gray-600">
                      {project.detections_foodgraph_searched} / {project.total_detections}
                    </div>
                  </div>
                </div>

                {/* AI Filtering */}
                <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
                  <Filter className="w-8 h-8 text-purple-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-gray-900">AI Filtered</div>
                    <div className="text-sm text-gray-600">
                      {project.detections_ai_filtered} / {project.total_detections}
                    </div>
                  </div>
                </div>

                {/* Fully Analyzed */}
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-gray-900">Completed</div>
                    <div className="text-sm text-gray-600">
                      {project.detections_fully_analyzed} / {project.total_detections}
                    </div>
                  </div>
                </div>

                {/* Completion Rate */}
                <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-lg">
                  <Target className="w-8 h-8 text-indigo-600 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-gray-900">Completion</div>
                    <div className="text-sm text-gray-600">
                      {Math.round((project.detections_fully_analyzed / (project.total_detections || 1)) * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Upload Options */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Add Images to Project</h2>
              <p className="text-gray-600 mb-4">
                Upload images to this project using bulk Excel upload or single S3 URL
              </p>
              <div className="flex gap-4">
                <Link
                  href={`/excel-upload?projectId=${projectId}`}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  <span className="font-semibold">Bulk Upload Excel</span>
                </Link>
                <Link
                  href={`/?projectId=${projectId}`}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-lg"
                >
                  <LinkIcon className="w-5 h-5" />
                  <span className="font-semibold">S3 URL Upload</span>
                </Link>
              </div>
            </div>

            {/* Images Grid */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Images ({images.length})
              </h2>

              {images.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No images in this project yet</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Use the upload options above to add images
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {images.map((image) => {
                    const detectionCount = getDetectionCount(image);
                    return (
                      <Link
                        key={image.id}
                        href={`/analyze/${image.id}`}
                        className="group relative bg-gray-50 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                      >
                        {/* Image */}
                        <div className="aspect-[3/4] relative bg-gray-200">
                          <img
                            src={image.image_data}
                            alt="Shelf image"
                            className="w-full h-full object-cover"
                          />
                          {/* Status Badge - 4 stages: uploaded, detected, extracted, selected */}
                          {image.status === 'uploaded' && (
                            <div className="absolute top-2 right-2 bg-gray-400 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                              <Upload className="w-3 h-3" />
                              Uploaded
                            </div>
                          )}
                          {image.status === 'detected' && (
                            <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              {detectionCount} detected
                            </div>
                          )}
                          {image.status === 'extracted' && (
                            <div className="absolute top-2 right-2 bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              {detectionCount} extracted
                            </div>
                          )}
                          {image.status === 'selected' && (
                            <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              {detectionCount} selected
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3">
                          {image.store_name && (
                            <div className="text-xs text-gray-600 mb-1 truncate">
                              {image.store_name}
                            </div>
                          )}
                          <div className="text-xs text-gray-500">
                            {new Date(image.created_at).toLocaleDateString()}
                          </div>
                          {image.detection_completed && detectionCount > 0 && (
                            <div className="text-xs text-green-600 font-semibold mt-1">
                              {detectionCount} {detectionCount === 1 ? 'product' : 'products'} detected
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

