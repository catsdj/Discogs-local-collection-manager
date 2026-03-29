// Performance monitoring and timing utilities
// Tracks slow operations and provides metrics

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: string;
  success: boolean;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private readonly MAX_METRICS = 1000; // Keep last 1000 metrics
  private readonly SLOW_OPERATION_THRESHOLD_MS = 100; // Log operations slower than 100ms

  /**
   * Execute a function with performance tracking
   * @param name - Name of the operation
   * @param fn - Function to execute
   * @param metadata - Optional metadata to include
   */
  async withTiming<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = performance.now();
    let success = true;
    let error: Error | undefined;

    try {
      return await fn();
    } catch (e) {
      success = false;
      error = e as Error;
      throw e;
    } finally {
      const duration = performance.now() - start;
      
      this.recordMetric({
        operation: name,
        duration,
        timestamp: new Date().toISOString(),
        success,
        metadata: {
          ...metadata,
          error: error?.message
        }
      });

      // Log slow operations
      if (duration > this.SLOW_OPERATION_THRESHOLD_MS) {
        console.warn(
          `[PERF] Slow operation: ${name} took ${duration.toFixed(2)}ms`,
          metadata ? JSON.stringify(metadata) : ''
        );
      }
    }
  }

  /**
   * Execute a synchronous function with performance tracking
   * @param name - Name of the operation
   * @param fn - Function to execute
   * @param metadata - Optional metadata to include
   */
  withTimingSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    const start = performance.now();
    let success = true;
    let error: Error | undefined;

    try {
      return fn();
    } catch (e) {
      success = false;
      error = e as Error;
      throw e;
    } finally {
      const duration = performance.now() - start;
      
      this.recordMetric({
        operation: name,
        duration,
        timestamp: new Date().toISOString(),
        success,
        metadata: {
          ...metadata,
          error: error?.message
        }
      });

      // Log slow operations
      if (duration > this.SLOW_OPERATION_THRESHOLD_MS) {
        console.warn(
          `[PERF] Slow operation: ${name} took ${duration.toFixed(2)}ms`,
          metadata ? JSON.stringify(metadata) : ''
        );
      }
    }
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    // Trim to max size
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }
  }

  /**
   * Get statistics for a specific operation
   */
  getStats(operationName?: string): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p95Duration: number;
    p99Duration: number;
    successRate: number;
  } {
    const relevantMetrics = operationName
      ? this.metrics.filter(m => m.operation === operationName)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
        successRate: 0
      };
    }

    const durations = relevantMetrics.map(m => m.duration).sort((a, b) => a - b);
    const successCount = relevantMetrics.filter(m => m.success).length;

    return {
      count: relevantMetrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p95Duration: durations[Math.floor(durations.length * 0.95)],
      p99Duration: durations[Math.floor(durations.length * 0.99)],
      successRate: (successCount / relevantMetrics.length) * 100
    };
  }

  /**
   * Get all unique operation names
   */
  getOperationNames(): string[] {
    return [...new Set(this.metrics.map(m => m.operation))];
  }

  /**
   * Get slow operations (above threshold)
   */
  getSlowOperations(): PerformanceMetric[] {
    return this.metrics.filter(m => m.duration > this.SLOW_OPERATION_THRESHOLD_MS);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get summary of all operations
   */
  getSummary(): Record<string, ReturnType<typeof this.getStats>> {
    const operations = this.getOperationNames();
    const summary: Record<string, ReturnType<typeof this.getStats>> = {};

    for (const operation of operations) {
      summary[operation] = this.getStats(operation);
    }

    return summary;
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Convenience function for timing async operations
 */
export async function withTiming<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return performanceMonitor.withTiming(name, fn, metadata);
}

/**
 * Convenience function for timing sync operations
 */
export function withTimingSync<T>(
  name: string,
  fn: () => T,
  metadata?: Record<string, any>
): T {
  return performanceMonitor.withTimingSync(name, fn, metadata);
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(operationName?: string) {
  return performanceMonitor.getStats(operationName);
}

/**
 * Get performance summary
 */
export function getPerformanceSummary() {
  return performanceMonitor.getSummary();
}

