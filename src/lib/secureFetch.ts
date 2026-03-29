/**
 * Secure fetch wrapper with timeouts, retry logic, and domain validation
 * Use this instead of raw fetch() for all external API calls
 */

const FETCH_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Allowed domains for external requests
const ALLOWED_DOMAINS = [
  'api.discogs.com',
  'www.discogs.com',
  'discogs.com',
  'i.ytimg.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be'
];

export interface SecureFetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  validateDomain?: boolean;
}

/**
 * Validate URL is from an allowed domain
 */
function validateDomain(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    
    // Only allow HTTPS
    if (parsedUrl.protocol !== 'https:') {
      console.warn(`[SecureFetch] Rejected non-HTTPS URL: ${parsedUrl.protocol}`);
      return false;
    }
    
    // Check if domain is allowed
    const isAllowed = ALLOWED_DOMAINS.some(domain => 
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
    );
    
    if (!isAllowed) {
      console.warn(`[SecureFetch] Rejected URL from unauthorized domain: ${parsedUrl.hostname}`);
    }
    
    return isAllowed;
  } catch (error) {
    console.error('[SecureFetch] Invalid URL:', error);
    return false;
  }
}

/**
 * Secure fetch with timeout and abort controller
 */
export async function secureFetch(
  url: string,
  options: SecureFetchOptions = {}
): Promise<Response> {
  const {
    timeout = FETCH_TIMEOUT_MS,
    retries = MAX_RETRIES,
    retryDelay = RETRY_DELAY_MS,
    validateDomain: shouldValidateDomain = true,
    ...fetchOptions
  } = options;

  // Validate domain if enabled
  if (shouldValidateDomain && !validateDomain(url)) {
    throw new Error('URL domain not allowed');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Don't retry on successful responses or 4xx client errors
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // 5xx server errors - retry
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      
      if (attempt < retries) {
        console.log(`[SecureFetch] Retry ${attempt + 1}/${retries} after ${response.status} for ${url}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }

    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        lastError = new Error(`Request timeout after ${timeout}ms`);
      } else {
        lastError = error;
      }

      // Don't retry on abort/timeout in final attempt
      if (attempt < retries) {
        console.log(`[SecureFetch] Retry ${attempt + 1}/${retries} after error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('Request failed after retries');
}

/**
 * Fetch with rate limiting awareness
 * For use with Discogs API that has strict rate limits
 */
export async function rateLimitedFetch(
  url: string,
  options: SecureFetchOptions = {},
  onRateLimit?: (retryAfter: number) => void
): Promise<Response> {
  const response = await secureFetch(url, options);

  // Handle 429 rate limit
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
    
    if (onRateLimit) {
      onRateLimit(waitTime);
    }
    
    console.log(`[SecureFetch] Rate limited, waiting ${waitTime}ms before retry`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Retry after waiting
    return secureFetch(url, options);
  }

  return response;
}

/**
 * Sanitize error messages before logging to prevent information disclosure
 */
export function sanitizeErrorForLogging(error: any): string {
  if (!error) return 'Unknown error';
  
  // Don't log full error objects that might contain tokens/credentials
  if (typeof error === 'object') {
    // Safe properties to log
    const safeMessage = error.message || error.name || 'Error occurred';
    const safeStatus = error.status || error.statusCode;
    
    if (safeStatus) {
      return `${safeMessage} (status: ${safeStatus})`;
    }
    
    return safeMessage;
  }
  
  return String(error).substring(0, 200); // Limit length
}

