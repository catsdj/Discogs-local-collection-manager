import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getDatabase } from '@/lib/database';
import { secureFetch, sanitizeErrorForLogging } from '@/lib/secureFetch';
import { rateLimit } from '@/lib/rateLimiter';
import { rejectIfNotLocal } from '@/lib/requestSecurity';
import { rejectIfNotConfigured } from '@/lib/setup';
import {
  CollectionSyncPeriod,
  getCollectionSyncCutoff,
  getCollectionSyncPeriodLabel,
  parseCollectionSyncPeriod,
} from '@/lib/collectionSyncPeriod';

/**
 * Update Collection API
 * Fetches latest collection data from Discogs to:
 * 1. Check for new releases
 * 2. Update conditions (media/sleeve)
 * 3. Update metadata
 *
 * Does NOT fetch marketplace prices or videos (use /api/discogs/database-sync for that)
 */

interface IdRow {
  id: number | bigint;
}

type CollectionUpdateJobStatus = {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped';
  period: CollectionSyncPeriod;
  progress: number;
  total: number;
  processed: number;
  startTime: Date | null;
  endTime: Date | null;
  error: string | null;
  results: {
    newReleases: number;
    conditionsUpdated: number;
    errors: number;
  };
};

const createInitialJobStatus = (): CollectionUpdateJobStatus => ({
  id: '',
  status: 'idle',
  period: 'all',
  progress: 0,
  total: 0,
  processed: 0,
  startTime: null,
  endTime: null,
  error: null,
  results: {
    newReleases: 0,
    conditionsUpdated: 0,
    errors: 0,
  },
});

type CollectionUpdateJobState = {
  status: CollectionUpdateJobStatus;
  stopRequested: boolean;
  abortController: AbortController | null;
};

const globalUpdateJobState = globalThis as typeof globalThis & {
  __discogsCollectionUpdateJobState?: CollectionUpdateJobState;
};

function getUpdateJobState(): CollectionUpdateJobState {
  if (!globalUpdateJobState.__discogsCollectionUpdateJobState) {
    globalUpdateJobState.__discogsCollectionUpdateJobState = {
      status: createInitialJobStatus(),
      stopRequested: false,
      abortController: null,
    };
  }

  return globalUpdateJobState.__discogsCollectionUpdateJobState;
}

function getUpdateJobStatus(): CollectionUpdateJobStatus {
  const { status } = getUpdateJobState();
  return { ...status, results: { ...status.results } };
}

function markUpdateJobStopped(): void {
  const { status } = getUpdateJobState();
  status.status = 'stopped';
  status.error = null;
  status.endTime = new Date();
}

function requestUpdateJobStop(): boolean {
  const state = getUpdateJobState();
  if (state.status.status !== 'running') {
    return false;
  }

  state.stopRequested = true;
  state.abortController?.abort();
  return true;
}

async function runUpdateCollectionJob(period: CollectionSyncPeriod): Promise<void> {
  const state = getUpdateJobState();
  const jobId = `collection-update_${Date.now()}`;
  const abortController = new AbortController();
  state.stopRequested = false;
  state.abortController = abortController;
  state.status = {
    ...createInitialJobStatus(),
    id: jobId,
    status: 'running',
    period,
    startTime: new Date(),
  };

  try {
    const db = getDatabase();
    let newReleases = 0;
    let conditionsUpdated = 0;
    let errors = 0;

    console.log(`Starting Update Collection job for releases added within: ${getCollectionSyncPeriodLabel(period)}`);

    let collectionData: any[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      if (state.stopRequested) {
        markUpdateJobStopped();
        return;
      }

      const collectionUrl = `https://api.discogs.com/users/${config.discogsUsername}/collection/folders/0/releases?page=${page}&per_page=100&sort=added&sort_order=desc`;

      const response = await secureFetch(collectionUrl, {
        headers: {
          'User-Agent': config.userAgent,
          'Authorization': `Discogs token=${config.discogsToken}`,
        },
        timeout: 30000,
        signal: abortController.signal,
      });

      if (!response.ok) {
        console.error(`Failed to fetch collection page ${page}: ${response.status}`);
        break;
      }

      const result = await response.json();
      const releases = result.releases || [];
      collectionData = collectionData.concat(releases);

      console.log(`Fetched page ${page}: ${releases.length} items (total: ${collectionData.length})`);

      const pagination = result.pagination;
      hasMorePages = pagination && pagination.page < pagination.pages;
      page++;
    }

    if (state.stopRequested) {
      markUpdateJobStopped();
      return;
    }

    const cutoff = getCollectionSyncCutoff(period);
    if (cutoff) {
      const cutoffTime = cutoff.getTime();
      collectionData = collectionData.filter((item) => {
        const addedAt = new Date(item.date_added).getTime();
        return Number.isFinite(addedAt) && addedAt >= cutoffTime;
      });
    }

    console.log(`Collection items in scope (${getCollectionSyncPeriodLabel(period)}): ${collectionData.length}`);
    state.status.total = collectionData.length;

    const rawDb = db.getDb();
    const statements = {
      selectRelease: rawDb.prepare('SELECT id FROM releases WHERE discogs_id = ?'),
      insertRelease: rawDb.prepare(`
        INSERT INTO releases (
          discogs_id, title, year, cover_image_url, date_added,
          media_condition, sleeve_condition, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `),
      updateReleaseConditions: rawDb.prepare(`
        UPDATE releases
        SET media_condition = COALESCE(?, media_condition),
            sleeve_condition = COALESCE(?, sleeve_condition),
            updated_at = datetime('now')
        WHERE id = ?
      `),
      selectArtist: rawDb.prepare('SELECT id FROM artists WHERE name = ?'),
      insertArtist: rawDb.prepare('INSERT INTO artists (name) VALUES (?)'),
      linkArtist: rawDb.prepare('INSERT OR IGNORE INTO release_artists (release_id, artist_id, position) VALUES (?, ?, ?)'),
      selectStyle: rawDb.prepare('SELECT id FROM styles WHERE name = ?'),
      insertStyle: rawDb.prepare('INSERT INTO styles (name) VALUES (?)'),
      linkStyle: rawDb.prepare('INSERT OR IGNORE INTO release_styles (release_id, style_id) VALUES (?, ?)'),
      selectGenre: rawDb.prepare('SELECT id FROM genres WHERE name = ?'),
      insertGenre: rawDb.prepare('INSERT INTO genres (name) VALUES (?)'),
      linkGenre: rawDb.prepare('INSERT OR IGNORE INTO release_genres (release_id, genre_id) VALUES (?, ?)'),
      selectLabel: rawDb.prepare('SELECT id FROM labels WHERE name = ?'),
      insertLabel: rawDb.prepare('INSERT INTO labels (name) VALUES (?)'),
      linkLabel: rawDb.prepare('INSERT OR IGNORE INTO release_labels (release_id, label_id, position) VALUES (?, ?, ?)'),
    };

    const getOrCreateId = (name: string, selectStatement: any, insertStatement: any): number => {
      const existing = selectStatement.get(name) as IdRow | undefined;
      if (existing) {
        return Number(existing.id);
      }

      const result = insertStatement.run(name);
      return Number(result.lastInsertRowid);
    };

    const processCollectionData = rawDb.transaction((items: any[]) => {
      for (const item of items) {
        if (state.stopRequested) {
          break;
        }

        try {
          const discogsId = item.basic_information?.id || item.id;
          const existingRelease = statements.selectRelease.get(discogsId) as IdRow | undefined;

          if (!existingRelease) {
            const basicInfo = item.basic_information;
            const mediaCondition = item.media_condition ||
              item.notes?.find((note: any) => note.field_id === 1)?.value ||
              'Unknown';
            const sleeveCondition = item.sleeve_condition ||
              item.notes?.find((note: any) => note.field_id === 2)?.value ||
              'Unknown';

            const result = statements.insertRelease.run(
              discogsId,
              basicInfo?.title || 'Unknown',
              basicInfo?.year || null,
              basicInfo?.cover_image || basicInfo?.thumb || null,
              item.date_added,
              mediaCondition,
              sleeveCondition,
            );

            const newReleaseId = Number(result.lastInsertRowid);

            if (Array.isArray(basicInfo?.artists)) {
              for (let index = 0; index < basicInfo.artists.length; index++) {
                const artistName = basicInfo.artists[index]?.name;
                if (!artistName) {
                  continue;
                }

                const artistId = getOrCreateId(artistName, statements.selectArtist, statements.insertArtist);
                statements.linkArtist.run(newReleaseId, artistId, index);
              }
            }

            if (Array.isArray(basicInfo?.styles)) {
              for (const styleName of basicInfo.styles) {
                if (!styleName) {
                  continue;
                }

                const styleId = getOrCreateId(styleName, statements.selectStyle, statements.insertStyle);
                statements.linkStyle.run(newReleaseId, styleId);
              }
            }

            if (Array.isArray(basicInfo?.genres)) {
              for (const genreName of basicInfo.genres) {
                if (!genreName) {
                  continue;
                }

                const genreId = getOrCreateId(genreName, statements.selectGenre, statements.insertGenre);
                statements.linkGenre.run(newReleaseId, genreId);
              }
            }

            if (Array.isArray(basicInfo?.labels)) {
              for (let index = 0; index < basicInfo.labels.length; index++) {
                const labelName = basicInfo.labels[index]?.name;
                if (!labelName) {
                  continue;
                }

                const labelId = getOrCreateId(labelName, statements.selectLabel, statements.insertLabel);
                statements.linkLabel.run(newReleaseId, labelId, index);
              }
            }

            newReleases++;
            state.status.results.newReleases++;
            console.log(`Added new release: "${basicInfo?.title}" (ID: ${discogsId})`);
          } else {
            const mediaCondition = item.media_condition ||
              item.notes?.find((note: any) => note.field_id === 1)?.value;
            const sleeveCondition = item.sleeve_condition ||
              item.notes?.find((note: any) => note.field_id === 2)?.value;

            if (mediaCondition || sleeveCondition) {
              statements.updateReleaseConditions.run(
                mediaCondition || null,
                sleeveCondition || null,
                Number(existingRelease.id),
              );
              conditionsUpdated++;
              state.status.results.conditionsUpdated++;
            }
          }
        } catch (itemError: any) {
          console.error('Error processing release:', sanitizeErrorForLogging(itemError));
          errors++;
          state.status.results.errors++;
        }

        state.status.processed++;
        state.status.progress = Math.round((state.status.processed / state.status.total) * 100);
      }
    });

    processCollectionData(collectionData);

    if (state.stopRequested) {
      markUpdateJobStopped();
      return;
    }

    state.status.status = 'completed';
    state.status.progress = 100;
    state.status.endTime = new Date();
    console.log(`Update Collection completed: ${newReleases} new, ${conditionsUpdated} updated, ${errors} errors`);
  } catch (error: any) {
    if (state.stopRequested) {
      markUpdateJobStopped();
      return;
    }

    console.error('Error in Update Collection job:', sanitizeErrorForLogging(error));
    state.status.status = 'failed';
    state.status.error = error.message || 'Unknown error';
    state.status.endTime = new Date();
  } finally {
    if (state.abortController === abortController) {
      state.abortController = null;
    }
  }
}

export async function GET(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  const action = new URL(request.url).searchParams.get('action');
  if (action !== 'status') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  return NextResponse.json({ job: getUpdateJobStatus() });
}

export async function POST(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action || 'trigger';

  if (action === 'stop') {
    const stopped = requestUpdateJobStop();
    return NextResponse.json({
      message: stopped ? 'Collection import stop requested' : 'No collection import is running',
      job: getUpdateJobStatus(),
    });
  }

  if (action !== 'trigger') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const setupResponse = rejectIfNotConfigured();
  if (setupResponse) {
    return setupResponse;
  }

  const rateLimitResult = rateLimit(request, '/api/discogs/update-collection');
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', message: 'Rate limit exceeded' },
      { status: 429 },
    );
  }

  if (getUpdateJobState().status.status === 'running') {
    return NextResponse.json({
      message: 'Collection import is already running',
      job: getUpdateJobStatus(),
    });
  }

  const period = parseCollectionSyncPeriod(body.period);
  if (body.period !== undefined && !period) {
    return NextResponse.json({ error: 'Invalid sync period' }, { status: 400 });
  }

  void runUpdateCollectionJob(period ?? 'all');
  return NextResponse.json(
    {
      message: 'Collection import started',
      job: getUpdateJobStatus(),
    },
    { status: 202 },
  );
}
