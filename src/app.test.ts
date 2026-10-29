// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { type App, startApp } from './app';
import type { Notice } from './bridge';
import type { ModuleState } from './modules/types';
import { DEFAULT_CONFIG } from './notch/config';
import { fakeBridge, fakeRaf, moduleInfo, TEST_STATE, timers } from './notch/test-helpers';

afterEach(() => { document.body.innerHTML = ''; document.documentElement.lang = ''; });

async function start(state: ModuleState = TEST_STATE) {
  const root = document.createElement('div');
  document.body.append(root);
  const bridge = fakeBridge(state);
  const r = fakeRaf();
  const app = await startApp(root, bridge, { raf: r.raf, caf: r.caf, setTimer: timers.setTimer });
  const frame = () => root.querySelector('iframe');
  const pillIds = () => [...root.querySelectorAll<HTMLElement>('.notch-pill .ic[data-id]')].map(e => e.dataset.id);
  return { root, bridge, r, app, frame, pillIds };
}

function open(app: App, r: ReturnType<typeof fakeRaf>): void {
  app.controller.click();
  app.view.kick();
  r.runAll(600);
  timers.advance(1000);
  r.runAll(600);
}

test('the pill shows modules that are on, in order', async () => {
  const { pillIds } = await start();
  expect(pillIds()).toEqual(['home', 'system-stat']);
});

test('opens the last card', async () => {
  const { app, r, frame } = await start({ ...TEST_STATE, lastCard: 'system-stat' });
  open(app, r);
  expect(frame()!.getAttribute('src')).toContain('system-stat');
  expect(app.controller.panelSize().w).toBe(400);
});

test('picking a module switches the card and remembers it', async () => {
  const { root, app, r, bridge, frame } = await start({ ...TEST_STATE, lastCard: 'system-stat' });
  open(app, r);
  root.querySelector<HTMLElement>('.notch-pill .ic[data-id="home"]')!.click();
  expect(bridge.setLastCard).toHaveBeenCalledWith('home');
  expect(frame()!.getAttribute('src')).toContain('home');
  expect(app.controller.panelSize().w).toBe(540);
  expect(root.querySelector('.notch-pill .on')!.getAttribute('data-id')).toBe('home');
});

test('a module switched off while open gives way to the next one', async () => {
  const { app, r, bridge, frame, pillIds } = await start({ ...TEST_STATE, lastCard: 'system-stat' });
  open(app, r);
  bridge.emitModuleState({ ...TEST_STATE, lastCard: 'system-stat',
    modules: [moduleInfo('home'), moduleInfo('system-stat', { enabled: false })] });
  expect(frame()!.getAttribute('src')).toContain('home');
  expect(pillIds()).toEqual(['home']);
});

test('a card picked on another screen opens here next time', async () => {
  const { app, r, bridge, frame } = await start({ ...TEST_STATE, lastCard: 'system-stat' });
  bridge.emitModuleState({ ...TEST_STATE, lastCard: 'home' });
  open(app, r);
  expect(frame()!.getAttribute('src')).toContain('home');
});

test('every module off shows the empty card', async () => {
  const off = { ...TEST_STATE, modules: TEST_STATE.modules.map(m => ({ ...m, enabled: false })) };
  const { root, app, r } = await start(off);
  open(app, r);
  expect(root.textContent).toContain('Semua modul mati.');
  expect(app.controller.panelSize().w).toBe(360);
});

test('Escape from inside the module closes the panel', async () => {
  const { app, r, frame } = await start();
  open(app, r);
  const view = document.defaultView!;
  view.dispatchEvent(new view.MessageEvent('message', {
    data: { type: 'notching:key', key: 'Escape' }, source: frame()!.contentWindow,
  }));
  expect(app.controller.phase).toBe('closing');
});

test('the frame goes away once the panel has closed', async () => {
  const { app, r, frame } = await start();
  open(app, r);
  expect(frame()).not.toBeNull();
  app.controller.escape();
  app.view.kick();
  r.runAll(600);
  expect(app.controller.phase).toBe('idle');
  expect(frame()).toBeNull();
});

test('a language change reloads the frame in the new language', async () => {
  const { root, app, r, bridge, frame } = await start();
  open(app, r);
  const before = frame();
  bridge.emitModuleState({ ...TEST_STATE, lang: 'en' });
  const after = frame()!;
  expect(after).not.toBe(before);
  const posted: unknown[] = [];
  after.contentWindow!.postMessage = ((m: unknown) => { posted.push(m); }) as Window['postMessage'];
  after.dispatchEvent(new Event('load'));
  expect(posted).toContainEqual({ type: 'notching:init', moduleId: 'home', lang: 'en' });
  expect(root.querySelector('.notch-pill .ic:not([data-id])')!.getAttribute('aria-label')).toBe('Settings');
  expect(document.documentElement.lang).toBe('en');
});

test('a hidden overlay drops its frame even with no animation frames', async () => {
  // A parked overlay (its screen went away) is ordered out: no rAF, so its close
  // animation never finishes, but the module must not keep running.
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

const notice = (title: string, moduleId: string | null = 'home'): Notice =>
  ({ moduleId, title, detail: '14.00', glow: true, seconds: 3.5 });
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
  app.controller.escape();
  app.view.kick();
  r.runAll(600);
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

test('clicking a notice opens its module card', async () => {
  const { app, bridge, r, frame } = await start({ ...TEST_STATE, lastCard: 'system-stat' });
  bridge.emitNotice(notice('Kirim invoice'));
  r.runAll(30);
  app.controller.click();
  app.view.kick();
  r.runAll(600);
  timers.advance(1000);
  expect(frame()!.getAttribute('src')).toContain('home');
  expect(bridge.setLastCard).toHaveBeenCalledWith('home');
});

test('a notice from a module that is off opens the usual card', async () => {
  const off = { ...TEST_STATE, lastCard: 'system-stat',
    modules: [moduleInfo('home', { enabled: false }), moduleInfo('system-stat')] };
  const { root, app, bridge, r, frame } = await start(off);
  bridge.emitNotice(notice('Kirim invoice'));
  r.runAll(30);
  expect(earText(root)).toContain('Kirim invoice');
  expect(root.querySelector('.ear.l .glyph')).toBeNull();
  app.controller.click();
  app.view.kick();
  r.runAll(600);
  expect(frame()!.getAttribute('src')).toContain('system-stat');
});

test('the missed dots stay while the panel is open and go when it closes', async () => {
  const { root, app, bridge, r } = await start({ ...TEST_STATE, missed: ['home'] });
  expect(root.querySelector('.notch-pill .ic[data-id="home"].missed')).not.toBeNull();
  open(app, r);
  // The pill only shows once the panel is open, so the dot must still be there.
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

