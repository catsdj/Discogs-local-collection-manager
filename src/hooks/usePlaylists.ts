'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiscogsRelease } from '@/types/discogs';
import { createInFlightShare, createVisibilityRefreshGate } from '@/lib/sharedRequest';

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

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Playlist request failed.');
  }

  return body;
}

async function fetchPlaylists(): Promise<CollectionPlaylist[]> {
  const response = await fetch('/api/playlists');
  const body = await readResponse(response);
  return Array.isArray(body.playlists) ? body.playlists as CollectionPlaylist[] : [];
}

const sharePlaylistFetch = createInFlightShare<CollectionPlaylist[]>();
const playlistVisibilityGate = createVisibilityRefreshGate();

async function loadPlaylists(): Promise<CollectionPlaylist[]> {
  return sharePlaylistFetch(fetchPlaylists);
}

async function postPlaylistAction(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch('/api/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return readResponse(response);
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<CollectionPlaylist[]>([]);

  const refreshPlaylists = useCallback(async (): Promise<CollectionPlaylist[]> => {
    const nextPlaylists = await loadPlaylists();
    setPlaylists(nextPlaylists);
    return nextPlaylists;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const nextPlaylists = await loadPlaylists();

        if (!cancelled) {
          setPlaylists(nextPlaylists);
        }
      } catch (error) {
        console.error('Failed to load playlists:', error);
      }
    };

    const refreshOnVisibility = () => {
      if (!playlistVisibilityGate.shouldRefresh(document.visibilityState)) {
        return;
      }

      void refreshPlaylists().catch((error) => console.error('Failed to refresh playlists:', error));
    };

    void initialize();
    document.addEventListener('visibilitychange', refreshOnVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [refreshPlaylists]);

  const replacePlaylist = useCallback((playlist: CollectionPlaylist) => {
    setPlaylists((current) => current.map((item) => (item.id === playlist.id ? playlist : item)));
  }, []);

  const createPlaylist = useCallback(async (name: string, description?: string): Promise<CollectionPlaylist | null> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }

    const body = await postPlaylistAction({ action: 'create', name: trimmedName, description });
    const playlist = body.playlist as CollectionPlaylist | null;
    if (!playlist) {
      throw new Error('Playlist was created without a response payload.');
    }

    setPlaylists((current) => [playlist, ...current]);
    return playlist;
  }, []);

  const deletePlaylist = useCallback(async (playlistId: string): Promise<void> => {
    await postPlaylistAction({ action: 'delete', playlistId });
    setPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId));
  }, []);

  const addReleaseToPlaylist = useCallback(async (playlistId: string, release: DiscogsRelease): Promise<void> => {
    const body = await postPlaylistAction({
      action: 'add-release',
      playlistId,
      releaseId: release.basic_information.id,
    });
    const playlist = body.playlist as CollectionPlaylist | null;
    if (!playlist) {
      throw new Error('Playlist update did not return the updated playlist.');
    }

    replacePlaylist(playlist);
  }, [replacePlaylist]);

  const removeReleaseFromPlaylist = useCallback(async (playlistId: string, releaseId: number): Promise<void> => {
    const body = await postPlaylistAction({ action: 'remove-release', playlistId, releaseId });
    const playlist = body.playlist as CollectionPlaylist | null;
    if (!playlist) {
      throw new Error('Playlist update did not return the updated playlist.');
    }

    replacePlaylist(playlist);
  }, [replacePlaylist]);

  const reorderPlaylistReleases = useCallback(async (playlistId: string, orderedReleaseIds: number[]): Promise<void> => {
    const body = await postPlaylistAction({
      action: 'reorder-releases',
      playlistId,
      releaseIds: orderedReleaseIds,
    });
    const playlist = body.playlist as CollectionPlaylist | null;
    if (!playlist) {
      throw new Error('Playlist update did not return the updated playlist.');
    }

    replacePlaylist(playlist);
  }, [replacePlaylist]);

  const toggleReleaseInPlaylist = useCallback(async (playlistId: string, release: DiscogsRelease): Promise<void> => {
    const releaseId = release.basic_information.id;
    const playlist = playlists.find((item) => item.id === playlistId);

    if (playlist?.releaseIds.includes(releaseId)) {
      await removeReleaseFromPlaylist(playlistId, releaseId);
      return;
    }

    await addReleaseToPlaylist(playlistId, release);
  }, [addReleaseToPlaylist, playlists, removeReleaseFromPlaylist]);

  const getPlaylistsForRelease = useCallback((releaseId: number) => (
    playlists.filter((playlist) => playlist.releaseIds.includes(releaseId))
  ), [playlists]);

  const playlistCount = useMemo(() => playlists.length, [playlists]);

  return {
    playlists,
    playlistCount,
    refreshPlaylists,
    createPlaylist,
    deletePlaylist,
    addReleaseToPlaylist,
    removeReleaseFromPlaylist,
    reorderPlaylistReleases,
    toggleReleaseInPlaylist,
    getPlaylistsForRelease,
  };
}
