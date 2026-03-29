import { create } from 'zustand';
import { 
  CollectionData, 
  DiscogsRelease, 
  ReleaseDetails, 
  CacheStats, 
  RateLimitStatus, 
  JobStatus, 
  SortColumn, 
  SortDirection, 
  ViewMode 
} from '@/types/discogs';

interface CollectionState {
  // Data state
  isLoading: boolean;
  data: CollectionData | null;
  allReleasesForAnalytics: DiscogsRelease[];
  selectedStyles: string[];
  error: string | null;
  currentPage: number;
  allAvailableStyles: string[];
  includeDetails: boolean;
  releaseDetails: Record<number, ReleaseDetails>;
  cacheStats: CacheStats;
  rateLimitStatus: RateLimitStatus;
  rowsPerPage: number;
  videosLoading: boolean;
  viewMode: ViewMode;
  jobStatus: JobStatus;

  // Filter states
  artistFilter: string;
  titleFilter: string;
  labelFilter: string;
  yearMinFilter: string;
  yearMaxFilter: string;
  dateAddedMinFilter: string;
  dateAddedMaxFilter: string;
  yearValueFilter: string;
  styleFilter: string[];

  // Sorting state
  sortColumn: SortColumn | string;
  sortDirection: SortDirection;

  // Filter dropdown state
  activeFilterColumn: string | null;
  filterDropdownPosition: { top: number; left: number };

  // Actions
  setIsLoading: (isLoading: boolean) => void;
  setData: (data: CollectionData | null) => void;
  setAllReleasesForAnalytics: (releases: DiscogsRelease[]) => void;
  setSelectedStyles: (styles: string[]) => void;
  setError: (error: string | null) => void;
  setCurrentPage: (page: number) => void;
  setAllAvailableStyles: (styles: string[]) => void;
  setIncludeDetails: (include: boolean) => void;
  setReleaseDetails: (details: Record<number, ReleaseDetails>) => void;
  updateReleaseDetails: (releaseId: number, details: ReleaseDetails) => void;
  setCacheStats: (stats: CacheStats) => void;
  setRateLimitStatus: (status: RateLimitStatus) => void;
  setRowsPerPage: (rows: number) => void;
  setVideosLoading: (loading: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setJobStatus: (status: JobStatus) => void;
  updateJobStatus: (updates: Partial<JobStatus>) => void;

  // Filter actions
  setArtistFilter: (filter: string) => void;
  setTitleFilter: (filter: string) => void;
  setLabelFilter: (filter: string) => void;
  setYearMinFilter: (filter: string) => void;
  setYearMaxFilter: (filter: string) => void;
  setDateAddedMinFilter: (filter: string) => void;
  setDateAddedMaxFilter: (filter: string) => void;
  setYearValueFilter: (filter: string) => void;
  setStyleFilter: (filter: string[]) => void;

  // Sorting actions
  setSortColumn: (column: SortColumn | string) => void;
  setSortDirection: (direction: SortDirection) => void;
  toggleSort: (column: SortColumn | string) => void;

  // Filter dropdown actions
  setActiveFilterColumn: (column: string | null) => void;
  setFilterDropdownPosition: (position: { top: number; left: number }) => void;

  // Reset actions
  resetFilters: () => void;
  resetState: () => void;
}

const initialJobStatus: JobStatus = {
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
    errors: 0,
  },
};

export const useCollectionStore = create<CollectionState>((set) => ({
  // Initial state
  isLoading: false,
  data: null,
  allReleasesForAnalytics: [],
  selectedStyles: [],
  error: null,
  currentPage: 1,
  allAvailableStyles: [],
  includeDetails: false,
  releaseDetails: {},
  cacheStats: { totalCached: 0, cacheSize: '0 KB' },
  rateLimitStatus: {
    requestsThisMinute: 0,
    remainingRequests: 60,
    queueLength: 0,
  },
  rowsPerPage: 25,
  videosLoading: false,
  viewMode: 'table',
  jobStatus: initialJobStatus,

  // Filter initial states
  artistFilter: '',
  titleFilter: '',
  labelFilter: '',
  yearMinFilter: '',
  yearMaxFilter: '',
  dateAddedMinFilter: '',
  dateAddedMaxFilter: '',
  yearValueFilter: '',
  styleFilter: [],

  // Sorting initial state
  sortColumn: 'date_added',
  sortDirection: 'desc',

  // Filter dropdown initial state
  activeFilterColumn: null,
  filterDropdownPosition: { top: 0, left: 0 },

  // Actions
  setIsLoading: (isLoading) => set({ isLoading }),
  setData: (data) => set({ data }),
  setAllReleasesForAnalytics: (releases) => set({ allReleasesForAnalytics: releases }),
  setSelectedStyles: (styles) => set({ selectedStyles: styles }),
  setError: (error) => set({ error }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setAllAvailableStyles: (styles) => set({ allAvailableStyles: styles }),
  setIncludeDetails: (include) => set({ includeDetails: include }),
  setReleaseDetails: (details) => set({ releaseDetails: details }),
  updateReleaseDetails: (releaseId, details) =>
    set((state) => ({
      releaseDetails: { ...state.releaseDetails, [releaseId]: details },
    })),
  setCacheStats: (stats) => set({ cacheStats: stats }),
  setRateLimitStatus: (status) => set({ rateLimitStatus: status }),
  setRowsPerPage: (rows) => set({ rowsPerPage: rows }),
  setVideosLoading: (loading) => set({ videosLoading: loading }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setJobStatus: (status) => set({ jobStatus: status }),
  updateJobStatus: (updates) =>
    set((state) => ({
      jobStatus: { ...state.jobStatus, ...updates },
    })),

  // Filter actions
  setArtistFilter: (filter) => set({ artistFilter: filter }),
  setTitleFilter: (filter) => set({ titleFilter: filter }),
  setLabelFilter: (filter) => set({ labelFilter: filter }),
  setYearMinFilter: (filter) => set({ yearMinFilter: filter }),
  setYearMaxFilter: (filter) => set({ yearMaxFilter: filter }),
  setDateAddedMinFilter: (filter) => set({ dateAddedMinFilter: filter }),
  setDateAddedMaxFilter: (filter) => set({ dateAddedMaxFilter: filter }),
  setYearValueFilter: (filter) => set({ yearValueFilter: filter }),
  setStyleFilter: (filter) => set({ styleFilter: filter }),

  // Sorting actions
  setSortColumn: (column) => set({ sortColumn: column }),
  setSortDirection: (direction) => set({ sortDirection: direction }),
  toggleSort: (column) =>
    set((state) => ({
      sortColumn: column,
      sortDirection:
        state.sortColumn === column && state.sortDirection === 'asc' ? 'desc' : 'asc',
    })),

  // Filter dropdown actions
  setActiveFilterColumn: (column) => set({ activeFilterColumn: column }),
  setFilterDropdownPosition: (position) => set({ filterDropdownPosition: position }),

  // Reset actions
  resetFilters: () =>
    set({
      artistFilter: '',
      titleFilter: '',
      labelFilter: '',
      yearMinFilter: '',
      yearMaxFilter: '',
      dateAddedMinFilter: '',
      dateAddedMaxFilter: '',
      yearValueFilter: '',
      styleFilter: [],
      selectedStyles: [],
    }),
  resetState: () =>
    set({
      isLoading: false,
      data: null,
      allReleasesForAnalytics: [],
      selectedStyles: [],
      error: null,
      currentPage: 1,
      allAvailableStyles: [],
      includeDetails: false,
      releaseDetails: {},
      cacheStats: { totalCached: 0, cacheSize: '0 KB' },
      rateLimitStatus: {
        requestsThisMinute: 0,
        remainingRequests: 60,
        queueLength: 0,
      },
      rowsPerPage: 25,
      videosLoading: false,
      viewMode: 'table',
      jobStatus: initialJobStatus,
      artistFilter: '',
      titleFilter: '',
      labelFilter: '',
      yearMinFilter: '',
      yearMaxFilter: '',
      dateAddedMinFilter: '',
      dateAddedMaxFilter: '',
      yearValueFilter: '',
      styleFilter: [],
      sortColumn: 'date_added',
      sortDirection: 'desc',
      activeFilterColumn: null,
      filterDropdownPosition: { top: 0, left: 0 },
    }),
}));


