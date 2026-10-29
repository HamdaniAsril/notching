import { expect, test } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { EAR_W, NOTICE_FADE_MS } from './controller';
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

test('switching cards while open moves the panel to the new size', () => {
  const c = ctl(null);
  c.click();
  runUntilNear(c);
  timers.advance(1000);
  c.setCard({ width: 500, height: 100 });
  expect(c.panelSize()).toEqual({ w: 500, h: 134 });
  frames(c, 240);
  expect(c.motion.springs.pw.x).toBeCloseTo(500, 0);
  expect(c.pillVisible).toBe(true);
});

test('content hides while the panel resizes and returns when near', () => {
  const c = ctl(null);
  c.click();
  runUntilNear(c);
  c.setCard({ width: 540, height: 72 });
  frames(c, 1);
  expect(c.contentVisible).toBe(false);
  runUntilNear(c);
  expect(c.contentVisible).toBe(true);
});

test('setCard while idle changes nothing visible', () => {
  const c = ctl(null);
  c.setCard({ width: 540, height: 72 });
  expect(c.targets()).toEqual({ W: 42, H: 4, s: 0, bx: 0, pw: 0, ph: 0 });
  expect(c.card).toEqual({ width: 540, height: 72 });
});

test('a new config applies from the next frame', () => {
  const c = ctl(null);
  expect(c.targets().H).toBe(4);
  c.setConfig({ ...DEFAULT_CONFIG, thickness: 10 });
  expect(c.targets().H).toBe(10);
  expect(c.config.thickness).toBe(10);
});

test('a notice grows ears beside the notch, then folds back', () => {
  const c = ctl({ width: 190, height: 32 });
  expect(c.notify(3500)).toBe(true);
  expect(c.phase).toBe('notify');
  frames(c, 120);
  expect(c.targets().pw).toBe(190 + 2 * EAR_W);
  expect(c.targets().ph).toBe(32);
  expect(c.noticeVisible).toBe(true);
  timers.advance(3500);
  expect(c.noticeVisible).toBe(false);
  expect(c.phase).toBe('notify');
  timers.advance(NOTICE_FADE_MS);
  expect(c.phase).toBe('closing');
  frames(c, 240);
  expect(c.phase).toBe('idle');
  expect(c.panelVisible).toBe(false);
});

test('without a notch the lens opens into a small pill', () => {
  const c = ctl(null);
  c.notify(3500);
  frames(c, 120);
  expect(c.noticeSize()).toEqual({ w: 300, h: 38 });
  expect(c.targets().pw).toBe(300);
  expect(c.noticeVisible).toBe(true);
});

test('no notice while the panel is open', () => {
  const c = ctl(null);
  c.click();
  expect(c.notify(3500)).toBe(false);
  expect(c.phase).toBe('open');
});

test('clicking a notice opens the panel and keeps it open', () => {
  const c = ctl(null);
  c.notify(3500);
  frames(c, 60);
  c.click();
  timers.advance(5000);
  expect(c.phase).toBe('open');
});

test('a notice keeps the frame loop running', () => {
  const c = ctl(null);
  c.notify(3500);
  frames(c, 600);
  expect(c.needsFrames()).toBe(true);
});

test('hovering during a notice is remembered for afterwards', () => {
  const c = ctl(null);
  c.notify(3500);
  c.pointer(true, 0);
  expect(c.phase).toBe('notify');
  c.escape();
  c.resignKey();
  expect(c.phase).toBe('notify');
  timers.advance(3500 + NOTICE_FADE_MS);
  frames(c, 240);
  expect(c.phase).toBe('hover');
});

