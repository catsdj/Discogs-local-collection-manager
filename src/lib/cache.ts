// Cache management for release details (videos and tracklist)
const CACHE_KEY = 'discogs_release_details';
const CACHE_VERSION = '1.0';
const CACHE_EXPIRY_HOURS = 6; // Discogs requirement: cache expires after 6 hours
const MAX_CACHE_SIZE_MB = 50; // Maximum cache size in MB
const MAX_ENTRIES_PER_RELEASE = 1000; // Maximum entries per release to prevent memory bloat
const MAX_TOTAL_ENTRIES = 10000; // Maximum total cache entries

interface CachedReleaseDetails {
  releaseId: number;
  videos: Array<{
    uri: string;
    title: string;
    description: string;
    duration: number;
    embed: boolean;
  }>;
  tracklist: Array<{
    position: string;
    title: string;
    duration: string;
    type_: string;
  }>;
  priceInfo?: {
    lowest_price: number | null;
    currency: string;
  };
  media_condition?: string | null;
  sleeve_condition?: string | null;
  cachedAt: string;
  version: string;
}

interface CacheData {
  [releaseId: number]: CachedReleaseDetails;
}

// Load cache from localStorage with security checks
function loadCache(): CacheData {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return {};
    
    // Validate cache size before parsing
    const cacheSizeBytes = new Blob([cached]).size;
    const cacheSizeMB = cacheSizeBytes / (1024 * 1024);
    
    if (cacheSizeMB > MAX_CACHE_SIZE_MB) {
      console.warn(`Cache size (${cacheSizeMB.toFixed(2)}MB) exceeds limit (${MAX_CACHE_SIZE_MB}MB). Clearing cache.`);
      clearCache();
      return {};
    }
    
    const data: CacheData = JSON.parse(cached);
    
    // Validate data structure
    if (typeof data !== 'object' || data === null) {
      console.warn('Invalid cache data structure. Clearing cache.');
      clearCache();
      return {};
    }
    
    // Clean up expired entries and validate entries
    const now = new Date();
    const cleanedData: CacheData = {};
    let entryCount = 0;
    
    Object.entries(data).forEach(([releaseId, details]) => {
      // Limit total entries
      if (entryCount >= MAX_TOTAL_ENTRIES) {
        return;
      }
      
      // Validate release ID
      const id = parseInt(releaseId);
      if (isNaN(id) || id <= 0) {
        return;
      }
      
      // Validate entry structure
      if (!details || typeof details !== 'object' || 
          !details.cachedAt || !details.version ||
          !Array.isArray(details.videos) || !Array.isArray(details.tracklist)) {
        return;
      }
      
      // Check expiry
      const cachedDate = new Date(details.cachedAt);
      if (isNaN(cachedDate.getTime())) {
        return;
      }
      
      const hoursDiff = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursDiff < CACHE_EXPIRY_HOURS && details.version === CACHE_VERSION) {
        // Limit entries per release
        if (details.videos.length <= MAX_ENTRIES_PER_RELEASE && 
            details.tracklist.length <= MAX_ENTRIES_PER_RELEASE) {
          cleanedData[id] = details;
          entryCount++;
        }
      }
    });
    
    // Save cleaned data back to localStorage
    if (Object.keys(cleanedData).length !== Object.keys(data).length) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cleanedData));
    }
    
    return cleanedData;
  } catch (error) {
    console.error('Error loading cache:', error);
    // Clear corrupted cache
    clearCache();
    return {};
  }
}

// Clear all cache
export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('Cache cleared');
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

// Get cache statistics
export function getCacheStats(): { totalCached: number; cacheSize: string } {
  const cache = loadCache();
  const totalCached = Object.keys(cache).length;
  const cacheSize = new Blob([JSON.stringify(cache)]).size;
  
  return {
    totalCached,
    cacheSize: `${(cacheSize / 1024).toFixed(2)} KB`
  };
}
