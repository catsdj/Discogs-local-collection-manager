#!/usr/bin/env node

/**
 * Migration: Add video and condition availability tracking
 * Extends the flagging system to videos and conditions (not just prices)
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'discogs_collection.db');

function migrate() {
  const db = new Database(DB_PATH);
  
  try {
    console.log('Starting migration: Add video/condition availability tracking...');
    
    // Check if columns already exist
    const releaseTableInfo = db.prepare("PRAGMA table_info(releases)").all();
    const releaseColumns = releaseTableInfo.map(col => col.name);
    
    if (releaseColumns.includes('no_videos_available')) {
      console.log('✓ Migration already applied, skipping...');
      db.close();
      return;
    }
    
    // Begin transaction
    db.exec('BEGIN TRANSACTION');
    
    console.log('1. Adding video/condition availability fields to releases table...');
    
    // Add fields to track video and condition availability
    db.exec(`
      ALTER TABLE releases ADD COLUMN no_videos_available INTEGER NOT NULL DEFAULT 0
    `);
    
    db.exec(`
      ALTER TABLE releases ADD COLUMN no_condition_available INTEGER NOT NULL DEFAULT 0
    `);
    
    db.exec(`
      ALTER TABLE releases ADD COLUMN video_check_attempt_count INTEGER NOT NULL DEFAULT 0
    `);
    
    db.exec(`
      ALTER TABLE releases ADD COLUMN condition_check_attempt_count INTEGER NOT NULL DEFAULT 0
    `);
    
    db.exec(`
      ALTER TABLE releases ADD COLUMN last_video_check_attempt TEXT
    `);
    
    db.exec(`
      ALTER TABLE releases ADD COLUMN last_condition_check_attempt TEXT
    `);
    
    console.log('2. Creating indexes for new fields...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_releases_no_videos ON releases(no_videos_available)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_releases_no_condition ON releases(no_condition_available)');
    
    console.log('3. Analyzing sync logs to flag releases with repeated failures...');
    
    // Find releases with many sync attempts but no videos
    const noVideoReleases = db.prepare(`
      SELECT 
        r.id as release_id,
        COUNT(sl.id) as attempts
      FROM releases r
      LEFT JOIN videos v ON r.id = v.release_id
      LEFT JOIN sync_logs sl ON r.id = sl.release_id
      WHERE v.id IS NULL
      GROUP BY r.id
      HAVING attempts >= 10
    `).all();
    
    console.log(`   Found ${noVideoReleases.length} releases with 10+ attempts but no videos`);
    
    // Flag these releases
    for (const release of noVideoReleases) {
      db.prepare(`
        UPDATE releases 
        SET no_videos_available = 1,
            video_check_attempt_count = ?,
            last_video_check_attempt = datetime('now')
        WHERE id = ?
      `).run(release.attempts, release.release_id);
    }
    
    console.log(`   Marked ${noVideoReleases.length} releases as "no videos available"`);
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('✅ Migration completed successfully!');
    console.log('\nSummary:');
    console.log(`   - Added no_videos_available flag`);
    console.log(`   - Added no_condition_available flag`);
    console.log(`   - Added attempt count tracking`);
    console.log(`   - Marked ${noVideoReleases.length} releases to skip for video checks`);
    console.log('\nNote: Condition flagging will happen automatically during next sync');
    console.log('      Releases with 10+ failed condition attempts will be auto-flagged');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

// Run migration
migrate();

