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
  for (const [key, value] of Object.entries({ offsetLeft: 480, offsetTop: 134, offsetWidth: 78, offsetHeight: 34 })) {
    Object.defineProperty(pill, key, { value });
  }
  c.click();
  v.kick();
  r.runAll(120);
  timers.advance(1000);
  r.runAll(600);
  expect(c.pillVisible).toBe(true);
  expect(spy).toHaveBeenLastCalledWith([{ x: 268, y: 0, w: 424, h: 134 }, { x: 441, y: 134, w: 78, h: 34 }]);
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

test('the missed dot is the accent, inside the notch widened to the left, or under the lens', () => {
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
    expect([d.getAttribute('fill'), d.getAttribute('stroke')]).toEqual(['#C8F04A', null]);
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

const shown = (root: HTMLElement, sel: string) => root.querySelector(sel)?.getAttribute('display') === 'inline';

const st = (text: string, icon: string | null = null) => ({ text, icon });

test('a status sits right of the notch, the missed dot left', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  expect(shown(root, '.st-tab')).toBe(false);
  v.setStatus([st('18:42')]);
  v.setMissed(true);
  expect(shown(root, '.st-tab')).toBe(true);
  expect(shown(root, '.missed-tab')).toBe(true);
  const text = root.querySelector('.st-text')!;
  expect(text.textContent).toBe('18:42');
  // One status keeps the 76 px tab and ends 8 px inside it: 95 + 76 − 8 − 35.
  expect([text.getAttribute('x'), text.getAttribute('y'), text.getAttribute('text-anchor')]).toEqual(['128', '20', 'start']);
  expect(root.querySelector('.st-tab')!.getAttribute('d')).toMatch(/^M 177\.00 0 /);
  expect(root.querySelector('.st-pill')).toBeNull();
  v.setStatus([]);
  expect(shown(root, '.st-tab')).toBe(false);
  expect(shown(root, '.st-items')).toBe(false);
});

test('several statuses widen the tab and get thin line separators', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  v.setStatus([st('18:42')]);
  const one = root.querySelector('.st-tab')!.getAttribute('d')!;
  v.setStatus([st('18:42', '/t/icon.svg'), st('1:42', '/k/icon.svg'), st('3', '/s/icon.svg')]);
  expect(shown(root, '.st-items')).toBe(true);
  expect(root.querySelectorAll('.st-sep')).toHaveLength(2);
  expect(root.querySelectorAll('.st-sep line')).toHaveLength(2);
  expect(root.querySelector('.st-sep circle')).toBeNull();
  expect([...root.querySelectorAll('.st-text')].map(t => t.textContent)).toEqual(['18:42', '1:42', '3']);
  expect([...root.querySelectorAll('.st-icon')].map(i => i.getAttribute('href'))).toEqual(['/t/icon.svg', '/k/icon.svg', '/s/icon.svg']);
  const many = root.querySelector('.st-tab')!.getAttribute('d')!;
  const right = (d: string) => Math.max(...d.split(/[ ,]/).map(Number).filter(n => !Number.isNaN(n)));
  expect(right(many)).toBeGreaterThan(right(one));
  // The first started sits next to the notch.
  const xs = [...root.querySelectorAll('.st-text')].map(t => Number(t.getAttribute('x')));
  expect(xs[0]).toBeLessThan(xs[1]);
  expect(xs[1]).toBeLessThan(xs[2]);
});

test('without a notch a status opens one small pill with the dot inside', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setMissed(true);
  v.setStatus([st('18:42')]);
  expect(shown(root, '.st-pill')).toBe(true);
  const dot = root.querySelector('.missed-dot')!;
  expect(shown(root, '.missed-dot')).toBe(true);
  expect(Number(dot.getAttribute('cx'))).toBeLessThan(0);
  expect(dot.getAttribute('cy')).toBe('11');
  // 24 + 7 × 5 characters + 14 for the dot, centred: the shoulders reach 6 px further.
  expect(root.querySelector('.st-pill')!.getAttribute('d')).toMatch(/^M -42\.50 0 /);
  v.setStatus([]);
  expect(shown(root, '.st-pill')).toBe(false);
  expect([dot.getAttribute('cx'), dot.getAttribute('cy')]).toEqual(['0', '9']);
});

test('lens pill holds every status', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setStatus([st('18:42')]);
  expect(root.querySelector('.st-pill')!.getAttribute('d')).toMatch(/^M -35\.50 0 /);
  // 24 + 35 + 12 + 7, centred, and the shoulders 6 px further.
  v.setStatus([st('18:42'), st('3')]);
  expect(root.querySelector('.st-pill')!.getAttribute('d')).toMatch(/^M -45\.00 0 /);
  expect(root.querySelectorAll('.st-sep')).toHaveLength(1);
});

test('a status icon sits just left of its text beside a notch, drawn white', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  v.setStatus([st('1:42', '/k/icon.svg')]);
  const icon = root.querySelector<SVGImageElement>('.st-icon')!;
  expect(icon.getAttribute('href')).toBe('/k/icon.svg');
  // The text ends at 163; 4 characters of 7 px, a 5 px gap, a 12 px icon.
  expect([icon.getAttribute('x'), icon.getAttribute('y'), icon.getAttribute('width')]).toEqual(['118', '10', '12']);
  // An SVG filter, not CSS: WebKit ignores CSS filter functions on SVG parts.
  expect(icon.style.filter).toBe('');
  const id = icon.getAttribute('filter')!.match(/^url\(#(.+)\)$/)![1];
  const matrix = root.querySelector(`filter[id="${id}"] feColorMatrix`)!;
  expect(matrix.getAttribute('values')).toBe('0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0');
  v.setStatus([st('42m')]);
  expect(root.querySelector('.st-icon')).toBeNull();
});

test('on a lens the pill makes room for the icon left of the text', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setStatus([st('18:42', '/k/icon.svg')]);
  // 24 + 7 × 5 characters + 17 for the icon, centred.
  expect(root.querySelector('.st-pill')!.getAttribute('d')).toMatch(/^M -44\.00 0 /);
  const icon = root.querySelector('.st-icon')!;
  expect([icon.getAttribute('x'), icon.getAttribute('y')]).toEqual(['-26', '5']);
  expect(root.querySelector('.st-text')!.getAttribute('x')).toBe('-9');
});

test('an empty status shows the icon alone, right-aligned beside a notch', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  v.setStatus([st('', '/k/icon.svg')]);
  expect(shown(root, '.st-tab')).toBe(true);
  // The text would end at 163; with no text the icon ends there instead.
  expect(root.querySelector('.st-icon')!.getAttribute('x')).toBe('151');
});

test('an empty status on a lens is a pill just wide enough for the icon', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setStatus([st('', '/k/icon.svg')]);
  // 24 + 12 for the icon, centred: the shoulders reach 6 px further.
  expect(root.querySelector('.st-pill')!.getAttribute('d')).toMatch(/^M -24\.00 0 /);
  expect(root.querySelector('.st-icon')!.getAttribute('x')).toBe('-6');
});

test('a status alone on a lens screen leaves no dot', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setStatus([st('18:42')]);
  expect(shown(root, '.st-pill')).toBe(true);
  expect(shown(root, '.missed-dot')).toBe(false);
});

test('status text is drawn as text', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  v.setStatus([st('<b>')]);
  expect(root.querySelector('.st-text')!.textContent).toBe('<b>');
  expect(root.querySelector('b')).toBeNull();
});

test('the status hides while the panel is open and starts no frame loop', () => {
  const r = fakeRaf();
  const root = document.createElement('div');
  const c = ctl({ width: 190, height: 32 });
  const v = mountNotch(root, c, deps(r));
  v.kick();
  r.runAll(600);
  v.setStatus([st('18:42')]);
  r.runAll(600);
  expect(r.pending()).toBe(0);
  c.click();
  v.kick();
  r.runAll(1);
  expect(shown(root, '.st-tab')).toBe(false);
});

test('the page head in the camera row is hidden while a notice shows in the ears', () => {
  const r = fakeRaf();
  const root = document.createElement('div');
  document.body.append(root);
  const c = ctl({ width: 164, height: 32 });
  const v = mountNotch(root, c, deps(r));
  const head = document.createElement('div');
  head.className = 'pg-head cam';
  v.content.append(head);
  v.setNotice({ icon: null, title: 'Kirim', detail: '14.00', glow: false });
  c.notify(3500);
  v.kick();
  r.runAll(120);
  expect(root.querySelector('.notch-notice')!.classList.contains('show')).toBe(true);
  expect(head.closest('.notch-content.show')).toBeNull();
  timers.advance(3640);
  r.runAll(600);
  c.click();
  v.kick();
  r.runAll(600);
  expect(root.querySelector('.notch-notice')!.classList.contains('show')).toBe(false);
  expect(head.closest('.notch-content.show')).not.toBeNull();
});

// Music beside the notch (design 3 Nov, §5).
const PLAYING = { playing: true, title: 'Jalan Braga', art: 'data:image/jpeg;base64,AAAA' };
const PAUSED = { ...PLAYING, playing: false };
const NOTHING = { playing: false, title: null, art: null };
const bars = (root: HTMLElement) => [...root.querySelectorAll('.mu-bar')];
const attrs = (el: Element, ...names: string[]) => names.map(n => el.getAttribute(n));

test('while music plays the cover sits left of the notch and five lime bars right of it', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  expect(shown(root, '.mu')).toBe(false);
  v.setMedia(PLAYING);
  expect(shown(root, '.mu')).toBe(true);
  expect(shown(root, '.mu-tab')).toBe(true);
  expect(shown(root, '.st-tab')).toBe(true);
  // The cover: 32 − 8 tall, 6 px from the notch's edge, corners of 5.
  const bg = root.querySelector('.mu-art-bg')!;
  expect(attrs(bg, 'x', 'y', 'width', 'height', 'rx')).toEqual(['-125', '4', '24', '24', '5']);
  const art = root.querySelector('.mu-art')!;
  expect(art.getAttribute('href')).toBe(PLAYING.art);
  expect(art.getAttribute('display')).toBe('inline');
  const clip = art.getAttribute('clip-path')!.match(/^url\(#(.+)\)$/)![1];
  expect(attrs(root.querySelector(`[id="${clip}"] rect`)!, 'x', 'width', 'rx')).toEqual(['-125', '24', '5']);
  // The left tab: 6 + 24 + 8, its shoulder 6 further.
  expect(root.querySelector('.mu-tab')!.getAttribute('d')).toMatch(/^M -139\.00 0 /);
  // Five bars 2 px wide with 2 px between, centred in a 24 px box 6 px from the edge.
  expect(bars(root).map(b => b.getAttribute('x'))).toEqual(['104', '108', '112', '116', '120']);
  expect(bars(root).every(b => b.getAttribute('width') === '2' && b.getAttribute('fill') === '#C8F04A')).toBe(true);
  expect(attrs(bars(root)[0], 'y', 'height')).toEqual(['9', '14']);
  // Each bar on its own beat, 0.9–1.3 s.
  const beats = bars(root).map(b => parseFloat((b as SVGElement).style.getPropertyValue('--mu-t')));
  expect(new Set(beats).size).toBe(5);
  expect(beats.every(t => t >= 0.9 && t <= 1.3)).toBe(true);
  // The right tab mirrors the left.
  expect(root.querySelector('.st-tab')!.getAttribute('d')).toMatch(/^M 139\.00 0 /);
  expect(shown(root, '.st-items')).toBe(false);
});

test('a track without artwork gets the lime gradient', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  v.setMedia({ ...PLAYING, art: null });
  expect(root.querySelector('.mu-art')!.getAttribute('display')).toBe('none');
  const fill = root.querySelector('.mu-art-bg')!.getAttribute('fill')!.match(/^url\(#(.+)\)$/)![1];
  const stops = [...root.querySelectorAll(`[id="${fill}"] stop`)].map(s => s.getAttribute('stop-color'));
  expect(stops).toEqual(['#C8F04A', '#4C6B12']);
  v.setMedia(PLAYING);
  expect(root.querySelector('.mu-art')!.getAttribute('display')).toBe('inline');
});

test('the music hides while the panel is open and comes back once it is closed', () => {
  const r = fakeRaf();
  const root = document.createElement('div');
  const c = ctl({ width: 190, height: 32 });
  const v = mountNotch(root, c, deps(r));
  v.setMedia(PLAYING);
  c.pointer(true, 0);
  v.kick();
  r.runAll(1);
  expect(shown(root, '.mu')).toBe(true);
  c.click();
  v.kick();
  r.runAll(1);
  expect(shown(root, '.mu')).toBe(false);
  expect(shown(root, '.mu-tab')).toBe(false);
  expect(shown(root, '.st-tab')).toBe(false);
  c.escape();
  c.pointer(false, 0);
  v.kick();
  r.runAll(600);
  expect(c.phase).toBe('idle');
  expect(shown(root, '.mu')).toBe(true);
});

test('a notice in the ears hides the music until it is over', () => {
  const r = fakeRaf();
  const root = document.createElement('div');
  const c = ctl({ width: 190, height: 32 });
  const v = mountNotch(root, c, deps(r));
  v.setMedia(PLAYING);
  v.setNotice({ icon: null, title: 'Kirim', detail: '14.00', glow: false });
  c.notify(3500);
  v.kick();
  r.runAll(1);
  expect(shown(root, '.mu')).toBe(false);
  timers.advance(3640);
  r.runAll(600);
  expect(c.phase).toBe('idle');
  expect(shown(root, '.mu')).toBe(true);
});

test('paused, the music stays 3 s with still bars, then goes', () => {
  vi.useFakeTimers();
  try {
    const r = fakeRaf();
    const root = document.createElement('div');
    const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(r));
    v.setMedia(PLAYING);
    v.setMedia(PAUSED);
    expect(shown(root, '.mu')).toBe(true);
    expect(root.querySelector('.mu-waves')!.classList.contains('paused')).toBe(true);
    vi.advanceTimersByTime(2900);
    expect(shown(root, '.mu')).toBe(true);
    // Playing again within the 3 s: it stays, and the pause timer is dropped.
    v.setMedia(PLAYING);
    expect(root.querySelector('.mu-waves')!.classList.contains('paused')).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(shown(root, '.mu')).toBe(true);
    v.setMedia(PAUSED);
    vi.advanceTimersByTime(3000);
    expect(shown(root, '.mu')).toBe(false);
    expect(shown(root, '.st-tab')).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('nothing left to play (the package switched off) hides the music at once', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  v.setMedia(PLAYING);
  v.setMedia(NOTHING);
  expect(shown(root, '.mu')).toBe(false);
  v.setMedia(PAUSED);
  expect(shown(root, '.mu')).toBe(false);
});

test('a status follows the soundwave, after the same thin separator', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  v.setStatus([st('18:42')]);
  v.setMedia(PLAYING);
  expect(shown(root, '.st-items')).toBe(true);
  // Bars end at 122; the line in the 12 px gap; the text; 8 px to the tab's edge.
  expect(root.querySelector('.st-sep line')!.getAttribute('x1')).toBe('128');
  expect(root.querySelector('.st-text')!.getAttribute('x')).toBe('134');
  expect(root.querySelector('.st-tab')!.getAttribute('d')).toMatch(/^M 183\.00 0 /);
  v.setMedia(NOTHING);
  // Back to the status alone, exactly as before.
  expect(root.querySelector('.st-text')!.getAttribute('x')).toBe('128');
  expect(root.querySelector('.st-sep')).toBeNull();
  expect(root.querySelector('.st-tab')!.getAttribute('d')).toMatch(/^M 177\.00 0 /);
});

test('the missed dot sits left of the cover, in the widened left tab', () => {
  const r = fakeRaf();
  const root = document.createElement('div');
  const c = ctl({ width: 190, height: 32 });
  const v = mountNotch(root, c, deps(r));
  v.setMissed(true);
  v.setMedia(PLAYING);
  const dot = root.querySelector('.missed-dot')!;
  expect(shown(root, '.missed-dot')).toBe(true);
  expect(attrs(dot, 'cx', 'cy')).toEqual(['-134', '16']);
  expect(shown(root, '.missed-tab')).toBe(false);
  expect(root.querySelector('.mu-tab')!.getAttribute('d')).toMatch(/^M -151\.00 0 /);
  v.setMedia(NOTHING);
  expect(attrs(dot, 'cx', 'cy')).toEqual(['-103', '16']);
  expect(shown(root, '.missed-tab')).toBe(true);
});

test('the music widens the hit area over the cover and the soundwave', () => {
  const r = fakeRaf();
  const spy = vi.fn();
  const c = ctl({ width: 190, height: 32 });
  const v = mountNotch(document.createElement('div'), c, { ...deps(r), onHitRects: spy });
  v.kick();
  r.runAll(600);
  expect(spy).toHaveBeenLastCalledWith([{ x: 375, y: 0, w: 210, h: 42 }]);
  v.setMedia(PLAYING);
  r.runAll(600);
  expect(spy).toHaveBeenLastCalledWith([{ x: 337, y: 0, w: 286, h: 42 }]);
  v.setMedia(NOTHING);
  r.runAll(600);
  expect(spy).toHaveBeenLastCalledWith([{ x: 375, y: 0, w: 210, h: 42 }]);
});

test('without a notch the music is one small pill under the lens: cover left, waves right', () => {
  const root = document.createElement('div');
  const v = mountNotch(root, ctl(null), deps(fakeRaf()));
  v.setMedia(PLAYING);
  expect(shown(root, '.st-pill')).toBe(true);
  expect(shown(root, '.mu')).toBe(true);
  expect(root.querySelector('.mu-tab')).toBeNull();
  // 12 + 14 cover + 8 + 18 waves + 12, centred: the shoulders reach 6 px further.
  expect(root.querySelector('.st-pill')!.getAttribute('d')).toMatch(/^M -38\.00 0 /);
  expect(attrs(root.querySelector('.mu-art-bg')!, 'x', 'y', 'width', 'height')).toEqual(['-20', '4', '14', '14']);
  expect(bars(root).map(b => b.getAttribute('x'))).toEqual(['2', '6', '10', '14', '18']);
  expect(attrs(bars(root)[0], 'y', 'height')).toEqual(['6', '10']);
  // A missed dot goes first, then a status after the waves.
  v.setMissed(true);
  v.setStatus([st('18:42')]);
  const dot = root.querySelector('.missed-dot')!;
  const cover = Number(root.querySelector('.mu-art-bg')!.getAttribute('x'));
  expect(Number(dot.getAttribute('cx'))).toBeLessThan(cover);
  expect(Number(root.querySelector('.st-text')!.getAttribute('x'))).toBeGreaterThan(Number(bars(root)[4].getAttribute('x')));
  v.setMedia(NOTHING);
  expect(shown(root, '.mu')).toBe(false);
  expect(shown(root, '.st-pill')).toBe(true);
});

test('on a lens the music shows only while idle, like the status pill', () => {
  const r = fakeRaf();
  const root = document.createElement('div');
  const c = ctl(null);
  const v = mountNotch(root, c, deps(r));
  v.setMedia(PLAYING);
  c.pointer(true, 0);
  v.kick();
  r.runAll(1);
  expect(shown(root, '.mu')).toBe(false);
  expect(shown(root, '.st-pill')).toBe(false);
});

test('nothing playing leaves the notch exactly as without music', () => {
  const plain = document.createElement('div');
  const quiet = document.createElement('div');
  mountNotch(plain, ctl({ width: 190, height: 32 }), deps(fakeRaf())).setStatus([st('18:42')]);
  const v = mountNotch(quiet, ctl({ width: 190, height: 32 }), deps(fakeRaf()));
  v.setStatus([st('18:42')]);
  v.setMedia(NOTHING);
  const strip = (root: HTMLElement) => root.querySelector('svg')!.outerHTML.replace(/-\d+"/g, '"').replace(/-\d+\)/g, ')');
  expect(strip(quiet)).toBe(strip(plain));
});
