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
  expect(spy).toHaveBeenLastCalledWith([{ x: 108, y: 0, w: 424, h: 134 }, { x: 281, y: 134, w: 78, h: 34 }]);
});

const ITEMS = [
  { id: 'home', label: 'Beranda', icon: '/m/home/icon.svg' },
  { id: 'system-stat', label: 'System stat', icon: '/m/system-stat/icon.svg' },
];

test('the pill lists the given modules and marks the active one', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setPill(ITEMS, 'system-stat', 'Pengaturan');
  const ics = root.querySelectorAll('.notch-pill .ic');
  expect(ics).toHaveLength(3);
  expect(ics[1].classList.contains('on')).toBe(true);
  expect(ics[0].classList.contains('on')).toBe(false);
  expect(ics[0].getAttribute('aria-label')).toBe('Beranda');
  expect(ics[2].getAttribute('aria-label')).toBe('Pengaturan');
  expect((ics[0].querySelector('.glyph') as HTMLElement).style.getPropertyValue('--icon')).toContain('/m/home/icon.svg');
});

test('clicking a module icon selects it; the ⋯ icon does not', () => {
  const root = document.createElement('div');
  const onSelect = vi.fn();
  const v = mountNotch(root, ctl(null), { ...deps(fakeRaf()), onSelect });
  v.setPill(ITEMS, 'home', 'Pengaturan');
  const ics = root.querySelectorAll<HTMLElement>('.notch-pill .ic');
  ics[1].click();
  ics[2].click();
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith('system-stat');
});

test('the pill and the content area follow the card size', () => {
  const r = fakeRaf();
  const root = document.createElement('div');
  const c = ctl(null);
  const v = mountNotch(root, c, deps(r));
  const pill = root.querySelector<HTMLElement>('.notch-pill')!;
  c.click();
  v.kick();
  r.runAll(600);
  expect(pill.style.top).toBe('134px');
  expect(v.content.style.width).toBe('400px');
  c.setCard({ width: 500, height: 100 });
  v.kick();
  r.runAll(600);
  expect(pill.style.top).toBe('144px');
  expect(v.content.style.width).toBe('500px');
});
