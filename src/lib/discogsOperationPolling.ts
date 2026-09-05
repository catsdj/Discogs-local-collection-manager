export type OperationPollStatuses = {
  syncStatus?: string | null;
  updateStatus?: string | null;
};

export function isDiscogsJobInProgress(status?: string | null): boolean {
  return status === 'running' || status === 'pending';
}

export function shouldContinueOperationPolling(
  syncStatus?: string | null,
  updateStatus?: string | null,
): boolean {
  return isDiscogsJobInProgress(syncStatus) || isDiscogsJobInProgress(updateStatus);
}

type ScheduledCallback = () => void | Promise<void>;

export type OperationStatusPollerOptions = {
  poll: () => Promise<OperationPollStatuses>;
  intervalMs: number;
  schedule?: (callback: ScheduledCallback, ms: number) => number;
  unschedule?: (id: number) => void;
};

export function createOperationStatusPoller(options: OperationStatusPollerOptions) {
  const schedule = options.schedule ?? ((callback, ms) => (
    globalThis.setInterval(callback, ms) as unknown as number
  ));
  const unschedule = options.unschedule ?? ((id) => {
    globalThis.clearInterval(id);
  });

  let timerId: number | null = null;
  let disposed = false;
  let inFlight = false;
  let pendingStart = false;

  const stopTimer = () => {
    if (timerId === null) {
      return;
    }

    unschedule(timerId);
    timerId = null;
  };

  const startTimer = () => {
    if (disposed || timerId !== null) {
      return;
    }

    timerId = schedule(() => tick(), options.intervalMs);
  };

  const tick = async () => {
    if (disposed) {
      return;
    }

    if (inFlight) {
      pendingStart = true;
      return;
    }

    inFlight = true;
    try {
      do {
        pendingStart = false;
        try {
          const result = await options.poll();
          if (disposed) {
            return;
          }

          if (shouldContinueOperationPolling(result.syncStatus, result.updateStatus)) {
            startTimer();
          } else {
            stopTimer();
          }
        } catch {
          // Keep the current timer so a transient status failure does not drop an in-flight job.
        }
      } while (pendingStart && !disposed);
    } finally {
      inFlight = false;
    }
  };

  return {
    start() {
      return tick();
    },
    dispose() {
      disposed = true;
      stopTimer();
    },
  };
}
