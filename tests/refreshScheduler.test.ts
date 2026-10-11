import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshScheduler, type RefreshTimers } from '../src/utils/refreshScheduler.ts';

// Manual clock: timers fire only when advance() passes their due time.
function manualClock() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { due: number; callback: () => void }>();
  const timers: RefreshTimers = {
    setTimeout: (callback, ms) => {
      const id = nextId++;
      pending.set(id, { due: now + ms, callback });
      return id;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
    now: () => now,
  };
  async function settle() {
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
  }
  async function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      await settle();
      const due = [...pending.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort((left, right) => left[1].due - right[1].due)[0];
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].due;
      due[1].callback();
    }
    now = target;
    await settle();
  }
  return { timers, advance, settle, pendingCount: () => pending.size };
}

// A run() whose completion the test controls, tracking overlap.
function controllableRun() {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const resolvers: Array<(ok: boolean) => void> = [];
  const run = () => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    return new Promise<void>((resolve, reject) => {
      resolvers.push((ok) => {
        active -= 1;
        if (ok) resolve();
        else reject(new Error('load failed'));
      });
    });
  };
  return {
    run,
    finish: (ok = true) => resolvers.shift()?.(ok),
    calls: () => calls,
    maxActive: () => maxActive,
    open: () => resolvers.length,
  };
}

function setup(options: { delayMs?: number; maxWaitMs?: number; retryDelayMs?: number; maxRetries?: number } = {}) {
  const clock = manualClock();
  const loader = controllableRun();
  const errors: unknown[] = [];
  const scheduler = createRefreshScheduler({
    run: loader.run,
    delayMs: 400,
    maxWaitMs: 2000,
    retryDelayMs: 3000,
    maxRetries: 2,
    ...options,
    onError: (error) => errors.push(error),
    timers: clock.timers,
  });
  return { clock, loader, scheduler, errors };
}

describe('createRefreshScheduler', () => {
  it('collapses a burst of realtime events into one refresh', async () => {
    const { clock, loader, scheduler } = setup();
    for (let index = 0; index < 25; index += 1) {
      scheduler.request();
      await clock.advance(20);
    }
    assert.equal(loader.calls(), 0, 'still waiting for the burst to end');
    await clock.advance(400);
    assert.equal(loader.calls(), 1);
    loader.finish();
    await clock.advance(5000);
    assert.equal(loader.calls(), 1, 'no extra refresh after the burst');
  });

  it('does not postpone forever during continuous events (max wait)', async () => {
    const { clock, loader, scheduler } = setup();
    const startedAt: number[] = [];
    for (let elapsed = 0; elapsed < 7000; elapsed += 100) {
      scheduler.request();
      const before = loader.calls();
      await clock.advance(100);
      if (loader.calls() > before) {
        startedAt.push(elapsed);
        loader.finish();
      }
    }
    assert.ok(startedAt.length >= 3, `refreshed ${startedAt.length} times during 7 s of events`);
    assert.ok(startedAt[0] <= 2000, 'first refresh within the max wait');
  });

  it('runs one more refresh for events that arrive during an active fetch, never overlapping', async () => {
    const { clock, loader, scheduler } = setup();
    scheduler.request();
    await clock.advance(400);
    assert.equal(loader.calls(), 1);
    scheduler.request();
    scheduler.request();
    await clock.advance(5000);
    assert.equal(loader.calls(), 1, 'waits for the active fetch');
    loader.finish();
    await clock.advance(400);
    assert.equal(loader.calls(), 2, 'one final refresh picks up the mid-fetch events');
    loader.finish();
    await clock.advance(5000);
    assert.equal(loader.calls(), 2);
    assert.equal(loader.maxActive(), 1, 'an older response can never land after a newer one');
  });

  it('flush runs immediately and resolves after a run that started after the call', async () => {
    const { clock, loader, scheduler } = setup();
    const first = scheduler.flush();
    assert.equal(loader.calls(), 1);
    const second = scheduler.flush();
    let secondDone = false;
    void second.then(() => (secondDone = true));
    loader.finish();
    assert.equal(await first, true);
    await clock.settle();
    assert.equal(loader.calls(), 2, 'second flush starts right after the first finishes');
    assert.equal(secondDone, false, 'not satisfied by the run that was already in flight');
    loader.finish();
    assert.equal(await second, true);
  });

  it('a pending batched request is served by flush (no duplicate refresh)', async () => {
    const { clock, loader, scheduler } = setup();
    scheduler.request();
    const done = scheduler.flush();
    loader.finish();
    assert.equal(await done, true);
    await clock.advance(5000);
    assert.equal(loader.calls(), 1);
  });

  it('retries a failed refresh, then stops until the next event', async () => {
    const { clock, loader, scheduler, errors } = setup({ maxRetries: 2 });
    const result = scheduler.flush();
    loader.finish(false);
    assert.equal(await result, false);
    assert.equal(errors.length, 1);
    await clock.advance(3000);
    assert.equal(loader.calls(), 2, 'first retry');
    loader.finish(false);
    await clock.advance(3000);
    assert.equal(loader.calls(), 3, 'second retry');
    loader.finish(false);
    await clock.advance(10000);
    assert.equal(loader.calls(), 3, 'retries exhausted');
    scheduler.request();
    await clock.advance(400);
    assert.equal(loader.calls(), 4, 'a later event retries again');
    loader.finish(true);
    await clock.advance(10000);
    assert.equal(loader.calls(), 4);
  });

  it('cleans up on unmount: no timers, no further runs, waiters resolve false', async () => {
    const { clock, loader, scheduler } = setup();
    scheduler.request();
    scheduler.dispose();
    assert.equal(clock.pendingCount(), 0, 'timer cleared');
    await clock.advance(5000);
    assert.equal(loader.calls(), 0);
    assert.equal(await scheduler.flush(), false);
    assert.equal(scheduler.isDisposed(), true);
  });

  it('a fetch still in flight at unmount does not trigger follow-ups and reports disposal', async () => {
    const { clock, loader, scheduler } = setup();
    const result = scheduler.flush();
    scheduler.request();
    scheduler.dispose();
    loader.finish();
    assert.equal(await result, false);
    await clock.advance(5000);
    assert.equal(loader.calls(), 1);
  });
});
