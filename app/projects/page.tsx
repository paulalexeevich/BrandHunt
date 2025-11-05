'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  FolderOpen, 
  Plus, 
  Loader2, 
  Image as ImageIcon, 
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  DollarSign,
  Target,
  Trash2,
  Edit
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

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      
      if (session?.user) {
        fetchProjects();
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProjects();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/projects');
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newProjectName.trim()) {
      return;
    }

    setCreating(true);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDescription || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      // Reset form and close modal
      setNewProjectName('');
      setNewProjectDescription('');
      setShowCreateModal(false);

      // Refresh projects list
      await fetchProjects();
    } catch (err) {
      console.error('Error creating project:', err);
      alert('Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete project');
      }

      // Refresh projects list
      await fetchProjects();
    } catch (err) {
      console.error('Error deleting project:', err);
      alert('Failed to delete project');
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
            <p className="text-gray-600 mb-6">Please sign in to view your projects</p>
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
        {/* Header with Auth Nav */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/" className="text-sm text-indigo-600 hover:text-indigo-800 mb-2 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-4xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-600 mt-2">Organize your shelf images into projects</p>
          </div>
          <AuthNav />
        </div>

        {/* Create Project Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Create New Project
          </button>
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

        {/* Empty State */}
        {!loading && !error && projects.length === 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <FolderOpen className="w-20 h-20 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-3">No Projects Yet</h2>
            <p className="text-gray-600 mb-6">
              Create your first project to start organizing your shelf images
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
            >
              <Plus className="w-5 h-5" />
              Create Project
            </button>
          </div>
        )}

        {/* Projects Grid */}
        {!loading && !error && projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project.project_id}
                className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow"
              >
                <Link href={`/projects/${project.project_id}`}>
                  <div className="p-6 cursor-pointer">
                    {/* Project Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-1">
                          {project.project_name}
                        </h3>
                        {project.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {project.description}
                          </p>
                        )}
                      </div>
                      <FolderOpen className="w-8 h-8 text-indigo-600 flex-shrink-0" />
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {/* Total Images */}
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <ImageIcon className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-medium text-blue-900">Images</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-700">
                          {project.total_images}
                        </div>
                        <div className="text-xs text-blue-600">
                          {project.images_with_detection} detected
                        </div>
                      </div>

                      {/* Total Products */}
                      <div className="bg-purple-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="w-4 h-4 text-purple-600" />
                          <span className="text-xs font-medium text-purple-900">Products</span>
                        </div>
                        <div className="text-2xl font-bold text-purple-700">
                          {project.total_detections}
                        </div>
                        <div className="text-xs text-purple-600">
                          {project.detections_fully_analyzed} completed
                        </div>
                      </div>
                    </div>

                    {/* Processing Status */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-gray-700 mb-2">Processing Status</div>
                      
                      {/* Brand Extraction */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-3 h-3 text-yellow-500" />
                          <span className="text-gray-600">Brand Extracted</span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          {project.detections_brand_extracted} / {project.total_detections}
                        </span>
                      </div>

                      {/* Price Extraction */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-3 h-3 text-green-500" />
                          <span className="text-gray-600">Price Extracted</span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          {project.detections_price_extracted} / {project.total_detections}
                        </span>
                      </div>

                      {/* FoodGraph Search */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Search className="w-3 h-3 text-blue-500" />
                          <span className="text-gray-600">FoodGraph Search</span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          {project.detections_foodgraph_searched} / {project.total_detections}
                        </span>
                      </div>

                      {/* AI Filtering */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Filter className="w-3 h-3 text-purple-500" />
                          <span className="text-gray-600">AI Filtered</span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          {project.detections_ai_filtered} / {project.total_detections}
                        </span>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <span className="text-xs text-gray-500">
                        Created {new Date(project.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Actions */}
                <div className="px-6 py-3 bg-gray-50 rounded-b-xl flex gap-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteProject(project.project_id, project.project_name);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Project Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Project</h2>
              
              <form onSubmit={handleCreateProject}>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g., Walgreens Q4 2025"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    required
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Brief description of the project..."
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewProjectName('');
                      setNewProjectDescription('');
                    }}
                    className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    disabled={creating || !newProjectName.trim()}
                  >
                    {creating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

