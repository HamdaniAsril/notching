// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ModuleState } from '../../modules/types';
import { homeWidgets, moduleInfo, TEST_STATE, timers } from '../../notch/test-helpers';
import { shotKeys } from '../../shot/test-helpers';
import { h1, mountForTest, settle } from '../test-helpers';

const STATE: ModuleState = {
  ...TEST_STATE,
  modules: [
    moduleInfo('home', { name: 'Beranda', description: 'Tanggal, cuaca, sholat, reminder', size: 136 * 1024 }),
    moduleInfo('system-stat', { name: 'System stat', description: 'CPU, memori, jaringan', size: 140 * 1024 }),
  ],
};
const without = (id: string): ModuleState => ({
  ...STATE, modules: STATE.modules.map(m => (m.id === id ? { ...m, installed: false, enabled: false } : m)),
});
const click = (root: HTMLElement, key: string) => root.querySelector<HTMLElement>(`[data-key="${key}"]`)!.click();

test('lists installed modules in order, with size and switch', async () => {
  const { root, app } = await mountForTest(STATE);
  app.go({ page: 'modules' });
  expect([...root.querySelectorAll('.module .label')].map(e => e.textContent)).toEqual(['Beranda', 'System stat']);
  expect(root.querySelector('.pane')!.textContent).toContain('136 KB');
  expect(root.querySelector('.pane')!.textContent).toContain('140 KB');
  expect(root.querySelector('.head .sub')!.textContent).toBe('2 terpasang · 276 KB');
});

test('a module whose tile runs an action is listed like the others', async () => {
  const clean = moduleInfo('keyboard-clean', { name: 'Keyboard Cleaning Mode', entry: null, card: null,
    action: { capability: 'keyclean', method: 'toggle' } });
  const { root, app } = await mountForTest({ ...STATE, modules: [...STATE.modules, clean] });
  app.go({ page: 'modules' });
  expect([...root.querySelectorAll('.module .label')].map(e => e.textContent)).toEqual(['Beranda', 'System stat', 'Keyboard Cleaning Mode']);
});

test('switching a module off asks the bridge', async () => {
  const { root, app, bridge } = await mountForTest(STATE);
  app.go({ page: 'modules' });
  click(root, 'module.home.on');
  expect(bridge.setModuleEnabled).toHaveBeenCalledWith('home', false);
});

test('a row opens its module page; its switch does not', async () => {
  const { root, app } = await mountForTest(STATE);
  app.go({ page: 'modules' });
  click(root, 'module.home.on');
  expect(app.route).toEqual({ page: 'modules' });
  click(root, 'module.home');
  expect(h1(root)).toBe('Beranda');
  expect(root.querySelector('.pane')!.textContent).toContain('Versi 1.0.0 · 136 KB');
  click(root, 'module.back');
  click(root, 'module.system-stat');
  expect(root.querySelector('.pane')!.textContent).toContain('Modul ini belum punya pengaturan.');
});

test('uninstalling asks once more, then returns to the list', async () => {
  const { root, app, bridge } = await mountForTest(STATE);
  app.go({ page: 'module', id: 'home' });
  const uninstall = root.querySelector('[data-key="module.home.uninstall"]')!;
  expect(uninstall.className).toBe('btn danger');
  click(root, 'module.home.uninstall');
  expect(root.querySelector('[data-key="module.home.uninstall"]')!.textContent).toBe('Yakin? Klik lagi');
  expect(uninstall.className).toBe('btn danger confirm');
  expect(bridge.uninstallModule).not.toHaveBeenCalled();
  click(root, 'module.home.uninstall');
  expect(bridge.uninstallModule).toHaveBeenCalledWith('home');
  await settle();
  expect(app.route).toEqual({ page: 'modules' });
});

test('the confirmation wears off', async () => {
  const { root, app, bridge } = await mountForTest(STATE);
  app.go({ page: 'module', id: 'home' });
  click(root, 'module.home.uninstall');
  timers.advance(4000);
  expect(root.querySelector('[data-key="module.home.uninstall"]')!.textContent).toBe('Copot modul');
  click(root, 'module.home.uninstall');
  expect(bridge.uninstallModule).not.toHaveBeenCalled();
});

test('a module page whose module is gone falls back to the list', async () => {
  const { root, app, bridge } = await mountForTest(STATE);
  app.go({ page: 'module', id: 'home' });
  bridge.emitModuleState(without('home'));
  expect(h1(root)).toBe('Modul');
});

test('Add module lists uninstalled built-ins and adds them back', async () => {
  const { root, app, bridge } = await mountForTest(without('home'));
  app.go({ page: 'modules' });
  click(root, 'modules.add');
  expect(h1(root)).toBe('Tambah modul');
  expect([...root.querySelectorAll('.module .label')].map(e => e.textContent)).toEqual(['Beranda']);
  click(root, 'add.home');
  expect(bridge.reinstallModule).toHaveBeenCalledWith('home');
  await settle();
  expect(app.route).toEqual({ page: 'modules' });
});

test('Add module with nothing to add says so', async () => {
  const { root, app } = await mountForTest(STATE);
  app.go({ page: 'add' });
  expect(root.querySelector('.pane')!.textContent).toContain('Semua modul bawaan sudah terpasang.');
});

test('a search for a module name opens its page', async () => {
  const { root } = await mountForTest(STATE);
  const input = root.querySelector<HTMLInputElement>('input.search')!;
  input.value = 'system';
  input.dispatchEvent(new Event('input'));
  root.querySelector<HTMLElement>('.result')!.click();
  expect(h1(root)).toBe('System stat');
});

test('module icons are masks, never markup', async () => {
  const state = { ...STATE, modules: [moduleInfo('home', { name: 'Beranda', iconSvg: '<svg onload="x()"/>' })] };
  const { root, app } = await mountForTest(state);
  app.go({ page: 'modules' });
  expect(root.querySelector('[onload]')).toBeNull();
  const glyph = root.querySelector<HTMLElement>('.module .glyph')!;
  expect(glyph.style.getPropertyValue('--icon')).toContain('data:image/svg+xml,');
});

test('the widget package is not listed as a module', async () => {
  const { root, app } = await mountForTest({ ...STATE, modules: [homeWidgets(), STATE.modules[1]] });
  app.go({ page: 'modules' });
  expect([...root.querySelectorAll('.module .label')].map(e => e.textContent)).toEqual(['System stat']);
  expect(root.querySelector('.head .sub')!.textContent).toBe('1 terpasang · 140 KB');
  app.go({ page: 'add' });
  expect(root.querySelector('.module')).toBeNull();
});

test('a module with a status gets a status switch', async () => {
  const timer = moduleInfo('timer', { name: 'Timer', status: true, statusShown: true });
  const { root, app, bridge } = await mountForTest({ ...STATE, modules: [...STATE.modules, timer] });
  app.go({ page: 'module', id: 'timer' });
  const row = root.querySelector<HTMLElement>('[data-row="module.timer.status"]')!;
  expect(row.textContent).toContain('Status di samping notch');
  expect(row.textContent).toContain('Tampil saat panel tertutup.');
  click(root, 'module.timer.status');
  expect(bridge.setStatusShown).toHaveBeenCalledWith('timer', false);
  app.go({ page: 'module', id: 'system-stat' });
  expect(root.querySelector('[data-key="module.system-stat.status"]')).toBeNull();
});

const SHOT = moduleInfo('screenshot', { name: 'Screenshot', description: 'Layar, window, area', entry: null, card: null,
  action: { capability: 'screenshot', method: 'open' }, permissions: ['screen-recording'] });
const WITH_SHOT: ModuleState = { ...STATE, modules: [...STATE.modules, SHOT] };
const notice = (root: HTMLElement) => root.querySelector<HTMLElement>('.shot-keys');

test('screenshot page shows the Mac key notice with the System Settings button', async () => {
  const { root, app, bridge } = await mountForTest(WITH_SHOT);
  bridge.shotKeys.mockResolvedValue(shotKeys('mac', 'mac'));
  app.go({ page: 'module', id: 'screenshot' });
  await settle();
  expect(notice(root)!.textContent).toContain('⌘⇧3 dan ⌘⇧4 masih dipakai screenshot bawaan Mac');
  const open = root.querySelector<HTMLElement>('[data-key="module.screenshot.keys"]')!;
  expect(open.textContent).toBe('Buka Pengaturan Sistem');
  open.click();
  expect(bridge.openKeyboardShortcuts).toHaveBeenCalledTimes(1);
  expect(root.querySelector('.pane')!.textContent).not.toContain('Modul ini belum punya pengaturan.');
});

test('a key held by another app has its line and no button', async () => {
  const { root, app, bridge } = await mountForTest(WITH_SHOT);
  bridge.shotKeys.mockResolvedValue(shotKeys('ok', 'other'));
  app.go({ page: 'module', id: 'screenshot' });
  await settle();
  expect(notice(root)!.textContent).toBe('⌘⇧4 dipakai app lain');
  expect(root.querySelector('[data-key="module.screenshot.keys"]')).toBeNull();
});

test('the Mac line comes first, then the other app line', async () => {
  const { root, app, bridge } = await mountForTest(WITH_SHOT);
  bridge.shotKeys.mockResolvedValue(shotKeys('mac', 'other'));
  app.go({ page: 'module', id: 'screenshot' });
  await settle();
  expect([...root.querySelectorAll('.shot-keys .note')].map(p => p.textContent)).toEqual([
    '⌘⇧3 masih dipakai screenshot bawaan Mac', '⌘⇧4 dipakai app lain',
  ]);
});

test('keys that are ours, or a module that is off, show no notice', async () => {
  const { root, app, bridge } = await mountForTest(WITH_SHOT);
  app.go({ page: 'module', id: 'screenshot' });
  await settle();
  expect(bridge.shotKeys).toHaveBeenCalled();
  expect(notice(root)!.textContent).toBe('');
  bridge.shotKeys.mockResolvedValue(shotKeys('off', 'off'));
  app.go({ page: 'modules' });
  app.go({ page: 'module', id: 'screenshot' });
  await settle();
  expect(notice(root)!.textContent).toBe('');
});

test('the notice follows the language', async () => {
  const { root, app, bridge } = await mountForTest({ ...WITH_SHOT, lang: 'en' });
  bridge.shotKeys.mockResolvedValue(shotKeys('other', 'other'));
  app.go({ page: 'module', id: 'screenshot' });
  await settle();
  expect(notice(root)!.textContent).toBe('⌘⇧3 and ⌘⇧4 are taken by another app');
});

test('a failed key query shows no notice', async () => {
  const { root, app, bridge } = await mountForTest(WITH_SHOT);
  bridge.shotKeys.mockRejectedValue(new Error('no'));
  app.go({ page: 'module', id: 'screenshot' });
  await settle();
  expect(notice(root)!.textContent).toBe('');
});

test('no status switch for screenshot', async () => {
  const { root, app } = await mountForTest(WITH_SHOT);
  app.go({ page: 'module', id: 'screenshot' });
  await settle();
  expect(root.querySelector('[data-key="module.screenshot.status"]')).toBeNull();
  expect(root.querySelector('[data-key="module.screenshot.on"]')).not.toBeNull();
});

const CLEANER = moduleInfo('cleaner', { name: 'Cleaner', description: 'Bersihkan cache', entry: null, card: null,
  action: { capability: 'cleaner', method: 'open' }, permissions: ['full-disk-access'] });
const WITH_CLEANER: ModuleState = { ...STATE, modules: [...STATE.modules, CLEANER] };

test('cleaner page lists exclusions and removes one', async () => {
  const { root, app, bridge } = await mountForTest(WITH_CLEANER);
  bridge.cleanerExclusions.mockResolvedValue({ home: '/Users/a', paths: ['/Users/a/Library/Caches/com.x.y', '/Users/a/Library/Logs/z'] });
  app.go({ page: 'module', id: 'cleaner' });
  await settle();
  const rows = [...root.querySelectorAll('.cl-ex .label')].map(r => r.textContent);
  expect(rows).toEqual(['~/Library/Caches/com.x.y', '~/Library/Logs/z']);
  bridge.cleanerExclusions.mockResolvedValue({ home: '/Users/a', paths: ['/Users/a/Library/Logs/z'] });
  root.querySelector<HTMLElement>('[data-key="module.cleaner.unexclude.0"]')!.click();
  await settle();
  expect(bridge.cleanerUnexclude).toHaveBeenCalledWith('/Users/a/Library/Caches/com.x.y');
  expect([...root.querySelectorAll('.cl-ex .label')].map(r => r.textContent)).toEqual(['~/Library/Logs/z']);
});

test('cleaner page says when the list is empty', async () => {
  const { root, app } = await mountForTest(WITH_CLEANER);
  app.go({ page: 'module', id: 'cleaner' });
  await settle();
  expect(root.querySelector('.cl-ex')!.textContent).toContain('Belum ada yang dikecualikan.');
});

test('cleaner page shows the unreadable-list line', async () => {
  const { root, app, bridge } = await mountForTest(WITH_CLEANER);
  bridge.cleanerExclusions.mockRejectedValue('exclusions');
  app.go({ page: 'module', id: 'cleaner' });
  await settle();
  expect(root.querySelector('.cl-ex')!.textContent).toContain('Daftar pengecualian tidak bisa dibaca');
});

test('open log button', async () => {
  const { root, app, bridge } = await mountForTest(WITH_CLEANER);
  app.go({ page: 'module', id: 'cleaner' });
  await settle();
  root.querySelector<HTMLElement>('[data-key="module.cleaner.log"]')!.click();
  expect(bridge.cleanerOpenLog).toHaveBeenCalled();
});
