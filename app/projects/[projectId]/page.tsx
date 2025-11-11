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
  Users,
  UserPlus,
  Trash2,
  Shield,
  Eye,
  Edit,
} from 'lucide-react';
import AuthNav from '@/components/AuthNav';
import { createClient } from '@/lib/supabase-browser';
import { User } from '@supabase/supabase-js';
import { getImageUrl } from '@/lib/image-utils';

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

interface ProductStatistics {
  totalProducts: number;
  notProduct: number;
  detailsNotVisible: number;
  notIdentified: number;
  oneMatch: number;
  noMatch: number;
  multipleMatches: number;
}

interface ImageData {
  id: string;
  file_path: string | null;
  s3_url: string | null;
  storage_type?: 's3_url' | 'base64';
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

interface ProjectMember {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  added_at: string;
  added_by: string;
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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{
    total: number;
    totalPages: number;
    hasMore: boolean;
  } | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [memberLoading, setMemberLoading] = useState(false);
  
  // Batch processing state
  const [batchDetecting, setBatchDetecting] = useState(false);
  const [batchExtracting, setBatchExtracting] = useState(false);
  const [productStats, setProductStats] = useState<ProductStatistics | null>(null);
  const [batchProgress, setBatchProgress] = useState<string>('');
  
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

  // Refetch when page changes
  useEffect(() => {
    if (user) {
      fetchProjectData(page);
    }
  }, [page, user]);

  const fetchProductStatistics = async () => {
    try {
      const { data, error } = await supabase
        .from('branghunt_images')
        .select(`
          branghunt_detections (
            id,
            is_product,
            details_visible,
            brand_name,
            fully_analyzed
          )
        `)
        .eq('project_id', projectId);

      if (error) throw error;

      // Flatten all detections from all images
      const allDetections = data?.flatMap((img: any) => img.branghunt_detections || []) || [];

      // Calculate statistics
      const stats: ProductStatistics = {
        totalProducts: allDetections.length,
        notProduct: allDetections.filter((d: any) => d.is_product === false).length,
        detailsNotVisible: allDetections.filter((d: any) => d.is_product === true && d.details_visible === false).length,
        notIdentified: allDetections.filter((d: any) => 
          (d.is_product === true || d.is_product === null) && 
          (d.details_visible === true || d.details_visible === null) &&
          !d.brand_name
        ).length,
        oneMatch: allDetections.filter((d: any) => d.fully_analyzed === true).length,
        noMatch: 0, // Will be calculated from foodgraph results if needed
        multipleMatches: 0 // Will be calculated from foodgraph results if needed
      };

      setProductStats(stats);
    } catch (err) {
      console.error('Failed to fetch product statistics:', err);
    }
  };

  const fetchProjectData = async (pageNum: number = page) => {
    setLoading(true);
    setError(null);

    try {
      // Using limit=10 for faster loading (each image is 2-5MB base64)
      const response = await fetch(`/api/projects/${projectId}?page=${pageNum}&limit=10`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch project data');
      }

      const data = await response.json();
      
      // Debug logging for image data
      if (data.images && data.images.length > 0) {
        console.log('[Projects] Sample image data:', {
          id: data.images[0].id,
          storage_type: data.images[0].storage_type,
          has_s3_url: !!data.images[0].s3_url,
          has_file_path: !!data.images[0].file_path,
          s3_url_preview: data.images[0].s3_url?.substring(0, 60)
        });
      }
      
      setProject(data.project);
      setImages(data.images || []);
      setPagination(data.pagination || null);

      // Fetch product statistics
      if (data.project && data.project.total_detections > 0) {
        await fetchProductStatistics();
      }
      
      // Also fetch members
      await fetchMembers();
    } catch (err) {
      console.error('Error fetching project data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch project data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  const handleAddMember = async () => {
    if (!newMemberUserId.trim()) {
      alert('Please enter a user ID');
      return;
    }

    setMemberLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newMemberUserId, role: newMemberRole }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add member');
      }

      // Success - refresh members list
      await fetchMembers();
      setNewMemberUserId('');
      setShowAddMember(false);
      alert('Member added successfully');
    } catch (err) {
      console.error('Error adding member:', err);
      alert(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setMemberLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }

    setMemberLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove member');
      }

      // Success - refresh members list
      await fetchMembers();
      alert('Member removed successfully');
    } catch (err) {
      console.error('Error removing member:', err);
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setMemberLoading(false);
    }
  };

  const getDetectionCount = (image: ImageData): number => {
    return image.detections && image.detections.length > 0 ? image.detections[0].count : 0;
  };

  const handleBatchDetect = async () => {
    if (!confirm('Run product detection on all unprocessed images in this project?')) {
      return;
    }

    setBatchDetecting(true);
    setBatchProgress('Starting batch detection...');

    try {
      const response = await fetch('/api/batch-detect-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId,
          concurrency: 10 // Process 10 images at a time for faster batch processing
        }),
        credentials: 'include'
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Batch detection failed');
      }

      // Show detailed results
      const { summary, results } = result;
      const failedImages = results?.filter((r: any) => r.status === 'error') || [];
      
      let progressMsg = `✅ Completed: ${summary.successful}/${summary.total} images successful, ${summary.totalDetections} products detected`;
      
      if (summary.failed > 0) {
        progressMsg += `\n\n❌ ${summary.failed} Failed:\n`;
        failedImages.forEach((img: any) => {
          progressMsg += `• ${img.originalFilename}: ${img.error}\n`;
        });
      }
      
      setBatchProgress(progressMsg);
      
      // Refresh project data
      await fetchProjectData();
      
      // Keep success messages for 5s, keep error messages indefinitely
      if (summary.failed === 0) {
        setTimeout(() => setBatchProgress(''), 5000);
      }
    } catch (error) {
      console.error('Batch detection error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setBatchProgress(`❌ Batch Detection Failed:\n${errorMsg}\n\nCheck browser console (F12) for details.`);
      // Keep error messages visible - don't auto-hide
    } finally {
      setBatchDetecting(false);
    }
  };

  const handleBatchExtract = async () => {
    if (!confirm('Extract product information (brand, name, description) from all detected products?')) {
      return;
    }

    setBatchExtracting(true);
    setBatchProgress('Starting batch extraction...');

    try {
      const response = await fetch('/api/batch-extract-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId,
          concurrency: 15 // Process 15 images at a time (detections within each image in parallel = ~50-150 concurrent Gemini calls under 2K RPM limit)
        }),
        credentials: 'include'
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Batch extraction failed');
      }

      // Show detailed results
      const { summary, results } = result;
      const failedImages = results?.filter((r: any) => r.status === 'error') || [];
      
      let progressMsg = `✅ Completed: ${summary.successful}/${summary.total} images successful, ${summary.totalDetections} products extracted`;
      
      if (summary.failed > 0) {
        progressMsg += `\n\n❌ ${summary.failed} Failed:\n`;
        failedImages.forEach((img: any) => {
          progressMsg += `• ${img.originalFilename}: ${img.error}\n`;
        });
      }
      
      setBatchProgress(progressMsg);
      
      // Refresh project data
      await fetchProjectData();
      
      // Keep success messages for 5s, keep error messages indefinitely
      if (summary.failed === 0) {
        setTimeout(() => setBatchProgress(''), 5000);
      }
    } catch (error) {
      console.error('Batch extraction error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setBatchProgress(`❌ Batch Extraction Failed:\n${errorMsg}\n\nCheck browser console (F12) for details.`);
      // Keep error messages visible - don't auto-hide
    } finally {
      setBatchExtracting(false);
    }
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

            {/* Product Statistics Panel */}
            {productStats && productStats.totalProducts > 0 && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-md p-6 mb-8 border border-indigo-100">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  📊 Product Statistics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  {/* Total Products */}
                  <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-900 ring-2 ring-gray-900">
                    <div className="text-2xl font-bold text-gray-900">{productStats.totalProducts}</div>
                    <div className="text-xs text-gray-600 mt-1">Total Products</div>
                    <div className="text-xs text-gray-900 font-semibold mt-1">● Active</div>
                  </div>

                  {/* Not Product */}
                  <div className="bg-red-50 rounded-lg p-4 shadow-sm border border-red-200">
                    <div className="text-2xl font-bold text-red-700">{productStats.notProduct}</div>
                    <div className="text-xs text-red-600 mt-1">Not Product</div>
                  </div>

                  {/* Details Not Visible */}
                  <div className="bg-orange-50 rounded-lg p-4 shadow-sm border border-orange-200">
                    <div className="text-2xl font-bold text-orange-700">{productStats.detailsNotVisible}</div>
                    <div className="text-xs text-orange-600 mt-1">Details Not Visible</div>
                  </div>

                  {/* Not Identified */}
                  <div className="bg-gray-50 rounded-lg p-4 shadow-sm border border-gray-300">
                    <div className="text-2xl font-bold text-gray-700">{productStats.notIdentified}</div>
                    <div className="text-xs text-gray-600 mt-1">Not Identified</div>
                  </div>

                  {/* ONE Match */}
                  <div className="bg-green-50 rounded-lg p-4 shadow-sm border border-green-200">
                    <div className="text-2xl font-bold text-green-700">{productStats.oneMatch}</div>
                    <div className="text-xs text-green-600 mt-1">✓ ONE Match</div>
                  </div>

                  {/* NO Match */}
                  <div className="bg-yellow-50 rounded-lg p-4 shadow-sm border border-yellow-200">
                    <div className="text-2xl font-bold text-yellow-700">{productStats.noMatch}</div>
                    <div className="text-xs text-yellow-600 mt-1">NO Match</div>
                  </div>

                  {/* 2+ Matches */}
                  <div className="bg-purple-50 rounded-lg p-4 shadow-sm border border-purple-200">
                    <div className="text-2xl font-bold text-purple-700">{productStats.multipleMatches}</div>
                    <div className="text-xs text-purple-600 mt-1">2+ Matches</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Processing Progress</span>
                    <span>{productStats.oneMatch} / {productStats.totalProducts} Completed ({Math.round((productStats.oneMatch / productStats.totalProducts) * 100)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500 ease-out flex items-center justify-end pr-1"
                      style={{ width: `${(productStats.oneMatch / productStats.totalProducts) * 100}%` }}
                    >
                      {productStats.oneMatch > 0 && (
                        <span className="text-[10px] font-bold text-white">✓</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Project Members */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Users className="w-6 h-6 text-indigo-600" />
                  Project Members ({members.length})
                </h2>
                <button
                  onClick={() => setShowAddMember(!showAddMember)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Member
                </button>
              </div>

              {/* Add Member Form */}
              {showAddMember && (
                <div className="mb-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <h3 className="font-semibold text-gray-900 mb-3">Add New Member</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        User ID
                      </label>
                      <input
                        type="text"
                        value={newMemberUserId}
                        onChange={(e) => setNewMemberUserId(e.target.value)}
                        placeholder="Enter user UUID"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        disabled={memberLoading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Note: Currently requires the user's UUID. Email lookup coming soon.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Role
                      </label>
                      <select
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value as 'admin' | 'member' | 'viewer')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        disabled={memberLoading}
                      >
                        <option value="member">Member (can edit)</option>
                        <option value="admin">Admin (can manage members)</option>
                        <option value="viewer">Viewer (read-only)</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddMember}
                        disabled={memberLoading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
                      >
                        {memberLoading ? 'Adding...' : 'Add Member'}
                      </button>
                      <button
                        onClick={() => {
                          setShowAddMember(false);
                          setNewMemberUserId('');
                        }}
                        disabled={memberLoading}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Members List */}
              <div className="space-y-2">
                {members.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p>No members yet</p>
                  </div>
                ) : (
                  members.map((member) => {
                    const isOwner = member.role === 'owner';
                    const isCurrentUser = user && member.user_id === user.id;

                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${
                            isOwner ? 'bg-yellow-100' :
                            member.role === 'admin' ? 'bg-purple-100' :
                            member.role === 'member' ? 'bg-blue-100' :
                            'bg-gray-100'
                          }`}>
                            {isOwner ? <Shield className="w-5 h-5 text-yellow-600" /> :
                             member.role === 'admin' ? <Edit className="w-5 h-5 text-purple-600" /> :
                             member.role === 'member' ? <Package className="w-5 h-5 text-blue-600" /> :
                             <Eye className="w-5 h-5 text-gray-600" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {member.user_id.substring(0, 8)}...
                              </span>
                              {isCurrentUser && (
                                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <span className={`font-semibold ${
                                isOwner ? 'text-yellow-600' :
                                member.role === 'admin' ? 'text-purple-600' :
                                member.role === 'member' ? 'text-blue-600' :
                                'text-gray-600'
                              }`}>
                                {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                              </span>
                              <span>•</span>
                              <span>
                                Added {new Date(member.added_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {!isOwner && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={memberLoading}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Remove member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Info about roles */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 font-semibold mb-1">About Roles:</p>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li><strong>Owner:</strong> Full control, cannot be removed</li>
                  <li><strong>Admin:</strong> Can manage members and edit content</li>
                  <li><strong>Member:</strong> Can edit content and add images</li>
                  <li><strong>Viewer:</strong> Read-only access to project</li>
                </ul>
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

            {/* Batch Processing Controls */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Batch Processing</h2>
              <p className="text-gray-600 mb-4">
                Process multiple images in parallel for faster analysis
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <button
                  onClick={handleBatchDetect}
                  disabled={batchDetecting || batchExtracting}
                  className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg hover:from-green-700 hover:to-teal-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {batchDetecting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-semibold">Detecting Products...</span>
                    </>
                  ) : (
                    <>
                      <Target className="w-5 h-5" />
                      <span className="font-semibold">Batch Detect Products</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleBatchExtract}
                  disabled={batchDetecting || batchExtracting}
                  className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {batchExtracting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-semibold">Extracting Info...</span>
                    </>
                  ) : (
                    <>
                      <Package className="w-5 h-5" />
                      <span className="font-semibold">Batch Extract Info</span>
                    </>
                  )}
                </button>
              </div>
              {/* Progress Message */}
              {batchProgress && (
                <div className={`p-4 rounded-lg ${
                  batchProgress.includes('✅') ? 'bg-green-50 border border-green-200' :
                  batchProgress.includes('❌') ? 'bg-red-50 border border-red-200' :
                  'bg-blue-50 border border-blue-200'
                }`}>
                  <p className={`text-sm font-medium whitespace-pre-line ${
                    batchProgress.includes('✅') ? 'text-green-900' :
                    batchProgress.includes('❌') ? 'text-red-900' :
                    'text-blue-900'
                  }`}>
                    {batchProgress}
                  </p>
                  {batchProgress.includes('❌') && (
                    <button
                      onClick={() => setBatchProgress('')}
                      className="mt-3 px-3 py-1 bg-white border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )}
              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-900 font-semibold mb-1">About Batch Processing:</p>
                <ul className="text-xs text-gray-700 space-y-1">
                  <li><strong>Batch Detect:</strong> Uses YOLO API for ultra-fast detection (~0.6s per image, 10 images in parallel)</li>
                  <li><strong>Batch Extract:</strong> Extracts brand, name, and description from detected products (15 images in parallel, unlimited detections per image)</li>
                  <li><strong>Gemini Rate Limit:</strong> 2000 requests/min - optimized for 50-150 concurrent extraction calls</li>
                  <li><strong>Parallel Processing:</strong> Multiple images processed simultaneously - 20x faster than sequential</li>
                </ul>
              </div>
            </div>

            {/* Images Grid */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Images {pagination ? `(${pagination.total} total, showing ${(page - 1) * 10 + 1}-${Math.min(page * 10, pagination.total)})` : `(${images.length})`}
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
                          {getImageUrl(image) ? (
                            <img
                              src={getImageUrl(image)}
                              alt="Shelf image"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-16 h-16 text-gray-400" />
                            </div>
                          )}
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

              {/* Pagination Controls */}
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between border-t pt-6">
                  <div className="text-sm text-gray-600">
                    Page {page} of {pagination.totalPages}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={!pagination.hasMore}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

