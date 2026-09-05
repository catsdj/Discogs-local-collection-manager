export function createInFlightShare<T>() {
  let inFlight: Promise<T> | null = null;

  return (run: () => Promise<T>): Promise<T> => {
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(run)
        .finally(() => {
          inFlight = null;
        });
    }

    return inFlight;
  };
}

export function createVisibilityRefreshGate() {
  let wasHidden = false;

  return {
    shouldRefresh(visibilityState: string): boolean {
      if (visibilityState === 'hidden') {
        wasHidden = true;
        return false;
      }

      if (visibilityState === 'visible' && wasHidden) {
        wasHidden = false;
        return true;
      }

      return false;
    },
  };
}
