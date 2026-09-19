/** Coalesce invalidations into serialized reads of an authoritative snapshot. */
export function createSnapshotRefresh<T>({
  read,
  onValue,
  onError,
  delayMs = 200,
}: {
  read: () => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  delayMs?: number;
}) {
  let stopped = false;
  let inFlight = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previousSnapshot: string | undefined;

  const schedule = () => {
    if (stopped || inFlight || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void update();
    }, delayMs);
  };

  const update = async () => {
    if (stopped) return;
    pending = false;
    inFlight = true;
    try {
      const value = await read();
      if (stopped) return;
      const snapshot = JSON.stringify(value);
      if (snapshot !== previousSnapshot) {
        onValue(value);
        previousSnapshot = snapshot;
      }
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      inFlight = false;
      // Events received during this read need one fresh read after it settles.
      if (pending) schedule();
    }
  };

  return {
    refresh() {
      if (stopped) return;
      pending = true;
      schedule();
    },
    stop() {
      stopped = true;
      pending = false;
      clearTimeout(timer);
    },
  };
}
