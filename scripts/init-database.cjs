#!/usr/bin/env node

/**
 * Create the local data directory and SQLite database file.
 * Schema migrations run automatically the first time the app opens the DB.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'discogs_collection.db');

function initializeLocalDatabase(options = {}) {
  const { quiet = false } = options;
  const log = quiet ? () => {} : console.log;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (error) {
    throw new Error(
      'better-sqlite3 is not installed. Run npm install first, then retry setup.',
      { cause: error },
    );
  }

  const db = new Database(DB_PATH);
  try {
    db.pragma('journal_mode = WAL');
    db.prepare('SELECT 1').get();
  } finally {
    db.close();
  }

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database file was not created at ${DB_PATH}`);
  }

  log(`Local database ready at ${DB_PATH}`);
  return DB_PATH;
}

module.exports = {
  DATA_DIR,
  DB_PATH,
  initializeLocalDatabase,
};

if (require.main === module) {
  try {
    initializeLocalDatabase();
    process.exit(0);
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  }
}
