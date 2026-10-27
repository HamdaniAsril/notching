import { expect, test } from 'vitest';
import { ctl, frames, runUntilNear, timers } from './test-helpers';

test('rest targets without a notch', () =>
  expect(ctl(null).targets()).toEqual({ W: 42, H: 4, s: 0, bx: 0, pw: 0, ph: 0 }));

test('hover targets without a notch', () => {
  const c = ctl(null);
  c.pointer(true, 100);
  expect(c.targets()).toMatchObject({ W: 36.6, H: 13, s: 1, bx: 6 });
});

test('notched Mac is invisible at rest', () =>
  expect(ctl({ width: 164, height: 32 }).targets()).toMatchObject({ W: 70, H: 0, pw: 131.2, ph: 25.6 }));

test('open panel size follows the card', () => {
  expect(ctl(null).panelSize()).toEqual({ w: 400, h: 124 });
  expect(ctl({ width: 164, height: 32 }).panelSize()).toEqual({ w: 400, h: 148 });
});

test('pill appears 160 ms after the panel is near, at speed 200', () => {
  const c = ctl(null);
  c.click();
  runUntilNear(c);
  timers.advance(159);
  expect(c.pillVisible).toBe(false);
  timers.advance(1);
  expect(c.pillVisible).toBe(true);
});

test('escape while opening cancels the pill and ends idle', () => {
  const c = ctl(null);
  c.click();
  frames(c, 3);
  c.escape();
  timers.advance(1000);
  expect(c.pillVisible).toBe(false);
  frames(c, 240);
  expect(c.phase).toBe('idle');
  expect(c.panelVisible).toBe(false);
});

test('click while closing reopens', () => {
  const c = ctl(null);
  c.click();
  runUntilNear(c);
  c.escape();
  frames(c, 2);
  c.click();
  expect(c.phase).toBe('open');
});

test('rapid hover in/out never leaves the pill or panel showing', () => {
  const c = ctl(null);
  for (let i = 0; i < 20; i++) { c.pointer(i % 2 === 0, 0); frames(c, 1); }
  c.pointer(false, 0);
  frames(c, 240);
  expect(c.phase).toBe('idle');
  expect(c.pillVisible).toBe(false);
  expect(c.needsFrames()).toBe(false);
});

test('hovering keeps frames running (breathing)', () => {
  const c = ctl(null);
  c.pointer(true, 0);
  frames(c, 240);
  expect(c.needsFrames()).toBe(true);
});

test('an open panel at rest lets the frame loop stop once the pill shows', () => {
  const c = ctl(null);
  c.click();
  runUntilNear(c);
  timers.advance(1000);
  frames(c, 600);
  expect(c.pillVisible).toBe(true);
  expect(c.needsFrames()).toBe(false);
});

test('reopening while closing keeps the current panel size', () => {
  const c = ctl(null);
  c.click();
  runUntilNear(c);
  c.escape();
  frames(c, 2);
  const width = c.motion.springs.pw.x;
  c.click();
  expect(c.motion.springs.pw.x).toBe(width);
});
