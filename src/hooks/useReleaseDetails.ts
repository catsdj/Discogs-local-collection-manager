import { useCallback } from 'react';
import { useCollectionStore } from '@/stores/useCollectionStore';
import {
  saveToCache,
  getCachedDetails,
  getCacheStats,
} from '@/lib/cache';

export function useReleaseDetails() {
  const {
    releaseDetails,
    updateReleaseDetails,
    setCacheStats,
    setRateLimitStatus,
    setVideosLoading,
    data,
  } = useCollectionStore();

  const loadReleaseDetails = useCallback(
    async (releaseId: number) => {
      try {
        const cached = getCachedDetails(releaseId);
        if (cached) {
          console.log(`Using cached data for release ${releaseId}`);
          updateReleaseDetails(releaseId, {
            videos: cached.videos,
            tracklist: cached.tracklist,
            priceInfo: cached.priceInfo,
          });
          return;
        }

        console.log(`Fetching fresh data for release ${releaseId}`);
        const response = await fetch(`/api/discogs/details?release_id=${releaseId}`);
        const result = await response.json();

        if (result.error) {
          console.error('Error fetching release details:', result.error);
          return;
        }

        const details = {
          videos: result.videos || [],
          tracklist: result.tracklist || [],
          priceInfo: result.priceInfo,
        };

        saveToCache(releaseId, details.videos, details.tracklist, details.priceInfo);
        updateReleaseDetails(releaseId, details);
        setCacheStats(getCacheStats());

        if (result.rateLimit) {
          setRateLimitStatus(result.rateLimit);
        }
      } catch (error) {
        console.error('Error fetching release details:', error);
      }
    },
    [updateReleaseDetails, setCacheStats, setRateLimitStatus]
  );

  const loadAllVideos = useCallback(async () => {
    if (!data?.releases || data.releases.length === 0) return;

    setVideosLoading(true);

    try {
      for (const release of data.releases) {
        if (!releaseDetails[release.id]) {
          await loadReleaseDetails(release.id);
        }
      }
    } finally {
      setVideosLoading(false);
    }
  }, [data, releaseDetails, loadReleaseDetails, setVideosLoading]);

  return {
    releaseDetails,
    loadReleaseDetails,
    loadAllVideos,
  };
}


