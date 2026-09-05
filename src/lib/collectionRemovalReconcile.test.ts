import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import {
  deleteReleasesNotInDiscogsIds,
  shouldReconcileCollectionRemovals,
} from './collectionRemovalReconcile.ts';

test('reconciles removals only for a complete unstopped All import', () => {
  assert.equal(
    shouldReconcileCollectionRemovals({
      period: 'all',
      fetchComplete: true,
      stopRequested: false,
    }),
    true,
  );
});

test('does not reconcile removals for a date-scoped import', () => {
  assert.equal(
    shouldReconcileCollectionRemovals({
      period: 'week',
      fetchComplete: true,
      stopRequested: false,
    }),
    false,
  );
});

test('does not reconcile removals when the Discogs fetch was incomplete', () => {
  assert.equal(
    shouldReconcileCollectionRemovals({
      period: 'all',
      fetchComplete: false,
      stopRequested: false,
    }),
    false,
  );
});

test('does not reconcile removals when the import was stopped', () => {
  assert.equal(
    shouldReconcileCollectionRemovals({
      period: 'all',
      fetchComplete: true,
      stopRequested: true,
    }),
    false,
  );
});

function openTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE releases (
      id INTEGER PRIMARY KEY,
      discogs_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL
    )
  `);
  const insert = db.prepare('INSERT INTO releases (discogs_id, title) VALUES (?, ?)');
  insert.run(101, 'Keep Me');
  insert.run(202, 'Remove Me');
  insert.run(303, 'Also Remove Me');
  return db;
}

test('deletes local releases whose Discogs IDs are missing from a complete fetch', () => {
  const db = openTestDb();

  const removed = deleteReleasesNotInDiscogsIds(db, [101]);

  assert.equal(removed, 2);
  const remaining = db.prepare('SELECT discogs_id FROM releases ORDER BY discogs_id').all() as Array<{
    discogs_id: number;
  }>;
  assert.deepEqual(remaining.map((row) => row.discogs_id), [101]);
  db.close();
});

test('deletes every local release when Discogs returns an empty collection', () => {
  const db = openTestDb();

  const removed = deleteReleasesNotInDiscogsIds(db, []);

  assert.equal(removed, 3);
  const remaining = db.prepare('SELECT COUNT(*) AS count FROM releases').get() as { count: number };
  assert.equal(remaining.count, 0);
  db.close();
});
