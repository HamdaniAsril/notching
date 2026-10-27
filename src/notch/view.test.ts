// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { deps, ctl, fakeRaf } from './test-helpers';
import { mountNotch } from './view';

test('loop stops once the notch is at rest', () => {
  const r = fakeRaf();
  const c = ctl(null);
  mountNotch(document.body, c, deps(r)).kick();
  r.runAll(600);
  expect(r.pending()).toBe(0);
});

test('kick restarts the loop after a pointer change', () => {
  const r = fakeRaf();
  const c = ctl(null);
  const v = mountNotch(document.body, c, deps(r));
  r.runAll(600);
  c.pointer(true, 0);
  v.kick();
  expect(r.pending()).toBe(1);
});

test('hit rects are reported on change only', () => {
  const r = fakeRaf();
  const spy = vi.fn();
  const c = ctl(null);
  mountNotch(document.body, c, { ...deps(r), onHitRects: spy }).kick();
  r.runAll(600);
  expect(spy).toHaveBeenCalledTimes(1);
});

test('Escape closes and Cmd+Q quits', () => {
  const r = fakeRaf();
  const quit = vi.fn();
  const c = ctl(null);
  mountNotch(document.body, c, { ...deps(r), onQuit: quit });
  c.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(c.phase).toBe('closing');
  c.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', metaKey: true }));
  expect(quit).toHaveBeenCalled();
});
