import { Suspense } from 'react';
import PlaylistsClient from '@/components/PlaylistsClient';

export default function PlaylistsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading playlists...</div>}>
      <PlaylistsClient />
    </Suspense>
  );
}
