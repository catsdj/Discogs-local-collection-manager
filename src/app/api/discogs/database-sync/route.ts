import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseSyncService } from '@/lib/databaseSyncService';
import { rejectIfNotLocal } from '@/lib/requestSecurity';

export async function GET(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    const syncService = getDatabaseSyncService();

    if (action === 'status') {
      const status = syncService.getJobStatus();
      return NextResponse.json({
        job: status,
        nextSync: 'Manual only (automatic sync disabled)',
        lastRun: status.endTime || null
      });
    }

    if (action === 'trigger') {
      // Trigger manual sync
      syncService.runSyncJob();
      return NextResponse.json({
        message: 'Sync job triggered',
        status: 'running'
      });
    }

    // Default: return current status
    const status = syncService.getJobStatus();
    return NextResponse.json({
      job: status,
      nextSync: 'Manual only (automatic sync disabled)',
      lastRun: status.endTime || null
    });

  } catch (error: any) {
    console.error('Database sync API error:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
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

    const syncService = getDatabaseSyncService();

    if (action === 'trigger') {
      // Trigger manual sync
      syncService.runSyncJob();
      return NextResponse.json({
        message: 'Sync job triggered successfully',
        status: 'running'
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Database sync API error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger sync' },
      { status: 500 }
    );
  }
}
