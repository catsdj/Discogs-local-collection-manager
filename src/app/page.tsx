import { Suspense } from 'react';
import DiscogsCollection from '@/components/DiscogsCollection';

export default function Home() {
  return (
    <div className="min-h-screen p-4">
      <div className="max-w-none mx-auto px-4">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Discogs Collection Manager</h1>
          <p className="text-lg text-muted-foreground">
            Browse and filter your vinyl collection by music styles
          </p>
        </header>

        <main>
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading collection…</div>}>
            <DiscogsCollection />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
