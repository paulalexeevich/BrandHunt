import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    // Check which environment variables are available
    hasFoodGraphEmail: !!process.env.FOODGRAPH_EMAIL,
    hasFoodGraphPassword: !!process.env.FOODGRAPH_PASSWORD,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasGeminiKey: !!process.env.GOOGLE_GEMINI_API_KEY,
    
    // Show first 3 characters only for debugging (safe)
    foodGraphEmailPrefix: process.env.FOODGRAPH_EMAIL?.substring(0, 3) || 'MISSING',
    foodGraphPasswordPrefix: process.env.FOODGRAPH_PASSWORD?.substring(0, 3) || 'MISSING',
    
    // Show all env variable names (not values)
    allEnvKeys: Object.keys(process.env).filter(key => 
      key.includes('FOODGRAPH') || key.includes('SUPABASE') || key.includes('GEMINI')
    ),
    
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
}

