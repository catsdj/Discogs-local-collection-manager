import { NextRequest, NextResponse } from 'next/server';
import { createSecureError } from '@/lib/security';
import { rejectIfNotLocal } from '@/lib/requestSecurity';

export async function GET(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Redirect cache-related requests to database sync
    if (action === 'cache') {
      return NextResponse.json({
        message: 'Cache functionality has been disabled. Use /api/discogs/database-sync for database synchronization.',
        redirect: '/api/discogs/database-sync',
        status: 'deprecated'
      });
    }

    // Return status indicating cache is disabled
    return NextResponse.json({
      message: 'Cache-based job system has been disabled',
      status: 'disabled',
      recommendation: 'Use /api/discogs/database-sync for synchronization'
    });

  } catch (error: any) {
    console.error('Job API error:', error);
    const secureError = createSecureError('Failed to process job request', 500);
    return NextResponse.json(secureError, { status: secureError.status });
  }
}

export async function POST(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  try {
    const body = await request.json();
    const { action } = body;

    // Redirect cache-related requests to database sync
    if (action === 'cache' || action === 'refresh') {
      return NextResponse.json({
        message: 'Cache functionality has been disabled. Use /api/discogs/database-sync for database synchronization.',
        redirect: '/api/discogs/database-sync',
        status: 'deprecated'
      });
    }

    return NextResponse.json({
      message: 'Cache-based job system has been disabled',
      status: 'disabled',
      recommendation: 'Use /api/discogs/database-sync for synchronization'
    });

  } catch (error: any) {
    console.error('Job API error:', error);
    const secureError = createSecureError('Failed to process job request', 500);
    return NextResponse.json(secureError, { status: secureError.status });
  }
}
