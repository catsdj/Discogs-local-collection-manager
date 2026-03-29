// Background synchronization service for keeping cache in sync with Discogs
import { config } from './config';
import { 
  getReleasesNeedingRefresh, 
  batchRefreshReleases, 
  warmCache,
  performCacheHealthCheck,
  CacheSyncConfig 
} from './cacheSync';
import { logCacheJobStart, logCacheJobCompletion, checkCacheCompliance } from './cacheJobLogger';

interface SyncJob {
  id: string;
  type: 'price_refresh' | 'metadata_refresh' | 'full_refresh' | 'cache_warming';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  progress: number;
  total: number;
  results?: {
    success: number;
    failed: number;
    changed: number;
    unchanged: number;
    errors: string[];
  };
}

class BackgroundSyncService {
  private syncJobs: Map<string, SyncJob> = new Map();
  private isRunning = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private config: CacheSyncConfig;

  constructor(config: CacheSyncConfig) {
    this.config = config;
  }

  // Start background sync service (manual only - no automatic scheduling)
  start(): void {
    if (this.isRunning) {
      console.log('Background sync service is already running');
      return;
    }

    this.isRunning = true;
    console.log('Background sync service started (manual mode only)');

    // NOTE: Automatic periodic sync has been disabled
    // Use manual sync buttons in the UI instead
    // this.runSyncCycle(); // Removed automatic initial sync
    // this.syncInterval = setInterval(() => { // Removed automatic periodic sync
    //   this.runSyncCycle();
    // }, 6 * 60 * 60 * 1000); // 6 hours - Discogs API compliance requirement
  }

  // Stop background sync service
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    console.log('Background sync service stopped');
  }

  // Run a complete sync cycle
  private async runSyncCycle(): Promise<void> {
    const jobId = logCacheJobStart('sync_cycle', {
      config: this.config
    });
    
    const startTime = Date.now();
    let totalReleasesProcessed = 0;
    let totalReleasesSuccessful = 0;
    let totalReleasesFailed = 0;
    let totalReleasesChanged = 0;
    let totalReleasesUnchanged = 0;
    let totalDataTransferred = 0;
    const errors: string[] = [];

    try {
      console.log('Starting sync cycle...');

      // 1. Price refresh (high priority)
      const priceResults = await this.runPriceRefresh();
      totalReleasesProcessed += priceResults.releasesProcessed;
      totalReleasesSuccessful += priceResults.releasesSuccessful;
      totalReleasesFailed += priceResults.releasesFailed;
      totalReleasesChanged += priceResults.releasesChanged;
      totalReleasesUnchanged += priceResults.releasesUnchanged;
      totalDataTransferred += priceResults.dataTransferred;
      if (priceResults.errors) errors.push(...priceResults.errors);

      // 2. Metadata refresh (lower priority)
      const metadataResults = await this.runMetadataRefresh();
      totalReleasesProcessed += metadataResults.releasesProcessed;
      totalReleasesSuccessful += metadataResults.releasesSuccessful;
      totalReleasesFailed += metadataResults.releasesFailed;
      totalReleasesChanged += metadataResults.releasesChanged;
      totalReleasesUnchanged += metadataResults.releasesUnchanged;
      totalDataTransferred += metadataResults.dataTransferred;
      if (metadataResults.errors) errors.push(...metadataResults.errors);

      // 3. Cache health check
      const healthCheck = performCacheHealthCheck();
      console.log('Cache health check:', healthCheck);

      // 4. Check compliance status
      const complianceStatus = checkCacheCompliance();

      const duration = Date.now() - startTime;
      const nextScheduledRun = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6 hours from now

      logCacheJobCompletion(jobId, 'completed', {
        duration,
        releasesProcessed: totalReleasesProcessed,
        releasesSuccessful: totalReleasesSuccessful,
        releasesFailed: totalReleasesFailed,
        releasesChanged: totalReleasesChanged,
        releasesUnchanged: totalReleasesUnchanged,
        dataTransferred: totalDataTransferred,
        errors: errors.length > 0 ? errors : undefined,
        complianceStatus: complianceStatus.isCompliant ? 'compliant' : 'non_compliant',
        nextScheduledRun
      }, {
        cacheHealth: healthCheck,
        recommendations: complianceStatus.recommendations
      });

      console.log('Sync cycle completed');
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);

      logCacheJobCompletion(jobId, 'failed', {
        duration,
        releasesProcessed: totalReleasesProcessed,
        releasesSuccessful: totalReleasesSuccessful,
        releasesFailed: totalReleasesFailed,
        releasesChanged: totalReleasesChanged,
        releasesUnchanged: totalReleasesUnchanged,
        dataTransferred: totalDataTransferred,
        errors,
        complianceStatus: 'unknown',
        nextScheduledRun: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
      });

      console.error('Error in sync cycle:', error);
    }
  }

  // Refresh price data for releases
  private async runPriceRefresh(): Promise<{
    releasesProcessed: number;
    releasesSuccessful: number;
    releasesFailed: number;
    releasesChanged: number;
    releasesUnchanged: number;
    dataTransferred: number;
    errors?: string[];
  }> {
    const jobId = `price_refresh_${Date.now()}`;
    const releasesNeedingPriceRefresh = getReleasesNeedingRefresh('price', this.config);

    if (releasesNeedingPriceRefresh.length === 0) {
      console.log('No releases need price refresh');
      return {
        releasesProcessed: 0,
        releasesSuccessful: 0,
        releasesFailed: 0,
        releasesChanged: 0,
        releasesUnchanged: 0,
        dataTransferred: 0
      };
    }

    console.log(`Starting price refresh for ${releasesNeedingPriceRefresh.length} releases`);

    const job: SyncJob = {
      id: jobId,
      type: 'price_refresh',
      status: 'running',
      startTime: new Date(),
      progress: 0,
      total: releasesNeedingPriceRefresh.length
    };

    this.syncJobs.set(jobId, job);

    try {
      const results = await batchRefreshReleases(
        releasesNeedingPriceRefresh,
        config.DISCOGS_API_TOKEN,
        'price',
        5, // Smaller batch size for price updates
        2000, // Longer delay to respect rate limits
        3 // Lower concurrency for price updates
      );

      job.status = 'completed';
      job.endTime = new Date();
      job.results = results;

      console.log(`Price refresh completed: ${results.success} success, ${results.failed} failed, ${results.changed} changed, ${results.unchanged} unchanged`);
      
      this.syncJobs.set(jobId, job);
      
      return {
        releasesProcessed: releasesNeedingPriceRefresh.length,
        releasesSuccessful: results.success,
        releasesFailed: results.failed,
        releasesChanged: results.changed,
        releasesUnchanged: results.unchanged,
        dataTransferred: 0 // TODO: Calculate from monitoring data
      };
    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      console.error('Price refresh failed:', error);
      
      this.syncJobs.set(jobId, job);
      
      return {
        releasesProcessed: releasesNeedingPriceRefresh.length,
        releasesSuccessful: 0,
        releasesFailed: releasesNeedingPriceRefresh.length,
        releasesChanged: 0,
        releasesUnchanged: 0,
        dataTransferred: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  // Refresh metadata for releases
  private async runMetadataRefresh(): Promise<{
    releasesProcessed: number;
    releasesSuccessful: number;
    releasesFailed: number;
    releasesChanged: number;
    releasesUnchanged: number;
    dataTransferred: number;
    errors?: string[];
  }> {
    const jobId = `metadata_refresh_${Date.now()}`;
    const releasesNeedingMetadataRefresh = getReleasesNeedingRefresh('metadata', this.config);

    if (releasesNeedingMetadataRefresh.length === 0) {
      console.log('No releases need metadata refresh');
      return {
        releasesProcessed: 0,
        releasesSuccessful: 0,
        releasesFailed: 0,
        releasesChanged: 0,
        releasesUnchanged: 0,
        dataTransferred: 0
      };
    }

    console.log(`Starting metadata refresh for ${releasesNeedingMetadataRefresh.length} releases`);

    const job: SyncJob = {
      id: jobId,
      type: 'metadata_refresh',
      status: 'running',
      startTime: new Date(),
      progress: 0,
      total: releasesNeedingMetadataRefresh.length
    };

    this.syncJobs.set(jobId, job);

    try {
      const results = await batchRefreshReleases(
        releasesNeedingMetadataRefresh,
        config.DISCOGS_API_TOKEN,
        'metadata',
        10, // Larger batch size for metadata updates
        1000, // Shorter delay for metadata
        5 // Higher concurrency for metadata updates
      );

      job.status = 'completed';
      job.endTime = new Date();
      job.results = results;

      console.log(`Metadata refresh completed: ${results.success} success, ${results.failed} failed, ${results.changed} changed, ${results.unchanged} unchanged`);
      
      this.syncJobs.set(jobId, job);
      
      return {
        releasesProcessed: releasesNeedingMetadataRefresh.length,
        releasesSuccessful: results.success,
        releasesFailed: results.failed,
        releasesChanged: results.changed,
        releasesUnchanged: results.unchanged,
        dataTransferred: 0 // TODO: Calculate from monitoring data
      };
    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      console.error('Metadata refresh failed:', error);
      
      this.syncJobs.set(jobId, job);
      
      return {
        releasesProcessed: releasesNeedingMetadataRefresh.length,
        releasesSuccessful: 0,
        releasesFailed: releasesNeedingMetadataRefresh.length,
        releasesChanged: 0,
        releasesUnchanged: 0,
        dataTransferred: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  // Manual price-only refresh for specific releases
  async refreshPricesForReleases(releaseIds: number[]): Promise<void> {
    const jobId = `price_refresh_manual_${Date.now()}`;
    
    const job: SyncJob = {
      id: jobId,
      type: 'price_refresh',
      status: 'running',
      startTime: new Date(),
      progress: 0,
      total: releaseIds.length
    };

    this.syncJobs.set(jobId, job);

    try {
      const results = await batchRefreshReleases(
        releaseIds,
        config.DISCOGS_API_TOKEN,
        'price',
        5, // Smaller batch size for price updates
        2000, // Longer delay to respect rate limits
        3 // Lower concurrency for price updates
      );
      
      job.status = 'completed';
      job.endTime = new Date();
      job.results = results;
      
      console.log(`Manual price refresh completed: ${results.success} success, ${results.failed} failed, ${results.changed} changed, ${results.unchanged} unchanged`);
    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      console.error('Manual price refresh failed:', error);
    }

    this.syncJobs.set(jobId, job);
  }

  // Manual cache warming for specific releases
  async warmCacheForReleases(releaseIds: number[]): Promise<void> {
    const jobId = `cache_warming_${Date.now()}`;
    
    const job: SyncJob = {
      id: jobId,
      type: 'cache_warming',
      status: 'running',
      startTime: new Date(),
      progress: 0,
      total: releaseIds.length
    };

    this.syncJobs.set(jobId, job);

    try {
      await warmCache(releaseIds, config.DISCOGS_API_TOKEN, this.config);
      
      job.status = 'completed';
      job.endTime = new Date();
      job.progress = releaseIds.length;
      
      console.log(`Cache warming completed for ${releaseIds.length} releases`);
    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      console.error('Cache warming failed:', error);
    }

    this.syncJobs.set(jobId, job);
  }

  // Get sync job status
  getJobStatus(jobId: string): SyncJob | null {
    return this.syncJobs.get(jobId) || null;
  }

  // Get all sync jobs
  getAllJobs(): SyncJob[] {
    return Array.from(this.syncJobs.values());
  }

  // Get service status
  getServiceStatus(): {
    isRunning: boolean;
    activeJobs: number;
    totalJobs: number;
    lastSyncTime?: Date;
  } {
    const jobs = Array.from(this.syncJobs.values());
    const activeJobs = jobs.filter(job => job.status === 'running').length;
    const lastSyncTime = jobs
      .filter(job => job.endTime)
      .sort((a, b) => b.endTime!.getTime() - a.endTime!.getTime())[0]?.endTime;

    return {
      isRunning: this.isRunning,
      activeJobs,
      totalJobs: jobs.length,
      lastSyncTime
    };
  }

  // Update configuration
  updateConfig(newConfig: CacheSyncConfig): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Background sync configuration updated');
  }
}

// Singleton instance
let backgroundSyncService: BackgroundSyncService | null = null;

export function getBackgroundSyncService(): BackgroundSyncService {
  if (!backgroundSyncService) {
    backgroundSyncService = new BackgroundSyncService({
      priceRefreshHours: 6, // 6-hour price refresh - Discogs API compliance requirement
      metadataRefreshHours: 6, // 6-hour metadata refresh - Discogs API compliance requirement
      forceRefreshReleases: [],
      backgroundSyncEnabled: false // Disabled by default - use manual sync buttons instead
    });
  }
  return backgroundSyncService;
}

// Initialize background sync service
export function initializeBackgroundSync(): void {
  const service = getBackgroundSyncService();
  service.start();
}

// Stop background sync service
export function stopBackgroundSync(): void {
  if (backgroundSyncService) {
    backgroundSyncService.stop();
  }
}

