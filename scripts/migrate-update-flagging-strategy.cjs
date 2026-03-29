#!/usr/bin/env node

/**
 * Migration: Update flagging strategy
 * - Change threshold from 10 attempts to 2 consecutive failures
 * - Add stale price tracking (price exists in DB but not on marketplace for 1 week)
 * - Add consecutive failure tracking
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'discogs_collection.db');

function migrate() {
  const db = new Database(DB_PATH);
  
  try {
    console.log('Starting migration: Update flagging strategy to 2 consecutive failures...');
    
    // Begin transaction
    db.exec('BEGIN TRANSACTION');
    
    console.log('1. Adding consecutive failure tracking and stale price fields...');
    
    // Add fields to prices table for stale price tracking
    const priceColumns = db.prepare("PRAGMA table_info(prices)").all().map(col => col.name);
    
    if (!priceColumns.includes('price_stale')) {
      db.exec(`ALTER TABLE prices ADD COLUMN price_stale INTEGER NOT NULL DEFAULT 0`);
      db.exec(`ALTER TABLE prices ADD COLUMN last_marketplace_check TEXT`);
      db.exec(`ALTER TABLE prices ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0`);
      console.log('   Added stale price tracking fields');
    }
    
    // Add fields to releases for consecutive failure tracking
    const releaseColumns = db.prepare("PRAGMA table_info(releases)").all().map(col => col.name);
    
    if (!releaseColumns.includes('video_consecutive_failures')) {
      db.exec(`ALTER TABLE releases ADD COLUMN video_consecutive_failures INTEGER NOT NULL DEFAULT 0`);
      db.exec(`ALTER TABLE releases ADD COLUMN condition_consecutive_failures INTEGER NOT NULL DEFAULT 0`);
      console.log('   Added consecutive failure tracking fields');
    }
    
    console.log('2. Creating indexes...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_prices_stale ON prices(price_stale)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_prices_consecutive_failures ON prices(consecutive_failures)');
    
    console.log('3. Resetting existing flags to use new 2-failure threshold...');
    
    // Reset all flags - they'll be re-evaluated with new threshold
    db.exec(`UPDATE prices SET no_listing_available = 0, consecutive_failures = 0 WHERE no_listing_available = 1`);
    db.exec(`UPDATE releases SET no_videos_available = 0, video_consecutive_failures = 0 WHERE no_videos_available = 1`);
    db.exec(`UPDATE releases SET no_condition_available = 0, condition_consecutive_failures = 0 WHERE no_condition_available = 1`);
    
    console.log('   All flags reset - will be re-evaluated with 2-failure threshold on next sync');
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('✅ Migration completed successfully!');
    console.log('\nSummary:');
    console.log('   - Changed threshold: 10 attempts → 2 consecutive failures');
    console.log('   - Added stale price tracking (1 week flagging)');
    console.log('   - Added consecutive failure counters');
    console.log('   - Reset all existing flags');
    console.log('\nNext sync will re-evaluate all releases with new criteria');
    
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

