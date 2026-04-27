import { getDatabase } from './database';
import { config } from './config';
import { rateLimitedFetch as secureRateLimitedFetch, sanitizeErrorForLogging } from './secureFetch';

interface SyncJobStatus {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  processed: number;
  startTime: Date | null;
  endTime: Date | null;
  error: string | null;
  results: {
    releasesUpdated: number;
    releasesSkipped: number;
    errors: number;
  };
}

class DatabaseSyncService {
  private jobStatus: SyncJobStatus = {
    id: '',
    status: 'idle',
    progress: 0,
    total: 0,
    processed: 0,
    startTime: null,
    endTime: null,
    error: null,
    results: {
      releasesUpdated: 0,
      releasesSkipped: 0,
      errors: 0
    }
  };

  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
  
  // Simplified rate limiting state
  private requestsThisMinute = 0;
  private lastMinuteReset = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 50; // Conservative rate limit
  private readonly REQUEST_DELAY_MS = 1200; // 1.2 seconds between requests
  
  // Error tracking
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 5; // Stop after 5 consecutive errors
  private readonly MAX_401_ERRORS = 2; // Stop after 2 consecutive 401 errors

  constructor() {
    // Note: Periodic sync disabled - sync is now on-demand only
    // this.startPeriodicSync();
    console.log('🔄 Database sync service initialized (on-demand mode)');
  }

  private async rateLimitedFetch(url: string, options: RequestInit): Promise<Response> {
    try {
      // Check rate limiting
      const now = Date.now();
      if (now - this.lastMinuteReset >= 60000) {
        this.requestsThisMinute = 0;
        this.lastMinuteReset = now;
      }

      if (this.requestsThisMinute >= this.MAX_REQUESTS_PER_MINUTE) {
        const waitTime = 60000 - (now - this.lastMinuteReset);
        console.log(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestsThisMinute = 0;
        this.lastMinuteReset = Date.now();
      }

      // Make the request using secure fetch with timeout
      const response = await secureRateLimitedFetch(
        url,
        {
          ...options,
          timeout: 30000, // 30 second timeout
        },
        (waitTime) => {
          console.log(`⏳ Rate limited by API, waiting ${Math.ceil(waitTime / 1000)} seconds...`);
        }
      );
      
      this.requestsThisMinute++;

      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY_MS));

      return response;

    } catch (error) {
      // Sanitize error before logging
      console.error('Error in rateLimitedFetch:', sanitizeErrorForLogging(error));
      throw error;
    }
  }

  private handleMissingPrice(db: any, releaseId: number): void {
    // Handle case where price is not on marketplace
    const existingPrice = db.getDb().prepare('SELECT id, lowest_price, consecutive_failures, last_marketplace_check FROM prices WHERE release_id = ?').get(releaseId);
    
    if (existingPrice && existingPrice.lowest_price) {
      // We have a price in DB but not on marketplace - mark as potentially stale
      const consecutiveFailures = (existingPrice.consecutive_failures || 0) + 1;
      
      if (consecutiveFailures >= 2) {
        // Flag as stale after 2 consecutive failures to find on marketplace
        db.getDb().prepare(`
          UPDATE prices 
          SET price_stale = 1,
              consecutive_failures = ?,
              last_marketplace_check = datetime('now')
          WHERE release_id = ?
        `).run(consecutiveFailures, releaseId);
        console.log(`   ⚠️  Price marked as stale (not on marketplace for ${consecutiveFailures} checks)`);
      } else {
        // Increment consecutive failures
        db.getDb().prepare(`
          UPDATE prices 
          SET consecutive_failures = ?,
              last_marketplace_check = datetime('now')
          WHERE release_id = ?
        `).run(consecutiveFailures, releaseId);
        console.log(`   ℹ️  Price check: not on marketplace (attempt ${consecutiveFailures}/2)`);
      }
    } else {
      // No price in DB and not on marketplace either
      const currentData = existingPrice || { consecutive_failures: 0 };
      const consecutiveFailures = (currentData.consecutive_failures || 0) + 1;
      
      if (consecutiveFailures >= 2) {
        // Flag as "no listing available" after 2 consecutive failures
        if (existingPrice) {
          db.getDb().prepare(`
            UPDATE prices 
            SET no_listing_available = 1,
                consecutive_failures = ?,
                last_marketplace_check = datetime('now')
            WHERE release_id = ?
          `).run(consecutiveFailures, releaseId);
        } else {
          db.getDb().prepare(`
            INSERT INTO prices (release_id, currency, price_source, last_updated, no_listing_available, consecutive_failures, last_marketplace_check)
            VALUES (?, 'EUR', 'discogs', datetime('now'), 1, ?, datetime('now'))
          `).run(releaseId, consecutiveFailures);
        }
        console.log(`   ⏭️  Flagged as "no listing available" after ${consecutiveFailures} consecutive failures`);
      } else {
        // Increment consecutive failures
        if (existingPrice) {
          db.getDb().prepare(`
            UPDATE prices 
            SET consecutive_failures = ?,
                last_marketplace_check = datetime('now')
            WHERE release_id = ?
          `).run(consecutiveFailures, releaseId);
        } else {
          db.getDb().prepare(`
            INSERT INTO prices (release_id, currency, price_source, last_updated, consecutive_failures, last_marketplace_check)
            VALUES (?, 'EUR', 'discogs', datetime('now'), ?, datetime('now'))
          `).run(releaseId, consecutiveFailures);
        }
        console.log(`   ℹ️  No listing found (attempt ${consecutiveFailures}/2)`);
      }
    }
  }

  private startPeriodicSync() {
    // Run initial sync after 1 minute
    setTimeout(() => {
      this.runSyncJob();
    }, 60000);

    // Then run every 6 hours
    this.syncInterval = setInterval(() => {
      this.runSyncJob();
    }, this.SYNC_INTERVAL_MS);

    console.log('🔄 Database sync service started - will run every 6 hours');
  }

  async runSyncJob(): Promise<void> {
    if (this.jobStatus.status === 'running') {
      console.log('⏳ Sync job already running, skipping...');
      return;
    }

    const jobId = `sync_${Date.now()}`;
    this.jobStatus = {
      id: jobId,
      status: 'running',
      progress: 0,
      total: 0,
      processed: 0,
      startTime: new Date(),
      endTime: null,
      error: null,
      results: {
        releasesUpdated: 0,
        releasesSkipped: 0,
        errors: 0
      }
    };

    console.log(`🚀 Starting database sync job ${jobId}`);

    try {
      const db = getDatabase();
      
      // NOTE: Collection data fetching and new release checking moved to "Update Collection" job
      // This "Get Release Data" job only fetches marketplace prices and videos for existing releases
      console.log('📊 "Get Release Data" - Fetching marketplace prices and videos for existing releases');
      console.log('💡 Use "Update Collection" to check for new releases and update conditions\n');

      // Get releases that need price/video updates (NOT conditions - that's in Update Collection job)
      // This is the "Get Release Data" job - fetches marketplace prices and videos only.
      // Existing marketplace prices are refreshed after 1 week so stale prices do not linger indefinitely.
      const releasesToSync = db.getDb().prepare(`
        SELECT r.id, r.discogs_id, r.title, r.last_sync_at, r.sync_status, r.media_condition, r.sleeve_condition,
               CASE WHEN (
                 p.id IS NULL
                 OR (p.lowest_price IS NULL AND (p.no_listing_available = 0 OR p.no_listing_available IS NULL))
                 OR (
                   p.lowest_price IS NOT NULL
                   AND (
                     p.last_marketplace_check IS NULL
                     OR datetime(p.last_marketplace_check) < datetime('now', '-7 days')
                     OR COALESCE(p.price_stale, 0) = 1
                   )
                 )
               ) THEN 1 ELSE 0 END as missing_price,
               0 as missing_condition,
               (SELECT COUNT(*) FROM videos v WHERE v.release_id = r.id) as video_count,
               (SELECT COUNT(*) FROM tracks t WHERE t.release_id = r.id) as track_count,
               COALESCE(p.no_listing_available, 0) as price_flagged,
               COALESCE(r.no_videos_available, 0) as videos_flagged,
               0 as condition_flagged
        FROM releases r
        LEFT JOIN prices p ON r.id = p.release_id
        WHERE (
          -- Missing price, stale existing price, or price due for refresh
          (
            p.id IS NULL
            OR (p.lowest_price IS NULL AND (p.no_listing_available = 0 OR p.no_listing_available IS NULL))
            OR (
              p.lowest_price IS NOT NULL
              AND (
                p.last_marketplace_check IS NULL
                OR datetime(p.last_marketplace_check) < datetime('now', '-7 days')
                OR COALESCE(p.price_stale, 0) = 1
              )
            )
          )
          -- Missing videos AND not flagged as unavailable
          OR (NOT EXISTS (SELECT 1 FROM videos v WHERE v.release_id = r.id) AND (r.no_videos_available = 0 OR r.no_videos_available IS NULL))
          -- Missing tracklist (always try - tracklist should always exist)
          OR NOT EXISTS (SELECT 1 FROM tracks t WHERE t.release_id = r.id)
        )
        ORDER BY r.created_at ASC
      `).all() as Array<{
        id: number;
        discogs_id: number;
        title: string;
        last_sync_at: string | null;
        sync_status: string;
        media_condition: string | null;
        sleeve_condition: string | null;
        missing_price: number;
        missing_condition: number;
        video_count: number;
        track_count: number;
      }>;

      const pricesToRefresh = releasesToSync.filter(r => r.missing_price).length;
      const missingVideos = releasesToSync.filter(r => r.video_count === 0).length;
      const missingTracks = releasesToSync.filter(r => r.track_count === 0).length;

      this.jobStatus.total = releasesToSync.length;
      console.log(`📊 "Get Release Data" job - Found ${releasesToSync.length} releases to sync:`);
      console.log(`   💰 ${pricesToRefresh} prices missing or due for refresh`);
      console.log(`   🎥 ${missingVideos} missing videos`);
      console.log(`   🎵 ${missingTracks} missing tracklist`);
      console.log(`   (Conditions handled by "Update Collection" job)`);

      if (releasesToSync.length === 0) {
        this.jobStatus.status = 'completed';
        this.jobStatus.endTime = new Date();
        console.log('✅ No releases need syncing');
        return;
      }

      // Process releases sequentially to respect rate limits
      for (let i = 0; i < releasesToSync.length; i++) {
        const release = releasesToSync[i];
        
        try {
          console.log(`🔄 Syncing release ${i + 1}/${releasesToSync.length}: "${release.title}" (ID: ${release.discogs_id})`);
          
          const missingItems = [];
          if (release.missing_price) missingItems.push('💰 price refresh');
          if (release.video_count === 0) missingItems.push('🎥 videos');
          if (release.track_count === 0) missingItems.push('🎵 tracklist');
          
          if (missingItems.length > 0) {
            console.log(`   Missing: ${missingItems.join(', ')}`);
          }
          
          const syncResult = await this.syncRelease(release.discogs_id, db);
          this.jobStatus.results.releasesUpdated++;
          this.consecutiveErrors = 0; // Reset error counter on success
          
          // Only log success if we actually got price data, or clarify what was synced
          if (syncResult?.priceUpdated) {
            console.log(`   ✅ Synced with price: ${syncResult.price}`);
          } else {
            console.log(`   ✅ Synced (no marketplace price available)`);
          }
        } catch (error: any) {
          console.error(`   ❌ Error syncing release ${release.discogs_id}:`, error.message);
          this.jobStatus.results.errors++;
          this.consecutiveErrors++;
          
          // Check specifically for 401 errors FIRST (authentication issues)
          if (error.message.includes('401')) {
            console.log(`🔐 401 Authentication error detected!`);
            if (this.consecutiveErrors >= this.MAX_401_ERRORS) {
              console.log(`🛑 Stopping sync due to ${this.consecutiveErrors} consecutive 401 authentication errors`);
              this.jobStatus.status = 'failed';
              this.jobStatus.error = `Stopped due to ${this.consecutiveErrors} consecutive 401 authentication errors`;
              this.jobStatus.endTime = new Date();
              break;
            }
          } else {
            // Check if we should stop due to other consecutive errors
            if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
              console.log(`🛑 Stopping sync due to ${this.consecutiveErrors} consecutive errors`);
              this.jobStatus.status = 'failed';
              this.jobStatus.error = `Stopped due to ${this.consecutiveErrors} consecutive errors`;
              this.jobStatus.endTime = new Date();
              break;
            }
          }
          
          // Log the error to sync_logs
          await db.createSyncLog({
            release_id: release.id,
            sync_type: 'metadata',
            status: 'failed',
            error_message: error.message,
            records_updated: 0,
            sync_duration_ms: 0
          });
        }
        
        this.jobStatus.processed++;
        this.jobStatus.progress = Math.round((this.jobStatus.processed / this.jobStatus.total) * 100);
        
        // Progress update every 10 releases
        if ((i + 1) % 10 === 0) {
          console.log(`📊 Progress: ${i + 1}/${releasesToSync.length} (${this.jobStatus.progress}%)`);
        }
      }

      this.jobStatus.status = 'completed';
      this.jobStatus.endTime = new Date();
      
      const duration = this.jobStatus.endTime.getTime() - this.jobStatus.startTime!.getTime();
      console.log(`✅ Sync job ${jobId} completed in ${Math.round(duration / 1000)}s`);
      console.log(`📊 Results: ${this.jobStatus.results.releasesUpdated} updated, ${this.jobStatus.results.errors} errors`);

    } catch (error: any) {
      this.jobStatus.status = 'failed';
      this.jobStatus.error = error.message;
      this.jobStatus.endTime = new Date();
      console.error(`❌ Sync job ${jobId} failed:`, error.message);
    }
  }

  private async syncRelease(discogsId: number, db: any): Promise<{ priceUpdated: boolean; price?: string } | void> {
    const startTime = Date.now();
    let priceUpdated = false;
    let priceValue = '';
    let releaseIdForLog: number | null = null;
    
    try {
      // Fetch release data from Discogs API with rate limiting
      const discogsUrl = `https://api.discogs.com/releases/${discogsId}`;
      const response = await this.rateLimitedFetch(discogsUrl, {
        headers: {
          'User-Agent': config.userAgent,
          'Authorization': `Discogs token=${config.discogsToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Discogs API returned ${response.status}: ${response.statusText}`);
      }

      const releaseData = await response.json();
      
      // Update the release record
      const release = await db.getReleaseByDiscogsId(discogsId);
      if (!release) {
        throw new Error(`Release ${discogsId} not found in database`);
      }
      releaseIdForLog = release.id;

      // NOTE: Condition extraction removed - handled by "Update Collection" job
      // This "Get Release Data" job only fetches marketplace prices and videos

      // Update basic information (metadata only, no conditions)
      await db.updateRelease(release.id, {
        title: releaseData.title,
        year: releaseData.year || null,
        cover_image_url: releaseData.images?.[0]?.uri || null,
        last_sync_at: new Date().toISOString(),
        sync_status: 'synced',
        metadata_version: (release.metadata_version || 0) + 1
      });

      // Fetch marketplace price data with proper currency and rate limiting
      try {
        const marketplaceUrl = `https://api.discogs.com/marketplace/stats/${discogsId}`;
        const marketplaceResponse = await this.rateLimitedFetch(marketplaceUrl, {
          headers: {
            'User-Agent': config.userAgent,
            'Authorization': `Discogs token=${config.discogsToken}`
          }
        });

        if (marketplaceResponse.ok) {
          const marketplaceData = await marketplaceResponse.json();
          
          if (marketplaceData.lowest_price && marketplaceData.lowest_price.value) {
            // Price found on marketplace!
            const existingPrice = db.getDb().prepare('SELECT id, lowest_price FROM prices WHERE release_id = ?').get(release.id);
            
            if (existingPrice) {
              db.getDb().prepare(`
                UPDATE prices 
                SET lowest_price = ?, 
                    currency = ?, 
                    last_updated = datetime('now'), 
                    updated_at = datetime('now'),
                    last_marketplace_check = datetime('now'),
                    consecutive_failures = 0,
                    price_stale = 0
                WHERE release_id = ?
              `).run(marketplaceData.lowest_price.value, marketplaceData.lowest_price.currency, release.id);
            } else {
              db.getDb().prepare(`
                INSERT INTO prices (release_id, lowest_price, currency, price_source, last_updated, last_marketplace_check, consecutive_failures, price_stale)
                VALUES (?, ?, ?, 'discogs', datetime('now'), datetime('now'), 0, 0)
              `).run(release.id, marketplaceData.lowest_price.value, marketplaceData.lowest_price.currency);
            }
            priceUpdated = true;
            priceValue = `${marketplaceData.lowest_price.value} ${marketplaceData.lowest_price.currency}`;
            console.log(`   💰 Price updated: ${priceValue}`);
          } else {
            // No price on marketplace but API returned OK
            this.handleMissingPrice(db, release.id);
          }
        } else {
          console.log(`   ⚠️ Failed to fetch price data: ${marketplaceResponse.status}`);
          if (marketplaceResponse.status === 401) {
            throw new Error(`401 Unauthorized: Marketplace API authentication failed`);
          }
          // Handle as missing price
          this.handleMissingPrice(db, release.id);
        }
      } catch (priceError: any) {
        console.log(`   ⚠️ Error fetching price data for release ${discogsId}:`, sanitizeErrorForLogging(priceError));
        // Re-throw 401 errors to trigger early stopping
        if (priceError.message && priceError.message.includes('401')) {
          throw priceError;
        }
        // Handle as missing price for other errors
        this.handleMissingPrice(db, release.id);
      }

      // Update artists
      if (releaseData.artists && releaseData.artists.length > 0) {
        // Remove existing artist links
        db.getDb().prepare('DELETE FROM release_artists WHERE release_id = ?').run(release.id);
        
        // Add new artist links
        for (let i = 0; i < releaseData.artists.length; i++) {
          const artist = releaseData.artists[i];
          const artistId = await db.createOrGetArtist(artist.name);
          await db.linkReleaseToArtist(release.id, artistId, i);
        }
      }

      // Update styles
      if (releaseData.styles && releaseData.styles.length > 0) {
        // Remove existing style links
        db.getDb().prepare('DELETE FROM release_styles WHERE release_id = ?').run(release.id);
        
        // Add new style links
        for (const styleName of releaseData.styles) {
          const styleId = await db.createOrGetStyle(styleName);
          await db.linkReleaseToStyle(release.id, styleId);
        }
      }

      // Update genres
      if (releaseData.genres && releaseData.genres.length > 0) {
        // Remove existing genre links
        db.getDb().prepare('DELETE FROM release_genres WHERE release_id = ?').run(release.id);
        
        // Add new genre links
        for (const genreName of releaseData.genres) {
          const genreId = await db.createOrGetGenre(genreName);
          await db.linkReleaseToGenre(release.id, genreId);
        }
      }

      // Update labels
      if (releaseData.labels && releaseData.labels.length > 0) {
        // Remove existing label links
        db.getDb().prepare('DELETE FROM release_labels WHERE release_id = ?').run(release.id);
        
        // Add new label links
        for (let i = 0; i < releaseData.labels.length; i++) {
          const label = releaseData.labels[i];
          const labelId = await db.createOrGetLabel(label.name);
          await db.linkReleaseToLabel(release.id, labelId, i);
        }
      }

      // Update videos - ALWAYS fetch from API to ensure we have video data
      // Remove existing videos first
      db.getDb().prepare('DELETE FROM videos WHERE release_id = ?').run(release.id);
      
      if (releaseData.videos && releaseData.videos.length > 0) {
        console.log(`   🎥 Adding ${releaseData.videos.length} videos...`);
        
        // Add new videos
        for (const video of releaseData.videos) {
          // Determine video type and extract YouTube ID if applicable
          let videoType = 'discogs';
          let youtubeVideoId = null;
          const youtubePlaylistId = null;
          
          if (video.uri && video.uri.includes('youtube.com')) {
            videoType = 'youtube';
            // Extract YouTube video ID from URL
            const youtubeMatch = video.uri.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
            if (youtubeMatch) {
              youtubeVideoId = youtubeMatch[1];
            }
          } else if (video.uri && (video.uri.includes('youtube.com') || video.uri.includes('youtu.be'))) {
            videoType = 'youtube';
          } else if (video.uri) {
            videoType = 'other';
          }
          
          db.getDb().prepare(`
            INSERT INTO videos (release_id, uri, title, description, duration, embed, video_type, youtube_video_id, youtube_playlist_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            release.id,
            video.uri,
            video.title,
            video.description || null,
            video.duration || null,
            video.embed ? 1 : 0,
            videoType,
            youtubeVideoId,
            youtubePlaylistId
          );
        }
        
        // Reset consecutive failures on success
        db.getDb().prepare(`
          UPDATE releases 
          SET video_consecutive_failures = 0
          WHERE id = ?
        `).run(release.id);
      } else {
        console.log(`   ℹ️  No videos available for this release`);
        
        // Track consecutive failures and flag after 2 tries
        const currentData = db.getDb().prepare('SELECT video_consecutive_failures, video_check_attempt_count FROM releases WHERE id = ?').get(release.id) as { video_consecutive_failures: number; video_check_attempt_count: number } | undefined;
        const consecutiveFailures = (currentData?.video_consecutive_failures || 0) + 1;
        const attemptCount = (currentData?.video_check_attempt_count || 0) + 1;
        
        if (consecutiveFailures >= 2) {
          // Flag as "no videos available" after 2 consecutive failures
          db.getDb().prepare(`
            UPDATE releases 
            SET no_videos_available = 1,
                video_consecutive_failures = ?,
                video_check_attempt_count = ?,
                last_video_check_attempt = datetime('now')
            WHERE id = ?
          `).run(consecutiveFailures, attemptCount, release.id);
          console.log(`   ⏭️  Flagged as "no videos available" after ${consecutiveFailures} consecutive failures`);
        } else {
          // Increment counters
          db.getDb().prepare(`
            UPDATE releases 
            SET video_consecutive_failures = ?,
                video_check_attempt_count = ?,
                last_video_check_attempt = datetime('now')
            WHERE id = ?
          `).run(consecutiveFailures, attemptCount, release.id);
        }
      }

      // Update tracklist
      if (releaseData.tracklist && releaseData.tracklist.length > 0) {
        // Remove existing tracks
        db.getDb().prepare('DELETE FROM tracks WHERE release_id = ?').run(release.id);
        
        // Add new tracks
        for (const track of releaseData.tracklist) {
          db.getDb().prepare(`
            INSERT INTO tracks (release_id, position, title, duration, type_)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            release.id,
            track.position,
            track.title,
            track.duration || null,
            track.type_ || null
          );
        }
      }

      const duration = Date.now() - startTime;
      
      // Log successful sync
      await db.createSyncLog({
        release_id: release.id,
        sync_type: 'metadata',
        status: 'success',
        error_message: null,
        records_updated: 1,
        sync_duration_ms: duration
      });
      
      // Return the result
      return { priceUpdated, price: priceValue || undefined };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Log failed sync
      if (releaseIdForLog !== null) {
        await db.createSyncLog({
          release_id: releaseIdForLog,
          sync_type: 'metadata',
          status: 'failed',
          error_message: error.message,
          records_updated: 0,
          sync_duration_ms: duration
        });
      }
      
      throw error;
    }
  }

  getJobStatus(): SyncJobStatus {
    return { ...this.jobStatus };
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('🛑 Database sync service stopped');
    }
  }
}

// Singleton instance
let syncServiceInstance: DatabaseSyncService | null = null;

export function getDatabaseSyncService(): DatabaseSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new DatabaseSyncService();
  }
  return syncServiceInstance;
}

export function stopDatabaseSyncService(): void {
  if (syncServiceInstance) {
    syncServiceInstance.stop();
    syncServiceInstance = null;
  }
}
