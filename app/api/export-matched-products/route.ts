import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/auth';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Create authenticated Supabase client with user session
    const supabase = await createAuthenticatedSupabaseClient();

    // Verify user has access to this project
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a member of this project
    const { data: membership } = await supabase
      .from('branghunt_project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // First, fetch all images for this project to get their IDs
    const { data: projectImages, error: imagesError } = await supabase
      .from('branghunt_images')
      .select('id')
      .eq('project_id', projectId);

    if (imagesError) {
      console.error('Error fetching project images:', imagesError);
      return NextResponse.json({ error: 'Failed to fetch project images', details: imagesError.message }, { status: 500 });
    }

    if (!projectImages || projectImages.length === 0) {
      return NextResponse.json({ error: 'No images found in this project' }, { status: 404 });
    }

    const imageIds = projectImages.map(img => img.id);

    // Fetch all matched products (detections with selected_foodgraph_gtin)
    const { data: detections, error: fetchError } = await supabase
      .from('branghunt_detections')
      .select(`
        id,
        detection_index,
        image_id,
        selected_foodgraph_gtin,
        selected_foodgraph_product_name,
        selected_foodgraph_brand,
        selected_foodgraph_manufacturer,
        selected_foodgraph_size,
        selected_foodgraph_image_url,
        branghunt_images (
          id,
          original_filename,
          s3_url,
          file_path,
          store_name
        )
      `)
      .in('image_id', imageIds)
      .not('selected_foodgraph_gtin', 'is', null)
      .order('image_id', { ascending: true })
      .order('detection_index', { ascending: true });

    if (fetchError) {
      console.error('Error fetching matched products:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch matched products', details: fetchError.message }, { status: 500 });
    }

    if (!detections || detections.length === 0) {
      return NextResponse.json({ error: 'No matched products found' }, { status: 404 });
    }

    // Transform data for Excel
    const excelData = detections.map((detection: any) => {
      const image = detection.branghunt_images;
      return {
        'Product GTIN': detection.selected_foodgraph_gtin || '',
        'Shelf Photo': image?.original_filename || image?.s3_url || 'N/A',
        'Product # on Image': detection.detection_index + 1, // +1 for human-readable numbering
        'Store Name': image?.store_name || 'N/A',
        'FoodGraph Front Photo': detection.selected_foodgraph_image_url || 'N/A',
        'Product Name': detection.selected_foodgraph_product_name || 'N/A',
        'Brand': detection.selected_foodgraph_brand || 'N/A',
        'Manufacturer': detection.selected_foodgraph_manufacturer || 'N/A',
        'Product Measure': detection.selected_foodgraph_size || 'N/A',
      };
    });

    // Create Excel workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // GTIN
      { wch: 30 }, // Shelf Photo
      { wch: 12 }, // Product #
      { wch: 20 }, // Store Name
      { wch: 50 }, // FoodGraph Photo URL
      { wch: 40 }, // Product Name
      { wch: 20 }, // Brand
      { wch: 20 }, // Manufacturer
      { wch: 15 }, // Measure
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Matched Products');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Get project name for filename
    const { data: project } = await supabase
      .from('branghunt_projects')
      .select('project_name')
      .eq('id', projectId)
      .single();

    const filename = `${project?.project_name || 'Project'}_Matched_Products_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Return Excel file
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting matched products:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

