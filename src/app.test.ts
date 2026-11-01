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

test('the overlay says it is ready for notices once it listens for them', async () => {
  const { bridge } = await start();
  expect(bridge.shotReady).toHaveBeenCalledTimes(1);
  expect(bridge.onNotice.mock.invocationCallOrder[0]).toBeLessThan(bridge.shotReady.mock.invocationCallOrder[0]);
});

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

const status = (screen: string) => ({ screen, items: [{ moduleId: 'timer', text: '18:42' }] });
const statusShown = (root: HTMLElement) => root.querySelector('.st-pill')?.getAttribute('display') === 'inline';

test('the status shows only on its screen', async () => {
  const { root, bridge } = await start();
  bridge.emitStatus(status('other'));
  expect(statusShown(root)).toBe(false);
  bridge.emitStatus(status('test'));
  expect(statusShown(root)).toBe(true);
  expect(root.querySelector('.st-text')!.textContent).toBe('18:42');
  bridge.emitStatus(null);
  expect(statusShown(root)).toBe(false);
});

test('a module status carries its module icon; the sample has none', async () => {
  const { root, bridge } = await start();
  const icon = () => root.querySelector('.st-icon')!;
  bridge.emitStatus({ screen: 'test', items: [{ moduleId: 'system-stat', text: '1:42' }] });
  expect(icon().getAttribute('href')).toBe('mod://system-stat/icon.svg');
  bridge.emitStatus({ screen: 'test', items: [{ moduleId: null, text: '18:42' }] });
  expect(root.querySelector('.st-icon')).toBeNull();
});

test('only this screen\'s list shows, every status in it', async () => {
  const { root, bridge } = await start();
  bridge.emitStatus({ screen: 'test', items: [{ moduleId: 'timer', text: '18:42' }, { moduleId: null, text: '3' }] });
  expect([...root.querySelectorAll('.st-text')].map(t => t.textContent)).toEqual(['18:42', '3']);
  bridge.emitStatus({ screen: 'other', items: [{ moduleId: 'timer', text: '18:42' }] });
  expect(statusShown(root)).toBe(false);
  expect(root.querySelectorAll('.st-text')).toHaveLength(0);
});

test('a status already on at start shows', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const bridge = fakeBridge(TEST_STATE);
  bridge.status.mockResolvedValue(status('test'));
  const r = fakeRaf();
  await startApp(root, bridge, { raf: r.raf, caf: r.caf, setTimer: timers.setTimer });
  expect(statusShown(root)).toBe(true);
});

test('the status hides while a notice or the panel shows', async () => {
  const { root, app, bridge, r } = await start();
  bridge.emitStatus(status('test'));
  bridge.emitNotice(notice('Kirim invoice'));
  r.runAll(120);
  expect(app.controller.phase).toBe('notify');
  expect(statusShown(root)).toBe(false);
  timers.advance(3640);
  r.runAll(600);
  expect(app.controller.phase).toBe('idle');
  expect(statusShown(root)).toBe(true);
  open(app, r);
  expect(statusShown(root)).toBe(false);
});

// Titipan (design 1 Nov).
const shelfInfo = (over = {}) => moduleInfo('shelf', {
  name: 'Titipan', shortName: 'Titipan', entry: null, card: null, status: true,
  action: { capability: 'shelf', method: 'open' }, ...over,
});
const SHELF_STATE: ModuleState = { ...TEST_STATE, pages: [BERANDA, P1], modules: [...TEST_STATE.modules, shelfInfo()] };
const kept = (n: number) => ({ items: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `f${i + 1}.txt`, folder: false, state: 'ready' as const, thumb: null })) });

async function startShelf(items = 0, state = SHELF_STATE) {
  const s = await start(state);
  s.bridge.emitShelf(kept(items));
  return s;
}

const onShelf = (root: HTMLElement) => root.querySelector('.sh') !== null;

test('the pill shows the shelf icon only while items are kept', async () => {
  const { bridge, pillIds } = await startShelf();
  expect(pillIds()).toEqual(['home', 'p1', 'modules']);
  bridge.emitShelf(kept(2));
  expect(pillIds()).toEqual(['home', 'p1', 'shelf', 'modules']);
  bridge.emitShelf(kept(0));
  expect(pillIds()).toEqual(['home', 'p1', 'modules']);
});

test('opening the panel with items shows the shelf', async () => {
  const { app, r, root, bridge } = await startShelf(2);
  open(app, r);
  expect(onShelf(root)).toBe(true);
  expect(root.querySelectorAll('.sh-tile')).toHaveLength(2);
  expect(bridge.shelf).toHaveBeenCalledWith(true);
  expect(bridge.setLastPage).not.toHaveBeenCalledWith('shelf');
});

test('the Modul tile opens the shelf', async () => {
  const { app, r, root, bridge, pick } = await startShelf();
  open(app, r);
  pick('modules');
  root.querySelector<HTMLElement>('.mods-tile[aria-label="Titipan"]')!.click();
  expect(app.controller.phase).toBe('open');
  expect(onShelf(root)).toBe(true);
  expect(root.querySelector('.sh-empty')).not.toBeNull();
  expect(bridge.moduleCall).not.toHaveBeenCalled();
});

test('a drop start opens the panel in drop mode', async () => {
  const { app, r, root, bridge } = await startShelf();
  bridge.emitShelfDrop({ phase: 'start' });
  expect(app.controller.phase).toBe('open');
  r.runAll(60);
  expect(root.querySelector('.sh-drop')).not.toBeNull();
  expect(bridge.shelfDropReady).toHaveBeenCalledTimes(1);
});

test('a drop start on an open panel switches to the drop zone at once', async () => {
  const { app, r, root, bridge } = await startShelf();
  open(app, r);
  bridge.emitShelfDrop({ phase: 'start' });
  expect(root.querySelector('.sh-drop')).not.toBeNull();
  expect(bridge.shelfDropReady).toHaveBeenCalledTimes(1);
  // Nothing dropped: back to the page it showed.
  bridge.emitShelfDrop({ phase: 'end', dropped: false });
  expect(app.controller.phase).toBe('open');
  expect(onShelf(root)).toBe(false);
  expect(root.querySelectorAll('iframe')).toHaveLength(3);
});

test('a drop end without a drop closes a panel the drag opened', async () => {
  const { app, r, bridge } = await startShelf();
  bridge.emitShelfDrop({ phase: 'start' });
  r.runAll(60);
  bridge.emitShelfDrop({ phase: 'end', dropped: false });
  expect(app.controller.phase).toBe('closing');
});

test('a drop end with a drop shows the shelf and closes when the pointer leaves', async () => {
  const { app, r, root, bridge } = await startShelf();
  bridge.emitShelfDrop({ phase: 'start' });
  r.runAll(60);
  bridge.emitShelf(kept(1));
  bridge.emitShelfDrop({ phase: 'end', dropped: true });
  expect(root.querySelector('.sh-drop')).toBeNull();
  expect(root.querySelectorAll('.sh-tile')).toHaveLength(1);
  bridge.emitPointer({ inside: true, x: 480, y: 20 });
  expect(app.controller.phase).toBe('open');
  bridge.emitPointer({ inside: false, x: 480, y: 300 });
  expect(app.controller.phase).toBe('closing');
});

test('a drag that leaves the panel closes it', async () => {
  const { app, r, bridge } = await startShelf(2);
  open(app, r);
  bridge.emitShelfDrag({ phase: 'left' });
  expect(app.controller.phase).toBe('closing');
});

test('the last item gone returns to the page before the shelf', async () => {
  const { app, r, root, bridge, pick } = await startShelf(1);
  open(app, r);
  expect(onShelf(root)).toBe(true);
  pick('p1');
  pick('shelf');
  expect(onShelf(root)).toBe(true);
  bridge.emitShelf(kept(0));
  expect(onShelf(root)).toBe(false);
  expect(root.querySelector('.notch-pill .ic.on')!.getAttribute('data-id')).toBe('p1');
});

test('the shelf module switched off removes the pill icon and leaves the shelf page', async () => {
  const { app, r, root, bridge, pillIds } = await startShelf(2);
  open(app, r);
  expect(onShelf(root)).toBe(true);
  bridge.emitModuleState({ ...SHELF_STATE, modules: [...TEST_STATE.modules, shelfInfo({ enabled: false })] });
  expect(onShelf(root)).toBe(false);
  expect(pillIds()).toEqual(['home', 'p1', 'modules']);
  // And a drop does nothing then.
  close(app, r);
  bridge.emitShelfDrop({ phase: 'start' });
  expect(app.controller.phase).not.toBe('open');
});

test('a drop start on a tall open shelf keeps the panel height', async () => {
  const { app, r, bridge } = await startShelf(13);
  open(app, r);
  const tall = app.controller.card.height;
  expect(tall).toBeGreaterThan(104);
  bridge.emitShelfDrop({ phase: 'start' });
  expect(app.controller.card.height).toBe(tall);
});

test('opening the shelf from the pill checks the files again', async () => {
  const { app, r, bridge, pick } = await startShelf(2);
  open(app, r);
  pick('p1');
  bridge.shelf.mockClear();
  pick('shelf');
  expect(bridge.shelf).toHaveBeenCalledWith(true);
});

// Screenshot (design 1 Nov §5, §6).
const shotInfo = (over = {}) => moduleInfo('screenshot', {
  name: 'Screenshot', shortName: 'Screenshot', entry: null, card: null,
  action: { capability: 'screenshot', method: 'open' }, ...over,
});
const SHOT_STATE: ModuleState = { ...SHELF_STATE, modules: [...SHELF_STATE.modules, shotInfo()] };
const shotDto = (id: number) => ({
  id, kind: 'window' as const, takenMs: Date.now(), width: 1440, height: 900, saved: false,
  image: `notchshot://localhost/${id}/current.png?v=0`, thumb: `notchshot://localhost/${id}/thumb.png?v=0`,
});
const onResult = (root: HTMLElement) => root.querySelector('.shot-res') !== null;
const onList = (root: HTMLElement) => root.querySelector('.shot-list') !== null;
const activeIcon = (root: HTMLElement) => root.querySelector('.notch-pill .ic.on')?.getAttribute('data-id');
const tick = () => new Promise(res => setTimeout(res, 0));

async function startShot(shelfItems = 0) {
  const s = await startShelf(shelfItems, SHOT_STATE);
  s.bridge.emitShots([shotDto(1)]);
  return s;
}

function taken(bridge: ReturnType<typeof fakeBridge>, id: number): void {
  bridge.emitShot({ phase: 'taken', id });
  bridge.emitShots([shotDto(id), shotDto(1)]);
}

function openList(s: Awaited<ReturnType<typeof startShot>>): void {
  open(s.app, s.r);
  s.pick('modules');
  s.root.querySelector<HTMLElement>('.mods-tile[aria-label="Screenshot"]')!.click();
}

test('a screenshot taken while closed opens the panel on its result', async () => {
  const { app, r, root, bridge } = await startShot(2);
  taken(bridge, 2);
  expect(app.controller.phase).toBe('open');
  r.runAll(60);
  expect(onResult(root)).toBe(true);
  // Kept files do not take its place.
  expect(onShelf(root)).toBe(false);
  expect(root.querySelector('.shot-pic img')!.getAttribute('src')).toBe('notchshot://localhost/2/current.png?v=0');
  expect(app.controller.card).toEqual({ width: 420, height: 172 });
  expect(bridge.setLastPage).not.toHaveBeenCalledWith('screenshot');
});

test('a screenshot taken while open switches the page', async () => {
  const { app, r, root, bridge } = await startShot();
  open(app, r);
  expect(onResult(root)).toBe(false);
  taken(bridge, 2);
  expect(onResult(root)).toBe(true);
  taken(bridge, 3);
  expect(root.querySelector('.shot-pic img')!.getAttribute('src')).toBe('notchshot://localhost/3/current.png?v=0');
});

test('a result whose list has not come yet asks for it', async () => {
  const { app, r, root, bridge } = await startShot();
  bridge.shotList.mockResolvedValue([shotDto(5), shotDto(1)]);
  bridge.emitShot({ phase: 'taken', id: 5 });
  expect(bridge.shotList).toHaveBeenCalled();
  await tick();
  r.runAll(60);
  expect(app.controller.phase).toBe('open');
  expect(root.querySelector('.shot-pic img')!.getAttribute('src')).toBe('notchshot://localhost/5/current.png?v=0');
});

test('closing the result goes back to the last page for the next open', async () => {
  const { app, r, root, bridge } = await startShot();
  taken(bridge, 2);
  r.runAll(60);
  close(app, r);
  open(app, r);
  expect(onResult(root)).toBe(false);
  expect(root.querySelectorAll('iframe')).toHaveLength(3);
});

test('the Screenshot tile opens the list without a core call', async () => {
  const s = await startShot();
  openList(s);
  expect(s.app.controller.phase).toBe('open');
  expect(onList(s.root)).toBe(true);
  expect(s.root.querySelectorAll('.shot-tile')).toHaveLength(1);
  expect(s.bridge.moduleCall).not.toHaveBeenCalled();
  expect(s.app.controller.card.width).toBe(560);
  // Its back bar returns to the Modul page.
  s.root.querySelector<HTMLElement>('.shot-head button')!.click();
  expect(s.root.querySelector('.mods-grid')).not.toBeNull();
});

test('the list lights the Modul icon; the result keeps the rule of other non-custom pages', async () => {
  const s = await startShot();
  openList(s);
  expect(activeIcon(s.root)).toBe('modules');
  taken(s.bridge, 2);
  expect(onResult(s.root)).toBe(true);
  expect(activeIcon(s.root)).toBe('modules');
  // Neither adds an icon of its own.
  expect(s.pillIds()).toEqual(['home', 'p1', 'modules']);
});

test('a notice on the list makes the panel taller', async () => {
  const s = await startShot();
  s.bridge.shotPermission.mockResolvedValue(false);
  openList(s);
  const before = s.app.controller.card.height;
  await tick();
  expect(s.app.controller.card.height).toBe(before + 24);
});

test('a screenshot notice opens the list, even with kept files', async () => {
  const { app, r, root, bridge } = await startShot(2);
  bridge.emitNotice(notice('⌘⇧3 masih dipakai Mac', 'screenshot', 'keys'));
  clickNotice(app, r);
  expect(onList(root)).toBe(true);
  expect(onShelf(root)).toBe(false);
});

test('Layar closes the panel and takes the screen once it is closed', async () => {
  const s = await startShot();
  openList(s);
  s.root.querySelector<HTMLElement>('.shot-take button')!.click();
  expect(s.app.controller.phase).toBe('closing');
  await tick();
  expect(s.bridge.shotTakeScreen).not.toHaveBeenCalled();
  s.r.runAll(600);
  expect(s.app.controller.phase).toBe('idle');
  await tick();
  expect(s.bridge.shotTakeScreen).toHaveBeenCalledTimes(1);
});

test('a gone event for the shown result closes the panel', async () => {
  const { app, r, bridge } = await startShot();
  taken(bridge, 2);
  r.runAll(60);
  bridge.emitShot({ phase: 'gone', id: 1 });
  expect(app.controller.phase).toBe('open');
  bridge.emitShot({ phase: 'gone', id: 2 });
  expect(app.controller.phase).toBe('closing');
});

test('a screenshot dragged out of the panel closes it', async () => {
  const { app, r, bridge } = await startShot();
  taken(bridge, 2);
  r.runAll(60);
  bridge.emitShotDrag({ phase: 'left' });
  expect(app.controller.phase).toBe('closing');
});

test('a module change keeps the screenshot page while the module is on', async () => {
  const { r, root, bridge } = await startShot();
  taken(bridge, 2);
  r.runAll(60);
  bridge.emitModuleState({ ...SHOT_STATE, missed: ['home.reminder'] });
  expect(onResult(root)).toBe(true);
  bridge.emitModuleState({ ...SHOT_STATE, modules: [...SHELF_STATE.modules, shotInfo({ enabled: false })] });
  expect(onResult(root)).toBe(false);
});
