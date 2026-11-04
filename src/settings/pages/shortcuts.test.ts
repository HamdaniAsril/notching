// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ModuleState } from '../../modules/types';
import { moduleInfo, TEST_STATE } from '../../notch/test-helpers';
import { appKeys, mountForTest, settle } from '../test-helpers';

const tool = (id: string, name: string, category: 'files' | 'window') =>
  moduleInfo(id, { name, entry: null, card: null, tool: true, permissions: ['accessibility'], category });
const STATE: ModuleState = {
  ...TEST_STATE,
  modules: [
    ...TEST_STATE.modules,
    moduleInfo('keep-awake', { name: 'Keep awake', category: 'energy' }),
    moduleInfo('screenshot', { name: 'Screenshot', entry: null, card: null, action: { capability: 'shot', method: 'open' } }),
    tool('cut-files', 'Potong file', 'files'),
    tool('window-keys', 'Atur jendela', 'window'),
  ],
};

const press = (init: KeyboardEventInit) => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
const cap = (root: HTMLElement, key: string) => root.querySelector<HTMLElement>(`[data-key="${key}"]`)!;
const hint = (root: HTMLElement, key: string) => root.querySelector(`[data-row="${key}"] small`)?.textContent;

async function onShortcuts(state = STATE, keys = appKeys()) {
  const t = await mountForTest(state);
  t.bridge.appKeys.mockResolvedValue(keys);
  t.app.go({ page: 'shortcuts' });
  await settle();
  return t;
}

test('Pintasan holds the app keys, Screenshot\'s two and the background tools', async () => {
  const { root } = await onShortcuts();
  expect(root.querySelector('.pane h1')!.textContent).toBe('Pintasan');
  expect(root.querySelector('.nav.on .label')!.textContent).toBe('Pintasan');
  expect(cap(root, 'shortcuts.awake').textContent).toBe('⌃⌥K');
  expect(cap(root, 'shortcuts.shelf').textContent).toBe('⌃⌥V');
  expect(root.querySelector('[data-key="module.screenshot.key.screen"]')).not.toBeNull();
  const labels = [...root.querySelectorAll('.pane .grp-label')].map(e => e.textContent);
  expect(labels).toEqual(['Modul', 'Screenshot', 'Alat latar']);
  expect([...root.querySelectorAll('.pane .module .label')].map(e => e.textContent)).toEqual(['Potong file', 'Atur jendela']);
});

test('a tool opens its page from Pintasan and goes back there', async () => {
  const { root, app } = await onShortcuts();
  cap(root, 'module.window-keys').click();
  expect(app.route).toEqual({ page: 'module', id: 'window-keys' });
  expect(root.querySelector('.nav.on .label')!.textContent).toBe('Pintasan');
  expect(root.querySelector('[data-key="module.back"]')!.textContent).toBe('Pintasan');
  cap(root, 'module.back').click();
  expect(app.route).toEqual({ page: 'shortcuts' });
});

test('a key is recorded by clicking it and pressing new ones', async () => {
  const { root, bridge } = await onShortcuts();
  bridge.appSetKey.mockResolvedValue(appKeys({}, { awake: '⌘⇧K' }));
  cap(root, 'shortcuts.awake').click();
  expect(cap(root, 'shortcuts.awake').textContent).toBe('Tekan tombol…');
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(true);
  press({ key: 'K', code: 'KeyK', metaKey: true, shiftKey: true });
  expect(bridge.appSetKey).toHaveBeenCalledWith('awake', { code: 'KeyK', cmd: true, ctrl: false, alt: false, shift: true });
  await settle();
  expect(cap(root, 'shortcuts.awake').textContent).toBe('⌘⇧K');
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(false);
  // Changed, so the way back shows.
  cap(root, 'shortcuts.reset').click();
  await settle();
  expect(bridge.appResetKeys).toHaveBeenCalledTimes(1);
});

test('a refused key says who holds it and keeps listening', async () => {
  const { root, bridge } = await onShortcuts();
  bridge.appSetKey.mockRejectedValue({ kind: 'window' });
  cap(root, 'shortcuts.shelf').click();
  press({ key: 'Q', code: 'KeyQ', ctrlKey: true, altKey: true });
  await settle();
  expect(hint(root, 'shortcuts.shelf')).toBe('Dipakai Atur jendela');
  expect(cap(root, 'shortcuts.shelf').textContent).toBe('Tekan tombol…');
  bridge.appSetKey.mockRejectedValue({ kind: 'duplicate', action: 'awake' });
  press({ key: 'K', code: 'KeyK', ctrlKey: true, altKey: true });
  await settle();
  expect(hint(root, 'shortcuts.shelf')).toBe('Sudah dipakai untuk Nyalakan atau matikan Keep awake');
});

test('a key whose module is off says where to turn it on; one another app holds says so', async () => {
  const { root } = await onShortcuts(STATE, appKeys({ shelf: 'off', awake: 'other' }));
  expect(hint(root, 'shortcuts.shelf')).toBe('Shelf sedang mati. Nyalakan di Modul supaya tombolnya bekerja.');
  expect(hint(root, 'shortcuts.awake')).toBe('Dipakai app lain');
});
