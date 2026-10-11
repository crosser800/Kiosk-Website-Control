// Coalesces bursts of "data changed" signals (e.g. Supabase realtime events)
// into as few reloads as possible without ever losing one:
//   - request(): batched. Waits `delayMs` after the latest signal, but never
//     more than `maxWaitMs` after the first unhandled one, so a continuous
//     stream of events cannot postpone the refresh forever.
//   - flush(): run as soon as possible and resolve when a run that STARTED
//     after this call has finished (true on success).
//   - Runs never overlap. A signal that arrives while a run is in flight marks
//     the data dirty and triggers one more run after it completes, so the
//     final state always reflects the latest change and an older response can
//     never land after a newer one.
//   - A failed run is retried after `retryDelayMs` (up to `maxRetries` times);
//     any later signal also retries.
//   - dispose(): cancels timers, stops future runs and resolves waiters with
//     false. `isDisposed()` lets the run callback skip state updates.
//
// No runtime imports, so it runs under `node --test` with injected timers.

export type RefreshTimers = {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
};

export type RefreshSchedulerOptions = {
  run: () => Promise<void>;
  delayMs?: number;
  maxWaitMs?: number;
  retryDelayMs?: number;
  maxRetries?: number;
  onError?: (error: unknown) => void;
  timers?: RefreshTimers;
};

export type RefreshScheduler = {
  request: () => void;
  flush: () => Promise<boolean>;
  dispose: () => void;
  isDisposed: () => boolean;
};

const defaultTimers: RefreshTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  now: () => Date.now(),
};

export function createRefreshScheduler(options: RefreshSchedulerOptions): RefreshScheduler {
  const delayMs = options.delayMs ?? 400;
  const maxWaitMs = Math.max(delayMs, options.maxWaitMs ?? 2000);
  const retryDelayMs = options.retryDelayMs ?? 3000;
  const maxRetries = options.maxRetries ?? 2;
  const timers = options.timers ?? defaultTimers;

  let disposed = false;
  let timer: unknown = null;
  let firstPendingAt: number | null = null;
  let inFlight = false;
  let dirty = false;
  let runImmediately = false;
  let retriesLeft = maxRetries;
  let waiters: Array<(ok: boolean) => void> = [];

  function clearTimer() {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(ms: number) {
    clearTimer();
    timer = timers.setTimeout(() => {
      timer = null;
      start();
    }, Math.max(0, ms));
  }

  function scheduleBatched() {
    const now = timers.now();
    if (firstPendingAt === null) firstPendingAt = now;
    schedule(Math.min(delayMs, maxWaitMs - (now - firstPendingAt)));
  }

  function start() {
    if (disposed || inFlight) return;
    clearTimer();
    firstPendingAt = null;
    dirty = false;
    runImmediately = false;
    inFlight = true;
    const runWaiters = waiters;
    waiters = [];

    let ok = false;
    void (async () => {
      try {
        await options.run();
        ok = true;
      } catch (error) {
        options.onError?.(error);
      }
      inFlight = false;
      runWaiters.forEach((resolve) => resolve(ok && !disposed));
      if (disposed) return;

      if (ok) {
        retriesLeft = maxRetries;
      }
      if (dirty) {
        if (runImmediately) start();
        else scheduleBatched();
      } else if (!ok && retriesLeft > 0) {
        retriesLeft -= 1;
        dirty = true;
        schedule(retryDelayMs);
      }
    })();
  }

  return {
    request() {
      if (disposed) return;
      dirty = true;
      if (inFlight) return;
      scheduleBatched();
    },
    flush() {
      if (disposed) return Promise.resolve(false);
      const done = new Promise<boolean>((resolve) => waiters.push(resolve));
      dirty = true;
      if (inFlight) {
        runImmediately = true;
      } else {
        start();
      }
      return done;
    },
    dispose() {
      disposed = true;
      clearTimer();
      const pending = waiters;
      waiters = [];
      pending.forEach((resolve) => resolve(false));
    },
    isDisposed: () => disposed,
  };
}
