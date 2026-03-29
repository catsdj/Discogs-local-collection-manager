// Client-side security utilities for input sanitization and validation

// Sanitize text input to prevent XSS
export const sanitizeTextInput = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
};

// Sanitize HTML content
export const sanitizeHtmlContent = (html: string): string => {
  if (typeof html !== 'string') {
    return '';
  }
  
  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove other potentially dangerous tags
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|textarea|select|button)\b[^>]*>/gi, '');
  
  // Remove dangerous attributes
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*javascript\s*:/gi, '');
  sanitized = sanitized.replace(/\s*vbscript\s*:/gi, '');
  
  return sanitized;
};

// Validate email format
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate URL format
export const isValidUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};

// Validate YouTube URL
export const isValidYouTubeUrl = (url: string): boolean => {
  const youtubeDomains = [
    'www.youtube.com',
    'youtube.com',
    'youtu.be',
    'm.youtube.com'
  ];
  
  try {
    const parsedUrl = new URL(url);
    return youtubeDomains.includes(parsedUrl.hostname);
  } catch {
    return false;
  }
};

// Validate Discogs URL
export const isValidDiscogsUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'www.discogs.com' || parsedUrl.hostname === 'discogs.com';
  } catch {
    return false;
  }
};


// Sanitize and validate search input
export const sanitizeSearchInput = (input: string): string => {
  const sanitized = sanitizeTextInput(input);
  
  // Limit length
  if (sanitized.length > 100) {
    return sanitized.substring(0, 100);
  }
  
  return sanitized;
};

// Sanitize numeric input
export const sanitizeNumericInput = (input: string | number): number | null => {
  const num = typeof input === 'string' ? parseFloat(input) : input;
  
  if (isNaN(num) || !isFinite(num)) {
    return null;
  }
  
  // Prevent extremely large numbers
  if (Math.abs(num) > Number.MAX_SAFE_INTEGER) {
    return null;
  }
  
  return num;
};

// Sanitize integer input
export const sanitizeIntegerInput = (input: string | number): number | null => {
  const num = sanitizeNumericInput(input);
  
  if (num === null) {
    return null;
  }
  
  return Number.isInteger(num) ? num : Math.floor(num);
};

// Validate and sanitize release ID
export const validateReleaseId = (id: string | number): number | null => {
  const num = sanitizeIntegerInput(id);
  
  if (num === null || num <= 0 || num > 999999999) {
    return null;
  }
  
  return num;
};

// Sanitize form data
export const sanitizeFormData = (data: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeTextInput(value);
    } else if (typeof value === 'number') {
      sanitized[key] = sanitizeNumericInput(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? sanitizeTextInput(item) : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

// Escape HTML entities
export const escapeHtml = (text: string): string => {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  };
  
  return text.replace(/[&<>"'/]/g, (char) => htmlEscapes[char]);
};

// Validate file upload (basic validation)
export const validateFileUpload = (file: File): { valid: boolean; error?: string } => {
  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }
  
  // Check file type (basic check)
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type' };
  }
  
  return { valid: true };
};

// Rate limiting for client-side operations
class ClientRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }

  getRemainingRequests(key: string): number {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    return Math.max(0, this.maxRequests - validRequests.length);
  }
}

// Global client rate limiter
export const clientRateLimiter = new ClientRateLimiter();

// Security event logging for client-side
export const logSecurityEvent = (event: string, details?: any): void => {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[SECURITY] ${event}`, details);
  }
  
  // In production, you might want to send this to a monitoring service
  // This is a placeholder for client-side security monitoring
};

// Input validation decorator
export const withValidation = <T extends (...args: any[]) => any>(
  validator: (args: Parameters<T>) => boolean,
  errorMessage: string = 'Invalid input'
) => {
  return (fn: T): T => {
    return ((...args: Parameters<T>) => {
      if (!validator(args)) {
        logSecurityEvent('Validation failed', { args, errorMessage });
        throw new Error(errorMessage);
      }
      return fn(...args);
    }) as T;
  };
};
