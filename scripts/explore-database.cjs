#!/usr/bin/env node

/**
 * Database Explorer - Interactive queries for your collection
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'discogs_collection.db');

function exploreDatabase() {
  const db = new Database(DB_PATH, { readonly: true }); // Read-only for safety
  
  console.log('\n==============================================');
  console.log('📊 Discogs Collection Database Explorer');
  console.log('==============================================\n');
  
  // 1. Collection Overview
  console.log('📚 COLLECTION OVERVIEW\n');
  const overview = db.prepare(`
    SELECT 
      COUNT(*) as total_releases,
      (SELECT COUNT(DISTINCT name) FROM artists) as unique_artists,
      (SELECT COUNT(DISTINCT name) FROM labels) as unique_labels,
      (SELECT COUNT(DISTINCT name) FROM styles) as unique_styles,
      (SELECT COUNT(DISTINCT name) FROM genres) as unique_genres,
      (SELECT COUNT(*) FROM videos) as total_videos,
      (SELECT COUNT(*) FROM tracks) as total_tracks,
      (SELECT COUNT(*) FROM prices WHERE lowest_price IS NOT NULL) as priced_releases
    FROM releases
  `).get();
  
  console.log(`Total Releases: ${overview.total_releases}`);
  console.log(`Unique Artists: ${overview.unique_artists}`);
  console.log(`Unique Labels: ${overview.unique_labels}`);
  console.log(`Unique Styles: ${overview.unique_styles}`);
  console.log(`Unique Genres: ${overview.unique_genres}`);
  console.log(`Total Videos: ${overview.total_videos}`);
  console.log(`Total Tracks: ${overview.total_tracks}`);
  console.log(`Priced Releases: ${overview.priced_releases}`);
  
  // 2. Top Artists
  console.log('\n🎤 TOP 10 ARTISTS (by release count)\n');
  const topArtists = db.prepare(`
    SELECT a.name, COUNT(ra.release_id) as release_count
    FROM artists a
    JOIN release_artists ra ON a.id = ra.artist_id
    GROUP BY a.id, a.name
    ORDER BY release_count DESC
    LIMIT 10
  `).all();
  
  topArtists.forEach((artist, index) => {
    console.log(`${index + 1}. ${artist.name} - ${artist.release_count} releases`);
  });
  
  // 3. Top Labels
  console.log('\n🏷️  TOP 10 LABELS (by release count)\n');
  const topLabels = db.prepare(`
    SELECT l.name, COUNT(rl.release_id) as release_count
    FROM labels l
    JOIN release_labels rl ON l.id = rl.label_id
    GROUP BY l.id, l.name
    ORDER BY release_count DESC
    LIMIT 10
  `).all();
  
  topLabels.forEach((label, index) => {
    console.log(`${index + 1}. ${label.name} - ${label.release_count} releases`);
  });
  
  // 4. Price Statistics
  console.log('\n💰 PRICE STATISTICS\n');
  const priceStats = db.prepare(`
    SELECT 
      currency,
      COUNT(*) as count,
      MIN(lowest_price) as min_price,
      MAX(lowest_price) as max_price,
      AVG(lowest_price) as avg_price,
      SUM(lowest_price) as total_value
    FROM prices 
    WHERE lowest_price IS NOT NULL AND lowest_price > 0
    GROUP BY currency
  `).all();
  
  priceStats.forEach(stat => {
    console.log(`Currency: ${stat.currency}`);
    console.log(`  Releases: ${stat.count}`);
    console.log(`  Range: ${stat.min_price.toFixed(2)} - ${stat.max_price.toFixed(2)}`);
    console.log(`  Average: ${stat.avg_price.toFixed(2)}`);
    console.log(`  Total Value: ${stat.total_value.toFixed(2)}`);
    console.log('');
  });
  
  // 5. Sync Status
  console.log('🔄 SYNC STATUS\n');
  const syncStats = db.prepare(`
    SELECT 
      sync_status,
      COUNT(*) as count
    FROM releases
    GROUP BY sync_status
  `).get();
  
  console.log(`Sync Status: ${syncStats.sync_status || 'N/A'}`);
  console.log(`Releases: ${syncStats.count}`);
  
  // 6. Flagged Releases (No Listings)
  console.log('\n⏭️  FLAGGED RELEASES (No Marketplace Listings)\n');
  const flaggedCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM prices
    WHERE no_listing_available = 1
  `).get();
  
  console.log(`Flagged Releases: ${flaggedCount.count}`);
  
  if (flaggedCount.count > 0) {
    const flagged = db.prepare(`
      SELECT r.title, p.check_attempt_count
      FROM releases r
      JOIN prices p ON r.id = p.release_id
      WHERE p.no_listing_available = 1
      ORDER BY p.check_attempt_count DESC
      LIMIT 5
    `).all();
    
    console.log('\nTop 5 by retry attempts:');
    flagged.forEach((release, index) => {
      console.log(`  ${index + 1}. "${release.title}" - ${release.check_attempt_count} attempts`);
    });
  }
  
  // 7. Database Size
  console.log('\n💾 DATABASE INFO\n');
  const dbStats = db.prepare(`
    SELECT 
      page_count * page_size / 1024 / 1024 as size_mb,
      page_count,
      page_size
    FROM pragma_page_count(), pragma_page_size()
  `).get();
  
  console.log(`Database Size: ${dbStats.size_mb.toFixed(2)} MB`);
  console.log(`Pages: ${dbStats.page_count}`);
  console.log(`Page Size: ${dbStats.page_size} bytes`);
  
  console.log('\n==============================================\n');
  
  db.close();
}

// Run explorer
exploreDatabase();

