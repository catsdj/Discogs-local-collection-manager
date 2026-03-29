'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import StyleMultiSelect from '@/components/StyleMultiSelect';
import FilterDropdown, { FilterDropdownRef } from '@/components/FilterDropdown';
import CollectionAnalytics from '@/components/CollectionAnalytics';
import { getCachedDetails, isCached, clearCache, getCacheStats } from '@/lib/cache';
import { isValidDiscogsUrl, isValidYouTubeUrl } from '@/lib/clientSecurity';
import { TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

// Helper function to format currency with proper symbols
function formatCurrency(amount: number, currency: string = 'USD'): string {
  const locale = currency === 'EUR' ? 'de-DE' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

interface DiscogsRelease {
  id: number;
  basic_information: {
    id: number;
    title: string;
    year: number;
    cover_image: string;
    artists: Array<{ name: string }>;
    styles: string[];
    genres: string[];
    labels: Array<{ name: string }>;
  };
  date_added: string;
  media_condition?: string;
  sleeve_condition?: string;
  notes?: Array<{
    field_id: number;
    value: string;
  }>;
  videos?: Array<{
    uri: string;
    title: string;
    description: string;
    duration: number;
    embed: boolean;
  }>;
  tracklist?: Array<{
    position: string;
    title: string;
    duration: string;
    type_: string;
  }>;
  priceInfo?: {
    lowest_price: number | null;
    currency: string;
  };
  youtubePlaylistId?: string;
  youtubeVideoId?: string;
  discogsVideos?: Array<{ videoId: string; title: string; duration: string }>;
}

interface ReleaseDetailsState {
  videos: any[];
  tracklist: any[];
  priceInfo?: any;
  media_condition?: string | null;
  sleeve_condition?: string | null;
}

interface CollectionData {
  releases: DiscogsRelease[];
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
  availableStyles: string[];
  totalFiltered: number;
  totalCollection: number;
  getAllStyles?: boolean;
}

interface CollectionFilters {
  artistFilter: string;
  titleFilter: string;
  labelFilter: string;
  yearMinFilter: string;
  yearMaxFilter: string;
  yearValueFilter: string;
  dateAddedMinFilter: string;
  dateAddedMaxFilter: string;
  styleFilter: string[];
}

export default function DiscogsCollection() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<CollectionData | null>(null);
  const [allReleasesForAnalytics, setAllReleasesForAnalytics] = useState<DiscogsRelease[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [allAvailableStyles, setAllAvailableStyles] = useState<string[]>([]);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [releaseDetails, setReleaseDetails] = useState<Record<number, ReleaseDetailsState>>({});
  const [cacheStats, setCacheStats] = useState({ totalCached: 0, cacheSize: '0 KB' });
  const [rateLimitStatus, setRateLimitStatus] = useState({ 
    requestsThisMinute: 0, 
    remainingRequests: 60, 
    queueLength: 0 
  });
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [videosLoading, setVideosLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    // Load view mode from localStorage on initialization
    if (typeof window !== 'undefined') {
      const savedViewMode = localStorage.getItem('collectionViewMode');
      return (savedViewMode === 'cards' || savedViewMode === 'table') ? savedViewMode : 'table';
    }
    return 'table';
  });
  
  // Job state
  const [jobStatus, setJobStatus] = useState<{
    id: string | null;
    status: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    total: number;
    processed: number;
    startTime: Date | null;
    endTime: Date | null;
    error: string | null;
    results: {
      videosLoaded: number;
      pricesLoaded: number;
      errors: number;
    };
  }>({
    id: null,
    status: 'idle',
    progress: 0,
    total: 0,
    processed: 0,
    startTime: null,
    endTime: null,
    error: null,
    results: {
      videosLoaded: 0,
      pricesLoaded: 0,
      errors: 0
    }
  });
  
  // Filter states
  const [artistFilter, setArtistFilter] = useState('');
  const [titleFilter, setTitleFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [yearMinFilter, setYearMinFilter] = useState('');
  const [yearMaxFilter, setYearMaxFilter] = useState('');
  const [dateAddedMinFilter, setDateAddedMinFilter] = useState('');
  const [dateAddedMaxFilter, setDateAddedMaxFilter] = useState('');
  const [yearValueFilter, setYearValueFilter] = useState('');
  const [styleFilter, setStyleFilter] = useState<string[]>([]);
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<string>('date_added');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Filter dropdown state
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const filterDropdownRef = useRef<FilterDropdownRef>(null);

  const getActiveFilters = (): CollectionFilters => ({
    artistFilter,
    titleFilter,
    labelFilter,
    yearMinFilter,
    yearMaxFilter,
    yearValueFilter,
    dateAddedMinFilter,
    dateAddedMaxFilter,
    styleFilter,
  });

  const buildCollectionParams = (
    styles: string[] = [],
    page: number = 1,
    withDetails: boolean = includeDetails,
    customPerPage?: number,
    filterOverrides?: Partial<CollectionFilters>,
    sortOverrides?: { sortColumn?: string; sortDirection?: 'asc' | 'desc' }
  ) => {
    const filters = { ...getActiveFilters(), ...filterOverrides };
    const params = new URLSearchParams();

    if (styles.length > 0) {
      params.set('styles', styles.join(','));
    } else {
      params.set('get_all_styles', 'true');
    }

    params.set('page', page.toString());
    params.set('per_page', (customPerPage || rowsPerPage).toString());
    params.set('sort_column', sortOverrides?.sortColumn || sortColumn);
    params.set('sort_direction', sortOverrides?.sortDirection || sortDirection);

    if (withDetails) {
      params.set('include_details', 'true');
    }

    if (filters.artistFilter) {
      params.set('artist', filters.artistFilter);
    }
    if (filters.titleFilter) {
      params.set('title', filters.titleFilter);
    }
    if (filters.labelFilter) {
      params.set('label', filters.labelFilter);
    }
    if (filters.yearMinFilter) {
      params.set('year_min', filters.yearMinFilter);
    }
    if (filters.yearMaxFilter) {
      params.set('year_max', filters.yearMaxFilter);
    }
    if (filters.yearValueFilter) {
      params.set('year_value', filters.yearValueFilter);
    }
    if (filters.dateAddedMinFilter) {
      params.set('date_added_min', filters.dateAddedMinFilter);
    }
    if (filters.dateAddedMaxFilter) {
      params.set('date_added_max', filters.dateAddedMaxFilter);
    }
    if (filters.styleFilter.length > 0) {
      params.set('style_filter', filters.styleFilter.join(','));
    }

    return params;
  };

  const fetchAllCollectionPages = async (
    styles: string[] = [],
    filterOverrides?: Partial<CollectionFilters>
  ): Promise<DiscogsRelease[]> => {
    const releases: DiscogsRelease[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const params = buildCollectionParams(styles, page, false, 100, filterOverrides);
      const response = await fetch(`/api/discogs?${params.toString()}`);

      if (!response.ok) {
        break;
      }

      const result = await response.json();
      if (result.error) {
        break;
      }

      releases.push(...(result.releases || []));
      totalPages = result.pagination?.pages || 1;
      page += 1;
    } while (page <= totalPages);

    return releases;
  };

  // Helper function to add line breaks for text longer than 50 characters
  const addLineBreaks = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) {
      return text;
    }
    
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      if ((currentLine + word).length <= maxLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Single word longer than maxLength, keep it as is
          lines.push(word);
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.join('\n');
  };

  // Helper function to render styles with line breaks after every 3 styles
  const renderStyles = (styles: string[]) => {
    const chunks = [];
    for (let i = 0; i < styles.length; i += 3) {
      chunks.push(styles.slice(i, i + 3));
    }
    
    return chunks.map((chunk, chunkIndex) => (
      <div key={chunkIndex} className="flex flex-wrap gap-1 mb-1 last:mb-0">
        {chunk.map((style, index) => (
          <span
            key={index}
            className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded"
          >
            {style}
          </span>
        ))}
      </div>
    ));
  };

  // Note: Sorting is now handled server-side via API parameters

  // Function to handle column header click for sorting
  const handleSort = (column: string) => {
    const newSortColumn = column;
    let newSortDirection: 'asc' | 'desc' = 'asc';
    
    if (sortColumn === column) {
      newSortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }
    
    setSortColumn(newSortColumn);
    setSortDirection(newSortDirection);
    setCurrentPage(1); // Reset to first page when sorting changes
    
    // Fetch data with new sorting
    fetchCollection(selectedStyles, 1, includeDetails, undefined, undefined, {
      sortColumn: newSortColumn,
      sortDirection: newSortDirection,
    });
  };

  // Function to get Discogs URL for a release
  const getDiscogsUrl = (release: DiscogsRelease) => {
    const releaseId = release.basic_information.id;
    const url = `https://www.discogs.com/release/${releaseId}`;
    return isValidDiscogsUrl(url) ? url : '#';
  };

  // Function to get Discogs URL for a label
  const getDiscogsLabelUrl = (labelId: number) => {
    return `https://www.discogs.com/label/${labelId}`;
  };

  // Function to handle filter icon click
  const handleFilterClick = (column: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent sorting when clicking filter icon
    
    const rect = event.currentTarget.getBoundingClientRect();
    setFilterDropdownPosition({
      top: rect.bottom + 5,
      left: rect.left,
    });
    
    if (activeFilterColumn === column) {
      setActiveFilterColumn(null);
    } else {
      setActiveFilterColumn(column);
      // Focus the input after the dropdown opens
      setTimeout(() => {
        if (filterDropdownRef.current) {
          filterDropdownRef.current.focusInput();
        }
      }, 100);
    }
  };

  // Function to close filter dropdown
  const closeFilterDropdown = () => {
    setActiveFilterColumn(null);
  };

  // Function to apply filters
  const applyFilters = () => {
    closeFilterDropdown();
    setCurrentPage(1);

    window.setTimeout(() => {
      fetchCollection(selectedStyles, 1, includeDetails);
    }, 0);
  };

  // Function to check if a column has an active filter
  const hasActiveFilter = (column: string) => {
    switch (column) {
      case 'artist':
        return !!artistFilter;
      case 'title':
        return !!titleFilter;
      case 'label':
        return !!labelFilter;
      case 'year':
        return !!(yearMinFilter || yearMaxFilter || yearValueFilter);
      case 'styles':
        return styleFilter.length > 0;
      case 'date_added':
        return !!(dateAddedMinFilter || dateAddedMaxFilter);
      default:
        return false;
    }
  };

  // Function to clear a specific column filter
  const clearColumnFilter = (column: string) => {
    switch (column) {
      case 'artist':
        setArtistFilter('');
        break;
      case 'title':
        setTitleFilter('');
        break;
      case 'label':
        setLabelFilter('');
        break;
      case 'year':
        setYearMinFilter('');
        setYearMaxFilter('');
        setYearValueFilter('');
        break;
      case 'styles':
        setStyleFilter([]);
        break;
      case 'date_added':
        setDateAddedMinFilter('');
        setDateAddedMaxFilter('');
        break;
    }

    setCurrentPage(1);
    window.setTimeout(() => {
      fetchCollection(selectedStyles, 1, includeDetails);
    }, 0);
  };

  const fetchCollection = async (
    styles: string[] = [],
    page: number = 1,
    withDetails: boolean = includeDetails,
    customPerPage?: number,
    filterOverrides?: Partial<CollectionFilters>,
    sortOverrides?: { sortColumn?: string; sortDirection?: 'asc' | 'desc' }
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = buildCollectionParams(styles, page, withDetails, customPerPage, filterOverrides, sortOverrides);
      const url = `/api/discogs${params.toString() ? `?${params.toString()}` : ''}`;
      
      const response = await fetch(url);
      
      if (response.status === 429) {
        // Rate limit exceeded
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
        setIncludeDetails(Boolean(result.includeDetails));
        
        // Update available styles if we got new ones
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
  };

  const loadAllStyles = async () => {
    await fetchCollection([], 1, true);
  };

  // Fetch all releases for analytics (without pagination)
  const fetchAllReleasesForAnalytics = async () => {
    try {
      return await fetchAllCollectionPages([]);
    } catch (error) {
      console.error('Error fetching all releases for analytics:', error);
      return [];
    }
  };

  const handleStyleSelectionChange = (newSelectedStyles: string[]) => {
    setSelectedStyles(newSelectedStyles);
    setCurrentPage(1); // Reset to first page when changing style selection
    fetchCollection(newSelectedStyles, 1, includeDetails);
  };

  const clearFilters = () => {
    setSelectedStyles([]);
    setCurrentPage(1); // Reset to first page when clearing style filters
    fetchCollection([], 1, includeDetails); // Use fetchCollection with empty styles to get all records
  };

  const handlePageChange = (page: number) => {
    fetchCollection(selectedStyles, page, includeDetails);
  };

  // Smart sync collection - checks if sync is needed before syncing
  const handleUpdateCollection = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/discogs/update-collection', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Collection updated: ${result.newReleases || 0} new releases, ${result.conditionsUpdated || 0} conditions updated`);
        // Reload collection to show new releases
        await fetchCollection(selectedStyles, currentPage, includeDetails);
      } else {
        const error = await response.json();
        toast.error(`Update failed: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating collection:', error);
      toast.error('Failed to update collection');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncCollection = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      toast.info('Checking collection status...');
      
      // First check if sync is needed by comparing counts
      const statusResponse = await fetch('/api/discogs/database-sync?action=status');
      const statusResult = await statusResponse.json();
      
      // Trigger database sync which will check and sync if needed
      const response = await fetch('/api/discogs/database-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'trigger' }),
      });

      const result = await response.json();
      
      if (result.error) {
        toast.error('Sync failed: ' + result.error);
        setError(result.error);
        return;
      }

      toast.success('Collection sync started!');
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes max
      let syncComplete = false;
      
      while (attempts < maxAttempts && !syncComplete) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const checkResponse = await fetch('/api/discogs/database-sync?action=status');
        const checkResult = await checkResponse.json();
        
        if (checkResult.job?.status === 'completed') {
          syncComplete = true;
          
          // Check if any new releases were added
          if (checkResult.job?.results?.releasesUpdated > 0) {
            toast.success(`Collection synced! ${checkResult.job.results.releasesUpdated} releases updated.`);
          } else {
            toast.info('Collection is already in sync!');
          }
          break;
        } else if (checkResult.job?.status === 'failed') {
          toast.error('Sync failed: ' + (checkResult.job?.error || 'Unknown error'));
          break;
        }
        
        attempts++;
      }
      
      // Fetch the updated collection
      await fetchCollection(selectedStyles, 1, includeDetails);
      
    } catch (error) {
      console.error('Error syncing collection:', error);
      toast.error('Failed to sync collection');
      setError('Failed to sync collection');
    } finally {
      setIsLoading(false);
    }
  };


  const loadDetails = () => {
    fetchCollection(selectedStyles, currentPage, true);
  };

  // Function to start the background job
  const startJob = async (testMode: boolean = false, skipCache: boolean = false) => {
    try {
      const response = await fetch('/api/discogs/job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ testMode, skipCache }),
      });

      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
        return;
      }

      setJobStatus(prev => ({
        ...prev,
        id: result.jobId,
        status: 'pending',
        progress: 0,
        total: 0,
        processed: 0,
        startTime: new Date(),
        endTime: null,
        error: null,
        results: {
          videosLoaded: 0,
          pricesLoaded: 0,
          errors: 0
        }
      }));

      // Start polling for job status
      pollJobStatus(result.jobId);
      
    } catch (error) {
      console.error('Error starting job:', error);
      setError('Failed to start job');
    }
  };

  // Function to poll job status
  const pollJobStatus = async (jobId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/discogs/job?jobId=${jobId}`);
        const result = await response.json();
        
        if (result.error) {
          console.error('Error polling job status:', result.error);
          return;
        }

        setJobStatus(prev => ({
          ...prev,
          status: result.status,
          progress: result.progress,
          total: result.total,
          processed: result.processed,
          startTime: new Date(result.startTime),
          endTime: result.endTime ? new Date(result.endTime) : null,
          error: result.error || null,
          results: result.results
        }));

        // Update rate limit status
        if (result.rateLimit) {
          setRateLimitStatus(result.rateLimit);
        }

        // Continue polling if job is still running
        if (result.status === 'running' || result.status === 'pending') {
          setTimeout(poll, 2000); // Poll every 2 seconds
        } else {
          // Job completed or failed, refresh collection data and sync cache
          if (result.status === 'completed') {
            // syncDatabase(); // Database sync handled automatically
            fetchCollection(selectedStyles, currentPage, includeDetails);
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    };

    poll();
  };

  // Function to sync database (replaces cache sync)
  const syncDatabase = async () => {
    try {
      const response = await fetch('/api/discogs/database-sync?action=status');
      const result = await response.json();
      
      console.log('Database sync status:', result);
      
      if (result.job) {
        if (result.job.status === 'running') {
          toast.info(`Sync in progress: ${result.job.processed || 0}/${result.job.total || 0} releases processed`);
        } else if (result.job.status === 'completed') {
          toast.success('Database sync completed');
        } else if (result.job.status === 'failed') {
          toast.error(`Database sync failed: ${result.job.error || 'Unknown error'}`);
        } else {
          toast.info('Database sync is idle');
        }
      }
    } catch (error) {
      console.error('Error getting database sync status:', error);
      toast.error('Failed to check sync status');
    }
  };

  const loadReleaseDetails = async (releaseId: number) => {
    try {
      // Check cache first
      const cached = getCachedDetails(releaseId);
      if (cached) {
        console.log(`Using cached data for release ${releaseId}`);
        setReleaseDetails(prev => ({
          ...prev,
          [releaseId]: {
            videos: cached.videos,
            tracklist: cached.tracklist,
            priceInfo: cached.priceInfo,
            media_condition: cached.media_condition,
            sleeve_condition: cached.sleeve_condition
          }
        }));
        return;
      }

      // Fetch from API if not cached
      console.log(`Fetching fresh data for release ${releaseId}`);
      const response = await fetch(`/api/discogs/details?release_id=${releaseId}`);
      const result = await response.json();
      
      if (result.error) {
        console.error('Error fetching release details:', result.error);
        return;
      }
      
      const details = {
        videos: result.videos || [],
        tracklist: result.tracklist || [],
        priceInfo: result.priceInfo,
        media_condition: result.media_condition,
        sleeve_condition: result.sleeve_condition
      };
      
      // Note: No longer saving to browser cache - data comes from server database
      // saveToCache(releaseId, details.videos, details.tracklist, details.priceInfo, details.media_condition, details.sleeve_condition);
      
      // Update state
      setReleaseDetails(prev => ({
        ...prev,
        [releaseId]: details
      }));
      
      // Cache stats no longer updated since we're not using browser cache
      // setCacheStats(getCacheStats());
      
      // Update rate limit status if provided
      if (result.rateLimit) {
        setRateLimitStatus(result.rateLimit);
      }
    } catch (error) {
      console.error('Error fetching release details:', error);
    }
  };

  // Function to automatically load videos for all releases
  const loadAllVideos = async () => {
    if (!data?.releases || videosLoading) return;
    
    setVideosLoading(true);
    console.log('Starting automatic video loading...');
    
    try {
      const releasesToLoad = data.releases.slice(0, 10); // Limit to first 10 for performance
      
      // Load videos for each release
      for (const release of releasesToLoad) {
        const releaseId = release.basic_information.id;
        
        // Skip if already loaded
        if (releaseDetails[releaseId]) {
          continue;
        }
        
        await loadReleaseDetails(releaseId);
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log('Automatic video loading completed');
    } catch (error) {
      console.error('Error during automatic video loading:', error);
    } finally {
      setVideosLoading(false);
    }
  };

  const clearAllFilters = () => {
    setArtistFilter('');
    setTitleFilter('');
    setLabelFilter('');
    setYearMinFilter('');
    setYearMaxFilter('');
    setDateAddedMinFilter('');
    setDateAddedMaxFilter('');
    setYearValueFilter('');
    setStyleFilter([]);
    setSelectedStyles([]);
    setCurrentPage(1); // Reset to first page when clearing all filters

    const clearedFilters: CollectionFilters = {
      artistFilter: '',
      titleFilter: '',
      labelFilter: '',
      yearMinFilter: '',
      yearMaxFilter: '',
      yearValueFilter: '',
      dateAddedMinFilter: '',
      dateAddedMaxFilter: '',
      styleFilter: [],
    };

    window.setTimeout(() => {
      fetchCollection([], 1, includeDetails, undefined, clearedFilters);
    }, 0);
  };

  const handleStyleFilterChange = (newStyleFilter: string[]) => {
    setStyleFilter(newStyleFilter);
  };

  const handleRowsPerPageChange = (newRowsPerPage: number) => {
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1); // Reset to first page when changing rows per page
    fetchCollection(selectedStyles, 1, includeDetails, newRowsPerPage); // Fetch with new rows per page
  };

  // Function to get condition from database fields
  const getCondition = (release: DiscogsRelease) => {
    const details = releaseDetails[release.basic_information.id];
    return { 
      media: details?.media_condition || release.media_condition || 'Unknown', 
      sleeve: details?.sleeve_condition || release.sleeve_condition || 'Unknown' 
    };
  };

  // Function to extract YouTube playlist ID from URL
  const extractYouTubePlaylistId = (url: string): string | null => {
    const playlistMatch = url.match(/[?&]list=([^&]+)/);
    return playlistMatch ? playlistMatch[1] : null;
  };

  // Function to extract YouTube video ID from URL
  const extractYouTubeVideoId = (url: string): string | null => {
    const videoMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
    return videoMatch ? videoMatch[1] : null;
  };

  // Function to categorize videos into playlists and individual videos
  const categorizeVideos = (videos: Array<{ uri: string; title: string; description: string; duration: number; embed: boolean }>) => {
    const playlists = new Map<string, { id: string; videos: Array<{ uri: string; title: string; description: string; duration: number; embed: boolean }> }>();
    const individualVideos: Array<{ uri: string; title: string; description: string; duration: number; embed: boolean }> = [];

    videos.forEach(video => {
      const playlistId = extractYouTubePlaylistId(video.uri);
      if (playlistId) {
        if (!playlists.has(playlistId)) {
          playlists.set(playlistId, { id: playlistId, videos: [] });
        }
        playlists.get(playlistId)!.videos.push(video);
      } else {
        individualVideos.push(video);
      }
    });

    return { playlists: Array.from(playlists.values()), individualVideos };
  };

  // Function to create a release playlist from individual videos
  const createReleasePlaylist = (videos: Array<{ uri: string; title: string; description: string; duration: number; embed: boolean }>, releaseTitle: string) => {
    if (videos.length < 2) return null; // Only create playlist if there are multiple videos
    
    // Extract video IDs
    const videoIds = videos.map(video => extractYouTubeVideoId(video.uri)).filter(id => id !== null);
    
    if (videoIds.length < 2) return null; // Need at least 2 videos for a playlist
    
    return {
      videos: videos,
      videoIds: videoIds,
      title: `${releaseTitle} - Complete Playlist`,
      totalVideos: videos.length
    };
  };

  // Function to create a custom playlist from individual videos
  const createCustomPlaylist = (videos: Array<{ uri: string; title: string; description: string; duration: number; embed: boolean }>, releaseTitle: string) => {
    if (videos.length < 2) return null; // Only create playlist if there are multiple videos
    
    // Extract video IDs and create a custom playlist
    const videoIds = videos.map(video => extractYouTubeVideoId(video.uri)).filter(id => id !== null);
    
    if (videoIds.length < 2) return null; // Need at least 2 videos for a playlist
    
    // Create a custom playlist URL using the first video as the main video and others as playlist
    const mainVideoId = videoIds[0];
    const playlistVideos = videoIds.slice(1);
    
    return {
      id: `custom-${mainVideoId}-${playlistVideos.join(',')}`,
      videos: videos,
      customPlaylistUrl: `https://www.youtube.com/watch?v=${mainVideoId}&list=${playlistVideos.join(',')}`
    };
  };

  // Spinner component
  const Spinner = () => (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
    </div>
  );

  // YouTube Playlist Embed Component
  const YouTubePlaylistEmbed = ({ playlistId, title, isCardView = false }: { playlistId: string; title: string; isCardView?: boolean }) => (
    <div>
      <iframe
        width={isCardView ? "100%" : "640"}
        height={isCardView ? "200" : "360"}
        src={`https://www.youtube.com/embed/videoseries?list=${playlistId}`}
        title={title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="rounded border w-full"
      ></iframe>
    </div>
  );

  // YouTube Video Embed Component
  const YouTubeVideoEmbed = ({ videoId, title, isCardView = false }: { videoId: string; title: string; isCardView?: boolean }) => (
    <div>
      <iframe
        width={isCardView ? "100%" : "640"}
        height={isCardView ? "200" : "360"}
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="rounded border w-full"
      ></iframe>
    </div>
  );

  // Discogs-style Playlist Component
  const DiscogsStylePlaylistComponent = ({ discogsVideos, releaseTitle, isCardView = false }: { discogsVideos: Array<{ videoId: string; title: string; duration: string }>; releaseTitle: string; isCardView?: boolean }) => {
    const [currentVideoId, setCurrentVideoId] = useState<string | null>(discogsVideos[0]?.videoId || null);

    return (
      <div className="space-y-3">
        {/* Main embedded player */}
        {currentVideoId && (
          <iframe
            width={isCardView ? "100%" : "640"}
            height={isCardView ? "200" : "360"}
            src={`https://www.youtube.com/embed/${currentVideoId}`}
            title={discogsVideos.find(v => v.videoId === currentVideoId)?.title || 'Video'}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="rounded border w-full"
          ></iframe>
        )}
        
        {/* Discogs-style video list (hidden in card view) */}
        {!isCardView && (
          <ul className="space-y-1">
            {discogsVideos.map((video, index) => (
              <li key={video.videoId}>
                <button
                  type="button"
                  onClick={() => setCurrentVideoId(video.videoId)}
                  className={`w-full flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors ${
                    currentVideoId === video.videoId ? 'bg-blue-50 border border-blue-200' : ''
                  }`}
                >
                  {/* Thumbnail */}
                  <img
                    src={`https://i.ytimg.com/vi/${video.videoId}/default.jpg`}
                    alt=""
                    width="60"
                    height="45"
                    loading="lazy"
                    className="rounded"
                  />

                  {/* Play/Pause Icon */}
                  <div className="flex-shrink-0">
                    {currentVideoId === video.videoId ? (
                      <svg aria-label="Pause" viewBox="0 0 1024 1024" className="w-4 h-4 text-blue-600" role="img">
                        <path d="M878 110v804q0 15-11 26t-26 11H549q-15 0-26-11t-11-26V110q0-15 11-26t26-11h292q15 0 26 11t11 26zm-512 0v804q0 15-11 26t-26 11H37q-15 0-26-11T0 914V110q0-15 11-26t26-11h292q15 0 26 11t11 26z"></path>
                      </svg>
                    ) : (
                      <svg aria-label="Play" viewBox="0 0 1024 1024" className="w-4 h-4 text-gray-600" role="img">
                        <path d="M791 530L32 951q-13 8-23 2t-9-20V91q0-14 9-20t23 2l759 421q13 8 13 18t-13 18z"></path>
                      </svg>
                    )}
                  </div>

                  {/* Title and Duration */}
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-gray-900">{video.title}</div>
                    <span className="text-xs text-gray-500">{video.duration}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  // Release Card Component
  const ReleaseCard = ({ release, backgroundColor = 'bg-white' }: { release: DiscogsRelease; backgroundColor?: string }) => {
    const releaseId = release.basic_information.id;
    const details = releaseDetails[releaseId];
    // Prefer release.videos if it has data, otherwise use cached details
    const videos = (release.videos && release.videos.length > 0) ? release.videos : (details?.videos || []);
    const tracklist = (release.tracklist && release.tracklist.length > 0) ? release.tracklist : (details?.tracklist || []);
    const isCachedData = isCached(releaseId);
    const { playlists, individualVideos } = categorizeVideos(videos);
    const releasePlaylist = createReleasePlaylist(individualVideos, release.basic_information.title);
    const condition = {
      media: details?.media_condition || release.media_condition || 'Unknown',
      sleeve: details?.sleeve_condition || release.sleeve_condition || 'Unknown'
    };
    const priceInfo = details?.priceInfo || release.priceInfo;

    return (
      <Card className={`w-full ${backgroundColor} border-2 border-gray-300 shadow-md`}>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Release Information Section */}
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="space-y-2">
                  {/* Title */}
                  <h3 className="font-semibold text-lg leading-tight">
                    <a
                      href={getDiscogsUrl(release)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {release.basic_information.title}
                    </a>
                  </h3>
                  
                  {/* Artist */}
                  <p className="text-sm text-gray-700 font-medium">
                    {release.basic_information.artists.map(artist => artist.name).join(', ')}
                  </p>
                  
                  {/* Year */}
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Year:</span> {release.basic_information.year === 0 ? 'Unknown' : release.basic_information.year}
                  </div>

                  {/* Labels */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Labels:</div>
                    <div className="text-sm text-gray-600">
                      {Array.from(new Set(release.basic_information.labels.map(label => label.name))).join(', ')}
                    </div>
                  </div>

                  {/* Styles */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Styles:</div>
                    <div className="flex flex-wrap gap-1">
                      {release.basic_information.styles.map((style, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded border border-blue-200"
                        >
                          {style}
                        </span>
                      ))}
                    </div>
                  </div>
                  </div>
                </div>
                
                {/* Cover Image on the right */}
                <div className="flex-shrink-0">
                  {release.basic_information.cover_image ? (
                    <img
                      src={release.basic_information.cover_image}
                      alt={`${release.basic_information.title} cover`}
                      className="w-32 h-32 object-cover rounded"
                      onError={(e) => {
                        console.error('Failed to load cover image:', release.basic_information.cover_image);
                        e.currentTarget.style.display = 'none';
                      }}
                      onLoad={() => {
                        console.log('Successfully loaded cover image:', release.basic_information.cover_image);
                      }}
                    />
                  ) : (
                    <div className="w-32 h-32 bg-muted rounded flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">No Image</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tracklist */}
            <div className="mt-10">
              <div className="text-xs text-muted-foreground mb-2">Tracklist:</div>
              <div className="space-y-1 h-24 overflow-y-auto bg-gray-50 p-2 rounded border">
                {tracklist && tracklist.length > 0 ? (
                  tracklist.map((track, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 font-mono w-6 flex-shrink-0">{track.position || `${index + 1}.`}</span>
                      <span className="flex-1">{track.title}</span>
                      {track.duration && (
                        <span className="text-gray-500 text-xs">{track.duration}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-2">No tracklist available</div>
                )}
              </div>
            </div>

            {/* Condition, Price, and Date Added Section */}
            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
              <div className="grid grid-cols-3 gap-4">
                {/* Condition Section */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Condition:</div>
                  <div className="space-y-1">
                    <div className="text-sm">
                      <span className="text-purple-600">Media: {condition.media}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-orange-600">Sleeve: {condition.sleeve}</span>
                    </div>
                  </div>
                </div>
                
                {/* Date Added Section */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Date Added:</div>
                  <div className="text-sm text-gray-600">
                    {new Date(release.date_added).toLocaleDateString()}
                  </div>
                </div>
                
                {/* Price Section */}
                {priceInfo && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Lowest Price:</div>
                    <div className="text-sm font-medium text-green-600">
                      {priceInfo.lowest_price ? formatCurrency(priceInfo.lowest_price, priceInfo.currency) : 'N/A'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* YouTube Videos */}
            <div>
              <div className="text-xs text-muted-foreground mb-2">
                {isCachedData ? '💾 Cached' : '🔄 Fresh'}
              </div>
              
              {/* Check if any videos are available */}
              {(() => {
                const hasDiscogsVideos = release.discogsVideos && release.discogsVideos.length > 0;
                const hasYouTubePlaylist = release.youtubePlaylistId && !release.discogsVideos;
                const hasReleasePlaylist = releasePlaylist && !release.youtubePlaylistId && !release.discogsVideos;
                const hasYouTubeVideo = release.youtubeVideoId && !release.youtubePlaylistId && !releasePlaylist && !release.discogsVideos;
                const hasApiPlaylists = playlists.length > 0;
                const hasIndividualVideos = individualVideos.length > 0;

                if (hasDiscogsVideos || hasYouTubePlaylist || hasReleasePlaylist || hasYouTubeVideo || hasApiPlaylists || hasIndividualVideos) {
                  // Count total videos for scrolling
                  const totalVideos = (release.discogsVideos?.length || 0) + 
                                    (releasePlaylist?.videos.length || 0) + 
                                    (hasYouTubePlaylist ? 1 : 0) + 
                                    (hasYouTubeVideo ? 1 : 0) + 
                                    playlists.length + 
                                    individualVideos.length;

                  return (
                    <div className="space-y-1 bg-gray-50 p-2 rounded border max-h-48 overflow-y-auto">
                      {/* Discogs Videos */}
                      {hasDiscogsVideos && release.discogsVideos && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-gray-700">Discogs Videos:</div>
                          {release.discogsVideos.map((video, index) => (
                            <a
                              key={video.videoId}
                              href={isValidYouTubeUrl(`https://www.youtube.com/watch?v=${video.videoId}`) ? `https://www.youtube.com/watch?v=${video.videoId}` : '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                              title={video.title}
                            >
                              🎵 {video.title.length > 70 ? video.title.substring(0, 70) + '...' : video.title} ({video.duration})
                            </a>
                          ))}
                        </div>
                      )}
                      
                      {/* YouTube Playlist */}
                      {hasYouTubePlaylist && release.youtubePlaylistId && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-gray-700">YouTube Playlist:</div>
                          <a
                            href={isValidYouTubeUrl(`https://www.youtube.com/playlist?list=${release.youtubePlaylistId}`) ? `https://www.youtube.com/playlist?list=${release.youtubePlaylistId}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                          >
                            📺 Full Album Playlist
                          </a>
                        </div>
                      )}
                      
                      {/* Release Playlist */}
                      {hasReleasePlaylist && releasePlaylist && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-gray-700">Release Videos:</div>
                          {releasePlaylist.videos.map((video, index) => (
                            <a
                              key={index}
                              href={video.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                              title={video.title}
                            >
                              🎵 {video.title.length > 70 ? video.title.substring(0, 70) + '...' : video.title}
                            </a>
                          ))}
                        </div>
                      )}
                      
                      {/* Single YouTube Video */}
                      {hasYouTubeVideo && release.youtubeVideoId && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-gray-700">YouTube Video:</div>
                          <a
                            href={`https://www.youtube.com/watch?v=${release.youtubeVideoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                          >
                            🎵 {release.basic_information.title.length > 70 ? release.basic_information.title.substring(0, 70) + '...' : release.basic_information.title} - From Discogs
                          </a>
                        </div>
                      )}
                      
                      {/* API Playlists */}
                      {hasApiPlaylists && playlists.map((playlist, index) => (
                        <div key={`api-playlist-${index}`} className="space-y-1">
                          <div className="text-xs font-medium text-gray-700">Playlist:</div>
                          <a
                            href={`https://www.youtube.com/playlist?list=${playlist.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                          >
                            📺 {(playlist.videos[0]?.title || 'Playlist').length > 70 ? (playlist.videos[0]?.title || 'Playlist').substring(0, 70) + '...' : (playlist.videos[0]?.title || 'Playlist')}
                          </a>
                        </div>
                      ))}
                      
                      {/* Individual Videos */}
                      {hasIndividualVideos && individualVideos.map((video, index) => (
                        <a
                          key={index}
                          href={video.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                          title={video.title}
                        >
                          🎵 {video.title.length > 70 ? video.title.substring(0, 70) + '...' : video.title}
                        </a>
                      ))}
                    </div>
                  );
                } else {
                  return (
                    <div className="text-sm text-muted-foreground text-center py-2">
                      No videos
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Release Playlist Component - Shows all videos from a release
  const ReleasePlaylistComponent = ({ playlist, releaseTitle, isCardView = false }: { playlist: { videos: Array<{ uri: string; title: string; description: string; duration: number; embed: boolean }>; videoIds: string[]; title: string; totalVideos: number }; releaseTitle: string; isCardView?: boolean }) => (
    <div className="space-y-2">
      {/* Show first video as embedded player */}
      {playlist.videoIds.length > 0 && (
        <iframe
          width={isCardView ? "100%" : "640"}
          height={isCardView ? "200" : "360"}
          src={`https://www.youtube.com/embed/${playlist.videoIds[0]}?playlist=${playlist.videoIds.slice(1).join(',')}`}
          title={playlist.title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="rounded border w-full"
        ></iframe>
      )}
      
      {/* Show playlist content - all tracks (hidden in card view) */}
      {!isCardView && (
        <div className="space-y-1 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded border">
          <div className="text-xs font-medium text-gray-700 mb-2">Playlist Content:</div>
          {playlist.videos.map((video, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 font-mono w-6">{index + 1}.</span>
              <a
                href={video.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline flex-1"
                title={video.title}
              >
                {video.title.length > 50 ? video.title.substring(0, 50) + '...' : video.title}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Job status component
  const JobStatusDisplay = () => {
    if (jobStatus.status === 'idle') return null;

    const getStatusColor = () => {
      switch (jobStatus.status) {
        case 'pending': return 'text-yellow-600';
        case 'running': return 'text-blue-600';
        case 'completed': return 'text-green-600';
        case 'failed': return 'text-red-600';
        default: return 'text-gray-600';
      }
    };

    const getStatusIcon = () => {
      switch (jobStatus.status) {
        case 'pending': return '⏳';
        case 'running': return '🔄';
        case 'completed': return '✅';
        case 'failed': return '❌';
        default: return '📊';
      }
    };

    const formatDuration = (startTime: Date, endTime: Date | null) => {
      const end = endTime || new Date();
      const duration = Math.round((end.getTime() - startTime.getTime()) / 1000);
      if (duration < 60) return `${duration}s`;
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      return `${minutes}m ${seconds}s`;
    };

    return (
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span>{getStatusIcon()}</span>
            <span className={getStatusColor()}>
              Background Job {jobStatus.status.charAt(0).toUpperCase() + jobStatus.status.slice(1)}
            </span>
            {jobStatus.status === 'running' && <Spinner />}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Progress Bar */}
            {jobStatus.total > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress: {jobStatus.processed} / {jobStatus.total}</span>
                  <span>{jobStatus.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${jobStatus.progress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Results */}
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="font-semibold text-blue-600">{jobStatus.total}</div>
                <div className="text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-green-600">{jobStatus.results.videosLoaded}</div>
                <div className="text-muted-foreground">Videos</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-purple-600">{jobStatus.results.pricesLoaded}</div>
                <div className="text-muted-foreground">Prices</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-red-600">{jobStatus.results.errors}</div>
                <div className="text-muted-foreground">Errors</div>
              </div>
            </div>

            {/* Duration */}
            {jobStatus.startTime && (
              <div className="text-sm text-muted-foreground">
                Duration: {formatDuration(jobStatus.startTime, jobStatus.endTime)}
              </div>
            )}

            {/* Error Message */}
            {jobStatus.error && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                Error: {jobStatus.error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Handle view mode change with automatic page size adjustment
  const handleViewModeChange = (newViewMode: 'table' | 'cards') => {
    setViewMode(newViewMode);
    
    // Save view mode to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('collectionViewMode', newViewMode);
    }
    
    let newRowsPerPage = rowsPerPage;
    let nextSortColumn = sortColumn;
    let nextSortDirection = sortDirection;
    
    // Auto-adjust page size when switching views
    if (newViewMode === 'cards') {
      // Switch to card-appropriate page sizes
      if (rowsPerPage === 25) newRowsPerPage = 24;
      else if (rowsPerPage === 50) newRowsPerPage = 32;
      else if (rowsPerPage === 75) newRowsPerPage = 48;
      else if (rowsPerPage === 100) newRowsPerPage = 48;
      else if (rowsPerPage === 10) newRowsPerPage = 16;
      // Set default sorting for card view: date added, descending
      nextSortColumn = 'date_added';
      nextSortDirection = 'desc';
      setSortColumn(nextSortColumn);
      setSortDirection(nextSortDirection);
    } else {
      // Switch to table-appropriate page sizes
      if (rowsPerPage === 8) newRowsPerPage = 10;
      else if (rowsPerPage === 16) newRowsPerPage = 25;
      else if (rowsPerPage === 24) newRowsPerPage = 25;
      else if (rowsPerPage === 32) newRowsPerPage = 50;
      else if (rowsPerPage === 48) newRowsPerPage = 75;
      // Set default sorting for table view: title, ascending
      nextSortColumn = 'title';
      nextSortDirection = 'asc';
      setSortColumn(nextSortColumn);
      setSortDirection(nextSortDirection);
    }
    
    // Update the page size and reset to first page
    setRowsPerPage(newRowsPerPage);
    setCurrentPage(1);
    
    // Fetch data with new view mode and page size
    fetchCollection(selectedStyles, 1, includeDetails, newRowsPerPage, undefined, {
      sortColumn: nextSortColumn,
      sortDirection: nextSortDirection,
    });
  };

  // Sorting controls component for card view
  const CardSortingControls = () => {
    if (viewMode !== 'cards') return null;

    const sortOptions = [
      { value: 'title', label: 'Title', icon: '📝' },
      { value: 'artist', label: 'Artist', icon: '👤' },
      { value: 'year', label: 'Year', icon: '📅' },
      { value: 'date_added', label: 'Date Added', icon: '📆' },
      { value: 'lowest_price', label: 'Price', icon: '💰' }
    ];

    return (
      <div className="bg-gray-50 p-4 rounded-lg border mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">Sort by:</h3>
          <button
            onClick={() => handleSort('title')}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            Reset to Title
          </button>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {sortOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSort(option.value)}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors ${
                sortColumn === option.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
              }`}
            >
              <span>{option.icon}</span>
              <span>{option.label}</span>
              {sortColumn === option.value && (
                <span className="text-xs">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // View toggle component
  const ViewToggle = () => (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">View:</span>
      <div className="flex border rounded">
        <button
          onClick={() => handleViewModeChange('table')}
          className={`px-3 py-1 text-sm transition-colors ${
            viewMode === 'table' 
              ? 'bg-blue-600 text-white' 
              : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          Table
        </button>
        <button
          onClick={() => handleViewModeChange('cards')}
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

  // Rows per page dropdown component
  const RowsPerPageDropdown = () => (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{viewMode === 'cards' ? 'Cards per page:' : 'Rows per page:'}</span>
      <select
        value={rowsPerPage}
        onChange={(e) => handleRowsPerPageChange(parseInt(e.target.value))}
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

  // Note: Pagination is now handled server-side via API parameters

  // Load all styles when component mounts
  useEffect(() => {
    loadAllStyles();
    // Load all releases for analytics
    fetchAllReleasesForAnalytics().then(setAllReleasesForAnalytics);
  }, []);

  // Auto-adjust page size when view mode changes (only for invalid options)
  useEffect(() => {
    if (viewMode === 'cards') {
      // If current page size is not a valid card option, set to default
      const validCardOptions = [8, 16, 24, 32, 48];
      if (!validCardOptions.includes(rowsPerPage)) {
        setRowsPerPage(16); // Default to 16 cards
        // Fetch data with new page size
        fetchCollection(selectedStyles, 1, includeDetails);
      }
    } else {
      // If current page size is not a valid table option, set to default
      const validTableOptions = [10, 25, 50, 75, 100];
      if (!validTableOptions.includes(rowsPerPage)) {
        setRowsPerPage(25); // Default to 25 rows
        // Fetch data with new page size
        fetchCollection(selectedStyles, 1, includeDetails);
      }
    }
  }, [viewMode]);

  // Check for legacy browser cache on component mount
  useEffect(() => {
    // Only load cache stats to show "Clear Browser Cache" button if legacy data exists
    // We no longer use browser cache since all data is in server database
    const stats = getCacheStats();
    setCacheStats(stats);
    
    if (stats.totalCached > 0) {
      console.log(`Found ${stats.totalCached} releases in legacy browser cache (${stats.cacheSize})`);
      console.log('Consider clearing browser cache - all data is now in server database');
    }
    
    // Note: Not loading cache data anymore since server database is source of truth
    // const cachedData = loadCache();
  }, []);

  // Automatically load videos when data is available
  useEffect(() => {
    if (!includeDetails && data?.releases && data.releases.length > 0) {
      loadAllVideos();
    }
  }, [data?.releases, includeDetails]);

  // Find release across all pages and navigate to it when coming from logs
  useEffect(() => {
    const releaseIdParam = searchParams.get('releaseId');
    if (releaseIdParam && data?.releases) {
      const releaseId = parseInt(releaseIdParam);
      
      // First, check if the release is on the current page
      const releaseOnCurrentPage = data.releases.find(
        (release: DiscogsRelease) => release.basic_information.id === releaseId
      );
      
      if (releaseOnCurrentPage) {
        // Release is on current page, scroll to it
        setTimeout(() => {
          const releaseElement = document.querySelector(`[data-release-id="${releaseId}"]`);
          if (releaseElement) {
            releaseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            releaseElement.classList.add('ring-4', 'ring-blue-500', 'ring-opacity-50');
            setTimeout(() => {
              releaseElement.classList.remove('ring-4', 'ring-blue-500', 'ring-opacity-50');
            }, 3000);
          }
        }, 100);
      } else if (data.pagination && currentPage === 1) {
        // Release not on current page, search for it
        searchForRelease(releaseId);
      }
    }
  }, [searchParams, data?.releases, currentPage]);
  
  // Function to search for a release across all pages
  const searchForRelease = async (releaseId: number) => {
    try {
      const allReleases = await fetchAllCollectionPages(selectedStyles);
      const releaseIndex = allReleases.findIndex(
        (release: DiscogsRelease) => release.basic_information.id === releaseId
      );
      
      if (releaseIndex !== -1) {
        const targetPage = Math.ceil((releaseIndex + 1) / rowsPerPage);
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
          fetchCollection(selectedStyles, targetPage, includeDetails, rowsPerPage);
        }
      }
    } catch (error) {
      console.error('Error searching for release:', error);
    }
  };

  // Note: Pagination reset is now handled server-side when filters/sorting change


  return (
    <div className="w-full space-y-6">
      {/* Job Status Display */}
      <JobStatusDisplay />
      
      {/* Collection Analytics Dashboard */}
      {allReleasesForAnalytics.length > 0 && (
        <CollectionAnalytics releases={allReleasesForAnalytics} releaseDetails={releaseDetails} />
      )}
      
      <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>My Discogs Collection</CardTitle>
            <p className="text-sm text-muted-foreground">
                Filter your collection by music styles
            </p>
          </div>
          <Link href="/analytics">
            <Button variant="outline" size="sm">
              <TrendingUp className="h-4 w-4 mr-2" />
              View Analytics
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
          <Button
                onClick={handleSyncCollection}
            disabled={isLoading}
          >
            {isLoading ? 'Fetching...' : 'Get Release Data'}
          </Button>
          <Button
            variant="outline"
            onClick={handleUpdateCollection}
            disabled={isLoading}
          >
            {isLoading ? 'Updating...' : 'Update Collection'}
          </Button>
          <Button variant="ghost" size="sm" onClick={syncDatabase}>
            Check Sync Status
          </Button>
                {/* Database info instead of browser cache */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>💾 Database: {data?.pagination?.items || 0} releases synced</span>
                  {cacheStats.totalCached > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        clearCache();
                        // Update cache stats immediately so button disappears
                        setCacheStats({ totalCached: 0, cacheSize: '0 KB' });
                        console.log('Legacy browser cache cleared successfully');
                      }}
                      className="h-6 px-2 text-xs"
                      title="Clear legacy browser cache"
                    >
                      Clear Browser Cache ({cacheStats.totalCached})
                    </Button>
                  )}
                </div>
              {selectedStyles.length > 0 && (
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  disabled={isLoading}
                >
                  Clear Filters
                </Button>
              )}
            </div>

            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}

          {data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {data.releases.length} releases (filtered: {data.totalFiltered}, total: {data.totalCollection})
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Page {data.pagination.page} of {data.pagination.pages}
                  </p>
                </div>


                {/* Original Style Filter (keeping for backward compatibility) */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Quick Style Filter:
                    {allAvailableStyles.length > 0 && (
                      <span className="text-muted-foreground ml-2">
                        ({allAvailableStyles.length} styles available)
                      </span>
                    )}
                  </h3>
                  {allAvailableStyles.length > 0 ? (
                    <StyleMultiSelect
                      styles={allAvailableStyles}
                      selectedStyles={selectedStyles}
                      onSelectionChange={handleStyleSelectionChange}
                      placeholder="Select styles to filter..."
                      className="w-full"
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {isLoading ? 'Loading styles...' : 'No styles available'}
                    </div>
                  )}
                </div>

                {data.releases.length > 0 ? (
                  <div className="space-y-4">
                    {/* Filter Results Summary */}
                    {(() => {
                      const hasActiveFilters = artistFilter || titleFilter || labelFilter || yearMinFilter || yearMaxFilter || 
                                             dateAddedMinFilter || dateAddedMaxFilter || yearValueFilter || 
                                             styleFilter.length > 0 || selectedStyles.length > 0;
                      const isSorted = sortColumn !== 'date_added' || sortDirection !== 'desc';
                      
                      return (
                        <div className="text-sm text-muted-foreground">
                          {hasActiveFilters ? (
                            <span>
                              Showing {data?.releases?.length || 0} of {data?.totalFiltered || 0} releases 
                              (filtered from {data?.totalCollection || 0} total)
                              {isSorted && ` • Sorted by ${sortColumn} ${sortDirection === 'asc' ? '↑' : '↓'}`}
                              {(data?.pagination?.pages || 1) > 1 && ` • Page ${data?.pagination?.page || currentPage} of ${data?.pagination?.pages || 1}`}
                            </span>
                          ) : (
                            <span>
                              Showing {data?.releases?.length || 0} of {data?.totalFiltered || 0} releases (total: {data?.totalCollection || 0})
                              {isSorted && ` • Sorted by ${sortColumn} ${sortDirection === 'asc' ? '↑' : '↓'}`}
                              {(data?.pagination?.pages || 1) > 1 && ` • Page ${data?.pagination?.page || currentPage} of ${data?.pagination?.pages || 1}`}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <ViewToggle />
                          <RowsPerPageDropdown />
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Showing {data?.releases?.length || 0} of {data?.totalFiltered || 0} releases
                          {(data?.pagination?.pages || 1) > 1 && ` • Page ${data?.pagination?.page || currentPage} of ${data?.pagination?.pages || 1}`}
                        </div>
                      </div>
                      {viewMode === 'table' ? (
                        <div className="border rounded-lg overflow-hidden">
                          <div className="overflow-x-auto">
                            <Table className="table-auto w-full">
                        <TableHeader className="sticky top-0 bg-background z-20 border-b">
                          <TableRow>
                            <TableHead className="whitespace-nowrap bg-background border-b">
                              <div className="flex items-center gap-1">
                                <span>Cover</span>
                                <span className="text-xs text-muted-foreground">📷</span>
                              </div>
                            </TableHead>
                            <TableHead 
                              className="whitespace-nowrap bg-background border-b cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleSort('artist')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Artist</span>
                                <span 
                                  className={`text-xs cursor-pointer transition-colors ${
                                    hasActiveFilter('artist') 
                                      ? 'text-blue-600' 
                                      : 'text-muted-foreground hover:text-blue-600'
                                  }`}
                                  onClick={(e) => handleFilterClick('artist', e)}
                                >
                                  🔍
                                </span>
                                {hasActiveFilter('artist') && (
                                  <button
                                    className="text-xs text-red-600 hover:text-red-800 ml-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearColumnFilter('artist');
                                    }}
                                    title="Clear filter"
                                  >
                                    ✕
                                  </button>
                                )}
                                {sortColumn === 'artist' && (
                                  <span className="text-xs">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead 
                              className="whitespace-nowrap bg-background border-b cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleSort('title')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Title</span>
                                <span 
                                  className={`text-xs cursor-pointer transition-colors ${
                                    hasActiveFilter('title') 
                                      ? 'text-blue-600' 
                                      : 'text-muted-foreground hover:text-blue-600'
                                  }`}
                                  onClick={(e) => handleFilterClick('title', e)}
                                >
                                  🔍
                                </span>
                                {hasActiveFilter('title') && (
                                  <button
                                    className="text-xs text-red-600 hover:text-red-800 ml-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearColumnFilter('title');
                                    }}
                                    title="Clear filter"
                                  >
                                    ✕
                                  </button>
                                )}
                                {sortColumn === 'title' && (
                                  <span className="text-xs">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead 
                              className="whitespace-nowrap bg-background border-b cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleSort('year')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Year</span>
                                <span 
                                  className={`text-xs cursor-pointer transition-colors ${
                                    hasActiveFilter('year') 
                                      ? 'text-blue-600' 
                                      : 'text-muted-foreground hover:text-blue-600'
                                  }`}
                                  onClick={(e) => handleFilterClick('year', e)}
                                >
                                  🔍
                                </span>
                                {hasActiveFilter('year') && (
                                  <button
                                    className="text-xs text-red-600 hover:text-red-800 ml-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearColumnFilter('year');
                                    }}
                                    title="Clear filter"
                                  >
                                    ✕
                                  </button>
                                )}
                                {sortColumn === 'year' && (
                                  <span className="text-xs">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead 
                              className="bg-background border-b cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleSort('label')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Label</span>
                                <span 
                                  className={`text-xs cursor-pointer transition-colors ${
                                    hasActiveFilter('label') 
                                      ? 'text-blue-600' 
                                      : 'text-muted-foreground hover:text-blue-600'
                                  }`}
                                  onClick={(e) => handleFilterClick('label', e)}
                                >
                                  🔍
                                </span>
                                {hasActiveFilter('label') && (
                                  <button
                                    className="text-xs text-red-600 hover:text-red-800 ml-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearColumnFilter('label');
                                    }}
                                    title="Clear filter"
                                  >
                                    ✕
                                  </button>
                                )}
                                {sortColumn === 'label' && (
                                  <span className="text-xs">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead 
                              className="whitespace-nowrap bg-background border-b w-32 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleSort('styles')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Styles</span>
                                <span 
                                  className={`text-xs cursor-pointer transition-colors ${
                                    hasActiveFilter('styles') 
                                      ? 'text-blue-600' 
                                      : 'text-muted-foreground hover:text-blue-600'
                                  }`}
                                  onClick={(e) => handleFilterClick('styles', e)}
                                >
                                  🔍
                                </span>
                                {hasActiveFilter('styles') && (
                                  <button
                                    className="text-xs text-red-600 hover:text-red-800 ml-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearColumnFilter('styles');
                                    }}
                                    title="Clear filter"
                                  >
                                    ✕
                                  </button>
                                )}
                                {sortColumn === 'styles' && (
                                  <span className="text-xs">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead 
                              className="whitespace-nowrap bg-background border-b cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleSort('date_added')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Date Added</span>
                                <span 
                                  className={`text-xs cursor-pointer transition-colors ${
                                    hasActiveFilter('date_added') 
                                      ? 'text-blue-600' 
                                      : 'text-muted-foreground hover:text-blue-600'
                                  }`}
                                  onClick={(e) => handleFilterClick('date_added', e)}
                                >
                                  🔍
                                </span>
                                {hasActiveFilter('date_added') && (
                                  <button
                                    className="text-xs text-red-600 hover:text-red-800 ml-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearColumnFilter('date_added');
                                    }}
                                    title="Clear filter"
                                  >
                                    ✕
                                  </button>
                                )}
                                {sortColumn === 'date_added' && (
                                  <span className="text-xs">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead 
                              className="whitespace-nowrap bg-background border-b cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleSort('condition')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Condition</span>
                                <span className="text-xs text-purple-600">💿</span>
                                {sortColumn === 'condition' && (
                                  <span className="text-xs">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead 
                              className="whitespace-nowrap bg-background border-b"
                            >
                              <div className="flex items-center gap-1">
                                <span>YouTube</span>
                                <span className="text-xs text-muted-foreground">🎵</span>
                                {videosLoading && <Spinner />}
                              </div>
                            </TableHead>
                            <TableHead 
                              className="whitespace-nowrap bg-background border-b cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => handleSort('lowest_price')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Lowest Price</span>
                                <span className="text-xs text-green-600">💰</span>
                                {sortColumn === 'lowest_price' && (
                                  <span className="text-xs">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="max-h-96 overflow-y-auto">
                          {(data?.releases || []).map((release) => (
                            <TableRow 
                              key={release.id} 
                              data-release-id={release.basic_information.id}
                              className="transition-all duration-300"
                            >
                              <TableCell className="whitespace-nowrap">
                                {release.basic_information.cover_image ? (
                                  <img
                                    src={release.basic_information.cover_image}
                                    alt={`${release.basic_information.title} cover`}
                                    className="w-12 h-12 object-cover rounded"
                                    onError={(e) => {
                                      console.error('Failed to load table cover image:', release.basic_information.cover_image);
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                                    <span className="text-xs text-muted-foreground">No Image</span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="whitespace-pre-line">
                                  {addLineBreaks(release.basic_information.artists
                                    .map(artist => artist.name)
                                    .join(', '))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <a
                                  href={getDiscogsUrl(release)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                  title={`View "${release.basic_information.title}" on Discogs`}
                                >
                                  <div className="whitespace-pre-line">
                                    {addLineBreaks(release.basic_information.title)}
                                  </div>
                                </a>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {release.basic_information.year === 0 ? '-' : release.basic_information.year}
                              </TableCell>
                              <TableCell>
                                <div className="whitespace-pre-line break-words">
                                  {Array.from(new Set(release.basic_information.labels.map(label => label.name))).map((labelName, index) => (
                                    <span key={index}>
                                      {labelName}
                                      {index < Array.from(new Set(release.basic_information.labels.map(label => label.name))).length - 1 && ', '}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="w-32">
                                <div className="space-y-1">
                                  {renderStyles(release.basic_information.styles)}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {new Date(release.date_added).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {(() => {
    const condition = getCondition(release);
                                  return (
                                    <div className="space-y-1">
                                      <div className="text-xs">
                                        <span className="text-muted-foreground">Media: </span>
                                        <span className="font-medium text-purple-600">{condition.media}</span>
                                      </div>
                                      <div className="text-xs">
                                        <span className="text-muted-foreground">Sleeve: </span>
                                        <span className="font-medium text-purple-600">{condition.sleeve}</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="w-70">
                                {(() => {
                                  const releaseId = release.basic_information.id;
                                  const details = releaseDetails[releaseId];
                                  // Prefer release.videos/tracklist if they have data
                                  const videos = (release.videos && release.videos.length > 0) ? release.videos : (details?.videos || []);
                                  const tracklist = (release.tracklist && release.tracklist.length > 0) ? release.tracklist : (details?.tracklist || []);
                                  const isCachedData = isCached(releaseId);
                                  
                                  const hasDiscogsVideos = release.discogsVideos && release.discogsVideos.length > 0;
                                  const hasYouTubePlaylist = release.youtubePlaylistId && !release.discogsVideos;
                                  const hasReleasePlaylist = videos.length > 0 && !release.youtubePlaylistId && !release.discogsVideos;
                                  const hasYouTubeVideo = release.youtubeVideoId && !release.youtubePlaylistId && !hasReleasePlaylist && !release.discogsVideos;

                                  if (hasDiscogsVideos || hasYouTubePlaylist || hasReleasePlaylist || hasYouTubeVideo) {
                                    // Count total videos for scrolling
                                    const totalVideos = (release.discogsVideos?.length || 0) + 
                                                      (hasYouTubePlaylist ? 1 : 0) + 
                                                      (hasYouTubeVideo ? 1 : 0) + 
                                                      videos.length;

                                    return (
                                      <div className={totalVideos > 8 ? "space-y-1 max-h-32 overflow-y-auto bg-gray-50 p-2 rounded border" : "space-y-1"}>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-muted-foreground">
                                            {isCachedData ? '💾' : '🔄'}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {isCachedData ? 'Cached' : 'Fresh'}
                                          </span>
                                        </div>
                                        
                                        {/* Discogs Videos */}
                                        {hasDiscogsVideos && release.discogsVideos && (
                                          <div className="space-y-1">
                                            <div className="text-xs font-medium text-gray-700">Discogs Videos:</div>
                                            {release.discogsVideos.map((video, index) => (
                                              <a
                                                key={video.videoId}
                                                href={`https://www.youtube.com/watch?v=${video.videoId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                                                title={video.title}
                                              >
                                                🎵 {video.title.length > 70 ? video.title.substring(0, 70) + '...' : video.title} ({video.duration})
                                              </a>
                                            ))}
                                          </div>
                                        )}
                                        
                                        {/* YouTube Playlist */}
                                        {hasYouTubePlaylist && release.youtubePlaylistId && (
                                          <div className="space-y-1">
                                            <div className="text-xs font-medium text-gray-700">YouTube Playlist:</div>
                                            <a
                                              href={`https://www.youtube.com/playlist?list=${release.youtubePlaylistId}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                                            >
                                              📺 Full Album Playlist
                                            </a>
                                          </div>
                                        )}
                                        
                                        {/* Release Videos */}
                                        {hasReleasePlaylist && videos.map((video, index) => (
                                          <a
                                            key={index}
                                            href={video.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                                            title={video.title}
                                          >
                                            🎵 {video.title.length > 70 ? video.title.substring(0, 70) + '...' : video.title}
                                          </a>
                                        ))}
                                        
                                        {/* Single YouTube Video */}
                                        {hasYouTubeVideo && release.youtubeVideoId && (
                                          <div className="space-y-1">
                                            <div className="text-xs font-medium text-gray-700">YouTube Video:</div>
                                            <a
                                              href={`https://www.youtube.com/watch?v=${release.youtubeVideoId}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:text-blue-800 hover:underline text-sm block truncate"
                                            >
                                              🎵 {release.basic_information.title.length > 70 ? release.basic_information.title.substring(0, 70) + '...' : release.basic_information.title} - From Discogs
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  } else if (details) {
                                    return <span className="text-muted-foreground">No videos</span>;
                                  } else if (videosLoading) {
                                    return (
                                      <div className="flex items-center gap-2">
                                        <Spinner />
                                        <span className="text-xs text-muted-foreground">Loading...</span>
                                      </div>
                                    );
                                  } else {
                                    return <span className="text-xs text-muted-foreground">Loading...</span>;
                                  }
                                })()}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {(() => {
                                  const releaseId = release.basic_information.id;
                                  const details = releaseDetails[releaseId];
                                  const priceInfo = details?.priceInfo || release.priceInfo;
                                  
                                  if (priceInfo) {
                                    return (
                                      <div className="text-sm">
                                        <span className="font-medium text-green-600">
                                          {priceInfo.lowest_price ? formatCurrency(priceInfo.lowest_price, priceInfo.currency) : 'N/A'}
                                        </span>
                                        <div className="text-xs text-muted-foreground">
                                          Lowest marketplace price
                                        </div>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => loadReleaseDetails(releaseId)}
                                        className="h-6 px-2 text-xs"
                                      >
                                        Load Price
                                      </Button>
                                    );
                                  }
                                })()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        </Table>
                        </div>
                      </div>
                      ) : (
                        /* Card View */
                        <div>
                          <CardSortingControls />
                          <div className="space-y-6">
                            {(() => {
                              const releases = data?.releases || [];
                              const cardsPerRow = 4; // xl:grid-cols-4
                              const rows = [];
                              
                              for (let i = 0; i < releases.length; i += cardsPerRow) {
                                const rowReleases = releases.slice(i, i + cardsPerRow);
                                const isEvenRow = Math.floor(i / cardsPerRow) % 2 === 0;
                                
                                rows.push(
                                  <div 
                                    key={`row-${i}`}
                                    className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-4 rounded-lg ${
                                      isEvenRow ? 'bg-gray-100' : 'bg-transparent'
                                    }`}
                                  >
                                    {rowReleases.map((release) => (
                                      <div 
                                        key={release.id} 
                                        className="flex transition-all duration-300" 
                                        data-release-id={release.basic_information.id}
                                      >
                                        <ReleaseCard 
                                          release={release} 
                                          backgroundColor={isEvenRow ? 'bg-gray-100' : 'bg-white'} 
                                        />
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              
                              return rows;
                            })()}
                          </div>
                        </div>
                      )}
                      
                      {/* Bottom pagination controls */}
                      <div className="flex justify-between items-center">
                        <RowsPerPageDropdown />
                        <div className="flex items-center gap-4">
                          <div className="text-sm text-muted-foreground">
                            Page {data?.pagination?.page || currentPage} of {data?.pagination?.pages || 1}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const newPage = Math.max(1, currentPage - 1);
                                setCurrentPage(newPage);
                                fetchCollection(selectedStyles, newPage, includeDetails);
                              }}
                              disabled={currentPage === 1}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const newPage = Math.min(data?.pagination?.pages || 1, currentPage + 1);
                                setCurrentPage(newPage);
                                fetchCollection(selectedStyles, newPage, includeDetails);
                              }}
                              disabled={currentPage === (data?.pagination?.pages || 1)}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Filter Dropdown */}
                    <FilterDropdown
                      ref={filterDropdownRef}
                      column={activeFilterColumn || ''}
                      isOpen={activeFilterColumn !== null}
                      onClose={closeFilterDropdown}
                      position={filterDropdownPosition}
                      artistFilter={artistFilter}
                      titleFilter={titleFilter}
                      labelFilter={labelFilter}
                      yearMinFilter={yearMinFilter}
                      yearMaxFilter={yearMaxFilter}
                      yearValueFilter={yearValueFilter}
                      dateAddedMinFilter={dateAddedMinFilter}
                      dateAddedMaxFilter={dateAddedMaxFilter}
                      styleFilter={styleFilter}
                      availableStyles={allAvailableStyles}
                      onArtistFilterChange={setArtistFilter}
                      onTitleFilterChange={setTitleFilter}
                      onLabelFilterChange={setLabelFilter}
                      onYearMinFilterChange={setYearMinFilter}
                      onYearMaxFilterChange={setYearMaxFilter}
                      onYearValueFilterChange={setYearValueFilter}
                      onDateAddedMinFilterChange={setDateAddedMinFilter}
                      onDateAddedMaxFilterChange={setDateAddedMaxFilter}
                      onStyleFilterChange={setStyleFilter}
                      onApplyFilters={applyFilters}
                      onClearFilters={clearAllFilters}
                    />

                  </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        {(() => {
                          const hasActiveFilters = artistFilter || titleFilter || labelFilter || yearMinFilter || yearMaxFilter || 
                                                 dateAddedMinFilter || dateAddedMaxFilter || yearValueFilter || 
                                                 styleFilter.length > 0 || selectedStyles.length > 0;
                          
                          if (hasActiveFilters) {
                            return 'No releases found matching the current filters';
                          } else {
                            return 'No releases found in your collection';
                          }
                        })()}
                      </div>
                    )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

