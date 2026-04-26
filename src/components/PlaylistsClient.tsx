'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, GripVertical, ListMusic, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CollectionPlaylist, usePlaylists } from '@/hooks/usePlaylists';

const formatDate = (date: string) => new Date(date).toLocaleDateString();

function PlaylistReleaseCard({
  release,
  playlistId,
  onRemove,
  isDragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  release: CollectionPlaylist['releases'][number];
  playlistId: string;
  onRemove: (playlistId: string, releaseId: number) => void;
  isDragging: boolean;
  onDragStart: (releaseId: number) => void;
  onDragEnter: (releaseId: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(release.id));
        onDragStart(release.id);
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter(release.id);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      className={`grid cursor-grab gap-3 rounded-lg border bg-white p-3 transition sm:grid-cols-[32px_96px_1fr_auto] ${
        isDragging ? 'border-blue-300 bg-blue-50 opacity-70 shadow-md' : 'hover:border-blue-200'
      }`}
    >
      <div className="flex items-center justify-center text-muted-foreground" title="Drag to reorder">
        <GripVertical className="h-5 w-5" />
      </div>
      {release.coverImage ? (
        <div
          role="img"
          aria-label={`${release.title} cover`}
          className="h-24 w-24 rounded-md bg-cover bg-center"
          style={{ backgroundImage: `url("${release.coverImage}")` }}
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
          No Image
        </div>
      )}
      <div className="min-w-0 space-y-2">
        <div>
          <a
            href={`https://www.discogs.com/release/${release.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-blue-700 hover:underline"
          >
            {release.title}
          </a>
          <p className="text-sm text-muted-foreground">{release.artist}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {release.year > 0 && (
            <span className="rounded border bg-gray-50 px-2 py-1 text-xs text-gray-700">{release.year}</span>
          )}
          {release.styles.slice(0, 4).map((style) => (
            <span key={style} className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800">
              {style}
            </span>
          ))}
        </div>
        {release.labels.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">{Array.from(new Set(release.labels)).join(', ')}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(playlistId, release.id)}
        title="Remove from playlist"
        aria-label={`Remove ${release.title} from playlist`}
        className="self-start"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function PlaylistsClient() {
  const searchParams = useSearchParams();
  const selectedPlaylistId = searchParams.get('playlist');
  const { playlists, createPlaylist, deletePlaylist, removeReleaseFromPlaylist, reorderPlaylistReleases } = usePlaylists();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [draggedReleaseId, setDraggedReleaseId] = useState<number | null>(null);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) || playlists[0],
    [playlists, selectedPlaylistId]
  );

  const handleCreatePlaylist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const playlist = createPlaylist(name, description);
    if (!playlist) {
      toast.error('Playlist name is required');
      return;
    }

    setName('');
    setDescription('');
    toast.success(`Created "${playlist.name}"`);
  };

  const handleDeletePlaylist = (playlist: CollectionPlaylist) => {
    deletePlaylist(playlist.id);
    toast.success(`Deleted "${playlist.name}"`);
  };

  const handleRemoveRelease = (playlistId: string, releaseId: number) => {
    removeReleaseFromPlaylist(playlistId, releaseId);
    toast.success('Removed from playlist');
  };

  const handleDragStart = (releaseId: number) => {
    setDraggedReleaseId(releaseId);
  };

  const handleDragEnter = (targetReleaseId: number) => {
    if (!selectedPlaylist || draggedReleaseId === null || draggedReleaseId === targetReleaseId) {
      return;
    }

    const currentIds = selectedPlaylist.releaseIds;
    const fromIndex = currentIds.indexOf(draggedReleaseId);
    const toIndex = currentIds.indexOf(targetReleaseId);

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    const nextIds = [...currentIds];
    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    reorderPlaylistReleases(selectedPlaylist.id, nextIds);
  };

  const handleDragEnd = () => {
    setDraggedReleaseId(null);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="mx-auto max-w-6xl space-y-6 px-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold">Playlists</h1>
            <p className="text-muted-foreground">Build lists from records already in your collection.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Collection
            </Link>
          </Button>
        </header>

        <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Plus className="h-5 w-5" />
                  New Playlist
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={handleCreatePlaylist}>
                  <div className="space-y-1">
                    <label htmlFor="playlist-name" className="text-sm font-medium">Name</label>
                    <input
                      id="playlist-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Late night records"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="playlist-description" className="text-sm font-medium">Notes</label>
                    <textarea
                      id="playlist-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Optional"
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    <Plus className="h-4 w-4" />
                    Create Playlist
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {playlists.length > 0 ? (
                playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className={`rounded-lg border p-3 ${
                      selectedPlaylist?.id === playlist.id ? 'border-blue-300 bg-blue-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/playlists?playlist=${playlist.id}`} className="min-w-0 flex-1">
                        <div className="truncate font-medium">{playlist.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {playlist.releaseIds.length} {playlist.releaseIds.length === 1 ? 'record' : 'records'}
                        </div>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletePlaylist(playlist)}
                        title="Delete playlist"
                        aria-label={`Delete ${playlist.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Create a playlist, then add records from the collection page.
                </div>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <ListMusic className="h-5 w-5" />
                  <span className="truncate">{selectedPlaylist?.name || 'No playlist selected'}</span>
                </span>
                {selectedPlaylist && (
                  <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    Updated {formatDate(selectedPlaylist.updatedAt)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedPlaylist ? (
                <div className="space-y-4">
                  {selectedPlaylist.description && (
                    <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{selectedPlaylist.description}</p>
                  )}
                  {selectedPlaylist.releaseIds.length > 0 ? (
                    <div className="space-y-3">
                      {selectedPlaylist.releaseIds.map((releaseId) => {
                        const release = selectedPlaylist.releases[releaseId];

                        return release ? (
                          <PlaylistReleaseCard
                            key={releaseId}
                            release={release}
                            playlistId={selectedPlaylist.id}
                            onRemove={handleRemoveRelease}
                            isDragging={draggedReleaseId === releaseId}
                            onDragStart={handleDragStart}
                            onDragEnter={handleDragEnter}
                            onDragEnd={handleDragEnd}
                          />
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                      This playlist is empty.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                  Create a playlist to get started.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
