// Cache synchronization and invalidation system
import { getCachedReleaseFromServer, saveReleaseToServerCache, loadServerCache } from './serverCache';
import { recordSyncRequest, recordSyncResponse, recordCacheHit, recordCacheMiss, recordSyncError } from './monitoring';
import { config } from './config';

export interface CacheSyncConfig {
  // Price refresh intervals (more frequent for price-sensitive data)
  priceRefreshHours: number;
  // Metadata refresh intervals (less frequent for stable data)
  metadataRefreshHours: number;
  // Force refresh for specific releases
  forceRefreshReleases: number[];
  // Background sync enabled
  backgroundSyncEnabled: boolean;
}

const DEFAULT_CONFIG: CacheSyncConfig = {
  priceRefreshHours: 6, // Refresh prices every 6 hours - Discogs API compliance requirement
  metadataRefreshHours: 6, // Refresh metadata every 6 hours - Discogs API compliance requirement
  forceRefreshReleases: [],
  backgroundSyncEnabled: true
};

export interface CacheEntryMetadata {
  releaseId: number;
  lastPriceUpdate: string;
  lastMetadataUpdate: string;
  priceUpdateCount: number;
  metadataUpdateCount: number;
  lastDiscogsCheck: string;
}

// Enhanced cache entry with sync metadata
export interface EnhancedCachedReleaseDetails {
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
  syncMetadata: CacheEntryMetadata;
}

// Check if cache entry needs refresh based on data type
export function needsRefresh(
  releaseId: number, 
  dataType: 'price' | 'metadata' | 'all',
  config: CacheSyncConfig = DEFAULT_CONFIG
): boolean {
  const cached = getCachedReleaseFromServer(releaseId);
  if (!cached) return true;

  const now = new Date();
  const cachedDate = new Date(cached.cachedAt);
  const hoursSinceCached = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60);

  // Force refresh for specific releases
  if (config.forceRefreshReleases.includes(releaseId)) {
    return true;
  }

  switch (dataType) {
    case 'price':
      return hoursSinceCached >= config.priceRefreshHours;
    case 'metadata':
      return hoursSinceCached >= config.metadataRefreshHours;
    case 'all':
      return hoursSinceCached >= Math.min(config.priceRefreshHours, config.metadataRefreshHours);
    default:
      return false;
  }
}

// Get releases that need refresh
export function getReleasesNeedingRefresh(
  dataType: 'price' | 'metadata' | 'all' = 'all',
  config: CacheSyncConfig = DEFAULT_CONFIG
): number[] {
  const cacheData = loadServerCache();
  const releasesNeedingRefresh: number[] = [];

  Object.keys(cacheData).forEach(releaseIdStr => {
    const releaseId = parseInt(releaseIdStr);
    if (needsRefresh(releaseId, dataType, config)) {
      releasesNeedingRefresh.push(releaseId);
    }
  });

  return releasesNeedingRefresh;
}

// Helper function to check if metadata has changed
function hasMetadataChanged(
  cached: any,
  freshData: any
): boolean {
  // Compare videos
  const cachedVideos = JSON.stringify(cached.videos || []);
  const freshVideos = JSON.stringify(freshData.videos || []);
  if (cachedVideos !== freshVideos) {
    return true;
  }

  // Compare tracklist
  const cachedTracklist = JSON.stringify(cached.tracklist || []);
  const freshTracklist = JSON.stringify(freshData.tracklist || []);
  if (cachedTracklist !== freshTracklist) {
    return true;
  }

  return false;
}

// Helper function to check if price has changed
function hasPriceChanged(
  cached: any,
  freshPrice: number | null
): boolean {
  const cachedPrice = cached.priceInfo?.lowest_price;
  return cachedPrice !== freshPrice;
}

// Incremental cache refresh for specific releases with ETag support and change detection
export async function refreshReleaseCache(
  releaseId: number,
  discogsToken: string,
  dataType: 'price' | 'metadata' | 'all' = 'all'
): Promise<{ success: boolean; changed: boolean; reason?: string }> {
  const startTime = Date.now();
  const eventId = recordSyncRequest(releaseId);
  
  try {
    console.log(`Refreshing ${dataType} data for release ${releaseId}`);
    
    // Get cached data for comparison
    const cached = getCachedReleaseFromServer(releaseId);
    
    // Record cache hit/miss
    if (cached) {
      recordCacheHit(releaseId);
    } else {
      recordCacheMiss(releaseId);
    }
    
    // Prepare headers for Discogs API request
    const headers: Record<string, string> = {
      'Authorization': `Discogs token=${discogsToken}`,
      'User-Agent': config.userAgent,
    };
    
    // Fetch fresh data from Discogs
    const releaseUrl = `https://api.discogs.com/releases/${releaseId}`;
    const response = await fetch(releaseUrl, { headers });
    const duration = Date.now() - startTime;

    if (!response.ok) {
      console.error(`Failed to refresh release ${releaseId}: ${response.status}`);
      recordSyncResponse(eventId, false, duration, 0, response.status, `HTTP ${response.status}`);
      recordSyncError(releaseId, `HTTP ${response.status}`);
      return { success: false, changed: false, reason: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const dataSize = JSON.stringify(data).length;
    
    // Extract price information
    let priceInfo = undefined;
    if (data.lowest_price !== null && data.lowest_price !== undefined) {
      priceInfo = {
        lowest_price: parseFloat(data.lowest_price),
        currency: 'USD'
      };
    }

    // Check for changes based on data type
    let hasChanges = false;
    let changeReason = '';

    if (dataType === 'price' || dataType === 'all') {
      if (hasPriceChanged(cached, priceInfo?.lowest_price || null)) {
        hasChanges = true;
        changeReason += 'price changed; ';
      }
    }

    if (dataType === 'metadata' || dataType === 'all') {
      if (hasMetadataChanged(cached, data)) {
        hasChanges = true;
        changeReason += 'metadata changed; ';
      }
    }

    // Only update cache if there are actual changes
    if (hasChanges) {
      // Update cache with fresh data
      saveReleaseToServerCache(releaseId, data.videos || [], data.tracklist || [], priceInfo);
      console.log(`Successfully refreshed ${dataType} data for release ${releaseId} - ${changeReason.trim()}`);
      recordSyncResponse(eventId, true, duration, dataSize, response.status, changeReason.trim());
      return { success: true, changed: true, reason: changeReason.trim() };
    } else {
      console.log(`No changes detected for release ${releaseId} ${dataType} data - skipping update`);
      recordSyncResponse(eventId, true, duration, dataSize, response.status, 'no changes detected');
      return { success: true, changed: false, reason: 'no changes detected' };
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error refreshing release ${releaseId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'unknown error';
    recordSyncResponse(eventId, false, duration, 0, 0, errorMessage);
    recordSyncError(releaseId, errorMessage);
    return { success: false, changed: false, reason: errorMessage };
  }
}

// Optimized batch refresh with parallel processing and intelligent batching
export async function batchRefreshReleases(
  releaseIds: number[],
  discogsToken: string,
  dataType: 'price' | 'metadata' | 'all' = 'all',
  batchSize: number = 10,
  delayMs: number = 1000,
  maxConcurrency: number = 5
): Promise<{ success: number; failed: number; changed: number; unchanged: number; errors: string[] }> {
  const results = { success: 0, failed: 0, changed: 0, unchanged: 0, errors: [] as string[] };
  
  // Process releases in optimized batches with concurrency control
  for (let i = 0; i < releaseIds.length; i += batchSize) {
    const batch = releaseIds.slice(i, i + batchSize);
    
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(releaseIds.length / batchSize)} (${batch.length} releases)`);
    
    // Process batch with controlled concurrency
    const batchResults = await processBatchWithConcurrency(
      batch, 
      discogsToken, 
      dataType, 
      maxConcurrency
    );
    
    // Aggregate results
    results.success += batchResults.success;
    results.failed += batchResults.failed;
    results.changed += batchResults.changed;
    results.unchanged += batchResults.unchanged;
    results.errors.push(...batchResults.errors);
    
    // Rate limiting delay between batches
    if (i + batchSize < releaseIds.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

// Process a batch with controlled concurrency
async function processBatchWithConcurrency(
  releaseIds: number[],
  discogsToken: string,
  dataType: 'price' | 'metadata' | 'all',
  maxConcurrency: number
): Promise<{ success: number; failed: number; changed: number; unchanged: number; errors: string[] }> {
  const results = { success: 0, failed: 0, changed: 0, unchanged: 0, errors: [] as string[] };
  
  // Create semaphore for concurrency control
  const semaphore = new Semaphore(maxConcurrency);
  
  const promises = releaseIds.map(async (releaseId) => {
    await semaphore.acquire();
    try {
      const result = await refreshReleaseCache(releaseId, discogsToken, dataType);
      if (result.success) {
        results.success++;
        if (result.changed) {
          results.changed++;
        } else {
          results.unchanged++;
        }
      } else {
        results.failed++;
        results.errors.push(`Failed to refresh release ${releaseId}: ${result.reason || 'unknown error'}`);
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`Error refreshing release ${releaseId}: ${error}`);
    } finally {
      semaphore.release();
    }
  });
  
  await Promise.all(promises);
  return results;
}

// Simple semaphore implementation for concurrency control
class Semaphore {
  private permits: number;
  private waitingQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitingQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitingQueue.length > 0) {
      const resolve = this.waitingQueue.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}

// Price-only refresh for releases (can be triggered manually)
export async function refreshPricesOnly(
  releaseIds: number[],
  discogsToken: string,
  batchSize: number = 5,
  delayMs: number = 2000
): Promise<{ success: number; failed: number; changed: number; unchanged: number; errors: string[] }> {
  console.log(`Refreshing prices for ${releaseIds.length} releases`);
  
  const results = await batchRefreshReleases(releaseIds, discogsToken, 'price', batchSize, delayMs);
  console.log(`Price refresh completed: ${results.success} success, ${results.failed} failed, ${results.changed} changed, ${results.unchanged} unchanged`);
  
  return results;
}

// Smart cache warming - refresh frequently accessed releases
export async function warmCache(
  frequentlyAccessedReleases: number[],
  discogsToken: string,
  config: CacheSyncConfig = DEFAULT_CONFIG
): Promise<void> {
  console.log(`Warming cache for ${frequentlyAccessedReleases.length} frequently accessed releases`);
  
  const releasesNeedingRefresh = frequentlyAccessedReleases.filter(releaseId => 
    needsRefresh(releaseId, 'all', config)
  );
  
  if (releasesNeedingRefresh.length > 0) {
    const results = await batchRefreshReleases(releasesNeedingRefresh, discogsToken, 'all');
    console.log(`Cache warming completed: ${results.success} success, ${results.failed} failed`);
  } else {
    console.log('No releases need cache warming');
  }
}

// Cache health check and cleanup
export function performCacheHealthCheck(): {
  totalEntries: number;
  expiredEntries: number;
  staleEntries: number;
  recommendations: string[];
} {
  const cacheData = loadServerCache();
  const now = new Date();
  const expiredEntries = 0;
  let staleEntries = 0;
  const recommendations: string[] = [];

  Object.values(cacheData).forEach(entry => {
    const cachedDate = new Date(entry.cachedAt);
    const hoursSinceCached = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceCached >= 6) { // 6 hours - Discogs API compliance requirement
      staleEntries++; // Mark as stale, not expired
    } else if (hoursSinceCached >= 4) { // 4 hours - approaching update time
      staleEntries++;
    }
  });

  if (expiredEntries > 0) {
    recommendations.push(`Consider refreshing ${expiredEntries} expired entries`);
  }
  
  if (staleEntries > 0) {
    recommendations.push(`Consider checking ${staleEntries} stale entries for updates`);
  }

  return {
    totalEntries: Object.keys(cacheData).length,
    expiredEntries,
    staleEntries,
    recommendations
  };
}

