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
      { status: 429 },
    );
  }

  try {
    const db = getDatabase();
    let newReleases = 0;
    let conditionsUpdated = 0;
    let errors = 0;

    console.log('Starting Update Collection job...');

    let collectionData: any[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const collectionUrl = `https://api.discogs.com/users/${config.discogsUsername}/collection/folders/0/releases?page=${page}&per_page=100`;

      const response = await secureFetch(collectionUrl, {
        headers: {
          'User-Agent': config.userAgent,
          'Authorization': `Discogs token=${config.discogsToken}`,
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

      console.log(`Fetched page ${page}: ${releases.length} items (total: ${collectionData.length})`);

      const pagination = result.pagination;
      hasMorePages = pagination && pagination.page < pagination.pages;
      page++;
    }

    console.log(`Total collection items fetched: ${collectionData.length}`);

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
            }
          }
        } catch (itemError: any) {
          console.error('Error processing release:', sanitizeErrorForLogging(itemError));
          errors++;
        }
      }
    });

    processCollectionData(collectionData);

    console.log(`Update Collection completed: ${newReleases} new, ${conditionsUpdated} updated, ${errors} errors`);

    return NextResponse.json({
      success: true,
      newReleases,
      conditionsUpdated,
      errors,
      totalProcessed: collectionData.length,
      message: `Successfully processed ${collectionData.length} releases`,
    });
  } catch (error: any) {
    console.error('Error in Update Collection job:', sanitizeErrorForLogging(error));
    return NextResponse.json(
      { error: 'Update failed', message: error.message || 'Unknown error' },
      { status: 500 },
    );
  }
}
