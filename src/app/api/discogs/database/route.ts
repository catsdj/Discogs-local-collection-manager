import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { rejectIfNotLocal } from '@/lib/requestSecurity';

export async function GET(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '25');
    const styles = searchParams.get('styles') || '';
    const search = searchParams.get('search') || '';
    const getAllStyles = searchParams.get('get_all_styles') === 'true';

    const db = getDatabase();
    const totalCollectionResult = db.getDb().prepare('SELECT COUNT(*) as count FROM releases').get() as { count: number };

    // Get all styles if requested
    if (getAllStyles) {
      const stylesData = db.getDb().prepare(`
        SELECT s.name, COUNT(rs.release_id) as count
        FROM styles s
        LEFT JOIN release_styles rs ON s.id = rs.style_id
        GROUP BY s.id, s.name
        ORDER BY s.name
      `).all() as Array<{ name: string; count: number }>;

      const totalReleases = db.getDb().prepare('SELECT COUNT(*) as count FROM releases').get() as { count: number };

      return NextResponse.json({
        availableStyles: stylesData.map((s: { name: string; count: number }) => s.name),
        totalCollection: totalReleases.count,
        styleCounts: stylesData.reduce((acc: Record<string, number>, style: { name: string; count: number }) => {
          acc[style.name] = style.count;
          return acc;
        }, {} as Record<string, number>)
      });
    }

    // Build the main query with filters
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    // Style filter
    if (styles) {
      const selectedStyles = styles.split(',').filter(s => s.length > 0);
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
    }

    // Search filter
    if (search) {
      whereConditions.push(`
        (r.title LIKE ? OR EXISTS (
          SELECT 1 FROM release_artists ra 
          JOIN artists a ON ra.artist_id = a.id 
          WHERE ra.release_id = r.id AND a.name LIKE ?
        ))
      `);
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

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
        r.created_at,
        r.updated_at,
        r.last_sync_at,
        r.sync_status,
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
      ${whereClause}
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const releases = db.getDb().prepare(releasesQuery).all(...queryParams, perPage, offset) as any[];

    // Transform releases to match the expected format and include videos/tracklist
    const transformedReleases = releases.map(release => {
      console.log(`[DB ROUTE DEBUG] Processing release: ${release.title} (DB ID: ${release.id}, Discogs ID: ${release.discogs_id})`);
      
      // Get videos from database using internal ID
      const videos = db.getDb().prepare('SELECT * FROM videos WHERE release_id = ?').all(release.id) as any[];
      console.log(`[DB ROUTE DEBUG] Found ${videos.length} videos for ${release.title}`);
      
      // Get tracklist from database using internal ID
      const tracklist = db.getDb().prepare('SELECT * FROM tracks WHERE release_id = ? ORDER BY position').all(release.id) as any[];
      console.log(`[DB ROUTE DEBUG] Found ${tracklist.length} tracks for ${release.title}`);
      
      // Get price from database
      const priceData = db.getDb().prepare('SELECT * FROM prices WHERE release_id = ?').get(release.id) as any;
      
      return {
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
        videos: videos.map((video: any) => ({
          uri: video.uri,
          title: video.title,
          description: video.description || '',
          duration: video.duration || 0,
          embed: Boolean(video.embed),
          youtube_video_id: video.youtube_video_id
        })),
        tracklist: tracklist.map((track: any) => ({
          position: track.position,
          title: track.title,
          duration: track.duration || '',
          type_: track.type_ || ''
        })),
        priceInfo: priceData ? {
          lowest_price: priceData.lowest_price,
          currency: priceData.currency
        } : null,
        // Database-specific fields
        created_at: release.created_at,
        updated_at: release.updated_at,
        last_sync_at: release.last_sync_at,
        sync_status: release.sync_status
      };
    });

    const response = {
      releases: transformedReleases,
      pagination: {
        page,
        pages: totalPages,
        per_page: perPage,
        items: total
      },
      totalFiltered: total,
      totalCollection: totalCollectionResult.count
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Database API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collection data from database' },
      { status: 500 }
    );
  }
}
