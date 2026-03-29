import { useCallback } from 'react';
import { useCollectionStore } from '@/stores/useCollectionStore';

export function useJobStatus() {
  const { jobStatus, setJobStatus, updateJobStatus, setError, setRateLimitStatus } =
    useCollectionStore();

  const pollJobStatus = useCallback(
    async (jobId: string) => {
      const poll = async () => {
        try {
          const response = await fetch(`/api/discogs/job?jobId=${jobId}`);
          const result = await response.json();

          if (result.error) {
            console.error('Error polling job status:', result.error);
            return;
          }

          updateJobStatus({
            status: result.status,
            progress: result.progress,
            total: result.total,
            processed: result.processed,
            startTime: new Date(result.startTime),
            endTime: result.endTime ? new Date(result.endTime) : null,
            error: result.error || null,
            results: result.results,
          });

          if (result.rateLimit) {
            setRateLimitStatus(result.rateLimit);
          }

          if (result.status === 'running' || result.status === 'pending') {
            setTimeout(poll, 2000);
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      };

      poll();
    },
    [updateJobStatus, setRateLimitStatus]
  );

  const startJob = useCallback(
    async (testMode: boolean = false, skipCache: boolean = false) => {
      try {
        const response = await fetch('/api/discogs/job', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ testMode, skipCache }),
        });

        const result = await response.json();

        if (result.error) {
          setError(result.error);
          return;
        }

        setJobStatus({
          id: result.jobId,
          status: 'pending',
          progress: 0,
          total: 0,
          processed: 0,
          startTime: new Date(),
          endTime: null,
          error: null,
          results: {
            videosLoaded: 0,
            pricesLoaded: 0,
            errors: 0,
          },
        });

        pollJobStatus(result.jobId);
      } catch (error) {
        console.error('Error starting job:', error);
        setError('Failed to start job');
      }
    },
    [setError, setJobStatus, pollJobStatus]
  );

  return {
    jobStatus,
    startJob,
    pollJobStatus,
  };
}


