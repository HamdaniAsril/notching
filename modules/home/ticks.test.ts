import { expect, test, vi } from 'vitest';
import { everyMinute, startTicks, WEATHER_EVERY_MS } from './ticks';
import type { HomeSnapshot } from './types';

const SNAP: HomeSnapshot = { place: null, weather: null, prayer: null, sun: null, reminders: [] };
const flush = () => new Promise(r => setTimeout(r, 0));

function setup(start = new Date(2026, 9, 27, 10, 18, 30), weather = true) {
  let now = start;
  const calls: Array<{ method: string; resolve: (v: unknown) => void; reject: (e: Error) => void }> = [];
  const kit = {
    call: vi.fn((_cap: string, method: string) => new Promise((resolve, reject) => { calls.push({ method, resolve, reject }); })),
  };
  const timers: Array<[() => void, number]> = [];
  const onSnapshot = vi.fn();
  startTicks(kit as never, onSnapshot, (fn, ms) => { timers.push([fn, ms]); }, () => now, { weather });
  // Runs the last timer after its delay.
  const tick = () => { const [fn, ms] = timers[timers.length - 1]; now = new Date(now.getTime() + ms); fn(); };
  return { kit, calls, timers, onSnapshot, tick };
}

const methods = (kit: { call: ReturnType<typeof vi.fn> }) => kit.call.mock.calls.map(c => c[1]);

test('reads at once, then on each minute', () => {
  const t = setup();
  expect(t.kit.call).toHaveBeenCalledWith('home.data', 'read');
  expect(methods(t.kit)).toEqual(['read', 'refreshWeather']);
  expect(t.timers[0][1]).toBe(30_000);
  t.tick();
  expect(methods(t.kit)).toEqual(['read', 'refreshWeather', 'read']);
  expect(t.timers[1][1]).toBe(60_000);
});

test('weather refreshes every half hour', () => {
  const t = setup();
  const minutes = Math.ceil(WEATHER_EVERY_MS / 60_000) + 1;
  for (let i = 0; i < minutes; i++) t.tick();
  expect(methods(t.kit).filter(m => m === 'refreshWeather')).toHaveLength(2);
});

test('each answer reaches the card', async () => {
  const t = setup();
  t.calls[0].resolve(SNAP);
  await flush();
  expect(t.onSnapshot).toHaveBeenCalledWith(SNAP);
});

test('a failed call keeps the last snapshot', async () => {
  const t = setup();
  t.calls[0].resolve(SNAP);
  t.calls[1].reject(new Error('offline'));
  await flush();
  expect(t.onSnapshot).toHaveBeenCalledTimes(1);
});

test('only the weather widget asks for fresh weather', () => {
  const t = setup(undefined, false);
  for (let i = 0; i < 40; i++) t.tick();
  expect(methods(t.kit)).not.toContain('refreshWeather');
  expect(methods(t.kit)[0]).toBe('read');
});

test('everyMinute wakes on the minute boundary', () => {
  const timers: Array<[() => void, number]> = [];
  let now = new Date(2026, 9, 27, 10, 18, 20);
  const cb = vi.fn();
  everyMinute((fn, ms) => { timers.push([fn, ms]); }, () => now, cb);
  expect(timers[0][1]).toBe(40_000);
  now = new Date(2026, 9, 27, 10, 19, 0);
  timers[0][0]();
  expect(cb).toHaveBeenCalledTimes(1);
  expect(timers[1][1]).toBe(60_000);
});
