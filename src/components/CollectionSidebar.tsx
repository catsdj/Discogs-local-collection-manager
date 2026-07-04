'use client';

import { memo } from 'react';
import Link from 'next/link';
import { FileText, ListMusic, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StyleMultiSelect from '@/components/StyleMultiSelect';

type ViewMode = 'table' | 'cards';

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
      <select
        value={rowsPerPage}
        onChange={(e) => onRowsPerPageChange(parseInt(e.target.value, 10))}
        className="px-2 py-1 text-sm border rounded bg-background"
      >
        {viewMode === 'cards' ? (
          <>
            <option value={8}>8 cards</option>
            <option value={16}>16 cards</option>
            <option value={24}>24 cards</option>
            <option value={32}>32 cards</option>
            <option value={48}>48 cards</option>
          </>
        ) : (
          <>
            <option value={10}>10 rows</option>
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={75}>75 rows</option>
            <option value={100}>100 rows</option>
          </>
        )}
      </select>
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
    <div className="rounded-lg border bg-gray-50 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">Sort by:</h3>
        <button
          type="button"
          onClick={() => onSort('title')}
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
        >
          Reset to Title
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {sortOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSort(option.value)}
            className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
              sortColumn === option.value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            <span>{option.icon}</span>
            <span>{option.label}</span>
            {sortColumn === option.value && (
              <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
            )}
          </button>
        ))}
      </div>
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
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  rowsPerPage: number;
  onRowsPerPageChange: (value: number) => void;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
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
  viewMode,
  onViewModeChange,
  rowsPerPage,
  onRowsPerPageChange,
  sortColumn,
  sortDirection,
  onSort,
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
            <Button onClick={onSyncCollection} disabled={discogsActionsDisabled} className="w-full">
              {isSyncing ? 'Fetching...' : 'Get Release Data'}
            </Button>
            <Button variant="outline" onClick={onUpdateCollection} disabled={discogsActionsDisabled} className="w-full">
              {isUpdating ? 'Updating...' : 'Update Collection'}
            </Button>
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

        <Card className="rounded-lg py-4">
          <CardHeader className="px-4 pb-2">
            <CardTitle className="text-base">Display</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            <CollectionViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
            <CollectionRowsPerPageDropdown
              viewMode={viewMode}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={onRowsPerPageChange}
            />
            {viewMode === 'cards' && (
              <CollectionCardSortingControls
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg py-4">
          <CardHeader className="px-4 pb-2">
            <CardTitle className="text-base">Filters</CardTitle>
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
      </div>
    </aside>
  );
});

export default CollectionSidebar;
