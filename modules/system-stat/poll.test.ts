import { expect, test, vi } from 'vitest';
import { POLL_MS, startPolling } from './poll';

const S = { cpu: 5, memUsed: 1, memTotal: 2, rx: 0, tx: 0 };
const flush = () => new Promise(r => setTimeout(r, 0));

function setup() {
  const calls: Array<{ resolve: (v: unknown) => void; reject: (e: Error) => void }> = [];
  const kit = { call: vi.fn(() => new Promise((resolve, reject) => { calls.push({ resolve, reject }); })) };
  const timers: Array<[() => void, number]> = [];
  const onStats = vi.fn();
  startPolling(kit as never, onStats, (fn, ms) => { timers.push([fn, ms]); });
  return { kit, calls, timers, onStats };
}

test('reads at once, then 1.5 s after each answer', async () => {
  const { kit, calls, timers, onStats } = setup();
  expect(kit.call).toHaveBeenCalledWith('system.stats', 'read');
  calls[0].resolve(S);
  await flush();
  expect(onStats).toHaveBeenCalledWith(S);
  expect(timers).toEqual([[expect.any(Function), POLL_MS]]);
  expect(POLL_MS).toBe(1500);
  timers[0][0]();
  expect(kit.call).toHaveBeenCalledTimes(2);
});

test('never asks twice at the same time', async () => {
  const { kit, timers } = setup();
  await flush();
  expect(timers).toHaveLength(0);
  expect(kit.call).toHaveBeenCalledTimes(1);
});

test('a failed read keeps polling', async () => {
  const { calls, timers, onStats } = setup();
  calls[0].reject(new Error('nope'));
  await flush();
  expect(onStats).not.toHaveBeenCalled();
  expect(timers).toEqual([[expect.any(Function), POLL_MS]]);
});
