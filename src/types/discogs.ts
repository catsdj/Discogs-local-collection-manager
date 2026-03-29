// Centralized TypeScript type definitions for Discogs application

export interface DiscogsArtist {
  name: string;
}

export interface DiscogsLabel {
  name: string;
}

export interface DiscogsNote {
  field_id: number;
  value: string;
}

export interface DiscogsVideo {
  uri: string;
  title: string;
  description: string;
  duration: number;
  embed: boolean;
}

export interface DiscogsTrack {
  position: string;
  title: string;
  duration: string;
  type_: string;
}

export interface DiscogsPriceInfo {
  lowest_price: number | null;
  currency: string;
}

export interface DiscogsVideoExtracted {
  videoId: string;
  title: string;
  duration: string;
}

export interface DiscogsBasicInformation {
  id: number;
  title: string;
  year: number;
  cover_image: string;
  artists: DiscogsArtist[];
  styles: string[];
  genres: string[];
  labels: DiscogsLabel[];
}

export interface DiscogsRelease {
  id: number;
  basic_information: DiscogsBasicInformation;
  date_added: string;
  media_condition?: string;
  sleeve_condition?: string;
  notes?: DiscogsNote[];
  videos?: DiscogsVideo[];
  tracklist?: DiscogsTrack[];
  priceInfo?: DiscogsPriceInfo;
  youtubePlaylistId?: string;
  youtubeVideoId?: string;
  discogsVideos?: DiscogsVideoExtracted[];
}

export interface DiscogsPagination {
  page: number;
  pages: number;
  per_page: number;
  items: number;
}

export interface CollectionData {
  releases: DiscogsRelease[];
  pagination: DiscogsPagination;
  availableStyles: string[];
  totalFiltered: number;
  totalCollection: number;
  getAllStyles?: boolean;
}

export interface ReleaseDetails {
  videos: any[];
  tracklist: any[];
  priceInfo?: DiscogsPriceInfo;
  media_condition?: string | null;
  sleeve_condition?: string | null;
}

export interface CacheStats {
  totalCached: number;
  cacheSize: string;
}

export interface RateLimitStatus {
  requestsThisMinute: number;
  remainingRequests: number;
  queueLength: number;
}

export interface JobResults {
  videosLoaded: number;
  pricesLoaded: number;
  errors: number;
}

export interface JobStatus {
  id: string | null;
  status: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  processed: number;
  startTime: Date | null;
  endTime: Date | null;
  error: string | null;
  results: JobResults;
}

export type SortColumn = 'title' | 'artist' | 'year' | 'date_added' | 'label' | 'styles' | 'condition' | 'lowest_price';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'table' | 'cards';


