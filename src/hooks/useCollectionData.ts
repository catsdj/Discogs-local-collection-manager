import { useCallback } from 'react';
import { useCollectionStore } from '@/stores/useCollectionStore';

export function useCollectionData() {
  const {
    setIsLoading,
    setError,
    setData,
    setCurrentPage,
    setIncludeDetails,
    setAllAvailableStyles,
    rowsPerPage,
    sortColumn,
    sortDirection,
  } = useCollectionStore();

  const fetchCollection = useCallback(
    async (
      styles: string[] = [],
      page: number = 1,
      withDetails: boolean = false,
      customPerPage?: number
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (styles.length > 0) {
          params.set('styles', styles.join(','));
        } else {
          params.set('get_all_styles', 'true');
        }
        params.set('page', page.toString());
        params.set('per_page', (customPerPage || rowsPerPage).toString());
        params.set('sort_column', sortColumn);
        params.set('sort_direction', sortDirection);
        if (withDetails) {
          params.set('include_details', 'true');
        }

        const url = `/api/discogs${params.toString() ? `?${params.toString()}` : ''}`;
        const response = await fetch(url);

        if (response.status === 429) {
          const retryAfter = response.headers.get('X-RateLimit-Reset-After');
          const retrySeconds = retryAfter ? parseInt(retryAfter) : 60;
          setError(`Rate limit exceeded. Please wait ${retrySeconds} seconds before trying again.`);
          return;
        }

        const result = await response.json();

        if (result.error) {
          setError(result.error);
        } else {
          console.log('Collection data received:', {
            releasesCount: result.releases?.length || 0,
            totalCollection: result.totalCollection,
            totalFiltered: result.totalFiltered,
            pagination: result.pagination,
          });
          setData(result);
          setCurrentPage(page);
          setIncludeDetails(result.includeDetails || false);

          if (result.availableStyles && result.availableStyles.length > 0) {
            setAllAvailableStyles(result.availableStyles);
          }
        }
      } catch (error) {
        console.error('Error fetching collection:', error);
        setError('Failed to fetch collection');
      } finally {
        setIsLoading(false);
      }
    },
    [
      setIsLoading,
      setError,
      setData,
      setCurrentPage,
      setIncludeDetails,
      setAllAvailableStyles,
      rowsPerPage,
      sortColumn,
      sortDirection,
    ]
  );

  const loadAllStyles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = '/api/discogs?get_all_styles=true';
      const response = await fetch(url);

      if (response.status === 429) {
        const retryAfter = response.headers.get('X-RateLimit-Reset-After');
        const retrySeconds = retryAfter ? parseInt(retryAfter) : 60;
        setError(`Rate limit exceeded. Please wait ${retrySeconds} seconds before trying again.`);
        return;
      }

      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        console.log('All styles loaded:', {
          stylesCount: result.availableStyles?.length || 0,
          totalCollection: result.totalCollection,
          firstFewStyles: result.availableStyles?.slice(0, 10) || [],
        });

        setData(result);
        setCurrentPage(1);
        setAllAvailableStyles(result.availableStyles || []);
      }
    } catch (error) {
      console.error('Error loading all styles:', error);
      setError('Failed to load all styles');
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setError, setData, setCurrentPage, setAllAvailableStyles]);

  const fetchAllReleasesForAnalytics = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('get_all_styles', 'true');
      params.set('page', '1');
      params.set('per_page', '1000');

      const url = `/api/discogs${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (response.ok) {
        const analyticsData = await response.json();
        return analyticsData.releases || [];
      }
      return [];
    } catch (error) {
      console.error('Error fetching all releases for analytics:', error);
      return [];
    }
  }, []);

  return {
    fetchCollection,
    loadAllStyles,
    fetchAllReleasesForAnalytics,
  };
}


