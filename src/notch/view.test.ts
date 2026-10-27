// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { deps, ctl, fakeRaf, timers } from './test-helpers';
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

test('the pill hit rect is centred like the pill itself', () => {
  const r = fakeRaf();
  const spy = vi.fn();
  const c = ctl(null);
  const root = document.createElement('div');
  document.body.append(root);
  const v = mountNotch(root, c, { ...deps(r), onHitRects: spy });
  // jsdom has no layout: give the pill the box a browser computes. It is centred with
  // left: 50% plus translateX(-50%), and offsetLeft ignores the transform.
  const pill = root.querySelector('.notch-pill')!;
  for (const [key, value] of Object.entries({ offsetLeft: 320, offsetTop: 134, offsetWidth: 78, offsetHeight: 34 })) {
    Object.defineProperty(pill, key, { value });
  }
  c.click();
  v.kick();
  r.runAll(120);
  timers.advance(1000);
  r.runAll(600);
  expect(c.pillVisible).toBe(true);
  expect(spy).toHaveBeenLastCalledWith([{ x: 108, y: 0, w: 424, h: 124 }, { x: 281, y: 134, w: 78, h: 34 }]);
});
