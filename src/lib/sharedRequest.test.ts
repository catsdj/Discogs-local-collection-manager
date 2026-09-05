import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInFlightShare, createVisibilityRefreshGate } from './sharedRequest.ts';

test('concurrent callers share one in-flight request', async () => {
  const share = createInFlightShare<string>();
  let factoryCalls = 0;
  let release!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    release = resolve;
  });

  const first = share(async () => {
    factoryCalls += 1;
    return pending;
  });
  const second = share(async () => {
    factoryCalls += 1;
    return 'should-not-run';
  });

  release('shared');
  assert.equal(await first, 'shared');
  assert.equal(await second, 'shared');
  assert.equal(factoryCalls, 1);
});

test('a later call starts a new request after the first finishes', async () => {
  const share = createInFlightShare<number>();
  let factoryCalls = 0;

  const first = await share(async () => {
    factoryCalls += 1;
    return 1;
  });
  const second = await share(async () => {
    factoryCalls += 1;
    return 2;
  });

  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(factoryCalls, 2);
});

test('does not refresh on the initial visible state', () => {
  const gate = createVisibilityRefreshGate();
  assert.equal(gate.shouldRefresh('visible'), false);
});

test('refreshes only after the tab was hidden and becomes visible again', () => {
  const gate = createVisibilityRefreshGate();

  assert.equal(gate.shouldRefresh('hidden'), false);
  assert.equal(gate.shouldRefresh('visible'), true);
  assert.equal(gate.shouldRefresh('visible'), false);
});
