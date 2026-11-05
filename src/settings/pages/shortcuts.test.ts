// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { DEFAULT_PEEK, type ModuleState } from '../../modules/types';
import { moduleInfo, TEST_STATE } from '../../notch/test-helpers';
import { appKeys, mountForTest, settle, TEST_INFO } from '../test-helpers';

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

test('Atur jendela folds open in place with its key grid', async () => {
  const { root, app } = await onShortcuts();
  const head = cap(root, 'module.window-keys');
  head.click();
  await settle();
  expect(app.route).toEqual({ page: 'shortcuts' });
  const body = head.nextElementSibling as HTMLElement;
  expect(body.hidden).toBe(false);
  expect(body.querySelectorAll('.win-row .keycap')).toHaveLength(10);
  expect(body.querySelectorAll('.win-row .win-pos svg')).toHaveLength(10);
  expect(body.querySelector('[data-row="tool.window-keys.access"]')).not.toBeNull();
});

test('a tool\'s own page, reached another way, goes back to Pintasan', async () => {
  const { root, app } = await onShortcuts();
  app.go({ page: 'module', id: 'window-keys' });
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

test('Potong file folds open in place, with its permission and keys, instead of opening a page', async () => {
  const { root, app } = await onShortcuts();
  const head = cap(root, 'module.cut-files');
  const body = head.nextElementSibling as HTMLElement;
  expect(body.hidden).toBe(true);
  head.click();
  expect(app.route).toEqual({ page: 'shortcuts' });
  expect(body.hidden).toBe(false);
  expect(head.getAttribute('aria-expanded')).toBe('true');
  expect(body.querySelector('[data-row="tool.cut-files.access"]')).not.toBeNull();
  expect([...body.querySelectorAll('.keycap')].map(e => e.textContent)).toEqual(['⌘X', '⌘V']);
  // Its switch does not fold it.
  cap(root, 'module.cut-files.on').click();
  expect(body.hidden).toBe(false);
  head.click();
  expect(body.hidden).toBe(true);
});

const PEEK = moduleInfo('window-peek', {
  name: 'Intip jendela', entry: null, card: null, tool: true, permissions: ['accessibility', 'screen-recording'], category: 'window',
});
const WITH_PEEK: ModuleState = { ...STATE, modules: [...STATE.modules, PEEK] };

async function peekFold(state = WITH_PEEK, info = TEST_INFO) {
  const t = await mountForTest(state, info);
  t.bridge.appKeys.mockResolvedValue(appKeys());
  t.app.go({ page: 'shortcuts' });
  await settle();
  cap(t.root, 'module.window-peek').click();
  await settle();
  return { ...t, body: cap(t.root, 'module.window-peek').nextElementSibling as HTMLElement };
}
const option = (root: HTMLElement, row: string, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>(`[data-row="${row}"] button`)].find(b => b.textContent === label)!;

test('Intip jendela folds open with its two permissions and every setting, in order', async () => {
  const { body } = await peekFold();
  expect(body.hidden).toBe(false);
  expect([...body.querySelectorAll<HTMLElement>('[data-row]')].map(r => r.dataset.row)).toEqual([
    'tool.window-peek.access', 'tool.window-peek.screen', 'peek.dock', 'peek.dockClick', 'peek.dockHint',
    'peek.card', 'peek.material', 'peek.minimized',
  ]);
  expect(body.querySelector('[data-row="peek.material"]')!.textContent).toContain('Liquid glass');
  expect(body.querySelector('[data-row="tool.window-peek.screen"]')!.textContent).toContain('Perekaman Layar');
});

test('the Dock tip shows only while macOS keeps minimized windows out of their icon', async () => {
  const { body } = await peekFold(WITH_PEEK, { ...TEST_INFO, dockMinimizeToApp: true });
  expect(body.querySelector('[data-row="peek.dockHint"]')).toBeNull();
  const tipped = await peekFold();
  tipped.body.querySelector<HTMLElement>('[data-key="peek.dockSettings"]')!.click();
  expect(tipped.bridge.openDockSettings).toHaveBeenCalledTimes(1);
});

test('a choice saves the whole settings with one field changed', async () => {
  const { root, bridge } = await peekFold();
  option(root, 'peek.material', 'Liquid glass').click();
  expect(bridge.setPeekSettings).toHaveBeenCalledWith({ ...DEFAULT_PEEK, material: 'glass' });
  root.querySelector<HTMLElement>('[data-key="peek.minimized"]')!.click();
  expect(bridge.setPeekSettings).toHaveBeenLastCalledWith({ ...DEFAULT_PEEK, minimized: false });
});

test("macOS's own Dock click needs no tip", async () => {
  const { root, bridge } = await peekFold();
  option(root, 'peek.dockClick', 'Bawaan macOS').click();
  expect(bridge.setPeekSettings).toHaveBeenCalledWith({ ...DEFAULT_PEEK, dockClick: 'mac' });
  bridge.emitModuleState({ ...WITH_PEEK, peek: { ...DEFAULT_PEEK, dockClick: 'mac' } });
  await settle();
  expect(root.querySelector('[data-row="peek.dockHint"]')).toBeNull();
});

test('Intip jendela in English', async () => {
  const { body } = await peekFold({ ...WITH_PEEK, lang: 'en' });
  expect(body.textContent).toContain('Card colour');
  expect(body.textContent).toContain('Peek from the Dock');
});
