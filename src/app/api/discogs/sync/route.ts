import { NextRequest, NextResponse } from 'next/server';
import { config, validateReleaseId } from '@/lib/config';
import { createSecureError } from '@/lib/security';
import { 
  getReleasesNeedingRefresh, 
  batchRefreshReleases, 
  warmCache,
  performCacheHealthCheck
} from '@/lib/cacheSync';
import { logCacheJobStart, logCacheJobCompletion, getCacheJobSummary, getRecentCacheJobs, checkCacheCompliance } from '@/lib/cacheJobLogger';
import { 
  getSyncMetrics, 
  getPerformanceMetrics, 
  getCacheHitRate, 
  getSuccessRate, 
  getDataTransferEfficiency 
} from '@/lib/monitoring';
import { 
  getBackgroundSyncService,
  initializeBackgroundSync,
  stopBackgroundSync 
} from '@/lib/backgroundSync';
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimiter';
import { logApiRequest, logValidationError } from '@/lib/logger';
import { rejectIfNotLocal } from '@/lib/requestSecurity';

// POST - Start cache synchronization
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const localOnlyResponse = rejectIfNotLocal(request);
  
  if (localOnlyResponse) {
    return localOnlyResponse;
  }
  
  try {
    // Apply rate limiting
    const rateLimitResult = rateLimit(request, '/api/discogs/sync');
    
    if (!rateLimitResult.allowed) {
      const headers = getRateLimitHeaders(
        rateLimitResult.allowed,
        rateLimitResult.remaining,
        rateLimitResult.resetTime,
        rateLimitResult.limit
      );
      
      logApiRequest('POST', '/api/discogs/sync', 429, Date.now() - startTime);
      
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers,
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { 
      action, 
      releaseIds, 
      dataType = 'all',
      config: syncConfig 
    } = body;

    // Validate input
    if (!action || typeof action !== 'string') {
      logValidationError('action', action, 'Missing or invalid action');
      const error = createSecureError('Action is required', 400);
      return NextResponse.json(error, { status: error.status });
    }

    let result: any = {};

    switch (action) {
      case 'refresh_releases':
        if (!releaseIds || !Array.isArray(releaseIds)) {
          logValidationError('releaseIds', releaseIds, 'Missing or invalid releaseIds');
          const error = createSecureError('Release IDs array is required', 400);
          return NextResponse.json(error, { status: error.status });
        }

        // Validate release IDs
        const validReleaseIds = releaseIds.filter(id => {
          try {
            validateReleaseId(parseInt(id));
            return true;
          } catch {
            return false;
          }
        });

        if (validReleaseIds.length === 0) {
          const error = createSecureError('No valid release IDs provided', 400);
          return NextResponse.json(error, { status: error.status });
        }

        const refreshJobId = logCacheJobStart('manual_refresh', {
          config: { action, dataType, releaseCount: validReleaseIds.length }
        });
        
        const refreshStartTime = Date.now();
        
        try {
          result = await batchRefreshReleases(
            validReleaseIds,
            config.DISCOGS_API_TOKEN,
            dataType,
            10,
            1000,
            5 // Default concurrency
          );
          
          const duration = Date.now() - refreshStartTime;
          logCacheJobCompletion(refreshJobId, 'completed', {
            duration,
            releasesProcessed: validReleaseIds.length,
            releasesSuccessful: result.success,
            releasesFailed: result.failed,
            releasesChanged: result.changed,
            releasesUnchanged: result.unchanged,
            dataTransferred: 0, // TODO: Calculate from monitoring
            complianceStatus: 'compliant'
          });
        } catch (error) {
          const duration = Date.now() - refreshStartTime;
          logCacheJobCompletion(refreshJobId, 'failed', {
            duration,
            releasesProcessed: validReleaseIds.length,
            releasesSuccessful: 0,
            releasesFailed: validReleaseIds.length,
            releasesChanged: 0,
            releasesUnchanged: 0,
            dataTransferred: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            complianceStatus: 'unknown'
          });
          throw error;
        }
        break;

      case 'refresh_stale':
        const staleReleases = getReleasesNeedingRefresh(dataType, syncConfig);
        const staleJobId = logCacheJobStart('manual_refresh', {
          config: { action, dataType, releaseCount: staleReleases.length }
        });
        
        const staleStartTime = Date.now();
        
        try {
          if (staleReleases.length > 0) {
            result = await batchRefreshReleases(
              staleReleases,
              config.DISCOGS_API_TOKEN,
              dataType,
              10,
              1000,
              5 // Default concurrency
            );
          } else {
            result = { success: 0, failed: 0, changed: 0, unchanged: 0, errors: [], message: 'No stale releases found' };
          }
          
          const duration = Date.now() - staleStartTime;
          logCacheJobCompletion(staleJobId, 'completed', {
            duration,
            releasesProcessed: staleReleases.length,
            releasesSuccessful: result.success,
            releasesFailed: result.failed,
            releasesChanged: result.changed,
            releasesUnchanged: result.unchanged,
            dataTransferred: 0, // TODO: Calculate from monitoring
            complianceStatus: 'compliant'
          });
        } catch (error) {
          const duration = Date.now() - staleStartTime;
          logCacheJobCompletion(staleJobId, 'failed', {
            duration,
            releasesProcessed: staleReleases.length,
            releasesSuccessful: 0,
            releasesFailed: staleReleases.length,
            releasesChanged: 0,
            releasesUnchanged: 0,
            dataTransferred: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            complianceStatus: 'unknown'
          });
          throw error;
        }
        break;

      case 'refresh_prices_only':
        if (!releaseIds || !Array.isArray(releaseIds)) {
          logValidationError('releaseIds', releaseIds, 'Missing or invalid releaseIds');
          const error = createSecureError('Release IDs array is required for price refresh', 400);
          return NextResponse.json(error, { status: error.status });
        }

        const validPriceReleaseIds = releaseIds.filter(id => {
          try {
            validateReleaseId(parseInt(id));
            return true;
          } catch {
            return false;
          }
        });

        if (validPriceReleaseIds.length === 0) {
          const error = createSecureError('No valid release IDs provided for price refresh', 400);
          return NextResponse.json(error, { status: error.status });
        }

        result = await batchRefreshReleases(
          validPriceReleaseIds,
          config.DISCOGS_API_TOKEN,
          'price',
          5, // Smaller batch size for price updates
          2000, // Longer delay to respect rate limits
          3 // Lower concurrency for price updates
        );
        break;

      case 'warm_cache':
        if (!releaseIds || !Array.isArray(releaseIds)) {
          logValidationError('releaseIds', releaseIds, 'Missing or invalid releaseIds');
          const error = createSecureError('Release IDs array is required for cache warming', 400);
          return NextResponse.json(error, { status: error.status });
        }

        const validWarmReleaseIds = releaseIds.filter(id => {
          try {
            validateReleaseId(parseInt(id));
            return true;
          } catch {
            return false;
          }
        });

        await warmCache(validWarmReleaseIds, config.DISCOGS_API_TOKEN, syncConfig);
        result = { message: `Cache warmed for ${validWarmReleaseIds.length} releases` };
        break;

      case 'start_background_sync':
        initializeBackgroundSync();
        result = { message: 'Background sync service started' };
        break;

      case 'stop_background_sync':
        stopBackgroundSync();
        result = { message: 'Background sync service stopped' };
        break;

      default:
        const error = createSecureError(`Unknown action: ${action}`, 400);
        return NextResponse.json(error, { status: error.status });
    }

    // Add rate limit headers
    const headers = getRateLimitHeaders(
      rateLimitResult.allowed,
      rateLimitResult.remaining,
      rateLimitResult.resetTime,
      rateLimitResult.limit
    );
    
    const response = NextResponse.json(result);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Log successful request
    logApiRequest('POST', '/api/discogs/sync', 200, Date.now() - startTime);

    return response;

  } catch {
    logApiRequest('POST', '/api/discogs/sync', 500, Date.now() - startTime);
    const secureError = createSecureError('Failed to process sync request', 500);
    return NextResponse.json(secureError, { status: secureError.status });
  }
}

// GET - Get sync status and cache health
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const localOnlyResponse = rejectIfNotLocal(request);
  
  if (localOnlyResponse) {
    return localOnlyResponse;
  }
  
  try {
    // Apply rate limiting
    const rateLimitResult = rateLimit(request, '/api/discogs/sync');
    
    if (!rateLimitResult.allowed) {
      const headers = getRateLimitHeaders(
        rateLimitResult.allowed,
        rateLimitResult.remaining,
        rateLimitResult.resetTime,
        rateLimitResult.limit
      );
      
      logApiRequest('GET', '/api/discogs/sync', 429, Date.now() - startTime);
      
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers,
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'status';

    let result: any = {};

    switch (type) {
      case 'status':
        const syncService = getBackgroundSyncService();
        result = {
          service: syncService.getServiceStatus(),
          jobs: syncService.getAllJobs().slice(-10), // Last 10 jobs
        };
        break;

      case 'health':
        result = performCacheHealthCheck();
        break;

      case 'stale_releases':
        const staleReleases = getReleasesNeedingRefresh('all');
        result = {
          staleReleases,
          count: staleReleases.length,
        };
        break;

      case 'metrics':
        result = {
          syncMetrics: getSyncMetrics(),
          cacheHitRate: getCacheHitRate(),
          successRate: getSuccessRate(),
          dataTransferEfficiency: getDataTransferEfficiency(),
        };
        break;

      case 'performance':
        result = getPerformanceMetrics();
        break;

      case 'job_logs':
        const hours = parseInt(searchParams.get('hours') || '24');
        const count = parseInt(searchParams.get('count') || '10');
        result = {
          summary: getCacheJobSummary(hours),
          recentJobs: getRecentCacheJobs(count),
          compliance: checkCacheCompliance()
        };
        break;

      default:
        const error = createSecureError(`Unknown type: ${type}`, 400);
        return NextResponse.json(error, { status: error.status });
    }

    // Add rate limit headers
    const headers = getRateLimitHeaders(
      rateLimitResult.allowed,
      rateLimitResult.remaining,
      rateLimitResult.resetTime,
      rateLimitResult.limit
    );
    
    const response = NextResponse.json(result);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Log successful request
    logApiRequest('GET', '/api/discogs/sync', 200, Date.now() - startTime);

    return response;

  } catch {
    logApiRequest('GET', '/api/discogs/sync', 500, Date.now() - startTime);
    const secureError = createSecureError('Failed to get sync status', 500);
    return NextResponse.json(secureError, { status: secureError.status });
  }
}

