'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CollectionTag } from '@/lib/tagName';
import { createInFlightShare, createVisibilityRefreshGate } from '@/lib/sharedRequest';

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Tag request failed.');
  }

  return body;
}

function readTags(body: Record<string, unknown>): CollectionTag[] {
  return Array.isArray(body.tags) ? body.tags as CollectionTag[] : [];
}

function readReleaseTags(body: Record<string, unknown>): CollectionTag[] {
  return Array.isArray(body.releaseTags) ? body.releaseTags as CollectionTag[] : [];
}

async function fetchTags(): Promise<CollectionTag[]> {
  const response = await fetch('/api/tags');
  const body = await readResponse(response);
  return readTags(body);
}

const shareTagFetch = createInFlightShare<CollectionTag[]>();
const tagVisibilityGate = createVisibilityRefreshGate();

async function loadTags(): Promise<CollectionTag[]> {
  return shareTagFetch(fetchTags);
}

async function postTagAction(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return readResponse(response);
}

export function useTags() {
  const [tags, setTags] = useState<CollectionTag[]>([]);

  const refreshTags = useCallback(async (): Promise<CollectionTag[]> => {
    const nextTags = await loadTags();
    setTags(nextTags);
    return nextTags;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const nextTags = await loadTags();
        if (!cancelled) {
          setTags(nextTags);
        }
      } catch (error) {
        console.error('Failed to load tags:', error);
      }
    };

    const refreshOnVisibility = () => {
      if (!tagVisibilityGate.shouldRefresh(document.visibilityState)) {
        return;
      }

      void refreshTags().catch((error) => console.error('Failed to refresh tags:', error));
    };

    void initialize();
    document.addEventListener('visibilitychange', refreshOnVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [refreshTags]);

  const addTagToRelease = useCallback(async (releaseId: number, name: string): Promise<CollectionTag[]> => {
    const body = await postTagAction({
      action: 'add-release',
      releaseId,
      name,
    });
    setTags(readTags(body));
    return readReleaseTags(body);
  }, []);

  const removeTagFromRelease = useCallback(async (releaseId: number, tagId: number): Promise<CollectionTag[]> => {
    const body = await postTagAction({
      action: 'remove-release',
      releaseId,
      tagId,
    });
    setTags(readTags(body));
    return readReleaseTags(body);
  }, []);

  return {
    tags,
    refreshTags,
    addTagToRelease,
    removeTagFromRelease,
  };
}
