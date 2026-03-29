// Advanced monitoring and analytics system for cache sync performance
import fs from 'fs';
import path from 'path';

const MONITORING_FILE = path.join(process.cwd(), 'data', 'sync-monitoring.json');

export interface SyncMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalDataTransferred: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
  lastUpdated: string;
}

export interface PerformanceMetrics {
  syncMetrics: SyncMetrics;
  hourlyStats: Array<{
    hour: string;
    requests: number;
    successRate: number;
    averageResponseTime: number;
    dataTransferred: number;
  }>;
  dailyStats: Array<{
    date: string;
    requests: number;
    successRate: number;
    cacheHitRate: number;
    totalDataTransferred: number;
  }>;
  releaseStats: Array<{
    releaseId: number;
    requestCount: number;
    lastAccessed: string;
    averageResponseTime: number;
  }>;
}

export interface SyncEvent {
  id: string;
  timestamp: string;
  type: 'request' | 'response' | 'cache_hit' | 'cache_miss' | 'error';
  releaseId?: number;
  duration?: number;
  dataSize?: number;
  status?: number;
  reason?: string;
}

class MonitoringService {
  private metrics: SyncMetrics;
  private events: SyncEvent[] = [];
  private maxEvents = 1000; // Keep last 1000 events

  constructor() {
    this.metrics = this.loadMetrics();
  }

  // Record a sync request
  recordRequest(releaseId: number, startTime: number): string {
    void startTime;
    const eventId = `req_${Date.now()}_${releaseId}`;
    const event: SyncEvent = {
      id: eventId,
      timestamp: new Date().toISOString(),
      type: 'request',
      releaseId,
    };
    
    this.addEvent(event);
    this.metrics.totalRequests++;
    this.updateLastUpdated();
    
    return eventId;
  }

  // Record a sync response
  recordResponse(
    eventId: string,
    success: boolean,
    duration: number,
    dataSize: number = 0,
    status?: number,
    reason?: string
  ): void {
    const event: SyncEvent = {
      id: eventId,
      timestamp: new Date().toISOString(),
      type: 'response',
      duration,
      dataSize,
      status,
      reason,
    };

    this.addEvent(event);

    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    this.metrics.totalDataTransferred += dataSize;
    this.updateAverageResponseTime(duration);
    this.updateLastUpdated();
  }

  // Record cache hit
  recordCacheHit(releaseId: number): void {
    const event: SyncEvent = {
      id: `hit_${Date.now()}_${releaseId}`,
      timestamp: new Date().toISOString(),
      type: 'cache_hit',
      releaseId,
    };

    this.addEvent(event);
    this.metrics.cacheHits++;
    this.updateLastUpdated();
  }

  // Record cache miss
  recordCacheMiss(releaseId: number): void {
    const event: SyncEvent = {
      id: `miss_${Date.now()}_${releaseId}`,
      timestamp: new Date().toISOString(),
      type: 'cache_miss',
      releaseId,
    };

    this.addEvent(event);
    this.metrics.cacheMisses++;
    this.updateLastUpdated();
  }

  // Record error
  recordError(releaseId: number, reason: string): void {
    const event: SyncEvent = {
      id: `error_${Date.now()}_${releaseId}`,
      timestamp: new Date().toISOString(),
      type: 'error',
      releaseId,
      reason,
    };

    this.addEvent(event);
    this.metrics.failedRequests++;
    this.updateLastUpdated();
  }

  // Get current metrics
  getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  // Get performance metrics with historical data
  getPerformanceMetrics(): PerformanceMetrics {
    const now = new Date();
    const hourlyStats = this.calculateHourlyStats(now);
    const dailyStats = this.calculateDailyStats(now);
    const releaseStats = this.calculateReleaseStats();

    return {
      syncMetrics: this.getMetrics(),
      hourlyStats,
      dailyStats,
      releaseStats,
    };
  }

  // Get cache hit rate
  getCacheHitRate(): number {
    const totalCacheAccess = this.metrics.cacheHits + this.metrics.cacheMisses;
    return totalCacheAccess > 0 ? (this.metrics.cacheHits / totalCacheAccess) * 100 : 0;
  }

  // Get success rate
  getSuccessRate(): number {
    return this.metrics.totalRequests > 0 
      ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
      : 0;
  }

  // Get data transfer efficiency (MB per request)
  getDataTransferEfficiency(): number {
    return this.metrics.totalRequests > 0 
      ? this.metrics.totalDataTransferred / (this.metrics.totalRequests * 1024 * 1024)
      : 0;
  }

  // Reset metrics
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalDataTransferred: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      lastUpdated: new Date().toISOString(),
    };
    this.events = [];
    this.saveMetrics();
  }

  // Private methods
  private addEvent(event: SyncEvent): void {
    this.events.push(event);
    
    // Keep only the last maxEvents
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  private updateAverageResponseTime(duration: number): void {
    const totalRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
    if (totalRequests > 0) {
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (totalRequests - 1) + duration) / totalRequests;
    }
  }

  private updateLastUpdated(): void {
    this.metrics.lastUpdated = new Date().toISOString();
    this.saveMetrics();
  }

  private calculateHourlyStats(now: Date): Array<{
    hour: string;
    requests: number;
    successRate: number;
    averageResponseTime: number;
    dataTransferred: number;
  }> {
    const hourlyStats: Array<{
      hour: string;
      requests: number;
      successRate: number;
      averageResponseTime: number;
      dataTransferred: number;
    }> = [];

    // Get last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStr = hour.toISOString().substring(0, 13); // YYYY-MM-DDTHH
      
      const hourEvents = this.events.filter(event => 
        event.timestamp.startsWith(hourStr)
      );

      const requests = hourEvents.filter(e => e.type === 'request').length;
      const responses = hourEvents.filter(e => e.type === 'response');
      const successful = responses.filter(e => e.status && e.status < 400).length;
      const successRate = requests > 0 ? (successful / requests) * 100 : 0;
      const avgResponseTime = responses.length > 0 
        ? responses.reduce((sum, e) => sum + (e.duration || 0), 0) / responses.length 
        : 0;
      const dataTransferred = responses.reduce((sum, e) => sum + (e.dataSize || 0), 0);

      hourlyStats.push({
        hour: hourStr,
        requests,
        successRate,
        averageResponseTime: avgResponseTime,
        dataTransferred,
      });
    }

    return hourlyStats;
  }

  private calculateDailyStats(now: Date): Array<{
    date: string;
    requests: number;
    successRate: number;
    cacheHitRate: number;
    totalDataTransferred: number;
  }> {
    const dailyStats: Array<{
      date: string;
      requests: number;
      successRate: number;
      cacheHitRate: number;
      totalDataTransferred: number;
    }> = [];

    // Get last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().substring(0, 10); // YYYY-MM-DD
      
      const dayEvents = this.events.filter(event => 
        event.timestamp.startsWith(dateStr)
      );

      const requests = dayEvents.filter(e => e.type === 'request').length;
      const responses = dayEvents.filter(e => e.type === 'response');
      const successful = responses.filter(e => e.status && e.status < 400).length;
      const successRate = requests > 0 ? (successful / requests) * 100 : 0;
      
      const cacheHits = dayEvents.filter(e => e.type === 'cache_hit').length;
      const cacheMisses = dayEvents.filter(e => e.type === 'cache_miss').length;
      const cacheHitRate = (cacheHits + cacheMisses) > 0 
        ? (cacheHits / (cacheHits + cacheMisses)) * 100 
        : 0;
      
      const totalDataTransferred = responses.reduce((sum, e) => sum + (e.dataSize || 0), 0);

      dailyStats.push({
        date: dateStr,
        requests,
        successRate,
        cacheHitRate,
        totalDataTransferred,
      });
    }

    return dailyStats;
  }

  private calculateReleaseStats(): Array<{
    releaseId: number;
    requestCount: number;
    lastAccessed: string;
    averageResponseTime: number;
  }> {
    const releaseMap = new Map<number, {
      requestCount: number;
      lastAccessed: string;
      totalResponseTime: number;
      responseCount: number;
    }>();

    this.events.forEach(event => {
      if (event.releaseId) {
        const existing = releaseMap.get(event.releaseId) || {
          requestCount: 0,
          lastAccessed: event.timestamp,
          totalResponseTime: 0,
          responseCount: 0,
        };

        if (event.type === 'request') {
          existing.requestCount++;
        } else if (event.type === 'response' && event.duration) {
          existing.totalResponseTime += event.duration;
          existing.responseCount++;
        }

        if (event.timestamp > existing.lastAccessed) {
          existing.lastAccessed = event.timestamp;
        }

        releaseMap.set(event.releaseId, existing);
      }
    });

    return Array.from(releaseMap.entries())
      .map(([releaseId, stats]) => ({
        releaseId,
        requestCount: stats.requestCount,
        lastAccessed: stats.lastAccessed,
        averageResponseTime: stats.responseCount > 0 
          ? stats.totalResponseTime / stats.responseCount 
          : 0,
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 50); // Top 50 most accessed releases
  }

  private loadMetrics(): SyncMetrics {
    try {
      if (fs.existsSync(MONITORING_FILE)) {
        const data = fs.readFileSync(MONITORING_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading monitoring metrics:', error);
    }

    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalDataTransferred: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  private saveMetrics(): void {
    try {
      const dataDir = path.dirname(MONITORING_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(MONITORING_FILE, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      console.error('Error saving monitoring metrics:', error);
    }
  }
}

// Singleton instance
let monitoringService: MonitoringService | null = null;

export function getMonitoringService(): MonitoringService {
  if (!monitoringService) {
    monitoringService = new MonitoringService();
  }
  return monitoringService;
}

// Convenience functions
export function recordSyncRequest(releaseId: number): string {
  return getMonitoringService().recordRequest(releaseId, Date.now());
}

export function recordSyncResponse(
  eventId: string,
  success: boolean,
  duration: number,
  dataSize: number = 0,
  status?: number,
  reason?: string
): void {
  getMonitoringService().recordResponse(eventId, success, duration, dataSize, status, reason);
}

export function recordCacheHit(releaseId: number): void {
  getMonitoringService().recordCacheHit(releaseId);
}

export function recordCacheMiss(releaseId: number): void {
  getMonitoringService().recordCacheMiss(releaseId);
}

export function recordSyncError(releaseId: number, reason: string): void {
  getMonitoringService().recordError(releaseId, reason);
}

export function getSyncMetrics(): SyncMetrics {
  return getMonitoringService().getMetrics();
}

export function getPerformanceMetrics(): PerformanceMetrics {
  return getMonitoringService().getPerformanceMetrics();
}

export function getCacheHitRate(): number {
  return getMonitoringService().getCacheHitRate();
}

export function getSuccessRate(): number {
  return getMonitoringService().getSuccessRate();
}

export function getDataTransferEfficiency(): number {
  return getMonitoringService().getDataTransferEfficiency();
}
