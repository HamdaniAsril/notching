// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { type App, startApp } from './app';
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
