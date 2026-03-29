import { NextRequest, NextResponse } from 'next/server';
import { createSecureError } from '@/lib/security';
import { getDatabase } from '@/lib/database';
import { getDatabaseSyncService } from '@/lib/databaseSyncService';
import { withTiming } from '@/lib/performance';
import { rejectIfNotLocal } from '@/lib/requestSecurity';
import type { 
  DatabaseReleaseRow, 
  DatabaseVideoRow, 
  DatabaseTrackRow, 
  ReleaseIdMapping,
  VideosByInternalId,
  TracksByInternalId,
  DatabaseStyleRow
} from '@/types/database';

// Initialize database sync service
let syncServiceInitialized = false;
if (!syncServiceInitialized) {
  try {
    getDatabaseSyncService();
    syncServiceInitialized = true;
    console.log('🔄 Database sync service initialized');
  } catch (error) {
    console.error('❌ Failed to initialize database sync service:', error);
  }
}

function sanitizeTextParam(value: string | null, maxLength: number = 100): string {
  if (!value) {
    return '';
  }

  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function sanitizeListParam(value: string | null, itemMaxLength: number = 60): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => sanitizeTextParam(item, itemMaxLength))
    .filter(Boolean);
}

function parseOptionalInteger(value: string | null, min: number, max: number): number | null {
  if (!value) {
    return null;
  }

  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function parseOptionalDate(value: string | null): string {
  if (!value) {
    return '';
  }

  const normalized = sanitizeTextParam(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

export async function GET(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page') || '1';
    const perPageParam = searchParams.get('per_page') || '25';
    const stylesParam = searchParams.get('styles') || '';
    const sortColumnParam = searchParams.get('sort_column') || 'date_added';
    const sortDirectionParam = searchParams.get('sort_direction') || 'desc';
    const includeDetails = searchParams.get('include_details') === 'true';
    const includeAllDetails = searchParams.get('include_all_details') === 'true';
    const artistFilter = sanitizeTextParam(searchParams.get('artist'));
    const titleFilter = sanitizeTextParam(searchParams.get('title'));
    const labelFilter = sanitizeTextParam(searchParams.get('label'));
    const yearValueFilter = sanitizeTextParam(searchParams.get('year_value'), 4);
    const yearMin = parseOptionalInteger(searchParams.get('year_min'), 0, 9999);
    const yearMax = parseOptionalInteger(searchParams.get('year_max'), 0, 9999);
    const dateAddedMin = parseOptionalDate(searchParams.get('date_added_min'));
    const dateAddedMax = parseOptionalDate(searchParams.get('date_added_max'));
    const styleFilter = sanitizeListParam(searchParams.get('style_filter'));
    const shouldIncludeDetails = includeDetails || includeAllDetails;

    // Validate and sanitize inputs
    let page: number, perPage: number;
    try {
      page = parseInt(pageParam);
      perPage = parseInt(perPageParam);
      
      if (isNaN(page) || page < 1 || page > 10000) {
        throw new Error('Invalid page number');
      }
      if (isNaN(perPage) || perPage < 1 || perPage > 1000) {
        throw new Error('Invalid per_page number');
      }
    } catch {
      const secureError = createSecureError('Invalid pagination parameters', 400);
      return NextResponse.json(secureError, { status: secureError.status });
    }

    // Validate styles parameter
    const selectedStyles = sanitizeListParam(stylesParam);

    // Validate sorting parameters
    const validSortColumns = ['date_added', 'title', 'year', 'artist', 'label', 'styles', 'condition', 'lowest_price'];
    const sortColumn = validSortColumns.includes(sortColumnParam) ? sortColumnParam : 'date_added';
    const sortDirection = ['asc', 'desc'].includes(sortDirectionParam) ? sortDirectionParam : 'desc';

    // Generate ORDER BY clause based on sorting parameters
    const getOrderByClause = (sortCol: string, sortDir: string) => {
      switch (sortCol) {
        case 'date_added':
          return `ORDER BY r.date_added ${sortDir.toUpperCase()}`;
        case 'title':
          return `ORDER BY r.title ${sortDir.toUpperCase()}`;
        case 'year':
          return `ORDER BY r.year ${sortDir.toUpperCase()}`;
        case 'artist':
          return `ORDER BY COALESCE(a.name, '') ${sortDir.toUpperCase()}`;
        case 'label':
          return `ORDER BY COALESCE(l.name, '') ${sortDir.toUpperCase()}`;
        case 'styles':
          return `ORDER BY COALESCE(s.name, '') ${sortDir.toUpperCase()}`;
        case 'condition':
          return `ORDER BY COALESCE(r.media_condition, '') ${sortDir.toUpperCase()}, COALESCE(r.sleeve_condition, '') ${sortDir.toUpperCase()}`;
        case 'lowest_price':
          return `ORDER BY CASE WHEN p.lowest_price IS NULL THEN 1 ELSE 0 END ASC, p.lowest_price ${sortDir.toUpperCase()}`;
        default:
          return `ORDER BY r.date_added DESC`;
      }
    };

    const db = getDatabase();

    // Build the main query with filters
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    // Style filter
    if (selectedStyles.length > 0) {
      const stylePlaceholders = selectedStyles.map(() => '?').join(',');
      whereConditions.push(`
        r.id IN (
          SELECT rs.release_id 
          FROM release_styles rs 
          JOIN styles s ON rs.style_id = s.id 
          WHERE s.name IN (${stylePlaceholders})
        )
      `);
      queryParams.push(...selectedStyles);
    }

    if (artistFilter) {
      whereConditions.push(`
        EXISTS (
          SELECT 1
          FROM release_artists ra_filter
          JOIN artists a_filter ON ra_filter.artist_id = a_filter.id
          WHERE ra_filter.release_id = r.id
            AND a_filter.name LIKE ? COLLATE NOCASE
        )
      `);
      queryParams.push(`%${artistFilter}%`);
    }

    if (titleFilter) {
      whereConditions.push(`r.title LIKE ? COLLATE NOCASE`);
      queryParams.push(`%${titleFilter}%`);
    }

    if (labelFilter) {
      whereConditions.push(`
        EXISTS (
          SELECT 1
          FROM release_labels rl_filter
          JOIN labels l_filter ON rl_filter.label_id = l_filter.id
          WHERE rl_filter.release_id = r.id
            AND l_filter.name LIKE ? COLLATE NOCASE
        )
      `);
      queryParams.push(`%${labelFilter}%`);
    }

    if (yearMin !== null) {
      whereConditions.push(`r.year >= ?`);
      queryParams.push(yearMin);
    }

    if (yearMax !== null) {
      whereConditions.push(`r.year <= ?`);
      queryParams.push(yearMax);
    }

    if (yearValueFilter) {
      whereConditions.push(`CAST(r.year AS TEXT) LIKE ?`);
      queryParams.push(`%${yearValueFilter}%`);
    }

    if (dateAddedMin) {
      whereConditions.push(`date(r.date_added) >= date(?)`);
      queryParams.push(dateAddedMin);
    }

    if (dateAddedMax) {
      whereConditions.push(`date(r.date_added) <= date(?)`);
      queryParams.push(dateAddedMax);
    }

    if (styleFilter.length > 0) {
      const styleConditions = styleFilter.map(() => `s_filter.name LIKE ? COLLATE NOCASE`).join(' OR ');
      whereConditions.push(`
        EXISTS (
          SELECT 1
          FROM release_styles rs_filter
          JOIN styles s_filter ON rs_filter.style_id = s_filter.id
          WHERE rs_filter.release_id = r.id
            AND (${styleConditions})
        )
      `);
      styleFilter.forEach((style) => queryParams.push(`%${style}%`));
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const totalCollectionResult = db.getDb().prepare('SELECT COUNT(*) as total FROM releases').get() as { total: number };

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT r.id) as total
      FROM releases r
      ${whereClause}
    `;
    const totalResult = db.getDb().prepare(countQuery).get(...queryParams) as { total: number };
    const total = totalResult.total;

    // Calculate pagination
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const offset = (page - 1) * perPage;

    // Get releases with all related data
    const releasesQuery = `
      SELECT 
        r.id,
        r.discogs_id,
        r.title,
        r.year,
        r.cover_image_url,
        r.date_added,
        r.media_condition,
        r.sleeve_condition,
        r.created_at,
        r.updated_at,
        r.last_sync_at,
        r.sync_status,
        p.lowest_price,
        p.currency,
        GROUP_CONCAT(DISTINCT a.name) as artists,
        GROUP_CONCAT(DISTINCT s.name) as styles,
        GROUP_CONCAT(DISTINCT g.name) as genres,
        GROUP_CONCAT(DISTINCT l.name) as labels
      FROM releases r
      LEFT JOIN release_artists ra ON r.id = ra.release_id
      LEFT JOIN artists a ON ra.artist_id = a.id
      LEFT JOIN release_styles rs ON r.id = rs.release_id
      LEFT JOIN styles s ON rs.style_id = s.id
      LEFT JOIN release_genres rg ON r.id = rg.release_id
      LEFT JOIN genres g ON rg.genre_id = g.id
      LEFT JOIN release_labels rl ON r.id = rl.release_id
      LEFT JOIN labels l ON rl.label_id = l.id
      LEFT JOIN prices p ON r.id = p.release_id
      ${whereClause}
      GROUP BY r.id
      ${getOrderByClause(sortColumn, sortDirection)}
      LIMIT ? OFFSET ?
    `;

    // ============================================================
    // PHASE 1: Query base release data with aggregated relationships
    // ============================================================
    const releases = await withTiming(
      'fetch-releases-main-query',
      async () => db.getDb().prepare(releasesQuery).all(...queryParams, perPage, offset) as DatabaseReleaseRow[],
      { page, perPage, selectedStyles: selectedStyles.length }
    );

    // Transform releases to match the expected format
    let transformedReleases = releases.map(release => ({
      id: release.discogs_id,
      basic_information: {
        id: release.discogs_id,
        title: release.title,
        year: release.year || 0,
        cover_image: release.cover_image_url || '',
        artists: release.artists ? release.artists.split(',').map((name: string) => ({ name: name.trim() })) : [],
        styles: release.styles ? release.styles.split(',').map((s: string) => s.trim()) : [],
        genres: release.genres ? release.genres.split(',').map((g: string) => g.trim()) : [],
        labels: release.labels ? release.labels.split(',').map((name: string) => ({ name: name.trim() })) : []
      },
      date_added: release.date_added,
      media_condition: release.media_condition || 'Unknown',
      sleeve_condition: release.sleeve_condition || 'Unknown',
      videos: [], // Will be populated from database
      tracklist: [], // Will be populated from database
      priceInfo: release.lowest_price ? {
        lowest_price: release.lowest_price,
        currency: release.currency || 'USD'
      } : null,
      // Database-specific fields
      created_at: release.created_at,
      updated_at: release.updated_at,
      last_sync_at: release.last_sync_at,
      sync_status: release.sync_status
    }));

    // ============================================================
    // PHASE 2: Batch fetch related data (videos & tracks)
    // This avoids N+1 query problem by fetching all data in 3 queries total
    // ============================================================
    
    // Step 1: Map Discogs IDs to internal database IDs
    if (shouldIncludeDetails && transformedReleases.length > 0) {
      const discogsIds = transformedReleases.map(r => r.id);
      const idPlaceholders = discogsIds.map(() => '?').join(',');
      const releaseIdMappings = await withTiming(
        'fetch-internal-ids',
        async () => db.getDb().prepare(
          `SELECT id, discogs_id FROM releases WHERE discogs_id IN (${idPlaceholders})`
        ).all(...discogsIds) as ReleaseIdMapping[],
        { releaseCount: discogsIds.length }
      );

      const internalIdMap = new Map(releaseIdMappings.map(r => [r.discogs_id, r.id]));

      // Step 2: Batch fetch all videos using internal IDs
      const internalIds = Array.from(internalIdMap.values());
      const internalIdPlaceholders = internalIds.map(() => '?').join(',');

      const allVideos = internalIds.length > 0 
        ? await withTiming(
            'batch-fetch-videos',
            async () => db.getDb().prepare(
              `SELECT * FROM videos WHERE release_id IN (${internalIdPlaceholders})`
            ).all(...internalIds) as DatabaseVideoRow[],
            { releaseCount: internalIds.length }
          )
        : [];

      // Step 3: Batch fetch all tracks using internal IDs
      const allTracks = internalIds.length > 0
        ? await withTiming(
            'batch-fetch-tracks',
            async () => db.getDb().prepare(
              `SELECT * FROM tracks WHERE release_id IN (${internalIdPlaceholders}) ORDER BY release_id, position`
            ).all(...internalIds) as DatabaseTrackRow[],
            { releaseCount: internalIds.length }
          )
        : [];

      // Step 4: Group videos and tracks by internal release ID for efficient lookup
      const videosByInternalId: VideosByInternalId = new Map();
      const tracksByInternalId: TracksByInternalId = new Map();

      allVideos.forEach(video => {
        if (!videosByInternalId.has(video.release_id)) {
          videosByInternalId.set(video.release_id, []);
        }
        videosByInternalId.get(video.release_id)!.push(video);
      });

      allTracks.forEach(track => {
        if (!tracksByInternalId.has(track.release_id)) {
          tracksByInternalId.set(track.release_id, []);
        }
        tracksByInternalId.get(track.release_id)!.push(track);
      });

      console.log(`[PERF] Batch loaded ${allVideos.length} videos and ${allTracks.length} tracks for ${transformedReleases.length} releases`);

      // ============================================================
      // PHASE 3: Hydrate releases with videos and tracks
      // ============================================================
      transformedReleases = transformedReleases.map((release: any) => {
        const internalId = internalIdMap.get(release.id);

        if (!internalId) {
          console.warn(`[WARN] Release ${release.id} not found in database during hydration`);
          return release;
        }

        const videos = videosByInternalId.get(internalId) || [];
        const tracklist = tracksByInternalId.get(internalId) || [];

        return {
          ...release,
          videos: videos.map((video: DatabaseVideoRow) => ({
            uri: video.uri,
            title: video.title,
            description: video.description || '',
            duration: video.duration || 0,
            embed: Boolean(video.embed),
            youtube_video_id: video.youtube_video_id
          })),
          tracklist: tracklist.map((track: DatabaseTrackRow) => ({
            position: track.position,
            title: track.title,
            duration: track.duration || '',
            type_: track.type_ || ''
          }))
        };
      });
    }

    // ============================================================
    // PHASE 4: Build final response with metadata
    // ============================================================
    const allStyles = db.getDb().prepare('SELECT DISTINCT name FROM styles ORDER BY name').all() as DatabaseStyleRow[];

    const response = {
      releases: transformedReleases,
      pagination: {
        page,
        pages: totalPages,
        per_page: perPage,
        items: total
      },
      availableStyles: allStyles.map(s => s.name),
      totalFiltered: total,
      totalCollection: totalCollectionResult.total,
      includeDetails: shouldIncludeDetails
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Database API error:', error);
    const secureError = createSecureError('Failed to fetch collection data from database', 500);
    return NextResponse.json(secureError, { status: secureError.status });
  }
}
