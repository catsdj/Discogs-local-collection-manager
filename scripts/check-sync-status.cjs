// scripts/check-sync-status.cjs
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'discogs_collection.db');
const db = new Database(DB_PATH);

function checkSyncStatus() {
  console.log('📊 Database Sync Status');
  console.log('======================\n');

  // Get total releases
  const totalReleases = db.prepare('SELECT COUNT(*) as count FROM releases').get().count;
  
  // Get releases with prices
  const releasesWithPrices = db.prepare('SELECT COUNT(DISTINCT release_id) as count FROM prices').get().count;
  
  // Get releases without prices
  const releasesWithoutPrices = db.prepare(`
    SELECT r.id, r.discogs_id, r.title, r.last_sync_at, r.sync_status
    FROM releases r
    LEFT JOIN prices p ON r.id = p.release_id
    WHERE p.id IS NULL
    ORDER BY r.created_at ASC
  `).all();

  // Get recently synced releases (last 24 hours)
  const recentlySynced = db.prepare(`
    SELECT COUNT(*) as count FROM releases 
    WHERE last_sync_at > datetime('now', '-1 day')
  `).get().count;

  // Get failed syncs
  const failedSyncs = db.prepare(`
    SELECT COUNT(*) as count FROM releases 
    WHERE sync_status = 'failed'
  `).get().count;

  console.log(`📈 Overall Status:`);
  console.log(`   Total releases: ${totalReleases}`);
  console.log(`   Releases with prices: ${releasesWithPrices} (${Math.round(releasesWithPrices/totalReleases*100)}%)`);
  console.log(`   Releases without prices: ${releasesWithoutPrices.length} (${Math.round(releasesWithoutPrices.length/totalReleases*100)}%)`);
  console.log(`   Recently synced (24h): ${recentlySynced}`);
  console.log(`   Failed syncs: ${failedSyncs}`);

  if (releasesWithoutPrices.length > 0) {
    console.log(`\n📋 Releases without prices (first 10):`);
    releasesWithoutPrices.slice(0, 10).forEach((release, index) => {
      console.log(`   ${index + 1}. "${release.title}" (ID: ${release.discogs_id})`);
      console.log(`      Last sync: ${release.last_sync_at || 'Never'}`);
      console.log(`      Status: ${release.sync_status || 'Unknown'}`);
    });

    if (releasesWithoutPrices.length > 10) {
      console.log(`   ... and ${releasesWithoutPrices.length - 10} more releases`);
    }
  }

  // Check sync logs for recent activity
  const recentLogs = db.prepare(`
    SELECT sync_type, status, COUNT(*) as count, 
           MAX(created_at) as last_activity
    FROM sync_logs 
    WHERE created_at > datetime('now', '-1 hour')
    GROUP BY sync_type, status
    ORDER BY last_activity DESC
  `).all();

  if (recentLogs.length > 0) {
    console.log(`\n📝 Recent Sync Activity (last hour):`);
    recentLogs.forEach(log => {
      console.log(`   ${log.sync_type}: ${log.status} (${log.count} times) - ${log.last_activity}`);
    });
  }

  db.close();
}

checkSyncStatus();






