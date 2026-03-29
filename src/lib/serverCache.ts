// Server-side in-memory cache management for release details with LRU eviction
const CACHE_VERSION = '1.0';
const CACHE_EXPIRY_HOURS = 6; // 6-hour cache expiry - Discogs API compliance requirement
const MAX_CACHE_ENTRIES = 1000; // Maximum cache entries before LRU eviction

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
  cachedAt: string;
  version: string;
  // Enhanced sync metadata
  lastPriceUpdate?: string;
  lastMetadataUpdate?: string;
  updateCount?: number;
  lastAccessedAt?: string; // For LRU tracking
}

interface CacheData {
  [releaseId: number]: CachedReleaseDetails;
}

/**
 * LRU Cache implementation with automatic eviction
 * @class LRUServerCache
 * @description Thread-safe in-memory cache with automatic LRU eviction
 * Exported for testing purposes
 */
export class LRUServerCache {
  private cache: Map<number, CachedReleaseDetails> = new Map();
  private readonly maxSize: number = MAX_CACHE_ENTRIES;
  
  get(releaseId: number): CachedReleaseDetails | null {
    const entry = this.cache.get(releaseId);
    if (!entry) {
      return null;
    }
    
    // Check expiry
    const now = new Date();
    const cachedDate = new Date(entry.cachedAt);
    const hoursSinceCached = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceCached >= CACHE_EXPIRY_HOURS) {
      this.cache.delete(releaseId);
      return null;
    }
    
    // Update last accessed time for LRU
    entry.lastAccessedAt = now.toISOString();
    
    // Move to end (most recently used)
    this.cache.delete(releaseId);
    this.cache.set(releaseId, entry);
    
    return entry;
  }
  
  set(releaseId: number, entry: CachedReleaseDetails): void {
    // If at capacity, evict least recently used entry
    if (this.cache.size >= this.maxSize && !this.cache.has(releaseId)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        console.log(`[LRU Cache] Evicted entry ${firstKey} (cache full)`);
      }
    }
    
    // Set last accessed time
    entry.lastAccessedAt = new Date().toISOString();
    
    // Remove if exists (to maintain order)
    if (this.cache.has(releaseId)) {
      this.cache.delete(releaseId);
    }
    
    this.cache.set(releaseId, entry);
  }
  
  getAll(): CacheData {
    const result: CacheData = {};
    this.cache.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  
  size(): number {
    return this.cache.size;
  }
  
  clear(): void {
    this.cache.clear();
    console.log('[Cache] In-memory cache cleared');
  }
  
  // Clean up expired entries
  cleanupExpired(): number {
    const now = new Date();
    let expiredCount = 0;
    
    for (const [releaseId, entry] of this.cache.entries()) {
      const cachedDate = new Date(entry.cachedAt);
      const hoursSinceCached = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceCached >= CACHE_EXPIRY_HOURS) {
        this.cache.delete(releaseId);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`[Cache] Cleaned up ${expiredCount} expired entries`);
    }
    
    return expiredCount;
  }
}

// Global in-memory cache instance
const serverCache = new LRUServerCache();

/**
 * Periodic cleanup of expired entries (every 30 minutes)
 * @note In production with multiple instances, consider using Redis or similar
 * to share cache state across instances
 */
let cleanupInterval: NodeJS.Timeout | null = null;
if (typeof setInterval !== 'undefined') {
  cleanupInterval = setInterval(() => {
    serverCache.cleanupExpired();
  }, 30 * 60 * 1000);
}

// Cleanup function for graceful shutdown
export function shutdownCache(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  serverCache.clear();
  console.log('[Cache] Shutdown complete');
}

// Load cache from in-memory storage (returns all cached entries)
export function loadServerCache(): CacheData {
  return serverCache.getAll();
}

/**
 * Save individual release to cache
 * @returns true if successfully cached, false otherwise
 */
export function saveReleaseToServerCache(
  releaseId: number,
  videos: any[],
  tracklist: any[],
  priceInfo?: { lowest_price: number | null; currency: string }
): boolean {
  try {
    const cachedDetails: CachedReleaseDetails = {
      releaseId,
      videos: videos || [],
      tracklist: tracklist || [],
      priceInfo,
      cachedAt: new Date().toISOString(),
      version: CACHE_VERSION
    };
    
    serverCache.set(releaseId, cachedDetails);
    return true;
    
  } catch (error) {
    console.error(`[Cache Error] Failed to save release ${releaseId}:`, error);
    return false;
  }
}

/**
 * Get cached release details
 * @returns Cached release data if found and not expired, null otherwise
 * @note Returns null on error to allow graceful fallback to database queries
 */
export function getCachedReleaseFromServer(releaseId: number): CachedReleaseDetails | null {
  try {
    return serverCache.get(releaseId);
  } catch (error) {
    console.error(`[Cache Error] Failed to retrieve release ${releaseId}:`, error);
    return null;
  }
}

// Check if release has complete cached data
export function hasCompleteCachedData(releaseId: number): boolean {
  const cached = getCachedReleaseFromServer(releaseId);
  if (!cached) {
    return false;
  }
  
  // Check if we have videos or price data
  const hasVideos = Boolean(cached.videos && cached.videos.length > 0);
  const hasPrice = Boolean(cached.priceInfo && cached.priceInfo.lowest_price !== null);
  
  return hasVideos || hasPrice;
}

// Get cache statistics
export function getServerCacheStats(): {
  totalEntries: number;
  entriesWithVideos: number;
  entriesWithPrices: number;
  cacheSize: string;
  maxEntries: number;
  utilizationPercent: number;
} {
  try {
    const cacheData = serverCache.getAll();
    const entries = Object.values(cacheData);
    
    const entriesWithVideos = entries.filter(entry => entry.videos && entry.videos.length > 0).length;
    const entriesWithPrices = entries.filter(entry => entry.priceInfo && entry.priceInfo.lowest_price !== null).length;
    
    // Calculate approximate cache size in memory
    const cacheSizeBytes = JSON.stringify(cacheData).length;
    const cacheSizeMB = (cacheSizeBytes / (1024 * 1024)).toFixed(2);
    
    const utilizationPercent = Math.round((serverCache.size() / MAX_CACHE_ENTRIES) * 100);
    
    return {
      totalEntries: entries.length,
      entriesWithVideos,
      entriesWithPrices,
      cacheSize: `${cacheSizeMB} MB (in-memory)`,
      maxEntries: MAX_CACHE_ENTRIES,
      utilizationPercent
    };
    
  } catch (error) {
    console.error('Error getting server cache stats:', error);
    return {
      totalEntries: 0,
      entriesWithVideos: 0,
      entriesWithPrices: 0,
      cacheSize: '0 MB',
      maxEntries: MAX_CACHE_ENTRIES,
      utilizationPercent: 0
    };
  }
}

// Clear all server cache
export function clearServerCache(): void {
  serverCache.clear();
}
