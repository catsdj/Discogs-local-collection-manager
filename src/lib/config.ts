import { z } from 'zod';
import {
  isSafeHttpsUrl,
  isValidDiscogsUrl as isDiscogsUrl,
  isValidYouTubeUrl as isYouTubeUrl,
} from '@/lib/urlValidation';

// Environment validation schema
const envSchema = z.object({
  DISCOGS_API_TOKEN: z.string().min(1, 'Discogs API token is required'),
  DISCOGS_USERNAME: z.string().min(1, 'Discogs username is required'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),
});

export type DiscogsCredentialKey = 'DISCOGS_API_TOKEN' | 'DISCOGS_USERNAME';

export type DiscogsSetupStatus = {
  configured: boolean;
  missing: DiscogsCredentialKey[];
};

let hasLoggedSetupWarning = false;

export function getDiscogsSetupStatus(): DiscogsSetupStatus {
  if (typeof window !== 'undefined') {
    return { configured: false, missing: ['DISCOGS_API_TOKEN', 'DISCOGS_USERNAME'] };
  }

  const missing: DiscogsCredentialKey[] = [];
  if (!process.env.DISCOGS_API_TOKEN?.trim()) {
    missing.push('DISCOGS_API_TOKEN');
  }
  if (!process.env.DISCOGS_USERNAME?.trim()) {
    missing.push('DISCOGS_USERNAME');
  }

  return {
    configured: missing.length === 0,
    missing,
  };
}

// Validate environment variables without crashing the app at import time
const validateEnv = () => {
  if (typeof window !== 'undefined') {
    return {
      DISCOGS_API_TOKEN: '',
      DISCOGS_USERNAME: '',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    };
  }

  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) {
    return parsed.data;
  }

  if (!hasLoggedSetupWarning) {
    hasLoggedSetupWarning = true;
    const status = getDiscogsSetupStatus();
    console.warn(
      'Discogs API credentials are not configured. Copy env.example to .env.local or run npm run setup.',
    );
    if (status.missing.length > 0) {
      console.warn(`Missing: ${status.missing.join(', ')}`);
    }
  }

  return {
    DISCOGS_API_TOKEN: process.env.DISCOGS_API_TOKEN?.trim() || '',
    DISCOGS_USERNAME: process.env.DISCOGS_USERNAME?.trim() || '',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  };
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
  userAgent: 'DiscogsLocalCollectionManager/1.0 +https://github.com/catsdj/Discogs-local-collection-manager',
};

/**
 * Server-only helper to access Discogs credentials
 * Use this instead of accessing config directly for better security
 */
export function getDiscogsCredentials() {
  if (typeof window !== 'undefined') {
    throw new Error('Discogs credentials cannot be accessed on client-side');
  }

  const status = getDiscogsSetupStatus();
  if (!status.configured) {
    throw new Error('SETUP_REQUIRED');
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
export const isValidUrl = isSafeHttpsUrl;

// YouTube URL validation
export const isValidYouTubeUrl = isYouTubeUrl;

// Discogs URL validation
export const isValidDiscogsUrl = isDiscogsUrl;
