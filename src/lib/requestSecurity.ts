import { NextRequest, NextResponse } from 'next/server';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isLoopbackHost(host: string | null): boolean {
  return Boolean(host && LOOPBACK_HOSTS.has(host));
}

function normalizeHost(host: string | null): string | null {
  if (!host) {
    return null;
  }

  return host.replace(/:\d+$/, '').trim().toLowerCase();
}

function extractHostname(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return normalizeHost(value);
  }
}

function isLoopbackIp(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const ip = value.split(',')[0]?.trim().toLowerCase();
  return Boolean(ip && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'));
}

export function isLocalRequest(request: NextRequest): boolean {
  const requestHost = normalizeHost(request.headers.get('host')) ?? request.nextUrl.hostname;
  if (!isLoopbackHost(requestHost)) {
    return false;
  }

  const forwardedHost = normalizeHost(request.headers.get('x-forwarded-host'));
  const originHost = extractHostname(request.headers.get('origin'));
  const refererHost = extractHostname(request.headers.get('referer'));

  if ([forwardedHost, originHost, refererHost].some((host) => host && !isLoopbackHost(host))) {
    return false;
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');

  if (forwardedFor && !isLoopbackIp(forwardedFor)) {
    return false;
  }

  if (realIp && !isLoopbackIp(realIp)) {
    return false;
  }

  return true;
}

export function rejectIfNotLocal(request: NextRequest): NextResponse | null {
  if (isLocalRequest(request)) {
    return null;
  }

  return NextResponse.json(
    {
      error: 'Forbidden',
      message: 'This app only accepts local requests.',
    },
    { status: 403 }
  );
}
