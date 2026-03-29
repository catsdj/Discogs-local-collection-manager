import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Create a DOMPurify instance for server-side use
const createDOMPurify = () => {
  const window = new JSDOM('').window;
  return DOMPurify(window as any);
};

// HTML sanitization
export const sanitizeHtml = (html: string): string => {
  const purify = createDOMPurify();
  
  return purify.sanitize(html, {
    ALLOWED_TAGS: [], // Remove all HTML tags
    ALLOWED_ATTR: [], // Remove all attributes
    KEEP_CONTENT: true, // Keep text content
  });
};

// Sanitize text content
export const sanitizeText = (text: string): string => {
  return text
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .trim();
};

// Sanitize URL
export const sanitizeUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow HTTPS URLs
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed');
    }
    
    // Remove potentially dangerous parameters
    const allowedParams = ['v', 'list', 't']; // YouTube specific
    const newUrl = new URL(parsedUrl.href);
    
    // Remove all query parameters except allowed ones
    newUrl.search = '';
    for (const [key, value] of parsedUrl.searchParams) {
      if (allowedParams.includes(key)) {
        newUrl.searchParams.set(key, value);
      }
    }
    
    return newUrl.toString();
  } catch {
    return '';
  }
};

// Extract YouTube video ID safely
export const extractYouTubeVideoId = (url: string): string | null => {
  try {
    const sanitizedUrl = sanitizeUrl(url);
    if (!sanitizedUrl) return null;
    
    const parsedUrl = new URL(sanitizedUrl);
    
    // Extract video ID from different YouTube URL formats
    if (parsedUrl.hostname.includes('youtube.com')) {
      const videoId = parsedUrl.searchParams.get('v');
      return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
    } else if (parsedUrl.hostname.includes('youtu.be')) {
      const videoId = parsedUrl.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
    }
    
    return null;
  } catch {
    return null;
  }
};

// Extract YouTube playlist ID safely
export const extractYouTubePlaylistId = (url: string): string | null => {
  try {
    const sanitizedUrl = sanitizeUrl(url);
    if (!sanitizedUrl) return null;
    
    const parsedUrl = new URL(sanitizedUrl);
    const playlistId = parsedUrl.searchParams.get('list');
    
    return playlistId && /^[a-zA-Z0-9_-]+$/.test(playlistId) ? playlistId : null;
  } catch {
    return null;
  }
};

// Rate limiting helper
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 60, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }

  getRemainingRequests(identifier: string): number {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    return Math.max(0, this.maxRequests - validRequests.length);
  }
}

// Error handling without information disclosure
export const createSecureError = (message: string, status: number = 500) => {
  // Log the actual error for debugging (server-side only)
  console.error(`[${status}] ${message}`);
  
  // Return sanitized error for client
  const sanitizedMessage = sanitizeText(message);
  
  return {
    error: status >= 500 ? 'Internal server error' : sanitizedMessage,
    status,
    timestamp: new Date().toISOString(),
  };
};

// Validate and sanitize user input
export const validateAndSanitizeInput = (input: unknown, schema: any): any => {
  try {
    const validated = schema.parse(input);
    return validated;
  } catch {
    throw new Error('Invalid input provided');
  }
};
