import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getDatabase } from '@/lib/database';
import { secureFetch, sanitizeErrorForLogging } from '@/lib/secureFetch';
import { rateLimit } from '@/lib/rateLimiter';
import { rejectIfNotLocal } from '@/lib/requestSecurity';

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

export async function POST(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  const rateLimitResult = rateLimit(request, '/api/discogs/update-collection');
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', message: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  try {
    const db = getDatabase();
    let newReleases = 0;
    let conditionsUpdated = 0;
    let errors = 0;

    console.log('🔄 Starting Update Collection job...');

    // Fetch collection data from Discogs
    let collectionData: any[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const collectionUrl = `https://api.discogs.com/users/${config.discogsUsername}/collection/folders/0/releases?page=${page}&per_page=100`;
      
      const response = await secureFetch(collectionUrl, {
        headers: {
          'User-Agent': config.userAgent,
          'Authorization': `Discogs token=${config.discogsToken}`
        },
        timeout: 30000,
      });

      if (!response.ok) {
        console.error(`Failed to fetch collection page ${page}: ${response.status}`);
        break;
      }

      const result = await response.json();
      const releases = result.releases || [];
      collectionData = collectionData.concat(releases);

      console.log(`📚 Fetched page ${page}: ${releases.length} items (total: ${collectionData.length})`);

      // Check if there are more pages
      const pagination = result.pagination;
      hasMorePages = pagination && pagination.page < pagination.pages;
      page++;
    }

    console.log(`📚 Total collection items fetched: ${collectionData.length}`);

    // Process each release
    for (const item of collectionData) {
      try {
        const discogsId = item.basic_information?.id || item.id;
        const existingRelease = db.getDb().prepare('SELECT id FROM releases WHERE discogs_id = ?').get(discogsId) as IdRow | undefined;

        if (!existingRelease) {
          // New release - add to database
          const basicInfo = item.basic_information;
          const mediaCondition = item.media_condition || item.notes?.find((n: any) => n.field_id === 1)?.value || 'Unknown';
          const sleeveCondition = item.sleeve_condition || item.notes?.find((n: any) => n.field_id === 2)?.value || 'Unknown';

          const result = db.getDb().prepare(`
            INSERT INTO releases (
              discogs_id, title, year, cover_image_url, date_added,
              media_condition, sleeve_condition, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
          `).run(
            discogsId,
            basicInfo?.title || 'Unknown',
            basicInfo?.year || null,
            basicInfo?.cover_image || basicInfo?.thumb || null,
            item.date_added,
            mediaCondition,
            sleeveCondition
          );

          const newReleaseId = Number(result.lastInsertRowid);

          // Add artists
          if (basicInfo?.artists) {
            for (let i = 0; i < basicInfo.artists.length; i++) {
              const artistName = basicInfo.artists[i].name;
              let artist = db.getDb().prepare('SELECT id FROM artists WHERE name = ?').get(artistName) as IdRow | undefined;
              
              if (!artist) {
                const artistResult = db.getDb().prepare('INSERT INTO artists (name) VALUES (?)').run(artistName);
                artist = { id: Number(artistResult.lastInsertRowid) };
              }
              
              db.getDb().prepare('INSERT INTO release_artists (release_id, artist_id, position) VALUES (?, ?, ?)').run(newReleaseId, Number(artist.id), i);
            }
          }

          // Add styles, genres, labels similarly
          if (basicInfo?.styles) {
            for (const styleName of basicInfo.styles) {
              let style = db.getDb().prepare('SELECT id FROM styles WHERE name = ?').get(styleName) as IdRow | undefined;
              if (!style) {
                const styleResult = db.getDb().prepare('INSERT INTO styles (name) VALUES (?)').run(styleName);
                style = { id: Number(styleResult.lastInsertRowid) };
              }
              db.getDb().prepare('INSERT OR IGNORE INTO release_styles (release_id, style_id) VALUES (?, ?)').run(newReleaseId, Number(style.id));
            }
          }

          if (basicInfo?.genres) {
            for (const genreName of basicInfo.genres) {
              let genre = db.getDb().prepare('SELECT id FROM genres WHERE name = ?').get(genreName) as IdRow | undefined;
              if (!genre) {
                const genreResult = db.getDb().prepare('INSERT INTO genres (name) VALUES (?)').run(genreName);
                genre = { id: Number(genreResult.lastInsertRowid) };
              }
              db.getDb().prepare('INSERT OR IGNORE INTO release_genres (release_id, genre_id) VALUES (?, ?)').run(newReleaseId, Number(genre.id));
            }
          }

          if (basicInfo?.labels) {
            for (let i = 0; i < basicInfo.labels.length; i++) {
              const labelName = basicInfo.labels[i].name;
              let label = db.getDb().prepare('SELECT id FROM labels WHERE name = ?').get(labelName) as IdRow | undefined;
              if (!label) {
                const labelResult = db.getDb().prepare('INSERT INTO labels (name) VALUES (?)').run(labelName);
                label = { id: Number(labelResult.lastInsertRowid) };
              }
              db.getDb().prepare('INSERT OR IGNORE INTO release_labels (release_id, label_id, position) VALUES (?, ?, ?)').run(newReleaseId, Number(label.id), i);
            }
          }

          newReleases++;
          console.log(`   ➕ Added new release: "${basicInfo?.title}" (ID: ${discogsId})`);
        } else {
          // Existing release - update condition if available
          const mediaCondition = item.media_condition || item.notes?.find((n: any) => n.field_id === 1)?.value;
          const sleeveCondition = item.sleeve_condition || item.notes?.find((n: any) => n.field_id === 2)?.value;

          if (mediaCondition || sleeveCondition) {
            db.getDb().prepare(`
              UPDATE releases 
              SET media_condition = COALESCE(?, media_condition),
                  sleeve_condition = COALESCE(?, sleeve_condition),
                  updated_at = datetime('now')
              WHERE id = ?
            `).run(mediaCondition || null, sleeveCondition || null, Number(existingRelease.id));
            
            conditionsUpdated++;
          }
        }
      } catch (itemError: any) {
        console.error(`Error processing release:`, sanitizeErrorForLogging(itemError));
        errors++;
      }
    }

    console.log(`✅ Update Collection completed: ${newReleases} new, ${conditionsUpdated} updated, ${errors} errors`);

    return NextResponse.json({
      success: true,
      newReleases,
      conditionsUpdated,
      errors,
      totalProcessed: collectionData.length,
      message: `Successfully processed ${collectionData.length} releases`
    });

  } catch (error: any) {
    console.error('Error in Update Collection job:', sanitizeErrorForLogging(error));
    return NextResponse.json(
      { error: 'Update failed', message: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

