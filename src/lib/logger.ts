// Structured logging for security monitoring and debugging

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export enum LogCategory {
  SECURITY = 'security',
  API = 'api',
  CACHE = 'cache',
  RATE_LIMIT = 'rate_limit',
  VALIDATION = 'validation',
  PERFORMANCE = 'performance',
  USER_ACTION = 'user_action',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: any;
  userId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  duration?: number;
}

class Logger {
  private isDevelopment: boolean;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  private createLogEntry(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: any,
    context?: {
      userId?: string;
      ip?: string;
      userAgent?: string;
      requestId?: string;
      duration?: number;
    }
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      ...context,
    };
  }

  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    
    // Keep buffer size manageable
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment) {
      return true; // Log everything in development
    }
    
    // In production, only log warnings and errors
    return level === LogLevel.WARN || level === LogLevel.ERROR;
  }

  private formatLogEntry(entry: LogEntry): string {
    const { timestamp, level, category, message, data, ...context } = entry;
    
    let logMessage = `[${timestamp}] ${level.toUpperCase()} [${category}] ${message}`;
    
    if (Object.keys(context).length > 0) {
      logMessage += ` | Context: ${JSON.stringify(context)}`;
    }
    
    if (data) {
      logMessage += ` | Data: ${JSON.stringify(data)}`;
    }
    
    return logMessage;
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: any, context?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.createLogEntry(level, category, message, data, context);
    this.addToBuffer(entry);

    const formattedMessage = this.formatLogEntry(entry);

    // Console logging
    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
    }

    // In production, you might want to send logs to an external service
    if (!this.isDevelopment && level === LogLevel.ERROR) {
      this.sendToExternalService(entry);
    }
  }

  private sendToExternalService(entry: LogEntry): void {
    // Placeholder for external logging service (e.g., Sentry, LogRocket, etc.)
    // This would typically send critical errors to a monitoring service
    void entry;
    try {
      // Example: Send to external service
      // await fetch('/api/logs', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(entry)
      // });
    } catch (error) {
      console.error('Failed to send log to external service:', error);
    }
  }

  // Public logging methods
  error(category: LogCategory, message: string, data?: any, context?: any): void {
    this.log(LogLevel.ERROR, category, message, data, context);
  }

  warn(category: LogCategory, message: string, data?: any, context?: any): void {
    this.log(LogLevel.WARN, category, message, data, context);
  }

  info(category: LogCategory, message: string, data?: any, context?: any): void {
    this.log(LogLevel.INFO, category, message, data, context);
  }

  debug(category: LogCategory, message: string, data?: any, context?: any): void {
    this.log(LogLevel.DEBUG, category, message, data, context);
  }

  // Security-specific logging methods
  securityViolation(message: string, data?: any, context?: any): void {
    this.error(LogCategory.SECURITY, `SECURITY VIOLATION: ${message}`, data, context);
  }

  suspiciousActivity(message: string, data?: any, context?: any): void {
    this.warn(LogCategory.SECURITY, `SUSPICIOUS ACTIVITY: ${message}`, data, context);
  }

  rateLimitExceeded(ip: string, endpoint: string, limit: number): void {
    this.warn(LogCategory.RATE_LIMIT, `Rate limit exceeded`, {
      ip,
      endpoint,
      limit,
    }, { ip });
  }

  validationFailed(field: string, value: any, reason: string): void {
    this.warn(LogCategory.VALIDATION, `Validation failed for ${field}`, {
      field,
      value: typeof value === 'string' ? value.substring(0, 100) : value,
      reason,
    });
  }

  apiRequest(method: string, endpoint: string, status: number, duration: number, context?: any): void {
    const level = status >= 400 ? LogLevel.WARN : LogLevel.INFO;
    this.log(level, LogCategory.API, `API Request: ${method} ${endpoint}`, {
      method,
      endpoint,
      status,
      duration,
    }, context);
  }

  cacheOperation(operation: string, key: string, success: boolean, size?: number): void {
    this.debug(LogCategory.CACHE, `Cache ${operation}`, {
      operation,
      key,
      success,
      size,
    });
  }

  // Utility methods
  getLogBuffer(): LogEntry[] {
    return [...this.logBuffer];
  }

  clearLogBuffer(): void {
    this.logBuffer = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logBuffer, null, 2);
  }
}

// Global logger instance
export const logger = new Logger();

// Helper functions for common logging scenarios
export const logSecurityEvent = (event: string, details?: any, context?: any) => {
  logger.securityViolation(event, details, context);
};

export const logApiRequest = (method: string, endpoint: string, status: number, duration: number, context?: any) => {
  logger.apiRequest(method, endpoint, status, duration, context);
};

export const logValidationError = (field: string, value: any, reason: string) => {
  logger.validationFailed(field, value, reason);
};

export const logRateLimit = (ip: string, endpoint: string, limit: number) => {
  logger.rateLimitExceeded(ip, endpoint, limit);
};

export const logCacheOperation = (operation: string, key: string, success: boolean, size?: number) => {
  logger.cacheOperation(operation, key, success, size);
};
