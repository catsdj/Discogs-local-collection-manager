export const COLLECTION_SYNC_PERIODS = [
  'week',
  'month',
  'three_months',
  'six_months',
  'year',
  'all',
] as const;

export type CollectionSyncPeriod = (typeof COLLECTION_SYNC_PERIODS)[number];

export const COLLECTION_SYNC_PERIOD_OPTIONS: Array<{
  value: CollectionSyncPeriod;
  label: string;
}> = [
  { value: 'week', label: '1 week' },
  { value: 'month', label: '1 month' },
  { value: 'three_months', label: '3 months' },
  { value: 'six_months', label: '6 months' },
  { value: 'year', label: '1 year' },
  { value: 'all', label: 'All' },
];

export function parseCollectionSyncPeriod(value: unknown): CollectionSyncPeriod | null {
  return typeof value === 'string' && COLLECTION_SYNC_PERIODS.includes(value as CollectionSyncPeriod)
    ? value as CollectionSyncPeriod
    : null;
}

export function getCollectionSyncPeriodLabel(period: CollectionSyncPeriod): string {
  return COLLECTION_SYNC_PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'All';
}

function subtractCalendarMonths(date: Date, months: number): void {
  const dayOfMonth = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
}

/**
 * The scope is based on when the release was added to the user's Discogs collection,
 * not on the record's original release date.
 */
export function getCollectionSyncCutoff(period: CollectionSyncPeriod, now = new Date()): Date | null {
  if (period === 'all') {
    return null;
  }

  const cutoff = new Date(now);

  switch (period) {
    case 'week':
      cutoff.setDate(cutoff.getDate() - 7);
      break;
    case 'month':
      subtractCalendarMonths(cutoff, 1);
      break;
    case 'three_months':
      subtractCalendarMonths(cutoff, 3);
      break;
    case 'six_months':
      subtractCalendarMonths(cutoff, 6);
      break;
    case 'year':
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
  }

  return cutoff;
}
