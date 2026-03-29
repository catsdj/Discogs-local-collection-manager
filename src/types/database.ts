/**
 * Database query result types
 * These types represent the shape of data returned from database queries
 * to avoid using 'any' and provide better type safety
 */

/**
 * Raw release row from database query with aggregated fields
 */
export interface DatabaseReleaseRow {
  id: number;
  discogs_id: number;
  title: string;
  year: number | null;
  cover_image_url: string | null;
  date_added: string;
  media_condition: string | null;
  sleeve_condition: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  sync_status: 'pending' | 'synced' | 'failed';
  lowest_price: number | null;
  currency: string | null;
  // Aggregated fields from GROUP_CONCAT (comma-separated strings)
  artists: string | null;
  styles: string | null;
  genres: string | null;
  labels: string | null;
}

/**
 * Video record from database
 */
export interface DatabaseVideoRow {
  id: number;
  release_id: number;
  uri: string;
  title: string;
  description: string | null;
  duration: number | null;
  embed: number; // SQLite boolean (0 or 1)
  video_type: 'discogs' | 'youtube' | 'other';
  youtube_video_id: string | null;
  youtube_playlist_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Track record from database
 */
export interface DatabaseTrackRow {
  id: number;
  release_id: number;
  position: string;
  title: string;
  duration: string | null;
  type_: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Internal ID mapping for releases
 */
export interface ReleaseIdMapping {
  id: number; // Internal database ID
  discogs_id: number; // External Discogs ID
}

/**
 * Grouped video data by release
 */
export type VideosByInternalId = Map<number, DatabaseVideoRow[]>;

/**
 * Grouped track data by release
 */
export type TracksByInternalId = Map<number, DatabaseTrackRow[]>;

/**
 * Style record from database
 */
export interface DatabaseStyleRow {
  name: string;
}

