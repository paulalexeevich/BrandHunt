/**
 * API Route: Validate Human Match
 * Saves human validation (correct/incorrect) for a detection's FoodGraph match
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { detectionId, isCorrect } = await request.json();

    if (!detectionId || typeof isCorrect !== 'boolean') {
      return NextResponse.json(
        { error: 'detectionId and isCorrect (boolean) are required' },
        { status: 400 }
      );
    }

    // Update the detection with human validation
    const { data, error } = await supabase
      .from('detections')
      .update({
        human_validation: isCorrect,
        human_validation_at: new Date().toISOString()
      })
      .eq('id', detectionId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating validation:', error);
      return NextResponse.json(
        { error: 'Failed to save validation', details: error.message },
        { status: 500 }
      );
    }

    console.log(`✓ Validation saved for detection ${detectionId}: ${isCorrect ? 'Correct' : 'Incorrect'}`);

    return NextResponse.json({
      success: true,
      validation: isCorrect,
      data
    });

  } catch (error) {
    console.error('❌ Error in validate-match API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

