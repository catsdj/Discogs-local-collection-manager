import type Database from 'better-sqlite3';
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { rejectIfNotLocal } from '@/lib/requestSecurity';
import {
  addTagToRelease,
  listTags,
  parseTagName,
  removeTagFromRelease,
} from '@/lib/tags';

export const runtime = 'nodejs';

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function parseDiscogsId(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function parseTagId(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function tagPayload(db: Database.Database, extra: Record<string, unknown> = {}) {
  return {
    tags: listTags(db),
    ...extra,
  };
}

export async function GET(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  try {
    const db = getDatabase().getDb();
    return NextResponse.json(tagPayload(db));
  } catch (error) {
    console.error('Failed to load tags:', error);
    return jsonError('Failed to load tags.', 500);
  }
}

export async function POST(request: NextRequest) {
  const localOnlyResponse = rejectIfNotLocal(request);
  if (localOnlyResponse) {
    return localOnlyResponse;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError('Invalid request body.', 400);
  }

  try {
    const action = body.action;
    const db = getDatabase().getDb();

    if (action === 'add-release') {
      const discogsId = parseDiscogsId(body.releaseId);
      if (!discogsId || !parseTagName(body.name)) {
        return jsonError('A valid release and tag name are required.', 400);
      }

      try {
        const result = addTagToRelease(db, discogsId, body.name);
        return NextResponse.json(tagPayload(db, {
          tag: result.tag,
          releaseTags: result.releaseTags,
        }));
      } catch (error) {
        if (error instanceof Error && error.message === 'Release is not in the local collection.') {
          return jsonError(error.message, 409);
        }
        throw error;
      }
    }

    if (action === 'remove-release') {
      const discogsId = parseDiscogsId(body.releaseId);
      const tagId = parseTagId(body.tagId);
      if (!discogsId || !tagId) {
        return jsonError('A valid release and tag are required.', 400);
      }

      try {
        const releaseTags = removeTagFromRelease(db, discogsId, tagId);
        return NextResponse.json(tagPayload(db, { releaseTags }));
      } catch (error) {
        if (error instanceof Error && error.message === 'Release is not in the local collection.') {
          return jsonError(error.message, 409);
        }
        throw error;
      }
    }

    return jsonError('Unknown tag action.', 400);
  } catch (error) {
    console.error('Failed to update tags:', error);
    return jsonError('Failed to update tags.', 500);
  }
}
