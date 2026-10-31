import { expect, test } from 'vitest';
import { dragMinutes, shownMinutes } from './ruler';
import type { TimerView } from './view';

const IDLE: TimerView = { state: 'idle', minutes: 5, until: null, left: null, text: null };

test('drag minutes clamp to 1–60', () => {
  expect(dragMinutes(10, -40)).toBe(15);
  expect(dragMinutes(10, 40)).toBe(5);
  expect(dragMinutes(10, 3)).toBe(10);
  expect(dragMinutes(10, 9999)).toBe(1);
  expect(dragMinutes(10, -9999)).toBe(60);
});

test('the ruler shows the minutes set, left, or frozen', () => {
  expect(shownMinutes(IDLE, 0)).toBe(5);
  expect(shownMinutes({ state: 'running', minutes: 10, until: 402_000, left: 402_000, text: '6:42' }, 0)).toBeCloseTo(6.7);
  expect(shownMinutes({ state: 'running', minutes: 10, until: 1_000, left: 1_000, text: '0:01' }, 5_000)).toBe(0);
  expect(shownMinutes({ state: 'paused', minutes: 10, until: null, left: 90_000, text: '1:30' }, 9e9)).toBe(1.5);
});
