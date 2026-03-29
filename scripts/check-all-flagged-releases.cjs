#!/usr/bin/env node

/**
 * Check all releases flagged as "data not available"
 * Shows releases flagged for prices, videos, and conditions
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'discogs_collection.db');

function checkAllFlaggedReleases() {
  const db = new Database(DB_PATH);
  
  try {
    console.log('\n==============================================');
    console.log('📊 Flagged Releases Summary');
    console.log('==============================================\n');
    
    // 1. Price Flags
    const priceFlags = db.prepare(`
      SELECT 
        r.discogs_id,
        r.title,
        p.check_attempt_count,
        p.last_check_attempt
      FROM releases r
      JOIN prices p ON r.id = p.release_id
      WHERE p.no_listing_available = 1
      ORDER BY p.check_attempt_count DESC
    `).all();
    
    console.log(`💰 PRICES - No Marketplace Listing: ${priceFlags.length} releases\n`);
    if (priceFlags.length > 0) {
      priceFlags.slice(0, 5).forEach((r, i) => {
        console.log(`${i + 1}. "${r.title}" (ID: ${r.discogs_id})`);
        console.log(`   Attempts: ${r.check_attempt_count}, Last: ${r.last_check_attempt}`);
      });
      if (priceFlags.length > 5) {
        console.log(`   ... and ${priceFlags.length - 5} more`);
      }
    }
    
    // 2. Video Flags
    const videoFlags = db.prepare(`
      SELECT 
        r.discogs_id,
        r.title,
        r.video_check_attempt_count,
        r.last_video_check_attempt
      FROM releases r
      WHERE r.no_videos_available = 1
      ORDER BY r.video_check_attempt_count DESC
    `).all();
    
    console.log(`\n🎥 VIDEOS - No Videos Available: ${videoFlags.length} releases\n`);
    if (videoFlags.length > 0) {
      videoFlags.slice(0, 5).forEach((r, i) => {
        console.log(`${i + 1}. "${r.title}" (ID: ${r.discogs_id})`);
        console.log(`   Attempts: ${r.video_check_attempt_count}, Last: ${r.last_video_check_attempt}`);
      });
      if (videoFlags.length > 5) {
        console.log(`   ... and ${videoFlags.length - 5} more`);
      }
    }
    
    // 3. Condition Flags
    const conditionFlags = db.prepare(`
      SELECT 
        r.discogs_id,
        r.title,
        r.condition_check_attempt_count,
        r.last_condition_check_attempt
      FROM releases r
      WHERE r.no_condition_available = 1
      ORDER BY r.condition_check_attempt_count DESC
    `).all();
    
    console.log(`\n📋 CONDITIONS - No Condition Data: ${conditionFlags.length} releases\n`);
    if (conditionFlags.length > 0) {
      conditionFlags.slice(0, 5).forEach((r, i) => {
        console.log(`${i + 1}. "${r.title}" (ID: ${r.discogs_id})`);
        console.log(`   Attempts: ${r.condition_check_attempt_count}, Last: ${r.last_condition_check_attempt}`);
      });
      if (conditionFlags.length > 5) {
        console.log(`   ... and ${conditionFlags.length - 5} more`);
      }
    }
    
    // 4. Summary
    const totalFlagged = priceFlags.length + videoFlags.length + conditionFlags.length;
    const totalReleases = db.prepare('SELECT COUNT(*) as count FROM releases').get().count;
    
    console.log('\n==============================================');
    console.log(`📊 SUMMARY`);
    console.log('==============================================\n');
    console.log(`Total Releases: ${totalReleases}`);
    console.log(`Flagged Releases: ${totalFlagged}`);
    console.log(`  - No Price Listings: ${priceFlags.length}`);
    console.log(`  - No Videos: ${videoFlags.length}`);
    console.log(`  - No Conditions: ${conditionFlags.length}`);
    console.log(`Unflagged: ${totalReleases - totalFlagged}`);
    
    // 5. Impact on sync
    const nextSync = db.prepare(`
      SELECT COUNT(*) as count
      FROM releases r
      LEFT JOIN prices p ON r.id = p.release_id
      WHERE (
        -- Missing price AND not flagged
        (p.id IS NULL OR (p.lowest_price IS NULL AND (p.no_listing_available = 0 OR p.no_listing_available IS NULL)))
        -- Missing condition AND not flagged
        OR ((r.media_condition IS NULL OR r.media_condition = 'Unknown') AND (r.no_condition_available = 0 OR r.no_condition_available IS NULL))
        -- Missing videos AND not flagged
        OR (NOT EXISTS (SELECT 1 FROM videos v WHERE v.release_id = r.id) AND (r.no_videos_available = 0 OR r.no_videos_available IS NULL))
        -- Missing tracklist
        OR NOT EXISTS (SELECT 1 FROM tracks t WHERE t.release_id = r.id)
      )
    `).get();
    
    console.log(`\n💡 Next Sync Will Process: ${nextSync.count} releases (down from ${totalReleases})`);
    console.log(`API Calls Saved Per Sync: ~${totalFlagged}`);
    
    console.log('\n==============================================\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run check
checkAllFlaggedReleases();

