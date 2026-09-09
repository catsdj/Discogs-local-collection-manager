import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import {
  addTagToRelease,
  createTagTables,
  listTags,
  loadTagsByDiscogsIds,
  parseTagName,
  removeTagFromRelease,
  suggestTags,
} from './tags.ts';

test('parseTagName trims and collapses whitespace', () => {
  assert.deepEqual(parseTagName('  peak   time  '), {
    name: 'peak time',
    normalizedName: 'peak time',
  });
});

test('parseTagName rejects empty names', () => {
  assert.equal(parseTagName('   '), null);
  assert.equal(parseTagName(''), null);
});

test('suggestTags offers nothing on an empty vocabulary and empty query', () => {
  assert.deepEqual(suggestTags({ query: '', vocabulary: [], assignedTagIds: [] }), {
    matches: [],
    createName: null,
  });
});

test('suggestTags filters as you type and offers create when there is no exact match', () => {
  const vocabulary = [
    { id: 1, name: 'peak time' },
    { id: 2, name: '4 AM' },
    { id: 3, name: 'warmup' },
  ];

  const result = suggestTags({
    query: 'peak',
    vocabulary,
    assignedTagIds: [],
  });

  assert.deepEqual(result.matches.map((tag) => tag.name), ['peak time']);
  assert.equal(result.createName, 'peak');
});

test('suggestTags does not offer create when the typed name already exists', () => {
  const result = suggestTags({
    query: '4 am',
    vocabulary: [{ id: 2, name: '4 AM' }],
    assignedTagIds: [],
  });

  assert.deepEqual(result.matches.map((tag) => tag.name), ['4 AM']);
  assert.equal(result.createName, null);
});

test('suggestTags hides tags already on the release', () => {
  const result = suggestTags({
    query: '',
    vocabulary: [
      { id: 1, name: 'peak time' },
      { id: 2, name: '4 AM' },
    ],
    assignedTagIds: [1],
  });

  assert.deepEqual(result.matches.map((tag) => tag.name), ['4 AM']);
});

function openTagTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE releases (
      id INTEGER PRIMARY KEY,
      discogs_id INTEGER UNIQUE NOT NULL,
      title TEXT NOT NULL
    );
  `);
  createTagTables(db);
  db.prepare('INSERT INTO releases (id, discogs_id, title) VALUES (?, ?, ?)').run(1, 101, 'Keep Me');
  return db;
}

test('a fresh database has no default tags', () => {
  const db = openTagTestDb();
  assert.deepEqual(listTags(db), []);
  db.close();
});

test('adding a tag creates it in the vocabulary and assigns it to the release', () => {
  const db = openTagTestDb();

  const result = addTagToRelease(db, 101, 'peak time');

  assert.equal(result.tag.name, 'peak time');
  assert.deepEqual(result.releaseTags.map((tag) => tag.name), ['peak time']);
  assert.deepEqual(listTags(db).map((tag) => tag.name), ['peak time']);
  db.close();
});

test('adding a tag is case-insensitive and reuses the original name', () => {
  const db = openTagTestDb();
  addTagToRelease(db, 101, 'Peak Time');

  const result = addTagToRelease(db, 101, 'peak time');

  assert.equal(listTags(db).length, 1);
  assert.equal(result.tag.name, 'Peak Time');
  assert.equal(result.releaseTags.length, 1);
  db.close();
});

test('removing a tag from a release keeps it in the vocabulary', () => {
  const db = openTagTestDb();
  const added = addTagToRelease(db, 101, '4 AM');

  const remaining = removeTagFromRelease(db, 101, added.tag.id);

  assert.deepEqual(remaining, []);
  assert.deepEqual(listTags(db).map((tag) => tag.name), ['4 AM']);
  db.close();
});

test('loadTagsByDiscogsIds groups assigned tags per release', () => {
  const db = openTagTestDb();
  db.prepare('INSERT INTO releases (id, discogs_id, title) VALUES (?, ?, ?)').run(2, 202, 'Other');
  addTagToRelease(db, 101, 'peak time');
  addTagToRelease(db, 202, '4 AM');

  const grouped = loadTagsByDiscogsIds(db, [101, 202]);

  assert.deepEqual(grouped.get(101)?.map((tag) => tag.name), ['peak time']);
  assert.deepEqual(grouped.get(202)?.map((tag) => tag.name), ['4 AM']);
  db.close();
});
