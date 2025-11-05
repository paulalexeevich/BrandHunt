import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthenticatedSupabaseClient } from '@/lib/auth';

/**
 * DELETE /api/images/[imageId]
 * Deletes an image and all associated data (detections, foodgraph results)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    // Require authentication
    const user = await requireAuth();

    // Create authenticated Supabase client
    const supabase = await createAuthenticatedSupabaseClient();

    const { imageId } = await params;

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    // First, delete all FoodGraph results for this image's detections
    // Get all detection IDs for this image
    const { data: detections, error: detectionsError } = await supabase
      .from('branghunt_detections')
      .select('id')
      .eq('image_id', imageId);

    if (detectionsError) {
      console.error('Error fetching detections:', detectionsError);
      return NextResponse.json({ 
        error: 'Failed to fetch detections for deletion',
        details: detectionsError.message 
      }, { status: 500 });
    }

    // Delete FoodGraph results if there are any detections
    if (detections && detections.length > 0) {
      const detectionIds = detections.map(d => d.id);
      
      const { error: foodgraphError } = await supabase
        .from('branghunt_foodgraph_results')
        .delete()
        .in('detection_id', detectionIds);

      if (foodgraphError) {
        console.error('Error deleting foodgraph results:', foodgraphError);
        // Continue anyway, as this might just mean no results exist
      }
    }

    // Delete all detections for this image
    const { error: deleteDetectionsError } = await supabase
      .from('branghunt_detections')
      .delete()
      .eq('image_id', imageId);

    if (deleteDetectionsError) {
      console.error('Error deleting detections:', deleteDetectionsError);
      return NextResponse.json({ 
        error: 'Failed to delete detections',
        details: deleteDetectionsError.message 
      }, { status: 500 });
    }

    // Finally, delete the image itself
    const { error: deleteImageError } = await supabase
      .from('branghunt_images')
      .delete()
      .eq('id', imageId);

    if (deleteImageError) {
      console.error('Error deleting image:', deleteImageError);
      return NextResponse.json({ 
        error: 'Failed to delete image',
        details: deleteImageError.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Image and all associated data deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error);
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ 
        error: 'Authentication required',
        details: 'Please log in to delete images'
      }, { status: 401 });
    }
    return NextResponse.json({ 
      error: 'Failed to delete image',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

