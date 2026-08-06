import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseSyncService } from '@/lib/databaseSyncService';
import { parseCollectionSyncPeriod } from '@/lib/collectionSyncPeriod';
import { rejectIfNotLocal } from '@/lib/requestSecurity';
import { rejectIfNotConfigured } from '@/lib/setup';

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
      const setupResponse = rejectIfNotConfigured();
      if (setupResponse) {
        return setupResponse;
      }

      const periodValue = searchParams.get('period');
      const period = parseCollectionSyncPeriod(periodValue);
      if (periodValue !== null && !period) {
        return NextResponse.json({ error: 'Invalid sync period' }, { status: 400 });
      }

      void syncService.runSyncJob(period ?? 'all');
      return NextResponse.json({
        message: 'Sync job triggered',
        job: syncService.getJobStatus(),
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
    const { action, period: periodValue } = body;
    const syncService = getDatabaseSyncService();

    if (action === 'trigger') {
      const setupResponse = rejectIfNotConfigured();
      if (setupResponse) {
        return setupResponse;
      }

      const period = parseCollectionSyncPeriod(periodValue);
      if (periodValue !== undefined && !period) {
        return NextResponse.json({ error: 'Invalid sync period' }, { status: 400 });
      }

      // Trigger manual sync
      void syncService.runSyncJob(period ?? 'all');
      return NextResponse.json({
        message: 'Sync job triggered successfully',
        job: syncService.getJobStatus(),
      });
    }

    if (action === 'stop') {
      const stopped = syncService.requestStop();
      return NextResponse.json({
        message: stopped ? 'Sync stop requested' : 'No sync job is running',
        job: syncService.getJobStatus(),
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
