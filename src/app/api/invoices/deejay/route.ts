import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getDatabase } from '@/lib/database';
import { rejectIfNotLocal } from '@/lib/requestSecurity';
import {
  DeejayInvoiceItem,
  generateCatalogVariants,
  normalizeCatalogNumber,
  parseDeejayInvoicePdf,
} from '@/lib/invoiceImport';

export const runtime = 'nodejs';

interface DiscogsSearchResult {
  id: number;
  type: string;
  title?: string;
  year?: string;
  country?: string;
  format?: string[];
  label?: string[];
  catno?: string;
  thumb?: string;
  cover_image?: string;
  uri?: string;
}

interface CandidateMatch {
  id: number;
  title: string;
  year: string | null;
  country: string | null;
  format: string[];
  labels: string[];
  catalogNumber: string | null;
  thumb: string | null;
  discogsUrl: string;
  score: number;
  confidence: 'strong' | 'possible' | 'weak';
  reasons: string[];
  inCollection: boolean;
}

interface AddCollectionRequest {
  releaseIds: number[];
  importId: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MATCHER_VERSION = 'deejay-progressive-2026-04-27-2';
const EXCELLENT_MATCH_SCORE = 90;
const DISCOGS_REQUEST_DELAY_MS = 7000;
const DISCOGS_429_BACKOFF_MS = 30000;
const DEEJAY_DEFAULT_MEDIA_CONDITION = 'Mint (M)';
const DEEJAY_DEFAULT_SLEEVE_CONDITION = 'Mint (M)';
const MAX_INVOICE_UPLOAD_BYTES = 5 * 1024 * 1024;
const IMPORT_SESSION_TTL_MS = 30 * 60 * 1000;
let nextDiscogsRequestAt = 0;
const importSessions = new Map<string, { releaseIds: Set<number>; expiresAt: number }>();

function cleanupImportSessions() {
  const now = Date.now();
  for (const [importId, session] of importSessions) {
    if (session.expiresAt <= now) {
      importSessions.delete(importId);
    }
  }
}

function createImportSession(): string {
  cleanupImportSessions();
  const importId = crypto.randomUUID();
  importSessions.set(importId, {
    releaseIds: new Set(),
    expiresAt: Date.now() + IMPORT_SESSION_TTL_MS,
  });
  return importId;
}

function addCandidatesToImportSession(importId: string, candidates: CandidateMatch[]) {
  cleanupImportSessions();
  const session = importSessions.get(importId);

  if (!session) {
    return;
  }

  for (const candidate of candidates) {
    session.releaseIds.add(candidate.id);
  }
}

function getImportSession(importId: string | undefined) {
  cleanupImportSessions();

  if (!importId) {
    return null;
  }

  return importSessions.get(importId) || null;
}

async function waitForDiscogsSlot() {
  const waitMs = nextDiscogsRequestAt - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  nextDiscogsRequestAt = Date.now() + DISCOGS_REQUEST_DELAY_MS;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSimilarity(left: string, right: string): number {
  const buildTokens = (value: string): { tokens: Set<string>; compact: string } => {
    const normalizedTokens = normalizeText(value).split(' ').filter(Boolean);
    const compact = normalizedTokens.join('');
    return {
      tokens: new Set([...normalizedTokens, compact].filter(Boolean)),
      compact,
    };
  };
  const leftParts = buildTokens(left);
  const rightParts = buildTokens(right);
  const leftTokens = leftParts.tokens;
  const rightTokens = rightParts.tokens;

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  if (leftParts.compact && rightParts.compact && leftParts.compact === rightParts.compact) {
    return 1;
  }

  const overlap = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function splitDiscogsTitle(value: string): { artist: string; title: string } {
  const [artist, ...titleParts] = value.split(' - ');
  return {
    artist: artist?.trim() || '',
    title: titleParts.join(' - ').trim() || value,
  };
}

function getFormatSignals(formats: string[]): { hasVinyl: boolean; isDigitalOnly: boolean } {
  const hasVinyl = formats.some((format) => /vinyl|lp|12"|7"|10"/i.test(format));
  const hasDigitalFormat = formats.some((format) => /file|mp3|wav|flac|aac|ogg|alac/i.test(format));

  return {
    hasVinyl,
    isDigitalOnly: hasDigitalFormat && !hasVinyl,
  };
}

function scoreCandidate(item: DeejayInvoiceItem, result: DiscogsSearchResult): CandidateMatch {
  const discogsTitle = splitDiscogsTitle(result.title || '');
  const reasons: string[] = [];
  let score = 0;

  const itemCatno = normalizeCatalogNumber(item.catalogNumber);
  const resultCatno = normalizeCatalogNumber(result.catno || '');

  if (itemCatno && resultCatno && itemCatno === resultCatno) {
    score += 55;
    reasons.push(`Catalog number matches ${result.catno}`);
  } else if (itemCatno && resultCatno && (itemCatno.includes(resultCatno) || resultCatno.includes(itemCatno))) {
    score += 35;
    reasons.push(`Catalog number is close to ${result.catno}`);
  }

  const artistSimilarity = tokenSimilarity(item.artist, discogsTitle.artist);
  if (artistSimilarity >= 0.85) {
    score += 20;
    reasons.push('Artist looks like an exact match');
  } else if (artistSimilarity >= 0.45) {
    score += 12;
    reasons.push('Artist is similar');
  }

  const titleSimilarity = tokenSimilarity(item.title, discogsTitle.title);
  if (titleSimilarity >= 0.85) {
    score += 20;
    reasons.push('Title looks like an exact match');
  } else if (titleSimilarity >= 0.45) {
    score += 12;
    reasons.push('Title is similar');
  }

  const formats = result.format || [];
  const formatSignals = getFormatSignals(formats);
  if (formatSignals.hasVinyl) {
    score += 5;
    reasons.push('Format appears to be vinyl');
  }

  if (formatSignals.isDigitalOnly) {
    score -= 45;
    reasons.push('Format appears to be digital only');
  }

  const itemArtistQuery = normalizeText(item.artist);
  const itemTitleQuery = normalizeText(item.title);
  const resultTitleQuery = normalizeText(result.title || '');

  if (itemArtistQuery && itemTitleQuery && resultTitleQuery.includes(`${itemArtistQuery} ${itemTitleQuery}`)) {
    score += 25;
    reasons.push('Discogs title contains invoice artist and title');
  } else if (itemTitleQuery && resultTitleQuery.includes(itemTitleQuery)) {
    score += 18;
    reasons.push('Discogs title contains invoice title');
  }

  if (result.type === 'release') {
    score += 5;
  }

  const cappedScore = Math.max(0, Math.min(score, 100));
  const confidence = cappedScore >= 75 ? 'strong' : cappedScore >= 45 ? 'possible' : 'weak';

  return {
    id: result.id,
    title: result.title || 'Untitled release',
    year: result.year || null,
    country: result.country || null,
    format: formats,
    labels: result.label || [],
    catalogNumber: result.catno || null,
    thumb: result.thumb || result.cover_image || null,
    discogsUrl: result.uri ? `https://www.discogs.com${result.uri}` : `https://www.discogs.com/release/${result.id}`,
    score: cappedScore,
    confidence,
    reasons: reasons.length > 0 ? reasons : ['Fallback Discogs search result'],
    inCollection: false,
  };
}

function markCollectionPresence(candidates: CandidateMatch[]): CandidateMatch[] {
  if (candidates.length === 0) {
    return candidates;
  }

  const db = getDatabase();
  const placeholders = candidates.map(() => '?').join(',');
  const rows = db.getDb().prepare(
    `SELECT discogs_id FROM releases WHERE discogs_id IN (${placeholders})`
  ).all(...candidates.map((candidate) => candidate.id)) as Array<{ discogs_id: number }>;
  const collectionIds = new Set(rows.map((row) => row.discogs_id));

  return candidates.map((candidate) => ({
    ...candidate,
    inCollection: collectionIds.has(candidate.id),
  }));
}

async function searchDiscogs(query: URLSearchParams): Promise<DiscogsSearchResult[]> {
  const url = `https://api.discogs.com/database/search?${query.toString()}`;
  const request = () => fetch(url, {
      headers: {
        'Authorization': `Discogs token=${config.discogsToken}`,
        'User-Agent': config.userAgent,
      },
    });

  await waitForDiscogsSlot();
  let response = await request();

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') || '8');
    const backoffMs = Math.max(DISCOGS_429_BACKOFF_MS, retryAfter * 1000);
    nextDiscogsRequestAt = Date.now() + backoffMs;
    await sleep(backoffMs);
    await waitForDiscogsSlot();
    response = await request();
  }

  if (!response.ok) {
    throw new Error(`Discogs search failed with ${response.status}`);
  }

  const data = await response.json() as { results?: DiscogsSearchResult[] };
  return data.results || [];
}

async function discogsFetch(url: string, init: RequestInit = {}): Promise<Response> {
  await waitForDiscogsSlot();

  return fetch(url, {
    ...init,
    headers: {
      'User-Agent': config.userAgent,
      'Authorization': `Discogs token=${config.discogsToken}`,
      ...(init.headers || {}),
    },
  });
}

async function fetchDiscogsRelease(releaseId: number): Promise<any> {
  const response = await discogsFetch(`https://api.discogs.com/releases/${releaseId}`);

  if (!response.ok) {
    throw new Error(`Discogs release fetch failed with ${response.status}`);
  }

  return response.json();
}

async function getDiscogsCollectionInstanceId(releaseId: number): Promise<number | null> {
  const response = await discogsFetch(
    `https://api.discogs.com/users/${config.discogsUsername}/collection/releases/${releaseId}`,
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const instanceId = data?.releases?.[0]?.instance_id || data?.releases?.[0]?.id || data?.instance_id;

  return typeof instanceId === 'number' ? instanceId : null;
}

async function setDiscogsCollectionField(
  releaseId: number,
  instanceId: number,
  fieldId: number,
  value: string,
): Promise<void> {
  const response = await discogsFetch(
    `https://api.discogs.com/users/${config.discogsUsername}/collection/folders/1/releases/${releaseId}/instances/${instanceId}/fields/${fieldId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    },
  );

  if (!response.ok) {
    throw new Error(`Discogs collection field ${fieldId} update failed with ${response.status}`);
  }
}

async function setDiscogsDefaultConditions(releaseId: number, instanceId: number): Promise<void> {
  await setDiscogsCollectionField(releaseId, instanceId, 1, DEEJAY_DEFAULT_MEDIA_CONDITION);
  await setDiscogsCollectionField(releaseId, instanceId, 2, DEEJAY_DEFAULT_SLEEVE_CONDITION);
}

async function addReleaseToDiscogsCollection(releaseId: number): Promise<number | null> {
  const response = await discogsFetch(
    `https://api.discogs.com/users/${config.discogsUsername}/collection/folders/1/releases/${releaseId}`,
    {
      method: 'POST',
    },
  );

  if (!response.ok) {
    throw new Error(`Discogs collection add failed with ${response.status}`);
  }

  const data = await response.json().catch(() => null);
  const instanceId = data?.instance_id || data?.id || await getDiscogsCollectionInstanceId(releaseId);

  if (typeof instanceId !== 'number') {
    throw new Error('Discogs collection add succeeded, but no instance ID was returned');
  }

  await setDiscogsDefaultConditions(releaseId, instanceId);

  return instanceId;
}

async function importReleaseToLocalCollection(releaseId: number): Promise<'added' | 'already-local'> {
  const db = getDatabase();
  const existingRelease = await db.getReleaseByDiscogsId(releaseId);

  if (existingRelease) {
    return 'already-local';
  }

  const releaseData = await fetchDiscogsRelease(releaseId);
  const imageUrl = releaseData.images?.[0]?.uri || releaseData.thumb || null;
  const localReleaseId = await db.createRelease({
    discogs_id: releaseId,
    title: releaseData.title || 'Unknown',
    year: releaseData.year || null,
    cover_image_url: imageUrl,
    date_added: new Date().toISOString(),
    media_condition: DEEJAY_DEFAULT_MEDIA_CONDITION,
    sleeve_condition: DEEJAY_DEFAULT_SLEEVE_CONDITION,
    last_sync_at: new Date().toISOString(),
    sync_status: 'synced',
    metadata_version: 1,
  });

  for (let index = 0; index < (releaseData.artists || []).length; index++) {
    const artist = releaseData.artists[index];
    if (artist?.name) {
      const artistId = await db.createOrGetArtist(artist.name);
      await db.linkReleaseToArtist(localReleaseId, artistId, index);
    }
  }

  for (const styleName of releaseData.styles || []) {
    const styleId = await db.createOrGetStyle(styleName);
    await db.linkReleaseToStyle(localReleaseId, styleId);
  }

  for (const genreName of releaseData.genres || []) {
    const genreId = await db.createOrGetGenre(genreName);
    await db.linkReleaseToGenre(localReleaseId, genreId);
  }

  for (let index = 0; index < (releaseData.labels || []).length; index++) {
    const label = releaseData.labels[index];
    if (label?.name) {
      const labelId = await db.createOrGetLabel(label.name);
      await db.linkReleaseToLabel(localReleaseId, labelId, index);
    }
  }

  return 'added';
}

async function addSelectedReleasesToCollection(releaseIds: number[], allowedReleaseIds: Set<number>) {
  const uniqueReleaseIds = Array.from(new Set(releaseIds.filter((id) => Number.isInteger(id) && id > 0)));
  const results = [];

  for (const releaseId of uniqueReleaseIds) {
    try {
      if (!allowedReleaseIds.has(releaseId)) {
        results.push({
          releaseId,
          status: 'rejected',
          error: 'Release was not produced by this invoice import session',
        });
        continue;
      }

      const db = getDatabase();
      const existingRelease = await db.getReleaseByDiscogsId(releaseId);

      if (existingRelease) {
        results.push({
          releaseId,
          status: 'already-local',
          discogsStatus: 'skipped',
          conditionStatus: 'skipped',
          localStatus: 'already-local',
        });
        continue;
      }

      let instanceId: number | null = null;
      try {
        instanceId = await addReleaseToDiscogsCollection(releaseId);
      } catch (discogsError) {
        results.push({
          releaseId,
          status: 'error',
          discogsStatus: 'failed',
          conditionStatus: 'skipped',
          localStatus: 'skipped',
          error: discogsError instanceof Error ? discogsError.message : 'Discogs add failed',
        });
        continue;
      }

      let conditionStatus = 'updated';
      if (!instanceId) {
        conditionStatus = 'missing-instance';
      }

      try {
        await importReleaseToLocalCollection(releaseId);
      } catch (localError) {
        results.push({
          releaseId,
          status: 'partial',
          discogsStatus: 'added',
          conditionStatus,
          localStatus: 'failed',
          error: localError instanceof Error ? localError.message : 'Local import failed',
        });
        continue;
      }

      results.push({
        releaseId,
        status: 'added',
        discogsStatus: 'added',
        conditionStatus,
        localStatus: 'added',
      });
    } catch (error) {
      results.push({
        releaseId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to add release',
      });
    }
  }

  return results;
}

async function findCandidates(item: DeejayInvoiceItem, debugTrace?: string[]): Promise<CandidateMatch[]> {
  const seenQueries = new Set<string>();
  const seenResults = new Map<number, DiscogsSearchResult>();

  const queries: URLSearchParams[] = [];
  const catalogVariants = generateCatalogVariants(item.catalogNumber);

  queries.push(new URLSearchParams({ type: 'release', catno: item.catalogNumber, per_page: '10' }));

  queries.push(new URLSearchParams({
    type: 'release',
    q: `${item.catalogNumber} - ${item.artist}`,
    per_page: '10',
  }));

  queries.push(new URLSearchParams({
    type: 'release',
    artist: item.artist,
    title: item.title,
    per_page: '10',
  }));

  queries.push(new URLSearchParams({
    type: 'release',
    q: `${item.artist} ${item.title}`,
    per_page: '5',
  }));

  queries.push(new URLSearchParams({
    type: 'release',
    q: item.rawDescription,
    per_page: '10',
  }));

  for (const variant of catalogVariants.filter((variant) => variant !== item.catalogNumber)) {
    queries.push(new URLSearchParams({ type: 'release', catno: variant, per_page: '10' }));
  }

  for (const variant of catalogVariants.slice(0, 1)) {
    queries.push(new URLSearchParams({
      type: 'release',
      q: `${variant} ${item.artist} ${item.title}`,
      per_page: '10',
    }));
  }

  for (const query of queries) {
    const queryKey = query.toString();
    if (seenQueries.has(queryKey)) {
      continue;
    }

    seenQueries.add(queryKey);
    debugTrace?.push(`query:${queryKey}`);

    try {
      const results = await searchDiscogs(query);
      debugTrace?.push(`results:${results.length}`);
      for (const result of results) {
        if (result.type === 'release' && !seenResults.has(result.id)) {
          seenResults.set(result.id, result);
        }
      }

      const bestScore = Array.from(seenResults.values())
        .map((result) => scoreCandidate(item, result).score)
        .reduce((highest, score) => Math.max(highest, score), 0);

      if (bestScore >= EXCELLENT_MATCH_SCORE) {
        break;
      }
    } catch (error) {
      console.error('Invoice Discogs search failed:', error);
    }
  }

  const candidates = Array.from(seenResults.values())
    .map((result) => scoreCandidate(item, result))
    .sort((left, right) => right.score - left.score);
  const bestScore = candidates[0]?.score || 0;
  const relevantCandidates = candidates.filter((candidate) => {
    const hasArtistOrTitleSignal = candidate.reasons.some((reason) => (
      reason.includes('Artist') || reason.includes('Title')
    ));

    if (bestScore >= EXCELLENT_MATCH_SCORE) {
      return candidate.score >= EXCELLENT_MATCH_SCORE;
    }

    if (candidate.score >= 75) {
      return candidate.format.length === 0 || getFormatSignals(candidate.format).hasVinyl;
    }

    return candidate.score >= 45 &&
      hasArtistOrTitleSignal &&
      (candidate.format.length === 0 || getFormatSignals(candidate.format).hasVinyl);
  });

  return markCollectionPresence((relevantCandidates.length > 0 ? relevantCandidates : [])
    .slice(0, 8))
    .sort((left, right) => {
      if (left.inCollection !== right.inCollection) {
        return left.inCollection ? -1 : 1;
      }

      return right.score - left.score;
    });
}

export async function POST(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);

  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'parse';

    if (action === 'match') {
      const item = await request.json() as DeejayInvoiceItem;
      const debug = process.env.NODE_ENV !== 'production' &&
        process.env.ENABLE_INVOICE_DEBUG === '1' &&
        searchParams.get('debug') === '1';
      const debugTrace: string[] = [];
      const importId = searchParams.get('importId') || undefined;

      if (!item?.id || !item.catalogNumber || !item.title) {
        return NextResponse.json({ error: 'Invoice item is required' }, { status: 400 });
      }

      const candidates = await findCandidates(item, debug ? debugTrace : undefined);
      if (importId) {
        addCandidatesToImportSession(importId, candidates);
      }

      return NextResponse.json({
        ...(debug ? { matcherVersion: MATCHER_VERSION } : {}),
        itemId: item.id,
        candidates,
        ...(debug ? { debugTrace } : {}),
      });
    }

    if (action === 'add') {
      const body = await request.json() as AddCollectionRequest;

      if (!Array.isArray(body.releaseIds)) {
        return NextResponse.json({ error: 'releaseIds must be an array' }, { status: 400 });
      }

      const session = getImportSession(body.importId);
      if (!session) {
        return NextResponse.json({ error: 'Import session expired or invalid' }, { status: 400 });
      }

      const results = await addSelectedReleasesToCollection(body.releaseIds, session.releaseIds);

      return NextResponse.json({
        success: results.every((result) => !['error', 'partial', 'rejected'].includes(result.status)),
        results,
      });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF invoices are supported in this POC' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_INVOICE_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Invoice PDF is too large' }, { status: 400 });
    }

    const invoice = parseDeejayInvoicePdf(buffer);
    const { extractedText, ...safeInvoice } = invoice;
    void extractedText;
    const importId = createImportSession();

    return NextResponse.json({
      ...safeInvoice,
      importId,
      items: invoice.items.map((item) => ({
        ...item,
        catalogVariants: generateCatalogVariants(item.catalogNumber),
        candidates: [],
      })),
    });
  } catch (error) {
    console.error('Failed to import deejay invoice:', error);
    return NextResponse.json({ error: 'Failed to import invoice' }, { status: 500 });
  }
}
