'use client';

import { memo } from 'react';
import Link from 'next/link';
import { FileText, ListMusic, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import StyleMultiSelect from '@/components/StyleMultiSelect';
import {
  COLLECTION_SYNC_PERIOD_OPTIONS,
  CollectionSyncPeriod,
} from '@/lib/collectionSyncPeriod';

type ViewMode = 'table' | 'cards';

export const COLLECTION_PAGE_SIZES = [8, 16, 24, 32, 48];

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export const CollectionViewToggle = memo(function CollectionViewToggle({
  viewMode,
  onViewModeChange,
}: ViewToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">View:</span>
      <div className="flex border rounded">
        <button
          type="button"
          onClick={() => onViewModeChange('table')}
          className={`px-3 py-1 text-sm transition-colors ${
            viewMode === 'table'
              ? 'bg-blue-600 text-white'
              : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          Table
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('cards')}
          className={`px-3 py-1 text-sm transition-colors ${
            viewMode === 'cards'
              ? 'bg-blue-600 text-white'
              : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          Cards
        </button>
      </div>
    </div>
  );
});

export function CollectionActionNotes() {
  return (
    <div className="space-y-2 rounded-md border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Refresh details &amp; prices:</span>{' '}
        fills missing tracklists and videos, refreshes missing or week-old marketplace prices, and updates
        core release details. It does not import new collection entries or update their conditions.
      </p>
      <p>
        <span className="font-medium text-foreground">Import releases &amp; conditions:</span>{' '}
        reads your Discogs collection, adds releases that are not yet stored locally, and updates media and
        sleeve conditions. It does not remove local releases or refresh prices, videos, and tracklists.
      </p>
      <p>
        <span className="font-medium text-foreground">Added within:</span>{' '}
        limits both actions by the date a release was added to your Discogs collection, not its release year.
      </p>
    </div>
  );
}

interface CollectionSyncPeriodSelectProps {
  id: string;
  value: CollectionSyncPeriod;
  onChange: (period: CollectionSyncPeriod) => void;
  disabled?: boolean;
}

export const CollectionSyncPeriodSelect = memo(function CollectionSyncPeriodSelect({
  id,
  value,
  onChange,
  disabled = false,
}: CollectionSyncPeriodSelectProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm text-muted-foreground" htmlFor={id}>
        Added within:
      </label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as CollectionSyncPeriod)}
        disabled={disabled}
        className="h-8 w-28 py-1"
      >
        {COLLECTION_SYNC_PERIOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
});

interface RowsPerPageDropdownProps {
  viewMode: ViewMode;
  rowsPerPage: number;
  onRowsPerPageChange: (value: number) => void;
}

export const CollectionRowsPerPageDropdown = memo(function CollectionRowsPerPageDropdown({
  viewMode,
  rowsPerPage,
  onRowsPerPageChange,
}: RowsPerPageDropdownProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">
        {viewMode === 'cards' ? 'Cards per page:' : 'Rows per page:'}
      </span>
      <Select
        value={rowsPerPage}
        onChange={(e) => onRowsPerPageChange(parseInt(e.target.value, 10))}
        className="h-8 w-28 py-1"
      >
        {COLLECTION_PAGE_SIZES.map((pageSize) => (
          <option key={pageSize} value={pageSize}>
            {pageSize} {viewMode === 'cards' ? 'cards' : 'rows'}
          </option>
        ))}
      </Select>
    </div>
  );
});

interface CardSortingControlsProps {
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
}

export const CollectionCardSortingControls = memo(function CollectionCardSortingControls({
  sortColumn,
  sortDirection,
  onSort,
}: CardSortingControlsProps) {
  const sortOptions = [
    { value: 'title', label: 'Title', icon: '📝' },
    { value: 'artist', label: 'Artist', icon: '👤' },
    { value: 'year', label: 'Year', icon: '📅' },
    { value: 'date_added', label: 'Date Added', icon: '📆' },
    { value: 'lowest_price', label: 'Price', icon: '💰' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-muted-foreground" htmlFor="card-sort">
        Sort by:
      </label>
      <Select
        id="card-sort"
        value={sortColumn}
        onChange={(event) => onSort(event.target.value)}
        className="h-8 w-32 py-1"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        onClick={() => onSort(sortColumn)}
        variant="outline"
        size="sm"
        aria-label={`Toggle sort direction; currently ${sortDirection === 'asc' ? 'ascending' : 'descending'}`}
      >
        {sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}
      </Button>
    </div>
  );
});

export interface CollectionSidebarProps {
  isCollectionLoading: boolean;
  isSyncing: boolean;
  isUpdating: boolean;
  syncedReleaseCount: number;
  cacheStats: { totalCached: number; cacheSize: string };
  onClearBrowserCache: () => void;
  discogsActionsDisabled: boolean;
  onSyncCollection: () => void;
  onUpdateCollection: () => void;
  syncPeriod: CollectionSyncPeriod;
  onSyncPeriodChange: (period: CollectionSyncPeriod) => void;
  allAvailableStyles: string[];
  selectedStyles: string[];
  onStyleSelectionChange: (styles: string[]) => void;
  styleFilterOpen: boolean;
  onStyleFilterOpenChange: (open: boolean) => void;
  showClearFilters: boolean;
  onClearFilters: () => void;
}

const CollectionSidebar = memo(function CollectionSidebar({
  isCollectionLoading,
  isSyncing,
  isUpdating,
  syncedReleaseCount,
  cacheStats,
  onClearBrowserCache,
  discogsActionsDisabled,
  onSyncCollection,
  onUpdateCollection,
  syncPeriod,
  onSyncPeriodChange,
  allAvailableStyles,
  selectedStyles,
  onStyleSelectionChange,
  styleFilterOpen,
  onStyleFilterOpenChange,
  showClearFilters,
  onClearFilters,
}: CollectionSidebarProps) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-4 space-y-4">
        <Card className="rounded-lg py-4">
          <CardHeader className="px-4 pb-2">
            <CardTitle className="text-base">Styles Filter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            {allAvailableStyles.length > 0 ? (
              <StyleMultiSelect
                styles={allAvailableStyles}
                selectedStyles={selectedStyles}
                onSelectionChange={onStyleSelectionChange}
                open={styleFilterOpen}
                onOpenChange={onStyleFilterOpenChange}
                placeholder="Select styles..."
                className="w-full"
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                {isCollectionLoading ? 'Loading styles...' : 'No styles available'}
              </div>
            )}
            {showClearFilters && (
              <Button variant="outline" onClick={onClearFilters} disabled={isCollectionLoading} className="w-full">
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg py-4">
          <CardHeader className="px-4 pb-2">
            <CardTitle className="text-base">Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/analytics">
                <TrendingUp className="h-4 w-4" />
                View Analytics
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/playlists">
                <ListMusic className="h-4 w-4" />
                Playlists
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/import-invoice">
                <FileText className="h-4 w-4" />
                Import Invoice
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-lg py-4">
          <CardHeader className="px-4 pb-2">
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            <CollectionSyncPeriodSelect
              id="collection-sync-period-desktop"
              value={syncPeriod}
              onChange={onSyncPeriodChange}
              disabled={isSyncing || isUpdating}
            />
            <Button
              onClick={onSyncCollection}
              disabled={discogsActionsDisabled || (isUpdating && !isSyncing)}
              className="w-full"
            >
              {isSyncing ? 'Stop Refresh' : 'Refresh Details & Prices'}
            </Button>
            <Button
              variant="outline"
              onClick={onUpdateCollection}
              disabled={discogsActionsDisabled || (isSyncing && !isUpdating)}
              className="w-full"
            >
              {isUpdating ? 'Stop Import' : 'Import Releases & Conditions'}
            </Button>
            <CollectionActionNotes />
            <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Database: {syncedReleaseCount} releases synced
            </div>
            {cacheStats.totalCached > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearBrowserCache}
                className="w-full text-xs"
                title="Clear legacy browser cache"
              >
                Clear Browser Cache ({cacheStats.totalCached})
              </Button>
            )}
          </CardContent>
        </Card>

      </div>
    </aside>
  );
});

export default CollectionSidebar;
