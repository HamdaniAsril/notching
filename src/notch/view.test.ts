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
  { id: 'home', label: 'Beranda', svg: '<svg data-icon="home"></svg>' },
  { id: 'modules', label: 'Modul', svg: '<svg data-icon="grid"></svg>' },
];

test('the pill lists the given pages and marks the active one', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setPill(ITEMS, 'modules', 'Pengaturan');
  const ics = root.querySelectorAll('.notch-pill .ic');
  expect(ics).toHaveLength(3);
  expect(ics[1].classList.contains('on')).toBe(true);
  expect(ics[0].classList.contains('on')).toBe(false);
  expect(ics[0].getAttribute('aria-label')).toBe('Beranda');
  expect(ics[2].getAttribute('aria-label')).toBe('Pengaturan');
  expect(ics[0].querySelector('svg')!.getAttribute('data-icon')).toBe('home');
  expect(ics[0].querySelector('.glyph')).toBeNull();
});

test('clicking a page icon selects it; the ⋯ icon does not', () => {
  const root = document.createElement('div');
  const onSelect = vi.fn();
  const v = mountNotch(root, ctl(null), { ...deps(fakeRaf()), onSelect });
  v.setPill(ITEMS, 'home', 'Pengaturan');
  const ics = root.querySelectorAll<HTMLElement>('.notch-pill .ic');
  ics[1].click();
  ics[2].click();
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith('modules');
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

test('the pill stays put while the opening panel settles', () => {
  const r = fakeRaf();
  const root = document.createElement('div');
  const c = ctl(null);
  const v = mountNotch(root, c, deps(r));
  const pill = root.querySelector<HTMLElement>('.notch-pill')!;
  c.click();
  v.kick();
  const tops = new Set<string>();
  for (let i = 0; i < 600 && r.pending() > 0; i++) {
    r.runAll(1);
    if (c.pillVisible) tops.add(pill.style.top);
    timers.advance(1000 / 60);
  }
  expect(c.pillVisible).toBe(true);
  expect([...tops]).toEqual(['134px']);
});

test('the ⋯ icon opens settings', () => {
  const root = document.createElement('div');
  const onMore = vi.fn();
  const onSelect = vi.fn();
  const v = mountNotch(root, ctl(null), { ...deps(fakeRaf()), onMore, onSelect });
  v.setPill(ITEMS, 'home', 'Pengaturan');
  root.querySelector<HTMLElement>('.notch-pill .ic.more')!.click();
  expect(onMore).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
});

function noticeView(glow = true) {
  const r = fakeRaf();
  const root = document.createElement('div');
  document.body.append(root);
  const c = ctl(null);
  const v = mountNotch(root, c, deps(r));
  v.setNotice({ icon: 'mod://home/icon.svg', title: '<b>Kirim</b>', detail: '14.00', glow });
  c.notify(3500);
  v.kick();
  return { r, root, c, v };
}

test('the notice shows its icon, title and detail as text', () => {
  const { r, root } = noticeView();
  r.runAll(120);
  expect(root.querySelector('.notch-notice')!.classList.contains('show')).toBe(true);
  expect(root.querySelector('.ear.r .t1')!.textContent).toBe('<b>Kirim</b>');
  expect(root.querySelector('.ear.r b')).toBeNull();
  expect(root.querySelector('.ear.r .t2')!.textContent).toBe('14.00');
  const glyph = root.querySelector<HTMLElement>('.ear.l .glyph')!;
  expect(glyph.style.getPropertyValue('--icon')).toContain('mod://home/icon.svg');
});

test('a notice without a module icon shows the bell', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setNotice({ icon: null, title: 'Contoh', detail: '', glow: false });
  expect(root.querySelector('.ear.l .glyph')).toBeNull();
  expect(root.querySelector('.ear.l svg')).not.toBeNull();
});

test('the glow appears with the notice and fades after it', () => {
  const { r, root } = noticeView();
  r.runAll(60);
  expect(root.querySelectorAll('.notice-glow path')).toHaveLength(2);
  timers.advance(3640);
  r.runAll(600);
  expect(root.querySelectorAll('.notice-glow path')).toHaveLength(0);
  expect(r.pending()).toBe(0);
});

test('no glow when it is switched off', () => {
  const { r, root } = noticeView(false);
  r.runAll(60);
  expect(root.querySelectorAll('.notice-glow path')).toHaveLength(0);
});

test('each notch has its own glow ids', () => {
  const a = document.createElement('div');
  const b = document.createElement('div');
  mountNotch(a, ctl(null), deps(fakeRaf()));
  mountNotch(b, ctl(null), deps(fakeRaf()));
  const id = (root: HTMLElement) => root.querySelector('linearGradient')!.id;
  expect(id(a)).not.toBe(id(b));
});

test('the missed dot shows only while idle', () => {
  const r = fakeRaf();
  const root = document.createElement('div');
  const c = ctl(null);
  const v = mountNotch(root, c, deps(r));
  const dot = root.querySelector('.missed-dot')!;
  expect(dot.getAttribute('display')).toBe('none');
  v.setMissed(true);
  expect(dot.getAttribute('display')).toBe('inline');
  c.click();
  v.kick();
  r.runAll(1);
  expect(dot.getAttribute('display')).toBe('none');
});

test('the missed dot is red, inside the notch widened to the left, or under the lens', () => {
  const r = fakeRaf();
  const beside = document.createElement('div');
  const c = ctl({ width: 190, height: 32 });
  const v = mountNotch(beside, c, deps(r));
  const tab = beside.querySelector('.missed-tab')!;
  expect(tab.getAttribute('display')).toBe('none');
  v.setMissed(true);
  const a = beside.querySelector('.missed-dot')!;
  expect([a.getAttribute('cx'), a.getAttribute('cy'), a.getAttribute('r')]).toEqual([String(-95 - 8), '16', '3']);
  expect(tab.getAttribute('display')).toBe('inline');
  expect(tab.getAttribute('d')).toMatch(/^M -121.00 0 /);
  c.click();
  v.kick();
  r.runAll(1);
  expect(tab.getAttribute('display')).toBe('none');
  const under = document.createElement('div');
  mountNotch(under, ctl(null), deps(fakeRaf())).setMissed(true);
  const b = under.querySelector('.missed-dot')!;
  expect([b.getAttribute('cx'), b.getAttribute('cy')]).toEqual(['0', '9']);
  expect(under.querySelector('.missed-tab')).toBeNull();
  for (const d of [a, b]) {
    expect([d.getAttribute('fill'), d.getAttribute('stroke')]).toEqual(['#E8262E', null]);
  }
});

test('a pill icon wears the missed dot', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setPill([{ ...ITEMS[0], missed: true }, ITEMS[1]], 'modules', 'Pengaturan');
  expect(root.querySelector('.ic[data-id="home"]')!.classList.contains('missed')).toBe(true);
  expect(root.querySelector('.ic[data-id="modules"]')!.classList.contains('missed')).toBe(false);
});


test('the open panel fades toward its bottom; a notice stays solid like the notch', () => {
  const { r, root, c, v } = noticeView(false);
  const panel = root.querySelector<SVGPathElement>('.notch-panel')!;
  r.runAll(60);
  expect(panel.style.fill).not.toContain('url(');
  timers.advance(3640);
  r.runAll(5);
  expect(c.phase).toBe('closing');
  expect(panel.style.fill).not.toContain('url(');
  r.runAll(600);
  c.click();
  v.kick();
  r.runAll(5);
  expect(panel.style.fill).toMatch(/^url\("?#notch-fade-\d+"?\)$/);
});
