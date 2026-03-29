import { NextRequest, NextResponse } from 'next/server';
import { getPerformanceSummary, performanceMonitor } from '@/lib/performance';
import { getServerCacheStats } from '@/lib/serverCache';
import { rejectIfNotLocal } from '@/lib/requestSecurity';

/**
 * Performance monitoring API endpoint
 * Returns performance metrics and cache statistics
 * 
 * SECURITY: This endpoint requires authentication via X-Admin-Token header
 * Set ADMIN_TOKEN in .env.local for production
 */

// Simple authentication check
function isAuthenticated(request: NextRequest): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  
  // In development without ADMIN_TOKEN, allow access
  if (!adminToken && process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // In production, require token
  const requestToken = request.headers.get('x-admin-token');
  return Boolean(adminToken && requestToken === adminToken);
}

export async function GET(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  // Authentication check
  if (!isAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Valid admin token required' },
      { status: 401 }
    );
  }

  try {
    const performanceSummary = getPerformanceSummary();
    const cacheStats = getServerCacheStats();
    const slowOperations = performanceMonitor.getSlowOperations();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      performance: {
        summary: performanceSummary,
        slowOperations: slowOperations.slice(-10), // Last 10 slow operations
        operationNames: performanceMonitor.getOperationNames()
      },
      cache: cacheStats,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: {
          heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
          external: `${Math.round(process.memoryUsage().external / 1024 / 1024)}MB`,
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
        }
      }
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch performance metrics' },
      { status: 500 }
    );
  }
}

