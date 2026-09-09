import type Database from 'better-sqlite3';
import { parseTagName, type CollectionTag, type ParsedTagName } from './tagName.ts';

export {
  MAX_TAG_NAME_LENGTH,
  parseTagName,
  suggestTags,
} from './tagName.ts';
export type { CollectionTag, ParsedTagName } from './tagName.ts';

type TagRow = {
  id: number;
  name: string;
};

export function createTagTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS release_tags (
      tag_id INTEGER NOT NULL,
      release_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tag_id, release_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
    )
  `);
}

export function listTags(db: Database.Database): CollectionTag[] {
  return db.prepare(`
    SELECT id, name
    FROM tags
    ORDER BY name COLLATE NOCASE ASC, id ASC
  `).all() as TagRow[];
}

function loadReleaseTags(db: Database.Database, releaseId: number): CollectionTag[] {
  return db.prepare(`
    SELECT t.id, t.name
    FROM release_tags rt
    JOIN tags t ON t.id = rt.tag_id
    WHERE rt.release_id = ?
    ORDER BY t.name COLLATE NOCASE ASC, t.id ASC
  `).all(releaseId) as TagRow[];
}

function findReleaseId(db: Database.Database, discogsId: number): number | null {
  const row = db.prepare('SELECT id FROM releases WHERE discogs_id = ?').get(discogsId) as { id: number } | undefined;
  return row?.id ?? null;
}

function findOrCreateTag(db: Database.Database, parsed: ParsedTagName): CollectionTag {
  const existing = db.prepare(`
    SELECT id, name
    FROM tags
    WHERE normalized_name = ?
  `).get(parsed.normalizedName) as TagRow | undefined;

  if (existing) {
    return existing;
  }

  const result = db.prepare(`
    INSERT INTO tags (name, normalized_name)
    VALUES (?, ?)
  `).run(parsed.name, parsed.normalizedName);

  return {
    id: Number(result.lastInsertRowid),
    name: parsed.name,
  };
}

export function addTagToRelease(
  db: Database.Database,
  discogsId: number,
  rawName: unknown,
): { tag: CollectionTag; releaseTags: CollectionTag[] } {
  const parsed = parseTagName(rawName);
  if (!parsed) {
    throw new Error('A tag name is required.');
  }

  const releaseId = findReleaseId(db, discogsId);
  if (releaseId === null) {
    throw new Error('Release is not in the local collection.');
  }

  const tag = findOrCreateTag(db, parsed);
  db.prepare(`
    INSERT OR IGNORE INTO release_tags (tag_id, release_id)
    VALUES (?, ?)
  `).run(tag.id, releaseId);

  return {
    tag,
    releaseTags: loadReleaseTags(db, releaseId),
  };
}

export function removeTagFromRelease(
  db: Database.Database,
  discogsId: number,
  tagId: number,
): CollectionTag[] {
  const releaseId = findReleaseId(db, discogsId);
  if (releaseId === null) {
    throw new Error('Release is not in the local collection.');
  }

  db.prepare(`
    DELETE FROM release_tags
    WHERE tag_id = ? AND release_id = ?
  `).run(tagId, releaseId);

  return loadReleaseTags(db, releaseId);
}

export function loadTagsByDiscogsIds(
  db: Database.Database,
  discogsIds: number[],
): Map<number, CollectionTag[]> {
  const grouped = new Map<number, CollectionTag[]>();
  for (const discogsId of discogsIds) {
    grouped.set(discogsId, []);
  }

  if (discogsIds.length === 0) {
    return grouped;
  }

  const placeholders = discogsIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT r.discogs_id, t.id, t.name
    FROM release_tags rt
    JOIN tags t ON t.id = rt.tag_id
    JOIN releases r ON r.id = rt.release_id
    WHERE r.discogs_id IN (${placeholders})
    ORDER BY t.name COLLATE NOCASE ASC, t.id ASC
  `).all(...discogsIds) as Array<{ discogs_id: number; id: number; name: string }>;

  for (const row of rows) {
    const tags = grouped.get(row.discogs_id);
    if (!tags) {
      continue;
    }
    tags.push({ id: row.id, name: row.name });
  }

  return grouped;
}
