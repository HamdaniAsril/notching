// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ModuleState } from '../../modules/types';
import { homeWidgets, moduleInfo, TEST_STATE, timers } from '../../notch/test-helpers';
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
  click(root, 'module.home.uninstall');
  expect(root.querySelector('[data-key="module.home.uninstall"]')!.textContent).toBe('Yakin? Klik lagi');
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
