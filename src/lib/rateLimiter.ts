import { NextRequest } from 'next/server';

// Rate limiting configuration
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

// Rate limit entry
interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

// In-memory store for rate limiting (in production, use Redis)
class RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private readonly MAX_ENTRIES = 10000; // Maximum entries to prevent unbounded growth

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  get(key: string): RateLimitEntry | undefined {
    const entry = this.store.get(key);
    if (entry && Date.now() > entry.resetTime) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, entry: RateLimitEntry): void {
    // If at capacity, evict oldest entries
    if (this.store.size >= this.MAX_ENTRIES && !this.store.has(key)) {
      this.evictOldest();
    }
    
    this.store.set(key, entry);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    // Find the oldest entry (by resetTime)
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < oldestTime) {
        oldestTime = entry.resetTime;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.store.delete(oldestKey);
      console.log(`[Rate Limiter] Evicted oldest entry (store at capacity: ${this.store.size}/${this.MAX_ENTRIES})`);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[Rate Limiter] Cleaned up ${cleanedCount} expired entries (current size: ${this.store.size}/${this.MAX_ENTRIES})`);
    }
  }

  getStats(): { size: number; maxSize: number; utilizationPercent: number } {
    return {
      size: this.store.size,
      maxSize: this.MAX_ENTRIES,
      utilizationPercent: Math.round((this.store.size / this.MAX_ENTRIES) * 100)
    };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Global rate limit store
const rateLimitStore = new RateLimitStore();

// Rate limiting configurations for different endpoints
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/discogs': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute (increased for multiple page loads)
  },
  '/api/discogs/details': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
  },
  '/api/discogs/job': {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 5, // 5 job requests per 5 minutes
  },
};

// Default rate limit for unknown endpoints
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
};

// Get client identifier from request
function getClientIdentifier(request: NextRequest): string {
  // Try to get IP from various headers
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  let ip = forwarded?.split(',')[0] || realIp || cfConnectingIp || 'unknown';
  
  // Clean up IP address
  ip = ip.trim();
  
  // For development, use a default identifier
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
    ip = 'localhost';
  }
  
  return ip;
}

// Rate limiting middleware
export function rateLimit(request: NextRequest, endpoint?: string): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
} {
  const clientId = getClientIdentifier(request);
  const path = endpoint || request.nextUrl.pathname;
  
  // Get rate limit config for this endpoint
  const config = RATE_LIMITS[path] || DEFAULT_RATE_LIMIT;
  const key = `${clientId}:${path}`;
  
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  
  if (!entry) {
    // First request from this client
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
      blocked: false,
    };
    rateLimitStore.set(key, newEntry);
    
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: newEntry.resetTime,
      limit: config.maxRequests,
    };
  }
  
  if (now > entry.resetTime) {
    // Window has expired, reset
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
      blocked: false,
    };
    rateLimitStore.set(key, newEntry);
    
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: newEntry.resetTime,
      limit: config.maxRequests,
    };
  }
  
  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    entry.blocked = true;
    rateLimitStore.set(key, entry);
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      limit: config.maxRequests,
    };
  }
  
  // Increment counter
  entry.count++;
  rateLimitStore.set(key, entry);
  
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
    limit: config.maxRequests,
  };
}

// Rate limit headers for response
export function getRateLimitHeaders(
  allowed: boolean,
  remaining: number,
  resetTime: number,
  limit: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': Math.max(0, remaining).toString(),
    'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
    'X-RateLimit-Reset-After': Math.ceil((resetTime - Date.now()) / 1000).toString(),
  };
}

// Cleanup function for graceful shutdown
export function cleanupRateLimiter(): void {
  rateLimitStore.destroy();
}

// Rate limit decorator for API routes
export function withRateLimit(config?: RateLimitConfig) {
  return function <TArgs extends unknown[]>(handler: (request: NextRequest, ...args: TArgs) => Promise<Response> | Response) {
    return async function (request: NextRequest, ...args: TArgs) {
      const rateLimitResult = rateLimit(request, config ? 'custom' : undefined);
      
      if (!rateLimitResult.allowed) {
        const headers = getRateLimitHeaders(
          rateLimitResult.allowed,
          rateLimitResult.remaining,
          rateLimitResult.resetTime,
          rateLimitResult.limit
        );
        
        return new Response(
          JSON.stringify({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
          }
        );
      }
      
      // Add rate limit headers to successful responses
      const response = await handler(request, ...args);
      
      if (response instanceof Response) {
        const headers = getRateLimitHeaders(
          rateLimitResult.allowed,
          rateLimitResult.remaining,
          rateLimitResult.resetTime,
          rateLimitResult.limit
        );
        
        // Add headers to existing response
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      }
      
      return response;
    };
  };
}
