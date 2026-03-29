// Comprehensive caching job logging system for Discogs API compliance
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const CACHE_JOB_LOG_FILE = path.join(LOG_DIR, 'cache-jobs.json');

export interface CacheJobLogEntry {
  id: string;
  timestamp: string;
  type: 'sync_cycle' | 'price_refresh' | 'metadata_refresh' | 'manual_refresh' | 'health_check';
  status: 'started' | 'completed' | 'failed' | 'partial';
  duration?: number; // milliseconds
  releasesProcessed?: number;
  releasesSuccessful?: number;
  releasesFailed?: number;
  releasesChanged?: number;
  releasesUnchanged?: number;
  dataTransferred?: number; // bytes
  errors?: string[];
  complianceStatus?: 'compliant' | 'non_compliant' | 'unknown';
  nextScheduledRun?: string;
  details?: {
    config?: any;
    recommendations?: string[];
    cacheHealth?: any;
  };
}

export interface CacheJobSummary {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  partialJobs: number;
  totalReleasesProcessed: number;
  totalDataTransferred: number;
  averageJobDuration: number;
  complianceRate: number;
  lastJobTimestamp: string;
  nextScheduledRun: string;
}

class CacheJobLogger {
  private ensureLogDirectory(): void {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  private loadLogs(): CacheJobLogEntry[] {
    try {
      if (!fs.existsSync(CACHE_JOB_LOG_FILE)) {
        return [];
      }
      const data = fs.readFileSync(CACHE_JOB_LOG_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading cache job logs:', error);
      return [];
    }
  }

  private saveLogs(logs: CacheJobLogEntry[]): void {
    try {
      this.ensureLogDirectory();
      fs.writeFileSync(CACHE_JOB_LOG_FILE, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('Error saving cache job logs:', error);
    }
  }

  // Log the start of a cache job
  logJobStart(
    type: CacheJobLogEntry['type'],
    details?: Partial<CacheJobLogEntry['details']>
  ): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const entry: CacheJobLogEntry = {
      id: jobId,
      timestamp: new Date().toISOString(),
      type,
      status: 'started',
      details
    };

    const logs = this.loadLogs();
    logs.push(entry);
    this.saveLogs(logs);

    console.log(`[CACHE JOB] Started ${type} job ${jobId}`);
    return jobId;
  }

  // Log the completion of a cache job
  logJobCompletion(
    jobId: string,
    status: 'completed' | 'failed' | 'partial',
    results: {
      duration: number;
      releasesProcessed?: number;
      releasesSuccessful?: number;
      releasesFailed?: number;
      releasesChanged?: number;
      releasesUnchanged?: number;
      dataTransferred?: number;
      errors?: string[];
      complianceStatus?: 'compliant' | 'non_compliant' | 'unknown';
      nextScheduledRun?: string;
    },
    details?: Partial<CacheJobLogEntry['details']>
  ): void {
    const logs = this.loadLogs();
    const entryIndex = logs.findIndex(log => log.id === jobId);
    
    if (entryIndex === -1) {
      console.error(`[CACHE JOB] Job ${jobId} not found for completion logging`);
      return;
    }

    const entry = logs[entryIndex];
    entry.status = status;
    entry.duration = results.duration;
    entry.releasesProcessed = results.releasesProcessed;
    entry.releasesSuccessful = results.releasesSuccessful;
    entry.releasesFailed = results.releasesFailed;
    entry.releasesChanged = results.releasesChanged;
    entry.releasesUnchanged = results.releasesUnchanged;
    entry.dataTransferred = results.dataTransferred;
    entry.errors = results.errors;
    entry.complianceStatus = results.complianceStatus;
    entry.nextScheduledRun = results.nextScheduledRun;
    
    if (details) {
      entry.details = { ...entry.details, ...details };
    }

    logs[entryIndex] = entry;
    this.saveLogs(logs);

    const statusEmoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⚠️';
    console.log(`[CACHE JOB] ${statusEmoji} Completed ${entry.type} job ${jobId} in ${results.duration}ms`);
    
    if (results.releasesProcessed) {
      console.log(`[CACHE JOB] 📊 Processed: ${results.releasesProcessed}, Success: ${results.releasesSuccessful}, Failed: ${results.releasesFailed}`);
      console.log(`[CACHE JOB] 🔄 Changed: ${results.releasesChanged}, Unchanged: ${results.releasesUnchanged}`);
    }
    
    if (results.complianceStatus) {
      const complianceEmoji = results.complianceStatus === 'compliant' ? '✅' : '⚠️';
      console.log(`[CACHE JOB] ${complianceEmoji} Compliance Status: ${results.complianceStatus}`);
    }
  }

  // Get job summary statistics
  getJobSummary(hours: number = 24): CacheJobSummary {
    const logs = this.loadLogs();
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const recentJobs = logs.filter(log => 
      new Date(log.timestamp) >= cutoffTime && log.status !== 'started'
    );

    const totalJobs = recentJobs.length;
    const successfulJobs = recentJobs.filter(job => job.status === 'completed').length;
    const failedJobs = recentJobs.filter(job => job.status === 'failed').length;
    const partialJobs = recentJobs.filter(job => job.status === 'partial').length;

    const totalReleasesProcessed = recentJobs.reduce((sum, job) => sum + (job.releasesProcessed || 0), 0);
    const totalDataTransferred = recentJobs.reduce((sum, job) => sum + (job.dataTransferred || 0), 0);
    const averageJobDuration = totalJobs > 0 
      ? recentJobs.reduce((sum, job) => sum + (job.duration || 0), 0) / totalJobs 
      : 0;

    const compliantJobs = recentJobs.filter(job => job.complianceStatus === 'compliant').length;
    const complianceRate = totalJobs > 0 ? (compliantJobs / totalJobs) * 100 : 0;

    const lastJob = recentJobs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];

    const nextScheduledRun = lastJob?.nextScheduledRun || 'Unknown';

    return {
      totalJobs,
      successfulJobs,
      failedJobs,
      partialJobs,
      totalReleasesProcessed,
      totalDataTransferred,
      averageJobDuration,
      complianceRate,
      lastJobTimestamp: lastJob?.timestamp || 'No recent jobs',
      nextScheduledRun
    };
  }

  // Get recent job logs
  getRecentJobs(count: number = 10): CacheJobLogEntry[] {
    const logs = this.loadLogs();
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);
  }

  // Check compliance status
  checkComplianceStatus(): {
    isCompliant: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const summary = this.getJobSummary(24);
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if jobs are running frequently enough (every 6 hours)
    if (summary.totalJobs < 4) { // Should have at least 4 jobs in 24 hours
      issues.push('Insufficient sync frequency - jobs should run every 6 hours');
      recommendations.push('Ensure background sync is running every 6 hours');
    }

    // Check success rate
    if (summary.totalJobs > 0 && (summary.successfulJobs / summary.totalJobs) < 0.9) {
      issues.push('Low success rate - less than 90% of jobs completing successfully');
      recommendations.push('Investigate and fix job failures');
    }

    // Check compliance rate
    if (summary.complianceRate < 100) {
      issues.push('Non-compliant jobs detected');
      recommendations.push('Review job logs for compliance violations');
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      recommendations
    };
  }

  // Clean up old logs (keep last 30 days)
  cleanupOldLogs(): void {
    const logs = this.loadLogs();
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentLogs = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
    
    if (recentLogs.length !== logs.length) {
      this.saveLogs(recentLogs);
      console.log(`[CACHE JOB] Cleaned up ${logs.length - recentLogs.length} old log entries`);
    }
  }
}

// Singleton instance
let cacheJobLogger: CacheJobLogger | null = null;

export function getCacheJobLogger(): CacheJobLogger {
  if (!cacheJobLogger) {
    cacheJobLogger = new CacheJobLogger();
  }
  return cacheJobLogger;
}

// Convenience functions
export function logCacheJobStart(
  type: CacheJobLogEntry['type'],
  details?: Partial<CacheJobLogEntry['details']>
): string {
  return getCacheJobLogger().logJobStart(type, details);
}

export function logCacheJobCompletion(
  jobId: string,
  status: 'completed' | 'failed' | 'partial',
  results: Parameters<CacheJobLogger['logJobCompletion']>[2],
  details?: Partial<CacheJobLogEntry['details']>
): void {
  getCacheJobLogger().logJobCompletion(jobId, status, results, details);
}

export function getCacheJobSummary(hours: number = 24): CacheJobSummary {
  return getCacheJobLogger().getJobSummary(hours);
}

export function getRecentCacheJobs(count: number = 10): CacheJobLogEntry[] {
  return getCacheJobLogger().getRecentJobs(count);
}

export function checkCacheCompliance(): ReturnType<CacheJobLogger['checkComplianceStatus']> {
  return getCacheJobLogger().checkComplianceStatus();
}
