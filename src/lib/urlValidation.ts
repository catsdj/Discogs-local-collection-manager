const YOUTUBE_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

const DISCOGS_HOSTS = new Set([
  'www.discogs.com',
  'discogs.com',
]);

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_PLAYLIST_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isHttpOrHttpsUrl(url: string): boolean {
  const parsedUrl = parseUrl(url);
  return parsedUrl?.protocol === 'http:' || parsedUrl?.protocol === 'https:';
}

export function isSafeHttpsUrl(url: string): boolean {
  return parseUrl(url)?.protocol === 'https:';
}

export function isValidYouTubeUrl(url: string): boolean {
  const parsedUrl = parseUrl(url);
  return Boolean(
    parsedUrl &&
    isHttpOrHttpsUrl(url) &&
    YOUTUBE_HOSTS.has(parsedUrl.hostname.toLowerCase()),
  );
}

export function isValidDiscogsUrl(url: string): boolean {
  const parsedUrl = parseUrl(url);
  return Boolean(
    parsedUrl &&
    isHttpOrHttpsUrl(url) &&
    DISCOGS_HOSTS.has(parsedUrl.hostname.toLowerCase()),
  );
}

export function extractYouTubeVideoId(url: string): string | null {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl || !isValidYouTubeUrl(url)) {
    return null;
  }

  let videoId: string | null = null;
  const hostname = parsedUrl.hostname.toLowerCase();

  if (hostname === 'youtu.be') {
    videoId = parsedUrl.pathname.split('/').filter(Boolean)[0] || null;
  } else if (parsedUrl.pathname.startsWith('/embed/')) {
    videoId = parsedUrl.pathname.split('/').filter(Boolean)[1] || null;
  } else if (parsedUrl.pathname.startsWith('/shorts/')) {
    videoId = parsedUrl.pathname.split('/').filter(Boolean)[1] || null;
  } else {
    videoId = parsedUrl.searchParams.get('v');
  }

  return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}

export function extractYouTubePlaylistId(url: string): string | null {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl || !isValidYouTubeUrl(url)) {
    return null;
  }

  const playlistId = parsedUrl.searchParams.get('list');
  return playlistId && YOUTUBE_PLAYLIST_ID_PATTERN.test(playlistId) ? playlistId : null;
}
