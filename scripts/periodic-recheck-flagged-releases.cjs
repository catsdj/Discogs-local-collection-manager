#!/usr/bin/env node

/**
 * Periodic Re-check Strategy for Flagged Releases
 * 
 * This script re-enables price checks for releases that have been flagged as 
 * "no listing available" after a certain period. This ensures we eventually 
 * detect when new marketplace listings appear.
 * 
 * Strategy:
 * - After 30 days: Re-check once
 * - After 90 days: Re-check once more
 * - After 180 days: Re-check periodically (every 90 days)
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'discogs_collection.db');

// Configuration
const RECHECK_INTERVALS = {
  FIRST_RECHECK: 30,    // Days after initial flagging
  SECOND_RECHECK: 90,   // Days for second attempt
  PERIODIC_RECHECK: 180 // Days before periodic re-checks
};

function periodicRecheck() {
  const db = new Database(DB_PATH);
  
  try {
    console.log('\n==============================================');
    console.log('🔄 Periodic Re-check for Flagged Releases');
    console.log('==============================================\n');
    
    const now = new Date();
    
    // Find releases eligible for re-check based on time since last check
    const eligibleReleases = db.prepare(`
      SELECT 
        r.id as release_id,
        r.discogs_id,
        r.title,
        p.check_attempt_count,
        p.last_check_attempt,
        julianday('now') - julianday(p.last_check_attempt) as days_since_check
      FROM releases r
      JOIN prices p ON r.id = p.release_id
      WHERE p.no_listing_available = 1
        AND (
          -- First re-check after 30 days
          (p.check_attempt_count < 15 AND julianday('now') - julianday(p.last_check_attempt) >= ${RECHECK_INTERVALS.FIRST_RECHECK})
          OR
          -- Second re-check after 90 days
          (p.check_attempt_count < 20 AND julianday('now') - julianday(p.last_check_attempt) >= ${RECHECK_INTERVALS.SECOND_RECHECK})
          OR
          -- Periodic re-check every 90 days after 180 days
          (julianday('now') - julianday(p.last_check_attempt) >= ${RECHECK_INTERVALS.PERIODIC_RECHECK})
        )
      ORDER BY days_since_check DESC
    `).all();
    
    if (eligibleReleases.length === 0) {
      console.log('✅ No releases eligible for re-check at this time.\n');
      console.log('Re-check intervals:');
      console.log(`   - First re-check: after ${RECHECK_INTERVALS.FIRST_RECHECK} days`);
      console.log(`   - Second re-check: after ${RECHECK_INTERVALS.SECOND_RECHECK} days`);
      console.log(`   - Periodic re-check: every 90 days after ${RECHECK_INTERVALS.PERIODIC_RECHECK} days\n`);
      return;
    }
    
    console.log(`📋 Found ${eligibleReleases.length} release(s) eligible for re-check:\n`);
    
    eligibleReleases.forEach((release, index) => {
      const daysSince = Math.floor(release.days_since_check);
      console.log(`${index + 1}. "${release.title}" (ID: ${release.discogs_id})`);
      console.log(`   Last checked: ${daysSince} days ago`);
      console.log(`   Previous attempts: ${release.check_attempt_count}`);
      console.log('');
    });
    
    // Prompt for confirmation (in production, this would be automatic)
    console.log('==============================================');
    console.log(`🔓 Re-enabling ${eligibleReleases.length} release(s) for price sync...`);
    console.log('==============================================\n');
    
    // Re-enable these releases
    db.exec('BEGIN TRANSACTION');
    
    for (const release of eligibleReleases) {
      db.prepare(`
        UPDATE prices 
        SET no_listing_available = 0,
            last_check_attempt = datetime('now')
        WHERE release_id = ?
      `).run(release.release_id);
    }
    
    db.exec('COMMIT');
    
    console.log(`✅ Successfully re-enabled ${eligibleReleases.length} release(s)\n`);
    console.log('These releases will be checked in the next sync cycle.\n');
    
    // Show summary
    const stillFlagged = db.prepare(`
      SELECT COUNT(*) as count 
      FROM prices 
      WHERE no_listing_available = 1
    `).get();
    
    console.log('📊 Summary:');
    console.log(`   Re-enabled: ${eligibleReleases.length}`);
    console.log(`   Still flagged: ${stillFlagged.count}`);
    console.log(`   Next sync will check ${eligibleReleases.length} previously unavailable releases\n`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

// Run periodic re-check
periodicRecheck();

