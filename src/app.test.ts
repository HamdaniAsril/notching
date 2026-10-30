// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { type App, startApp } from './app';
import type { Notice } from './bridge';
import type { ModuleState, Page } from './modules/types';
import { DEFAULT_CONFIG } from './notch/config';
import { BERANDA, fakeBridge, fakeRaf, homeWidgets, moduleInfo, TEST_STATE, timers } from './notch/test-helpers';

afterEach(() => { document.body.innerHTML = ''; document.documentElement.lang = ''; });

const P1: Page = { id: 'p1', name: 'Kerja', icon: 'briefcase', widgets: [
  { widget: 'home/clock', col: 0, width: 1 }, { widget: 'home/prayer', col: 1, width: 1 },
] };

async function start(state: ModuleState = TEST_STATE) {
  const root = document.createElement('div');
  document.body.append(root);
  const bridge = fakeBridge(state);
  const r = fakeRaf();
  const app = await startApp(root, bridge, { raf: r.raf, caf: r.caf, setTimer: timers.setTimer });
  const frames = () => [...root.querySelectorAll('iframe')];
  const frame = () => root.querySelector('iframe');
  const pillIds = () => [...root.querySelectorAll<HTMLElement>('.notch-pill .ic[data-id]')].map(e => e.dataset.id);
  const pick = (id: string) => root.querySelector<HTMLElement>(`.notch-pill .ic[data-id="${id}"]`)!.click();
  return { root, bridge, r, app, frame, frames, pillIds, pick };
}

function open(app: App, r: ReturnType<typeof fakeRaf>): void {
  app.controller.click();
  app.view.kick();
  r.runAll(600);
  timers.advance(1000);
  r.runAll(600);
}

function close(app: App, r: ReturnType<typeof fakeRaf>): void {
  app.controller.escape();
  app.view.kick();
  r.runAll(600);
}

const view = () => document.defaultView!;
const fromFrame = (f: HTMLIFrameElement, data: unknown) =>
  view().dispatchEvent(new (view().MessageEvent)('message', { data, source: f.contentWindow }));

test('the pill shows the pages, then Modul', async () => {
  const { pillIds } = await start({ ...TEST_STATE, pages: [BERANDA, P1] });
  expect(pillIds()).toEqual(['home', 'p1', 'modules']);
});

test('Beranda opens with its three widgets', async () => {
  const { app, r, frames } = await start();
  open(app, r);
  expect(frames()).toHaveLength(3);
  expect(frames().every(f => f.getAttribute('src') === 'mod://home/index.html')).toBe(true);
  expect(frames().map(f => f.title)).toEqual(['Tanggal', 'Cuaca', 'Reminder']);
  expect(app.controller.panelSize().w).toBe(520);
});

test('picking Modul shows the tiles and remembers it', async () => {
  const { root, app, r, bridge, pick, frame } = await start();
  open(app, r);
  pick('modules');
  expect(root.querySelectorAll('.mods-tile')).toHaveLength(1);
  expect(frame()).toBeNull();
  expect(bridge.setLastPage).toHaveBeenCalledWith('modules');
  expect(root.querySelector('.notch-pill .on')!.getAttribute('data-id')).toBe('modules');
});

test('a tile opens the module page; back returns to Modul', async () => {
  const { root, app, r, bridge, pick, frame } = await start();
  open(app, r);
  pick('modules');
  root.querySelector<HTMLElement>('.mods-tile')!.click();
  expect(frame()!.getAttribute('src')).toBe('mod://system-stat/index.html');
  expect(bridge.setLastPage).toHaveBeenLastCalledWith('module:system-stat');
  expect(app.controller.panelSize().w).toBe(400);
  expect(root.querySelector('.notch-pill .on')!.getAttribute('data-id')).toBe('modules');
  root.querySelector<HTMLElement>('.pg-back button')!.click();
  expect(root.querySelector('.mods-grid')).not.toBeNull();
  expect(bridge.setLastPage).toHaveBeenLastCalledWith('modules');
});

test('the last page opens', async () => {
  const { app, r, frame } = await start({ ...TEST_STATE, lastPage: 'module:system-stat' });
  open(app, r);
  expect(frame()!.getAttribute('src')).toContain('system-stat');
});

test('a deleted page gives way to Beranda', async () => {
  const s = { ...TEST_STATE, pages: [BERANDA, P1], lastPage: 'p1' };
  const { app, r, bridge, frames, pillIds } = await start(s);
  open(app, r);
  expect(frames().map(f => f.title)).toEqual(['Jam', 'Waktu sholat']);
  bridge.emitModuleState({ ...s, pages: [BERANDA], lastPage: null });
  expect(frames().map(f => f.title)).toEqual(['Tanggal', 'Cuaca', 'Reminder']);
  expect(pillIds()).toEqual(['home', 'modules']);
});

test('a module switched off while open gives way to the Modul page', async () => {
  const { root, app, r, bridge } = await start({ ...TEST_STATE, lastPage: 'module:system-stat' });
  open(app, r);
  bridge.emitModuleState({ ...TEST_STATE, lastPage: 'module:system-stat',
    modules: [homeWidgets(), moduleInfo('system-stat', { enabled: false })] });
  expect(root.querySelector('.pg-empty')!.textContent).toBe('Belum ada modul yang menyala.');
});

test('a page picked on another screen opens here next time', async () => {
  const { app, r, bridge, frame } = await start();
  bridge.emitModuleState({ ...TEST_STATE, lastPage: 'module:system-stat' });
  open(app, r);
  expect(frame()!.getAttribute('src')).toContain('system-stat');
});

test('Escape from inside a widget closes the panel', async () => {
  const { app, r, frame } = await start();
  open(app, r);
  fromFrame(frame()!, { type: 'notching:key', key: 'Escape' });
  expect(app.controller.phase).toBe('closing');
});

test('the frames go away once the panel has closed', async () => {
  const { app, r, frame } = await start();
  open(app, r);
  expect(frame()).not.toBeNull();
  close(app, r);
  expect(app.controller.phase).toBe('idle');
  expect(frame()).toBeNull();
});

test('a language change reloads the frames in the new language', async () => {
  const { root, app, r, bridge, frame } = await start();
  open(app, r);
  const before = frame();
  bridge.emitModuleState({ ...TEST_STATE, lang: 'en' });
  const after = frame()!;
  expect(after).not.toBe(before);
  const posted: unknown[] = [];
  after.contentWindow!.postMessage = ((m: unknown) => { posted.push(m); }) as Window['postMessage'];
  after.dispatchEvent(new Event('load'));
  expect(posted).toContainEqual({ type: 'notching:init', moduleId: 'home', lang: 'en', widget: 'date' });
  expect(root.querySelector('.notch-pill .ic:not([data-id])')!.getAttribute('aria-label')).toBe('Settings');
  expect(root.querySelector('.notch-pill .ic[data-id="home"]')!.getAttribute('aria-label')).toBe('Home');
  expect(document.documentElement.lang).toBe('en');
});

test('a hidden overlay drops its frames even with no animation frames', async () => {
  // A parked overlay (its screen went away) is ordered out: no rAF, so its close
  // animation never finishes, but the widgets must not keep running.
  const { app, r, frame } = await start();
  open(app, r);
  expect(frame()).not.toBeNull();
  app.controller.resignKey();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(frame()).toBeNull();
  visibility.mockRestore();
});

test('⋯ closes the panel and opens settings', async () => {
  const { root, app, r, bridge } = await start();
  open(app, r);
  root.querySelector<HTMLElement>('.notch-pill .ic.more')!.click();
  expect(bridge.openSettings).toHaveBeenCalledTimes(1);
  expect(app.controller.phase).toBe('closing');
});

test('the notch starts with the saved look', async () => {
  const { app } = await start({ ...TEST_STATE, notch: { ...DEFAULT_CONFIG, dropDepth: 20 } });
  expect(app.controller.config.dropDepth).toBe(20);
});

test('a new look from settings reaches the notch, clamped', async () => {
  const { app, bridge } = await start();
  bridge.emitModuleState({ ...TEST_STATE, notch: { ...DEFAULT_CONFIG, thickness: 10, bounce: 400 } });
  expect(app.controller.config).toEqual({ ...DEFAULT_CONFIG, thickness: 10, bounce: 100 });
});

test('a full view covers the page and Kembali brings the row back', async () => {
  const { root, app, r, frames } = await start();
  open(app, r);
  const reminders = frames().find(f => f.title === 'Reminder')!;
  fromFrame(reminders, { type: 'notching:expand' });
  expect(root.querySelector('.pg-row.full')).not.toBeNull();
  fromFrame(reminders, { type: 'notching:collapse' });
  expect(root.querySelector('.pg-row.full')).toBeNull();
});

test('a full view that asks for room makes the panel taller until it closes', async () => {
  const { app, r, frames, pick, bridge } = await start();
  open(app, r);
  const reminders = () => frames().find(f => f.title === 'Reminder')!;
  fromFrame(reminders(), { type: 'notching:expand', height: 193 });
  expect(app.controller.card.height).toBe(193);
  bridge.emitModuleState({ ...TEST_STATE });
  expect(app.controller.card.height).toBe(193);
  fromFrame(reminders(), { type: 'notching:collapse' });
  expect(app.controller.card.height).toBe(104);
  fromFrame(reminders(), { type: 'notching:expand', height: 193 });
  pick('home');
  expect(app.controller.card.height).toBe(104);
  fromFrame(reminders(), { type: 'notching:expand', height: 193 });
  close(app, r);
  open(app, r);
  expect(app.controller.card.height).toBe(104);
});

test('picking the open page again closes its full view', async () => {
  const { root, app, r, frames, pick } = await start();
  open(app, r);
  fromFrame(frames().find(f => f.title === 'Reminder')!, { type: 'notching:expand' });
  pick('home');
  expect(root.querySelector('.pg-row.full')).toBeNull();
});

test('a full view does not survive closing the panel', async () => {
  const { root, app, r, frames } = await start();
  open(app, r);
  fromFrame(frames().find(f => f.title === 'Reminder')!, { type: 'notching:expand' });
  close(app, r);
  open(app, r);
  expect(root.querySelector('.pg-row')).not.toBeNull();
  expect(root.querySelector('.pg-row.full')).toBeNull();
});

test('a page name is text in the pill label', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { root } = await start({ ...TEST_STATE, pages: [BERANDA, { ...P1, name: evil }] });
  expect(root.querySelector('.notch-pill .ic[data-id="p1"]')!.getAttribute('aria-label')).toBe(evil);
  expect(root.querySelector('.notch-pill img')).toBeNull();
});

const notice = (title: string, moduleId: string | null = 'home', channel: string | null = 'reminder'): Notice =>
  ({ moduleId, channel, title, detail: '14.00', glow: true, seconds: 3.5 });
const earText = (root: HTMLElement) => root.querySelector('.ear.r')!.textContent;

test('a notice shows on this notch', async () => {
  const { root, app, bridge, r } = await start();
  bridge.emitNotice(notice('Kirim invoice'));
  r.runAll(120);
  expect(app.controller.phase).toBe('notify');
  expect(earText(root)).toContain('Kirim invoice');
  expect(root.querySelector<HTMLElement>('.ear.l .glyph')!.style.getPropertyValue('--icon')).toContain('mod://home/icon.svg');
});

test('a notice waits while the panel is open', async () => {
  const { app, bridge, r } = await start();
  open(app, r);
  bridge.emitNotice(notice('Kirim invoice'));
  expect(app.controller.phase).toBe('open');
  close(app, r);
  expect(app.controller.phase).toBe('notify');
});

test('several notices take turns', async () => {
  const { root, bridge, r } = await start();
  bridge.emitNotice(notice('Satu'));
  bridge.emitNotice(notice('Dua'));
  r.runAll(60);
  expect(earText(root)).toContain('Satu');
  timers.advance(3640);
  r.runAll(600);
  expect(earText(root)).toContain('Dua');
});

function clickNotice(app: App, r: ReturnType<typeof fakeRaf>): void {
  r.runAll(30);
  app.controller.click();
  app.view.kick();
  r.runAll(600);
  timers.advance(1000);
}

test('a notice opens the first page with its widget', async () => {
  const s = { ...TEST_STATE, pages: [BERANDA, P1], lastPage: 'module:system-stat' };
  const { app, bridge, r, frames } = await start(s);
  bridge.emitNotice(notice('Ashar', 'home', 'prayer'));
  clickNotice(app, r);
  expect(frames().map(f => f.title)).toEqual(['Jam', 'Waktu sholat']);
  expect(bridge.setLastPage).toHaveBeenCalledWith('p1');
});

test('the sample notice keeps the page', async () => {
  const { app, bridge, r, frame } = await start({ ...TEST_STATE, lastPage: 'module:system-stat' });
  bridge.emitNotice(notice('Contoh', null, null));
  clickNotice(app, r);
  expect(frame()!.getAttribute('src')).toContain('system-stat');
  expect(bridge.setLastPage).not.toHaveBeenCalled();
});

test('a notice from an unknown module has no icon and opens Beranda', async () => {
  const { root, app, bridge, r, frames } = await start({ ...TEST_STATE, lastPage: 'module:system-stat' });
  bridge.emitNotice(notice('Selesai', 'timer', 'done'));
  r.runAll(30);
  expect(earText(root)).toContain('Selesai');
  expect(root.querySelector('.ear.l .glyph')).toBeNull();
  clickNotice(app, r);
  expect(frames()).toHaveLength(3);
});

test('a missed reminder puts the white dot on its page; it goes when the panel closes', async () => {
  const { root, app, bridge, r } = await start({ ...TEST_STATE, pages: [BERANDA, P1], missed: ['home.reminder'] });
  expect(root.querySelector('.notch-pill .ic[data-id="home"].missed')).not.toBeNull();
  expect(root.querySelector('.notch-pill .ic[data-id="p1"].missed')).toBeNull();
  open(app, r);
  expect(app.controller.pillVisible).toBe(true);
  expect(root.querySelector('.notch-pill .ic[data-id="home"].missed')).not.toBeNull();
  expect(bridge.clearMissed).not.toHaveBeenCalled();
  app.controller.escape();
  app.view.kick();
  r.runAll(1);
  expect(bridge.clearMissed).toHaveBeenCalledTimes(1);
});

test('the queue keeps the five newest', async () => {
  const { root, app, bridge, r } = await start();
  open(app, r);
  for (let i = 1; i <= 7; i++) bridge.emitNotice(notice(String(i)));
  app.controller.escape();
  app.view.kick();
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    r.runAll(600);
    seen.push(root.querySelector('.ear.r .t1')!.textContent!);
    timers.advance(3640);
  }
  expect(seen).toEqual(['3', '4', '5', '6', '7']);
});
