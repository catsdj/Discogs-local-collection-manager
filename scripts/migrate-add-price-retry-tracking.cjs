#!/usr/bin/env node

/**
 * Migration: Add price retry tracking fields
 * Adds fields to track releases with no marketplace listings to avoid futile retries
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'discogs_collection.db');

function migrate() {
  const db = new Database(DB_PATH);
  
  try {
    console.log('Starting migration: Add price retry tracking fields...');
    
    // Check if columns already exist
    const tableInfo = db.prepare("PRAGMA table_info(prices)").all();
    const columnNames = tableInfo.map(col => col.name);
    
    if (columnNames.includes('no_listing_available')) {
      console.log('✓ Migration already applied, skipping...');
      db.close();
      return;
    }
    
    // Begin transaction
    db.exec('BEGIN TRANSACTION');
    
    // SQLite doesn't support ADD COLUMN with DEFAULT for existing tables easily
    // We need to recreate the table
    
    console.log('1. Creating new prices table with additional fields...');
    db.exec(`
      CREATE TABLE prices_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        release_id INTEGER NOT NULL,
        lowest_price REAL,
        currency TEXT NOT NULL DEFAULT 'USD',
        price_source TEXT NOT NULL DEFAULT 'discogs',
        last_updated TEXT NOT NULL,
        no_listing_available INTEGER NOT NULL DEFAULT 0,
        last_check_attempt TEXT,
        check_attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
      )
    `);
    
    console.log('2. Copying existing data...');
    db.exec(`
      INSERT INTO prices_new (id, release_id, lowest_price, currency, price_source, last_updated, created_at, updated_at)
      SELECT id, release_id, lowest_price, currency, price_source, last_updated, created_at, updated_at
      FROM prices
    `);
    
    console.log('3. Dropping old table...');
    db.exec('DROP TABLE prices');
    
    console.log('4. Renaming new table...');
    db.exec('ALTER TABLE prices_new RENAME TO prices');
    
    console.log('5. Recreating indexes...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_prices_release_id ON prices(release_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_prices_last_updated ON prices(last_updated)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_prices_no_listing ON prices(no_listing_available)');
    
    console.log('6. Analyzing sync logs to mark releases with no listings...');
    
    // Find releases that have been attempted many times without getting a price
    const problematicReleases = db.prepare(`
      SELECT 
        r.id as release_id,
        COUNT(sl.id) as attempts
      FROM releases r
      LEFT JOIN prices p ON r.id = p.release_id
      LEFT JOIN sync_logs sl ON r.id = sl.release_id
      WHERE (p.lowest_price IS NULL OR p.lowest_price = 0 OR p.id IS NULL)
      GROUP BY r.id
      HAVING attempts >= 10
    `).all();
    
    console.log(`   Found ${problematicReleases.length} releases with 10+ failed attempts`);
    
    // Mark these releases as "no listing available" after 10+ attempts
    for (const release of problematicReleases) {
      const existing = db.prepare('SELECT id FROM prices WHERE release_id = ?').get(release.release_id);
      
      if (existing) {
        db.prepare(`
          UPDATE prices 
          SET no_listing_available = 1,
              check_attempt_count = ?,
              last_check_attempt = datetime('now')
          WHERE release_id = ?
        `).run(release.attempts, release.release_id);
      } else {
        db.prepare(`
          INSERT INTO prices (release_id, currency, price_source, last_updated, no_listing_available, check_attempt_count, last_check_attempt)
          VALUES (?, 'EUR', 'discogs', datetime('now'), 1, ?, datetime('now'))
        `).run(release.release_id, release.attempts);
      }
    }
    
    console.log(`   Marked ${problematicReleases.length} releases as "no listing available"`);
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('✅ Migration completed successfully!');
    console.log('\nSummary:');
    console.log(`   - Added no_listing_available flag`);
    console.log(`   - Added last_check_attempt timestamp`);
    console.log(`   - Added check_attempt_count counter`);
    console.log(`   - Marked ${problematicReleases.length} releases to skip on next sync`);
    
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

