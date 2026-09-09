import type Database from 'better-sqlite3';

export const DEFAULT_LIST_ITEM_MAX_LENGTH = 60;
export const DEFAULT_LIST_MAX_ITEMS = 50;

export type ReleaseNameLists = {
  artists: string[];
  styles: string[];
  genres: string[];
  labels: string[];
};

export function sanitizeTextParam(value: string | null, maxLength: number = 100): string {
  if (!value) {
    return '';
  }

  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

export function sanitizeListParam(
  value: string | null,
  options: { itemMaxLength?: number; maxItems?: number } = {},
): string[] {
  if (!value) {
    return [];
  }

  const itemMaxLength = options.itemMaxLength ?? DEFAULT_LIST_ITEM_MAX_LENGTH;
  const maxItems = options.maxItems ?? DEFAULT_LIST_MAX_ITEMS;

  return value
    .split(',')
    .map((item) => sanitizeTextParam(item, itemMaxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function uniqueNormalizedNames(names: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const name of names) {
    const nextName = name.trim().toLowerCase();
    if (!nextName || seen.has(nextName)) {
      continue;
    }
    seen.add(nextName);
    normalized.push(nextName);
  }

  return normalized;
}

export function addReleaseStyleFilter(
  whereConditions: string[],
  queryParams: unknown[],
  styleNames: string[],
): void {
  const names = uniqueNormalizedNames(styleNames);
  if (names.length === 0) {
    return;
  }

  const placeholders = names.map(() => '?').join(',');
  whereConditions.push(`
    r.id IN (
      SELECT rs.release_id
      FROM release_styles rs
      JOIN styles s ON rs.style_id = s.id
      WHERE lower(s.name) IN (${placeholders})
    )
  `);
  queryParams.push(...names);
}

function emptyNameLists(): ReleaseNameLists {
  return {
    artists: [],
    styles: [],
    genres: [],
    labels: [],
  };
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',');
}

export function loadReleaseNameLists(
  db: Database.Database,
  internalIds: number[],
): Map<number, ReleaseNameLists> {
  const grouped = new Map<number, ReleaseNameLists>();
  for (const id of internalIds) {
    grouped.set(id, emptyNameLists());
  }

  if (internalIds.length === 0) {
    return grouped;
  }

  const idPlaceholders = placeholders(internalIds.length);

  const artistRows = db.prepare(`
    SELECT ra.release_id, a.name
    FROM release_artists ra
    JOIN artists a ON a.id = ra.artist_id
    WHERE ra.release_id IN (${idPlaceholders})
    ORDER BY ra.release_id, ra.position, ra.rowid
  `).all(...internalIds) as Array<{ release_id: number; name: string }>;

  for (const row of artistRows) {
    grouped.get(row.release_id)?.artists.push(row.name);
  }

  const styleRows = db.prepare(`
    SELECT rs.release_id, s.name
    FROM release_styles rs
    JOIN styles s ON s.id = rs.style_id
    WHERE rs.release_id IN (${idPlaceholders})
    ORDER BY rs.release_id, s.name COLLATE NOCASE, s.id
  `).all(...internalIds) as Array<{ release_id: number; name: string }>;

  for (const row of styleRows) {
    grouped.get(row.release_id)?.styles.push(row.name);
  }

  const genreRows = db.prepare(`
    SELECT rg.release_id, g.name
    FROM release_genres rg
    JOIN genres g ON g.id = rg.genre_id
    WHERE rg.release_id IN (${idPlaceholders})
    ORDER BY rg.release_id, g.name COLLATE NOCASE, g.id
  `).all(...internalIds) as Array<{ release_id: number; name: string }>;

  for (const row of genreRows) {
    grouped.get(row.release_id)?.genres.push(row.name);
  }

  const labelRows = db.prepare(`
    SELECT rl.release_id, l.name
    FROM release_labels rl
    JOIN labels l ON l.id = rl.label_id
    WHERE rl.release_id IN (${idPlaceholders})
    ORDER BY rl.release_id, rl.position, rl.rowid
  `).all(...internalIds) as Array<{ release_id: number; name: string }>;

  for (const row of labelRows) {
    grouped.get(row.release_id)?.labels.push(row.name);
  }

  return grouped;
}

export function firstRelationOrderBy(
  relation: 'artist' | 'label' | 'styles',
  direction: 'ASC' | 'DESC',
): string {
  if (relation === 'artist') {
    return `ORDER BY COALESCE((
      SELECT a.name
      FROM release_artists ra
      JOIN artists a ON a.id = ra.artist_id
      WHERE ra.release_id = r.id
      ORDER BY ra.position ASC, ra.rowid ASC
      LIMIT 1
    ), '') ${direction}`;
  }

  if (relation === 'label') {
    return `ORDER BY COALESCE((
      SELECT l.name
      FROM release_labels rl
      JOIN labels l ON l.id = rl.label_id
      WHERE rl.release_id = r.id
      ORDER BY rl.position ASC, rl.rowid ASC
      LIMIT 1
    ), '') ${direction}`;
  }

  return `ORDER BY COALESCE((
    SELECT s.name
    FROM release_styles rs
    JOIN styles s ON s.id = rs.style_id
    WHERE rs.release_id = r.id
    ORDER BY s.name COLLATE NOCASE ASC, s.id ASC
    LIMIT 1
  ), '') ${direction}`;
}
