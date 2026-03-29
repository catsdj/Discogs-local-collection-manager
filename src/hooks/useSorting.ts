import { useCallback } from 'react';
import { useCollectionStore } from '@/stores/useCollectionStore';
import { SortColumn, SortDirection } from '@/types/discogs';

export function useSorting() {
  const {
    sortColumn,
    sortDirection,
    setSortColumn,
    setSortDirection,
    toggleSort,
    setCurrentPage,
  } = useCollectionStore();

  const handleSort = useCallback(
    (column: SortColumn | string, fetchFn?: (styles: string[], page: number, includeDetails: boolean) => void, selectedStyles?: string[], includeDetails?: boolean) => {
      const newSortColumn = column;
      let newSortDirection: SortDirection = 'asc';

      if (sortColumn === column) {
        newSortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      }

      setSortColumn(newSortColumn);
      setSortDirection(newSortDirection);
      setCurrentPage(1);

      // Fetch data with new sorting if fetch function is provided
      if (fetchFn && selectedStyles !== undefined && includeDetails !== undefined) {
        fetchFn(selectedStyles, 1, includeDetails);
      }
    },
    [sortColumn, sortDirection, setSortColumn, setSortDirection, setCurrentPage]
  );

  return {
    sortColumn,
    sortDirection,
    handleSort,
    toggleSort,
  };
}


