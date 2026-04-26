'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiscogsRelease } from '@/types/discogs';

export interface PlaylistReleaseSnapshot {
  id: number;
  collectionId: number;
  title: string;
  artist: string;
  year: number;
  coverImage: string;
  labels: string[];
  styles: string[];
  dateAdded: string;
}

export interface CollectionPlaylist {
  id: string;
  name: string;
  description?: string;
  releaseIds: number[];
  releases: Record<number, PlaylistReleaseSnapshot>;
  createdAt: string;
  updatedAt: string;
}

const PLAYLISTS_STORAGE_KEY = 'discogsCollectionPlaylists';
const PLAYLISTS_CHANGED_EVENT = 'discogs-playlists-changed';

const isBrowser = () => typeof window !== 'undefined';

const createId = () => {
  if (isBrowser() && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizePlaylist = (playlist: CollectionPlaylist): CollectionPlaylist => ({
  ...playlist,
  releaseIds: Array.from(new Set(playlist.releaseIds || [])),
  releases: playlist.releases || {},
});

const readPlaylists = (): CollectionPlaylist[] => {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PLAYLISTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizePlaylist);
  } catch (error) {
    console.error('Failed to read playlists from localStorage:', error);
    return [];
  }
};

const writePlaylists = (playlists: CollectionPlaylist[]) => {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
  window.dispatchEvent(new CustomEvent(PLAYLISTS_CHANGED_EVENT));
};

export const createPlaylistSnapshot = (release: DiscogsRelease): PlaylistReleaseSnapshot => ({
  id: release.basic_information.id,
  collectionId: release.id,
  title: release.basic_information.title,
  artist: release.basic_information.artists.map((artist) => artist.name).join(', '),
  year: release.basic_information.year,
  coverImage: release.basic_information.cover_image,
  labels: release.basic_information.labels.map((label) => label.name),
  styles: release.basic_information.styles,
  dateAdded: release.date_added,
});

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<CollectionPlaylist[]>([]);

  useEffect(() => {
    const refresh = () => setPlaylists(readPlaylists());

    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(PLAYLISTS_CHANGED_EVENT, refresh);

    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(PLAYLISTS_CHANGED_EVENT, refresh);
    };
  }, []);

  const updatePlaylists = useCallback((updater: (current: CollectionPlaylist[]) => CollectionPlaylist[]) => {
    const nextPlaylists = updater(readPlaylists()).map(normalizePlaylist);
    writePlaylists(nextPlaylists);
    setPlaylists(nextPlaylists);
  }, []);

  const createPlaylist = useCallback((name: string, description?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }

    const now = new Date().toISOString();
    const playlist: CollectionPlaylist = {
      id: createId(),
      name: trimmedName,
      description: description?.trim() || undefined,
      releaseIds: [],
      releases: {},
      createdAt: now,
      updatedAt: now,
    };

    updatePlaylists((current) => [...current, playlist]);
    return playlist;
  }, [updatePlaylists]);

  const deletePlaylist = useCallback((playlistId: string) => {
    updatePlaylists((current) => current.filter((playlist) => playlist.id !== playlistId));
  }, [updatePlaylists]);

  const addReleaseToPlaylist = useCallback((playlistId: string, release: DiscogsRelease) => {
    const snapshot = createPlaylistSnapshot(release);
    const now = new Date().toISOString();

    updatePlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist;
        }

        return {
          ...playlist,
          releaseIds: Array.from(new Set([...playlist.releaseIds, snapshot.id])),
          releases: {
            ...playlist.releases,
            [snapshot.id]: snapshot,
          },
          updatedAt: now,
        };
      })
    );
  }, [updatePlaylists]);

  const removeReleaseFromPlaylist = useCallback((playlistId: string, releaseId: number) => {
    const now = new Date().toISOString();

    updatePlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist;
        }

        const remainingReleases = { ...playlist.releases };
        delete remainingReleases[releaseId];

        return {
          ...playlist,
          releaseIds: playlist.releaseIds.filter((id) => id !== releaseId),
          releases: remainingReleases,
          updatedAt: now,
        };
      })
    );
  }, [updatePlaylists]);

  const reorderPlaylistReleases = useCallback((playlistId: string, orderedReleaseIds: number[]) => {
    const now = new Date().toISOString();

    updatePlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId) {
          return playlist;
        }

        const knownReleaseIds = new Set(playlist.releaseIds);
        const orderedKnownIds = orderedReleaseIds.filter((releaseId) => knownReleaseIds.has(releaseId));
        const missingIds = playlist.releaseIds.filter((releaseId) => !orderedKnownIds.includes(releaseId));

        return {
          ...playlist,
          releaseIds: [...orderedKnownIds, ...missingIds],
          updatedAt: now,
        };
      })
    );
  }, [updatePlaylists]);

  const toggleReleaseInPlaylist = useCallback((playlistId: string, release: DiscogsRelease) => {
    const releaseId = release.basic_information.id;
    const playlist = readPlaylists().find((item) => item.id === playlistId);

    if (playlist?.releaseIds.includes(releaseId)) {
      removeReleaseFromPlaylist(playlistId, releaseId);
      return;
    }

    addReleaseToPlaylist(playlistId, release);
  }, [addReleaseToPlaylist, removeReleaseFromPlaylist]);

  const getPlaylistsForRelease = useCallback((releaseId: number) => (
    readPlaylists().filter((playlist) => playlist.releaseIds.includes(releaseId))
  ), []);

  const playlistCount = useMemo(() => playlists.length, [playlists]);

  return {
    playlists,
    playlistCount,
    createPlaylist,
    deletePlaylist,
    addReleaseToPlaylist,
    removeReleaseFromPlaylist,
    reorderPlaylistReleases,
    toggleReleaseInPlaylist,
    getPlaylistsForRelease,
  };
}
