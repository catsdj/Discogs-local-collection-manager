import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import {
  addReleaseStyleFilter,
  loadReleaseNameLists,
  sanitizeListParam,
  uniqueNormalizedNames,
} from './collectionQuery.ts';

test('sanitizeListParam caps the number of items', () => {
  const raw = Array.from({ length: 80 }, (_, index) => `style-${index}`).join(',');
  const items = sanitizeListParam(raw, { itemMaxLength: 60, maxItems: 50 });
  assert.equal(items.length, 50);
  assert.equal(items[0], 'style-0');
  assert.equal(items[49], 'style-49');
});

test('sanitizeListParam trims items and drops empties', () => {
  assert.deepEqual(sanitizeListParam(' Techno , , House '), ['Techno', 'House']);
});

test('uniqueNormalizedNames de-duplicates case-insensitively', () => {
  assert.deepEqual(uniqueNormalizedNames(['Techno', 'techno', 'House', ' TECHNO ']), [
    'techno',
    'house',
  ]);
});

function openCollectionQueryDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE releases (
      id INTEGER PRIMARY KEY,
      discogs_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL
    );
    CREATE TABLE artists (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE release_artists (
      release_id INTEGER NOT NULL,
      artist_id INTEGER NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE styles (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE release_styles (
      release_id INTEGER NOT NULL,
      style_id INTEGER NOT NULL
    );
    CREATE TABLE genres (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE release_genres (
      release_id INTEGER NOT NULL,
      genre_id INTEGER NOT NULL
    );
    CREATE TABLE labels (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE release_labels (
      release_id INTEGER NOT NULL,
      label_id INTEGER NOT NULL,
      position INTEGER NOT NULL
    );
  `);

  db.prepare('INSERT INTO releases (id, discogs_id, title) VALUES (?, ?, ?)').run(1, 101, 'Comma, Title');
  db.prepare('INSERT INTO artists (id, name) VALUES (?, ?)').run(1, 'Last, First');
  db.prepare('INSERT INTO artists (id, name) VALUES (?, ?)').run(2, 'Second Artist');
  db.prepare('INSERT INTO release_artists (release_id, artist_id, position) VALUES (?, ?, ?)').run(1, 1, 0);
  db.prepare('INSERT INTO release_artists (release_id, artist_id, position) VALUES (?, ?, ?)').run(1, 2, 1);
  db.prepare('INSERT INTO styles (id, name) VALUES (?, ?)').run(1, 'Techno');
  db.prepare('INSERT INTO styles (id, name) VALUES (?, ?)').run(2, 'House');
  db.prepare('INSERT INTO release_styles (release_id, style_id) VALUES (?, ?)').run(1, 1);
  db.prepare('INSERT INTO release_styles (release_id, style_id) VALUES (?, ?)').run(1, 2);
  db.prepare('INSERT INTO genres (id, name) VALUES (?, ?)').run(1, 'Electronic');
  db.prepare('INSERT INTO release_genres (release_id, genre_id) VALUES (?, ?)').run(1, 1);
  db.prepare('INSERT INTO labels (id, name) VALUES (?, ?)').run(1, 'Ostgut Ton');
  db.prepare('INSERT INTO release_labels (release_id, label_id, position) VALUES (?, ?, ?)').run(1, 1, 0);

  return db;
}

test('loadReleaseNameLists keeps artist and style counts independent of each other', () => {
  const db = openCollectionQueryDb();
  const grouped = loadReleaseNameLists(db, [1]);
  const lists = grouped.get(1);

  assert.deepEqual(lists?.artists, ['Last, First', 'Second Artist']);
  assert.deepEqual(lists?.styles, ['House', 'Techno']);
  assert.deepEqual(lists?.genres, ['Electronic']);
  assert.deepEqual(lists?.labels, ['Ostgut Ton']);
  db.close();
});

test('addReleaseStyleFilter matches styles exactly and case-insensitively', () => {
  const db = openCollectionQueryDb();
  db.prepare('INSERT INTO releases (id, discogs_id, title) VALUES (?, ?, ?)').run(2, 202, 'Other');
  db.prepare('INSERT INTO release_styles (release_id, style_id) VALUES (?, ?)').run(2, 1);

  const whereConditions: string[] = [];
  const queryParams: string[] = [];
  addReleaseStyleFilter(whereConditions, queryParams, ['techno', 'House']);

  const rows = db.prepare(`
    SELECT r.discogs_id
    FROM releases r
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY r.discogs_id
  `).all(...queryParams) as Array<{ discogs_id: number }>;

  assert.deepEqual(queryParams, ['techno', 'house']);
  assert.deepEqual(rows.map((row) => row.discogs_id), [101, 202]);
  db.close();
});

test('addReleaseStyleFilter does not treat a partial style name as a match', () => {
  const db = openCollectionQueryDb();
  const whereConditions: string[] = [];
  const queryParams: string[] = [];
  addReleaseStyleFilter(whereConditions, queryParams, ['Tech']);

  const rows = db.prepare(`
    SELECT r.discogs_id
    FROM releases r
    WHERE ${whereConditions.join(' AND ')}
  `).all(...queryParams) as Array<{ discogs_id: number }>;

  assert.deepEqual(rows, []);
  db.close();
});
