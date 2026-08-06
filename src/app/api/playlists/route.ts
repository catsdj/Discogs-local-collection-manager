import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { rejectIfNotLocal } from '@/lib/requestSecurity';

export const runtime = 'nodejs';

const MAX_PLAYLIST_NAME_LENGTH = 120;
const MAX_PLAYLIST_DESCRIPTION_LENGTH = 2_000;
const MAX_PLAYLIST_RELEASES = 2_000;

type PlaylistResponse = {
  id: string;
  name: string;
  description?: string;
  releaseIds: number[];
  releases: Record<number, PlaylistReleaseSnapshot>;
  createdAt: string;
  updatedAt: string;
};

type PlaylistReleaseSnapshot = {
  id: number;
  collectionId: number;
  title: string;
  artist: string;
  year: number;
  coverImage: string;
  labels: string[];
  styles: string[];
  dateAdded: string;
};

type PlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type PlaylistReleaseRow = {
  playlist_id: string;
  position: number;
  discogs_id: number;
  title: string;
  year: number | null;
  cover_image_url: string | null;
  date_added: string;
  artists: string | null;
  labels: string | null;
  styles: string | null;
};

function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength)
    : '';
}

function parseDiscogsId(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function parsePlaylistId(value: unknown): string | null {
  const id = sanitizeText(value, 128);
  return id ? id : null;
}

function parseReleaseIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > MAX_PLAYLIST_RELEASES) {
    return null;
  }

  const releaseIds = value.map(parseDiscogsId);
  if (releaseIds.some((releaseId) => releaseId === null)) {
    return null;
  }

  const uniqueReleaseIds = Array.from(new Set(releaseIds as number[]));
  return uniqueReleaseIds.length === releaseIds.length ? uniqueReleaseIds : null;
}

function splitValues(value: string | null): string[] {
  return value ? value.split('\u001f').filter(Boolean) : [];
}

function loadPlaylists(db: Database.Database): PlaylistResponse[] {
  const playlists = db.prepare(`
    SELECT id, name, description, created_at, updated_at
    FROM playlists
    ORDER BY updated_at DESC, created_at DESC, id DESC
  `).all() as PlaylistRow[];

  if (playlists.length === 0) {
    return [];
  }

  const playlistIds = playlists.map((playlist) => playlist.id);
  const placeholders = playlistIds.map(() => '?').join(',');
  const playlistReleases = db.prepare(`
    SELECT
      pr.playlist_id,
      pr.position,
      r.discogs_id,
      r.title,
      r.year,
      r.cover_image_url,
      r.date_added,
      (
        SELECT GROUP_CONCAT(a.name, char(31))
        FROM release_artists ra
        JOIN artists a ON a.id = ra.artist_id
        WHERE ra.release_id = r.id
      ) AS artists,
      (
        SELECT GROUP_CONCAT(l.name, char(31))
        FROM release_labels rl
        JOIN labels l ON l.id = rl.label_id
        WHERE rl.release_id = r.id
      ) AS labels,
      (
        SELECT GROUP_CONCAT(s.name, char(31))
        FROM release_styles rs
        JOIN styles s ON s.id = rs.style_id
        WHERE rs.release_id = r.id
      ) AS styles
    FROM playlist_releases pr
    JOIN releases r ON r.id = pr.release_id
    WHERE pr.playlist_id IN (${placeholders})
    ORDER BY pr.playlist_id, pr.position, pr.release_id
  `).all(...playlistIds) as PlaylistReleaseRow[];

  const responseById = new Map<string, PlaylistResponse>(
    playlists.map((playlist) => [
      playlist.id,
      {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || undefined,
        releaseIds: [],
        releases: {},
        createdAt: playlist.created_at,
        updatedAt: playlist.updated_at,
      },
    ]),
  );

  for (const release of playlistReleases) {
    const playlist = responseById.get(release.playlist_id);
    if (!playlist) {
      continue;
    }

    playlist.releaseIds.push(release.discogs_id);
    playlist.releases[release.discogs_id] = {
      id: release.discogs_id,
      collectionId: release.discogs_id,
      title: release.title,
      artist: splitValues(release.artists).join(', '),
      year: release.year || 0,
      coverImage: release.cover_image_url || '',
      labels: splitValues(release.labels),
      styles: splitValues(release.styles),
      dateAdded: release.date_added,
    };
  }

  return playlists.map((playlist) => responseById.get(playlist.id)!);
}

function getPlaylist(db: Database.Database, playlistId: string): PlaylistResponse | null {
  return loadPlaylists(db).find((playlist) => playlist.id === playlistId) || null;
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function ensurePlaylistExists(db: Database.Database, playlistId: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM playlists WHERE id = ?').get(playlistId));
}

function touchPlaylist(db: Database.Database, playlistId: string): void {
  db.prepare(`UPDATE playlists SET updated_at = datetime('now') WHERE id = ?`).run(playlistId);
}

export async function GET(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  try {
    const db = getDatabase().getDb();
    return NextResponse.json({ playlists: loadPlaylists(db) });
  } catch (error) {
    console.error('Failed to load playlists:', error);
    return jsonError('Failed to load playlists.', 500);
  }
}

export async function POST(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError('Invalid request body.', 400);
  }

  try {
    const action = body.action;
    const db = getDatabase().getDb();

    if (action === 'create') {
      const name = sanitizeText(body.name, MAX_PLAYLIST_NAME_LENGTH);
      if (!name) {
        return jsonError('A playlist name is required.', 400);
      }

      const playlistId = randomUUID();
      const description = sanitizeText(body.description, MAX_PLAYLIST_DESCRIPTION_LENGTH) || null;
      db.prepare('INSERT INTO playlists (id, name, description) VALUES (?, ?, ?)').run(playlistId, name, description);
      return NextResponse.json({ playlist: getPlaylist(db, playlistId) }, { status: 201 });
    }

    if (action === 'delete') {
      const playlistId = parsePlaylistId(body.playlistId);
      if (!playlistId) {
        return jsonError('A valid playlist id is required.', 400);
      }

      const result = db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId);
      if (result.changes === 0) {
        return jsonError('Playlist not found.', 404);
      }

      return NextResponse.json({ deletedPlaylistId: playlistId });
    }

    if (action === 'add-release') {
      const playlistId = parsePlaylistId(body.playlistId);
      const discogsId = parseDiscogsId(body.releaseId);
      if (!playlistId || !discogsId) {
        return jsonError('A valid playlist and release are required.', 400);
      }

      if (!ensurePlaylistExists(db, playlistId)) {
        return jsonError('Playlist not found.', 404);
      }

      const release = db.prepare('SELECT id FROM releases WHERE discogs_id = ?').get(discogsId) as { id: number } | undefined;
      if (!release) {
        return jsonError('Release is not in the local collection. Import it before adding it to a playlist.', 409);
      }

      const nextPosition = db.prepare(`
        SELECT COALESCE(MAX(position), -1) + 1 AS position
        FROM playlist_releases
        WHERE playlist_id = ?
      `).get(playlistId) as { position: number };
      const result = db.prepare(`
        INSERT OR IGNORE INTO playlist_releases (playlist_id, release_id, position)
        VALUES (?, ?, ?)
      `).run(playlistId, release.id, nextPosition.position);

      if (result.changes > 0) {
        touchPlaylist(db, playlistId);
      }

      return NextResponse.json({ playlist: getPlaylist(db, playlistId) });
    }

    if (action === 'remove-release') {
      const playlistId = parsePlaylistId(body.playlistId);
      const discogsId = parseDiscogsId(body.releaseId);
      if (!playlistId || !discogsId) {
        return jsonError('A valid playlist and release are required.', 400);
      }

      if (!ensurePlaylistExists(db, playlistId)) {
        return jsonError('Playlist not found.', 404);
      }

      const result = db.prepare(`
        DELETE FROM playlist_releases
        WHERE playlist_id = ?
          AND release_id = (SELECT id FROM releases WHERE discogs_id = ?)
      `).run(playlistId, discogsId);
      if (result.changes > 0) {
        touchPlaylist(db, playlistId);
      }

      return NextResponse.json({ playlist: getPlaylist(db, playlistId) });
    }

    if (action === 'reorder-releases') {
      const playlistId = parsePlaylistId(body.playlistId);
      const releaseIds = parseReleaseIds(body.releaseIds);
      if (!playlistId || !releaseIds) {
        return jsonError('A valid playlist and ordered release list are required.', 400);
      }

      if (!ensurePlaylistExists(db, playlistId)) {
        return jsonError('Playlist not found.', 404);
      }

      const existingReleaseIds = db.prepare(`
        SELECT r.discogs_id
        FROM playlist_releases pr
        JOIN releases r ON r.id = pr.release_id
        WHERE pr.playlist_id = ?
      `).all(playlistId) as Array<{ discogs_id: number }>;
      const existingIds = existingReleaseIds.map((release) => release.discogs_id);
      const validOrder = releaseIds.length === existingIds.length
        && releaseIds.every((releaseId) => existingIds.includes(releaseId));
      if (!validOrder) {
        return jsonError('The ordered releases must exactly match the playlist contents.', 400);
      }

      if (releaseIds.length === 0) {
        touchPlaylist(db, playlistId);
        return NextResponse.json({ playlist: getPlaylist(db, playlistId) });
      }

      const releaseIdByDiscogsId = new Map(existingReleaseIds.map((release) => [release.discogs_id, release.discogs_id]));
      const localReleaseIds = db.prepare(`
        SELECT id, discogs_id FROM releases
        WHERE discogs_id IN (${releaseIds.map(() => '?').join(',')})
      `).all(...releaseIds) as Array<{ id: number; discogs_id: number }>;
      const localReleaseIdByDiscogsId = new Map(localReleaseIds.map((release) => [release.discogs_id, release.id]));
      const updatePosition = db.prepare(`
        UPDATE playlist_releases
        SET position = ?
        WHERE playlist_id = ? AND release_id = ?
      `);

      db.transaction(() => {
        releaseIds.forEach((discogsId, position) => {
          const releaseId = localReleaseIdByDiscogsId.get(discogsId);
          if (!releaseId || !releaseIdByDiscogsId.has(discogsId)) {
            throw new Error('Playlist release no longer exists in the local collection.');
          }
          updatePosition.run(position, playlistId, releaseId);
        });
        touchPlaylist(db, playlistId);
      })();

      return NextResponse.json({ playlist: getPlaylist(db, playlistId) });
    }

    return jsonError('Unknown playlist action.', 400);
  } catch (error) {
    console.error('Failed to update playlists:', error);
    return jsonError('Failed to update playlists.', 500);
  }
}
