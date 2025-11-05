'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check authentication and redirect
    const checkAuthAndRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Redirect authenticated users to projects page
        router.push('/projects');
      }
    };

    checkAuthAndRedirect();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        router.push('/projects');
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);


  // Landing page for unauthenticated users
  // Authenticated users are redirected to /projects
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">BrangHunt</h1>
          <p className="text-2xl text-gray-600 mb-2">
            AI-powered product detection and brand recognition
          </p>
          <p className="text-lg text-gray-500">
            Organize shelf images into projects and analyze products with advanced AI
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-12 mb-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full mb-6">
              <FolderOpen className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Welcome to BrangHunt
            </h2>
            <p className="text-gray-600 mb-8 max-w-2xl mx-auto text-lg">
              Sign in to access your projects, upload shelf images, and leverage powerful AI 
              to detect products, extract brand information, pricing, and match with FoodGraph database.
            </p>
            
            {/* Action Buttons */}
            <div className="flex gap-4 justify-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-10 py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold text-lg shadow-lg hover:shadow-xl"
              >
                <LogIn className="w-6 h-6" />
                <span>Sign In</span>
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-10 py-4 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold text-lg shadow-lg hover:shadow-xl"
              >
                <span>Create Account</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div className="bg-white bg-opacity-60 backdrop-blur rounded-xl p-6">
            <div className="text-3xl mb-3">📁</div>
            <h3 className="font-bold text-gray-900 mb-2">Project Management</h3>
            <p className="text-gray-600 text-sm">Organize images into projects with detailed tracking</p>
          </div>
          <div className="bg-white bg-opacity-60 backdrop-blur rounded-xl p-6">
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="font-bold text-gray-900 mb-2">AI Detection</h3>
            <p className="text-gray-600 text-sm">Advanced YOLO and Gemini AI for product recognition</p>
          </div>
          <div className="bg-white bg-opacity-60 backdrop-blur rounded-xl p-6">
            <div className="text-3xl mb-3">📊</div>
            <h3 className="font-bold text-gray-900 mb-2">Batch Processing</h3>
            <p className="text-gray-600 text-sm">Process multiple products and match with FoodGraph</p>
          </div>
        </div>
      </div>
    </div>
  );
}
