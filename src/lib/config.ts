import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  DISCOGS_API_TOKEN: z.string().min(1, 'Discogs API token is required'),
  DISCOGS_USERNAME: z.string().min(1, 'Discogs username is required'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),
});

// Validate environment variables with helpful error messages
const validateEnv = () => {
  // Only validate on server-side
  if (typeof window !== 'undefined') {
    // On client-side, return a minimal config
    return {
      DISCOGS_API_TOKEN: '',
      DISCOGS_USERNAME: '',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    };
  }

  try {
    return envSchema.parse(process.env);
  } catch {
    // Sanitized error logging - don't expose which specific vars are missing
    console.error('❌ Environment configuration error: Missing or invalid credentials');
    
    // Check if we're missing the environment variables
    if (!process.env.DISCOGS_API_TOKEN || !process.env.DISCOGS_USERNAME) {
      // Log minimal setup info without exposing config details
      console.error('🔧 SETUP REQUIRED: Discogs API credentials missing. See env.example for configuration template.');
    }
    
    // Generic error message
    throw new Error('Environment validation failed - check server logs and verify .env.local configuration');
  }
};

// Export validated config
const env = validateEnv();

/**
 * Server-only configuration
 * WARNING: Only import this in server-side code (API routes, server components)
 * DO NOT use in client components or expose to browser
 */
export const config = {
  ...env,
  // Add convenience aliases with camelCase
  discogsToken: env.DISCOGS_API_TOKEN,
  discogsUsername: env.DISCOGS_USERNAME,
  // User-Agent format: AppName/Version +URL or Email
  userAgent: `DiscogsCollectionManager/1.0 +https://discogs.com/user/${env.DISCOGS_USERNAME}`,
};

/**
 * Server-only helper to access Discogs credentials
 * Use this instead of accessing config directly for better security
 */
export function getDiscogsCredentials() {
  if (typeof window !== 'undefined') {
    throw new Error('Discogs credentials cannot be accessed on client-side');
  }
  return {
    token: config.discogsToken,
    username: config.discogsUsername,
    userAgent: config.userAgent,
  };
}

// Input validation schemas
export const ReleaseIdSchema = z.number()
  .int('Release ID must be an integer')
  .min(1, 'Release ID must be positive')
  .max(999999999, 'Release ID too large');

export const UsernameSchema = z.string()
  .min(1, 'Username is required')
  .max(50, 'Username too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username contains invalid characters');

export const PageSchema = z.number()
  .int('Page must be an integer')
  .min(1, 'Page must be positive')
  .max(100, 'Page number too large');

export const PerPageSchema = z.number()
  .int('Per page must be an integer')
  .min(1, 'Per page must be positive')
  .max(100, 'Per page too large');

// Validation helper functions
export const validateReleaseId = (id: unknown): number => {
  return ReleaseIdSchema.parse(id);
};

export const validateUsername = (username: unknown): string => {
  return UsernameSchema.parse(username);
};

export const validatePage = (page: unknown): number => {
  return PageSchema.parse(page);
};

export const validatePerPage = (perPage: unknown): number => {
  return PerPageSchema.parse(perPage);
};

// URL validation
export const isValidUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    // Only allow HTTPS URLs for external links
    return parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};

// YouTube URL validation
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

// Discogs URL validation
export const isValidDiscogsUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'www.discogs.com' || parsedUrl.hostname === 'discogs.com';
  } catch {
    return false;
  }
};
