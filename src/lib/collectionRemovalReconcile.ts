import type Database from 'better-sqlite3';
import type { CollectionSyncPeriod } from './collectionSyncPeriod.ts';

export function shouldReconcileCollectionRemovals(input: {
  period: CollectionSyncPeriod;
  fetchComplete: boolean;
  stopRequested: boolean;
}): boolean {
  return input.period === 'all' && input.fetchComplete && !input.stopRequested;
}

export function deleteReleasesNotInDiscogsIds(
  db: Database.Database,
  discogsIds: Iterable<number>,
): number {
  return db.transaction((ids: number[]) => {
    db.exec('CREATE TEMP TABLE fetched_collection_ids (discogs_id INTEGER PRIMARY KEY)');
    const insert = db.prepare(
      'INSERT OR IGNORE INTO fetched_collection_ids (discogs_id) VALUES (?)',
    );

    for (const discogsId of ids) {
      if (Number.isInteger(discogsId)) {
        insert.run(discogsId);
      }
    }

    const result = db.prepare(`
      DELETE FROM releases
      WHERE discogs_id NOT IN (SELECT discogs_id FROM fetched_collection_ids)
    `).run();

    db.exec('DROP TABLE fetched_collection_ids');
    return result.changes;
  })([...discogsIds]);
}
