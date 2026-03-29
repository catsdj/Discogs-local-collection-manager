#!/usr/bin/env node

/**
 * Check releases marked as "no marketplace listing available"
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'discogs_collection.db');

function checkNoListingReleases() {
  const db = new Database(DB_PATH);
  
  try {
    const releases = db.prepare(`
      SELECT 
        r.discogs_id,
        r.title,
        p.check_attempt_count,
        p.last_check_attempt,
        COUNT(sl.id) as total_sync_attempts
      FROM releases r
      JOIN prices p ON r.id = p.release_id
      LEFT JOIN sync_logs sl ON r.id = sl.release_id
      WHERE p.no_listing_available = 1
      GROUP BY r.id
      ORDER BY p.check_attempt_count DESC
    `).all();
    
    console.log('\n==============================================');
    console.log('📊 Releases with No Marketplace Listing');
    console.log('==============================================\n');
    
    if (releases.length === 0) {
      console.log('✅ No releases marked as "no listing available"');
      return;
    }
    
    console.log(`Found ${releases.length} releases with no marketplace listings:\n`);
    
    releases.forEach((release, index) => {
      console.log(`${index + 1}. "${release.title}" (ID: ${release.discogs_id})`);
      console.log(`   Attempts: ${release.check_attempt_count}`);
      console.log(`   Last check: ${release.last_check_attempt}`);
      console.log(`   Total syncs: ${release.total_sync_attempts}`);
      console.log('');
    });
    
    console.log('==============================================');
    console.log(`📌 These ${releases.length} releases will be skipped during price sync`);
    console.log('💡 To re-check a release, manually reset its flag in the database');
    console.log('==============================================\n');
    
    // Calculate potential value
    const withPrices = db.prepare(`
      SELECT 
        COUNT(*) as count,
        SUM(lowest_price) as total,
        AVG(lowest_price) as average
      FROM prices 
      WHERE lowest_price IS NOT NULL 
        AND lowest_price > 0
        AND no_listing_available = 0
    `).get();
    
    console.log('\n📈 Collection Value Summary:');
    console.log(`   Releases with prices: ${withPrices.count}`);
    console.log(`   Total value: €${withPrices.total.toFixed(2)}`);
    console.log(`   Average value: €${withPrices.average.toFixed(2)}`);
    console.log(`   Releases without listings: ${releases.length}`);
    console.log(`   Total collection: ${withPrices.count + releases.length}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run check
checkNoListingReleases();

