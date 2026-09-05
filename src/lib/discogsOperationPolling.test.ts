import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOperationStatusPoller } from './discogsOperationPolling.ts';

function createFakeTimers() {
  const timers = new Map<number, () => void>();
  let nextId = 1;

  return {
    schedule(callback: () => void | Promise<void>, _ms: number) {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
    unschedule(id: number) {
      timers.delete(id);
    },
    get scheduledCount() {
      return timers.size;
    },
    async fireAll() {
      await Promise.all([...timers.values()].map((callback) => callback()));
    },
  };
}

test('does not keep polling when both Discogs jobs are idle', async () => {
  const timers = createFakeTimers();
  let pollCount = 0;
  const poller = createOperationStatusPoller({
    intervalMs: 2000,
    schedule: timers.schedule,
    unschedule: timers.unschedule,
    poll: async () => {
      pollCount += 1;
      return { syncStatus: 'idle', updateStatus: 'idle' };
    },
  });

  await poller.start();

  assert.equal(pollCount, 1);
  assert.equal(timers.scheduledCount, 0);

  await timers.fireAll();

  assert.equal(pollCount, 1);
  poller.dispose();
});

test('polls on an interval while a Discogs job is running, then stops when it completes', async () => {
  const timers = createFakeTimers();
  let pollCount = 0;
  const poller = createOperationStatusPoller({
    intervalMs: 2000,
    schedule: timers.schedule,
    unschedule: timers.unschedule,
    poll: async () => {
      pollCount += 1;
      return {
        syncStatus: pollCount < 3 ? 'running' : 'completed',
        updateStatus: 'idle',
      };
    },
  });

  await poller.start();
  assert.equal(pollCount, 1);
  assert.equal(timers.scheduledCount, 1);

  await timers.fireAll();
  assert.equal(pollCount, 2);
  assert.equal(timers.scheduledCount, 1);

  await timers.fireAll();
  assert.equal(pollCount, 3);
  assert.equal(timers.scheduledCount, 0);
  poller.dispose();
});

test('a failed poll while a job is running keeps the interval', async () => {
  const timers = createFakeTimers();
  let pollCount = 0;
  const poller = createOperationStatusPoller({
    intervalMs: 2000,
    schedule: timers.schedule,
    unschedule: timers.unschedule,
    poll: async () => {
      pollCount += 1;
      if (pollCount === 2) {
        throw new Error('status endpoint failed');
      }
      return { syncStatus: 'running', updateStatus: 'idle' };
    },
  });

  await poller.start();
  assert.equal(timers.scheduledCount, 1);

  await timers.fireAll();
  assert.equal(pollCount, 2);
  assert.equal(timers.scheduledCount, 1);
  poller.dispose();
});

test('keeps polling if one job finished but the other is still running', async () => {
  const timers = createFakeTimers();
  const poller = createOperationStatusPoller({
    intervalMs: 2000,
    schedule: timers.schedule,
    unschedule: timers.unschedule,
    poll: async () => ({
      syncStatus: 'completed',
      updateStatus: 'running',
    }),
  });

  await poller.start();
  assert.equal(timers.scheduledCount, 1);
  poller.dispose();
  assert.equal(timers.scheduledCount, 0);
});
