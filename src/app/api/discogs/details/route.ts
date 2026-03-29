import { NextRequest, NextResponse } from 'next/server';
import { validateReleaseId } from '@/lib/config';
import { createSecureError } from '@/lib/security';
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimiter';
import { logApiRequest, logValidationError } from '@/lib/logger';
import { getDatabase } from '@/lib/database';
import { rejectIfNotLocal } from '@/lib/requestSecurity';

// No longer needed since we're using database instead of external API calls

// Function to fetch detailed release data from database
async function getDetailedReleaseData(releaseId: number): Promise<{
  videos?: Array<{ uri: string; title: string; description: string; duration: number; embed: boolean }>;
  tracklist?: Array<{ position: string; title: string; duration: string; type_: string }>;
  priceInfo?: {
    lowest_price: number | null;
    currency: string;
  };
  media_condition?: string | null;
  sleeve_condition?: string | null;
} | null> {
  try {
    const db = getDatabase();
    
    // Get release from database
    const release = await db.getReleaseByDiscogsId(releaseId);
    if (!release) {
      console.log(`Release ${releaseId} not found in database`);
      return null;
    }

    // Get videos from database
    const videos = db.getDb().prepare('SELECT * FROM videos WHERE release_id = ?').all(release.id) as any[];
    
    // Get tracklist from database
    const tracklist = db.getDb().prepare('SELECT * FROM tracks WHERE release_id = ? ORDER BY position').all(release.id) as any[];
    
    // Get price info from database
    const priceData = db.getDb().prepare('SELECT * FROM prices WHERE release_id = ?').get(release.id) as any;

    const result = {
      videos: videos.map((video: any) => ({
        uri: video.uri,
        title: video.title,
        description: video.description || '',
        duration: video.duration || 0,
        embed: Boolean(video.embed)
      })),
      tracklist: tracklist.map((track: any) => ({
        position: track.position,
        title: track.title,
        duration: track.duration || '',
        type_: track.type_ || ''
      })),
      priceInfo: priceData ? {
        lowest_price: priceData.lowest_price,
        currency: priceData.currency
      } : undefined,
      media_condition: release.media_condition || 'Unknown',
      sleeve_condition: release.sleeve_condition || 'Unknown'
    };

    console.log(`Using database data for release ${releaseId}: ${videos.length} videos, ${tracklist.length} tracks`);
    return result;
    
  } catch (error) {
    console.error(`Error fetching detailed data for release ${releaseId}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const localOnlyResponse = rejectIfNotLocal(request);
  
  if (localOnlyResponse) {
    return localOnlyResponse;
  }
  
  try {
    // Apply rate limiting
    const rateLimitResult = rateLimit(request, '/api/discogs/details');
    
    if (!rateLimitResult.allowed) {
      const headers = getRateLimitHeaders(
        rateLimitResult.allowed,
        rateLimitResult.remaining,
        rateLimitResult.resetTime,
        rateLimitResult.limit
      );
      
      logApiRequest('GET', '/api/discogs/details', 429, Date.now() - startTime);
      
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers,
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const releaseIdParam = searchParams.get('release_id');

    // Validate input
    if (!releaseIdParam) {
      logValidationError('release_id', releaseIdParam, 'Missing required parameter');
      const error = createSecureError('Release ID is required', 400);
      return NextResponse.json(error, { status: error.status });
    }

    // Validate and sanitize release ID
    let releaseId: number;
    try {
      releaseId = validateReleaseId(parseInt(releaseIdParam));
    } catch {
      logValidationError('release_id', releaseIdParam, 'Invalid format');
      const error = createSecureError('Invalid release ID format', 400);
      return NextResponse.json(error, { status: error.status });
    }

    const details = await getDetailedReleaseData(releaseId);
    
    if (!details) {
      const error = createSecureError('Release not found', 404);
      return NextResponse.json(error, { status: error.status });
    }

    const response = NextResponse.json({
      releaseId,
      videos: details.videos || [],
      tracklist: details.tracklist || [],
      priceInfo: details.priceInfo || null,
      media_condition: details.media_condition || 'Unknown',
      sleeve_condition: details.sleeve_condition || 'Unknown',
    });

    // Add rate limit headers
    const headers = getRateLimitHeaders(
      rateLimitResult.allowed,
      rateLimitResult.remaining,
      rateLimitResult.resetTime,
      rateLimitResult.limit
    );
    
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Log successful request
    logApiRequest('GET', '/api/discogs/details', 200, Date.now() - startTime);

    return response;

  } catch {
    logApiRequest('GET', '/api/discogs/details', 500, Date.now() - startTime);
    const secureError = createSecureError('Failed to process request', 500);
    return NextResponse.json(secureError, { status: secureError.status });
  }
}
