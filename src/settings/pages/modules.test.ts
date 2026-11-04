// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { ShotKeys } from '../../bridge';
import type { ModuleState } from '../../modules/types';
import { homeWidgets, moduleInfo, TEST_STATE, timers } from '../../notch/test-helpers';
import { shotKeys } from '../../shot/test-helpers';
import { windowKeys } from '../test-helpers';
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
const keyRow = (root: HTMLElement, which: 'screen' | 'pick') => root.querySelector<HTMLElement>(`[data-row="module.screenshot.key.${which}"]`)!;
const keyCap = (root: HTMLElement, which: 'screen' | 'pick') => root.querySelector<HTMLElement>(`[data-key="module.screenshot.key.${which}"]`)!;
const hint = (root: HTMLElement, which: 'screen' | 'pick') => keyRow(root, which).querySelector('small')?.textContent ?? '';
const press = (init: KeyboardEventInit) => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

async function onShotPage(keys = shotKeys(), lang: 'id' | 'en' = 'id') {
  const t = await mountForTest({ ...WITH_SHOT, lang });
  t.bridge.shotKeys.mockResolvedValue(keys);
  t.app.go({ page: 'module', id: 'screenshot' });
  await settle();
  return t;
}

test('screenshot page lists both keys with their labels', async () => {
  const { root } = await onShotPage();
  expect(root.querySelector('.shot-keys .grp-label')!.textContent).toBe('Tombol');
  expect(keyRow(root, 'screen').querySelector('.label')!.textContent).toBe('Seluruh layar');
  expect(keyRow(root, 'pick').querySelector('.label')!.textContent).toBe('Window atau area');
  expect(keyCap(root, 'screen').textContent).toBe('⌘⇧3');
  expect(keyCap(root, 'pick').textContent).toBe('⌘⇧4');
  expect(hint(root, 'screen')).toBe('');
  expect(root.querySelector('[data-key="module.screenshot.reset"]')).toBeNull();
  expect(root.querySelector('[data-key="module.screenshot.keys"]')).toBeNull();
  expect(root.querySelector('.pane')!.textContent).not.toContain('Modul ini belum punya pengaturan.');
});

test('recording a key: the Mac lets go, the new key is saved and shown', async () => {
  const { root, bridge } = await onShotPage();
  bridge.shotSetKey.mockResolvedValue(shotKeys('ok', 'ok', { screen: '⌃⇧S', pick: '⌘⇧4' }));
  keyCap(root, 'screen').click();
  expect(keyCap(root, 'screen').textContent).toBe('Tekan tombol…');
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(true);
  press({ key: 'Shift', code: 'ShiftLeft', shiftKey: true });
  expect(bridge.shotSetKey).not.toHaveBeenCalled();
  press({ key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true });
  expect(bridge.shotSetKey).toHaveBeenCalledWith('screen', { code: 'KeyS', cmd: false, ctrl: true, alt: false, shift: true });
  await settle();
  expect(keyCap(root, 'screen').textContent).toBe('⌃⇧S');
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(false);
  expect(root.querySelector('[data-key="module.screenshot.reset"]')).not.toBeNull();
});

test('a key that cannot be used keeps recording and says why', async () => {
  const { root, bridge } = await onShotPage();
  bridge.shotSetKey.mockRejectedValue('invalid');
  keyCap(root, 'screen').click();
  press({ key: 's', code: 'KeyS' });
  await settle();
  expect(hint(root, 'screen')).toBe('Pakai ⌘, ⌃, atau ⌥ dengan satu tombol');
  expect(keyCap(root, 'screen').textContent).toBe('Tekan tombol…');
  expect(bridge.shotKeysHold).not.toHaveBeenCalledWith(false);
});

test('the other row\'s key is refused, naming that row', async () => {
  const { root, bridge } = await onShotPage();
  bridge.shotSetKey.mockRejectedValue('duplicate');
  keyCap(root, 'screen').click();
  press({ key: '4', code: 'Digit4', metaKey: true, shiftKey: true });
  await settle();
  expect(hint(root, 'screen')).toBe('Sudah dipakai untuk Window atau area');
  expect(keyCap(root, 'screen').textContent).toBe('Tekan tombol…');
});

test('a key of Atur jendela is refused, naming the tool', async () => {
  const { root, bridge } = await onShotPage();
  bridge.shotSetKey.mockRejectedValue('tool');
  keyCap(root, 'screen').click();
  press({ key: 'c', code: 'KeyC', ctrlKey: true, altKey: true });
  await settle();
  expect(hint(root, 'screen')).toBe('Dipakai Atur jendela');
});

test('Esc or leaving the window cancels, and the keys come back', async () => {
  const { root, bridge } = await onShotPage();
  keyCap(root, 'pick').click();
  press({ key: 'Escape', code: 'Escape' });
  expect(keyCap(root, 'pick').textContent).toBe('⌘⇧4');
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(false);
  keyCap(root, 'pick').click();
  window.dispatchEvent(new Event('blur'));
  expect(keyCap(root, 'pick').textContent).toBe('⌘⇧4');
  expect(bridge.shotKeysHold).toHaveBeenCalledTimes(4);
  expect(bridge.shotSetKey).not.toHaveBeenCalled();
});

// A shotSetKey the test answers itself.
function heldReply(bridge: { shotSetKey: { mockImplementation: (fn: () => Promise<ShotKeys>) => void } }) {
  let answer!: (keys: ShotKeys) => void;
  bridge.shotSetKey.mockImplementation(() => new Promise<ShotKeys>(r => { answer = r; }));
  return (keys: ShotKeys) => answer(keys);
}

test('keys pressed while one is being saved are ignored, Esc too; the saved key shows', async () => {
  const { root, bridge } = await onShotPage();
  const answer = heldReply(bridge);
  keyCap(root, 'screen').click();
  press({ key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true });
  press({ key: 'A', code: 'KeyA', ctrlKey: true, shiftKey: true });
  press({ key: 'Escape', code: 'Escape' });
  expect(bridge.shotSetKey).toHaveBeenCalledTimes(1);
  answer(shotKeys('ok', 'ok', { screen: '⌃⇧S', pick: '⌘⇧4' }));
  await settle();
  expect(keyCap(root, 'screen').textContent).toBe('⌃⇧S');
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(false);
});

test('a key saved while the other row records keeps Notching\'s keys let go, and shows', async () => {
  const { root, bridge } = await onShotPage();
  const answer = heldReply(bridge);
  keyCap(root, 'screen').click();
  press({ key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true });
  window.dispatchEvent(new Event('blur'));
  keyCap(root, 'pick').click();
  answer(shotKeys('ok', 'ok', { screen: '⌃⇧S', pick: '⌘⇧4' }));
  await settle();
  expect(keyCap(root, 'screen').textContent).toBe('⌃⇧S');
  expect(keyCap(root, 'pick').textContent).toBe('Tekan tombol…');
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(true);
});

test('pressing another button while recording leaves it in place for its click', async () => {
  const { root } = await onShotPage();
  keyCap(root, 'screen').click();
  const pick = keyCap(root, 'pick');
  pick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  expect(pick.isConnected).toBe(true);
  pick.click();
  expect(keyCap(root, 'pick').textContent).toBe('Tekan tombol…');
  expect(keyCap(root, 'screen').textContent).toBe('⌘⇧3');
});

test('leaving the page while recording lets the keys come back', async () => {
  const { root, app, bridge } = await onShotPage();
  keyCap(root, 'pick').click();
  app.go({ page: 'modules' });
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(false);
  press({ key: 'S', code: 'KeyS', ctrlKey: true });
  expect(bridge.shotSetKey).not.toHaveBeenCalled();
});

test('keys of one own can go back to ⌘⇧3 and ⌘⇧4', async () => {
  const { root, bridge } = await onShotPage(shotKeys('ok', 'ok', { screen: '⌃⇧S', pick: '⌃⇧A' }));
  bridge.shotResetKeys.mockResolvedValue(shotKeys());
  const reset = root.querySelector<HTMLElement>('[data-key="module.screenshot.reset"]')!;
  expect(reset.textContent).toBe('Kembalikan ke ⌘⇧3 dan ⌘⇧4');
  reset.click();
  expect(bridge.shotResetKeys).toHaveBeenCalledTimes(1);
  await settle();
  expect(keyCap(root, 'screen').textContent).toBe('⌘⇧3');
  expect(root.querySelector('[data-key="module.screenshot.reset"]')).toBeNull();
});

test('each row says who holds its key; the Mac\'s get the System Settings button', async () => {
  const { root, bridge } = await onShotPage(shotKeys('mac', 'other'));
  expect(hint(root, 'screen')).toBe('Dipakai screenshot bawaan Mac');
  expect(hint(root, 'pick')).toBe('Dipakai app lain');
  const open = root.querySelector<HTMLElement>('[data-key="module.screenshot.keys"]')!;
  expect(open.textContent).toBe('Buka Pengaturan Sistem');
  open.click();
  expect(bridge.openKeyboardShortcuts).toHaveBeenCalledTimes(1);
  const shortcut = await onShotPage(shotKeys('ok', 'shortcut'));
  expect(hint(shortcut.root, 'pick')).toBe('Dipakai pintasan Mac');
  expect(shortcut.root.querySelector('[data-key="module.screenshot.keys"]')).not.toBeNull();
});

test('another app\'s key, a module that is off, or a failed query: no System Settings button', async () => {
  const other = await onShotPage(shotKeys('ok', 'other'));
  expect(other.root.querySelector('[data-key="module.screenshot.keys"]')).toBeNull();
  const off = await onShotPage(shotKeys('off', 'off'));
  expect(hint(off.root, 'screen')).toBe('');
  const { root, app, bridge } = await mountForTest(WITH_SHOT);
  bridge.shotKeys.mockRejectedValue(new Error('no'));
  app.go({ page: 'module', id: 'screenshot' });
  await settle();
  expect(keyCap(root, 'screen').textContent).toBe('⌘⇧3');
  expect(hint(root, 'screen')).toBe('');
});

test('the keys page follows the language', async () => {
  const { root } = await onShotPage(shotKeys('other', 'ok'), 'en');
  expect(root.querySelector('.shot-keys .grp-label')!.textContent).toBe('Keys');
  expect(keyRow(root, 'screen').querySelector('.label')!.textContent).toBe('Whole screen');
  expect(hint(root, 'screen')).toBe('Taken by another app');
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

// The background tools (design 4 Nov, alat latar §7).
const cutTool = moduleInfo('cut-files', { name: 'Potong file', description: '⌘X dan ⌘V', entry: null, card: null, tool: true, permissions: ['accessibility'], category: 'files' });
const winTool = moduleInfo('window-keys', { name: 'Atur jendela', description: '⌃⌥ dan Q–C', entry: null, card: null, tool: true, permissions: ['accessibility'], category: 'window' });
const TOOLS: ModuleState = { ...STATE, modules: [...STATE.modules, cutTool, winTool] };

const cats = (root: HTMLElement) => [...root.querySelectorAll<HTMLDetailsElement>('.pane details.cat')];
// A plain storage for the folded categories: the test environment's own may lack methods.
function memoryStorage(): void {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  });
}

const labels = (d: Element) => [...d.querySelectorAll('.module .label')].map(e => e.textContent);

test('modules sit in six categories that fold; an empty one stays, shut, and says so; tools are not listed', async () => {
  memoryStorage();
  const { root, app } = await mountForTest(TOOLS);
  app.go({ page: 'modules' });
  const all = cats(root);
  expect(all.map(d => d.querySelector('.cat-name')!.textContent))
    .toEqual(['Utilitas', 'Energi & daya', 'Jendela & Dock', 'Kelola aplikasi', 'File', 'Aplikasi']);
  expect(labels(all[0])).toEqual(['Beranda', 'System stat']);
  expect(labels(all[2])).toEqual([]);
  expect(labels(all[4])).toEqual([]);
  expect(all.map(d => d.open)).toEqual([true, false, false, false, false, false]);
  expect(all[5].textContent).toContain('Belum ada modul di sini.');
  expect(all[0].querySelector('.n')!.textContent).toBe('2');
  expect(root.querySelector('[data-key="nav.modules"] .n')!.textContent).toBe('2');
  vi.unstubAllGlobals();
});

test('a category folded shut stays shut when the page comes back', async () => {
  memoryStorage();
  const { root, app } = await mountForTest(TOOLS);
  app.go({ page: 'modules' });
  const utilities = cats(root)[0];
  utilities.open = false;
  utilities.dispatchEvent(new Event('toggle'));
  app.go({ page: 'general' });
  app.go({ page: 'modules' });
  expect(cats(root)[0].open).toBe(false);
  vi.unstubAllGlobals();
});

test('a tool page shows the permission and the fixed keys', async () => {
  const { root, app, bridge } = await mountForTest(TOOLS);
  app.go({ page: 'module', id: 'cut-files' });
  expect(h1(root)).toBe('Potong file');
  const perm = root.querySelector<HTMLElement>('[data-row="tool.cut-files.access"]')!;
  expect(perm.textContent).toContain('Aksesibilitas');
  expect(perm.textContent).toContain('Belum diizinkan');
  click(root, 'tool.cut-files.open');
  expect(bridge.openAccessibility).toHaveBeenCalled();
  expect([...root.querySelectorAll('.tool-keys .keycap')].map(e => e.textContent)).toEqual(['⌘X', '⌘V']);
  expect(root.querySelector('.tool-keys')!.textContent).toContain('Hanya di Finder.');
  expect(root.textContent).not.toContain('Modul ini belum punya pengaturan.');
});

// Rows in the order the page lists them: halves, corners, centre, whole screen.
const LISTED = ['⌃⌥←', '⌃⌥→', '⌃⌥↑', '⌃⌥↓', '⌃⌥;', "⌃⌥'", '⌃⌥.', '⌃⌥/', '⌃⌥\\', '⌃⌥↩'];

test('Atur jendela lists each position with its picture, name and key, and says which are taken', async () => {
  const { root, app, bridge } = await mountForTest({ ...TOOLS, lang: 'id' });
  bridge.windowKeys.mockResolvedValueOnce(windowKeys({ bottomRight: 'other', center: 'shortcut' }));
  app.go({ page: 'module', id: 'window-keys' });
  await settle();
  const rows = [...root.querySelectorAll<HTMLElement>('.win-row')];
  expect(rows.map(r => r.querySelector('.label')!.textContent)).toEqual([
    'Setengah kiri', 'Setengah kanan', 'Setengah atas', 'Setengah bawah',
    'Kiri atas', 'Kanan atas', 'Kiri bawah', 'Kanan bawah', 'Tengah', 'Penuhi layar',
  ]);
  expect(winCaps(root)).toEqual(LISTED);
  // Each picture fills its part of a small screen: the left half is the left 9 of 19.
  const area = (cell: string) => {
    const a = winRow(root, cell).querySelector('.win-pos .area')!;
    return ['x', 'y', 'width', 'height'].map(k => Number(a.getAttribute(k)));
  };
  expect(area('left')).toEqual([3.5, 3.5, 9, 11]);
  expect(area('bottomRight')).toEqual([13.5, 9.5, 9, 5]);
  expect(area('fill')).toEqual([3.5, 3.5, 19, 11]);
  expect(area('center')).toEqual([8.5, 6.5, 9, 5]);
  expect(winCap(root, 'bottomRight').classList.contains('taken')).toBe(true);
  expect(winRowHint(root, 'bottomRight')).toBe('Dipakai app lain');
  expect(winRowHint(root, 'center')).toBe('Dipakai pintasan Mac');
  expect(winRowHint(root, 'left')).toBeUndefined();
});

const winCap = (root: HTMLElement, cell: string) => root.querySelector<HTMLElement>(`[data-key="tool.window-keys.${cell}"]`)!;
const winRow = (root: HTMLElement, cell: string) => root.querySelector<HTMLElement>(`[data-row="tool.window-keys.${cell}"]`)!;
const winRowHint = (root: HTMLElement, cell: string) => winRow(root, cell).querySelector('small')?.textContent;
const winCaps = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.win-row .keycap')].map(e => e.textContent);

async function onWindowPage(keys = windowKeys(), lang: 'id' | 'en' = 'id') {
  const t = await mountForTest({ ...TOOLS, lang });
  t.bridge.windowKeys.mockResolvedValue(keys);
  t.app.go({ page: 'module', id: 'window-keys' });
  await settle();
  return t;
}

// The keys with some cells' labels changed.
const relabel = (labels: Record<string, string>) => windowKeys().map(k => ({ ...k, label: labels[k.cell] ?? k.label }));

test('Atur jendela: clicking a key records a new one for that position', async () => {
  const { root, bridge } = await onWindowPage();
  expect(root.querySelector('[data-key="tool.window-keys.reset"]')).toBeNull();
  bridge.windowSetKey.mockResolvedValue(relabel({ topLeft: '⌃⇧T' }));
  winCap(root, 'topLeft').click();
  expect(winCap(root, 'topLeft').textContent).toBe('Tekan tombol…');
  expect(winCap(root, 'topLeft').classList.contains('recording')).toBe(true);
  expect(winRowHint(root, 'topLeft')).toBe('Tekan tombol baru untuk Kiri atas. Esc untuk batal.');
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(true);
  press({ key: 'Control', code: 'ControlLeft', ctrlKey: true });
  expect(bridge.windowSetKey).not.toHaveBeenCalled();
  press({ key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true });
  expect(bridge.windowSetKey).toHaveBeenCalledWith('topLeft', { code: 'KeyT', cmd: false, ctrl: true, alt: false, shift: true });
  await settle();
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(false);
  expect(winRowHint(root, 'topLeft')).toBeUndefined();
  expect(winCap(root, 'topLeft').textContent).toBe('⌃⇧T');
  expect(root.querySelector('[data-key="tool.window-keys.reset"]')!.textContent).toBe('Kembalikan ke tombol bawaan');
});

test('Atur jendela: a refused key keeps recording and says why', async () => {
  const { root, bridge } = await onWindowPage();
  winCap(root, 'top').click();
  bridge.windowSetKey.mockRejectedValueOnce({ kind: 'duplicate', cell: 'bottomRight' });
  press({ key: '/', code: 'Slash', ctrlKey: true, altKey: true });
  await settle();
  expect(winRowHint(root, 'top')).toBe('Sudah dipakai untuk Kanan bawah');
  expect(winRow(root, 'top').querySelector('small')!.classList.contains('err')).toBe(true);
  expect(winCap(root, 'top').textContent).toBe('Tekan tombol…');
  bridge.windowSetKey.mockRejectedValueOnce({ kind: 'shot' });
  press({ key: '3', code: 'Digit3', metaKey: true, shiftKey: true });
  await settle();
  expect(winRowHint(root, 'top')).toBe('Dipakai Screenshot');
  bridge.windowSetKey.mockRejectedValueOnce({ kind: 'app' });
  press({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true });
  await settle();
  expect(winRowHint(root, 'top')).toBe('Dipakai pintasan Keep awake atau Shelf');
  bridge.windowSetKey.mockRejectedValueOnce({ kind: 'invalid' });
  press({ key: 'q', code: 'KeyQ' });
  await settle();
  expect(winRowHint(root, 'top')).toBe('Pakai ⌘, ⌃, atau ⌥ dengan satu tombol');
  expect(bridge.shotKeysHold).not.toHaveBeenCalledWith(false);
});

test('Atur jendela: Esc cancels, leaving the page lets the keys come back', async () => {
  const { root, app, bridge } = await onWindowPage();
  winCap(root, 'center').click();
  press({ key: 'Escape', code: 'Escape' });
  expect(winCap(root, 'center').textContent).toBe('⌃⌥\\');
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(false);
  winCap(root, 'center').click();
  app.go({ page: 'modules' });
  expect(bridge.shotKeysHold).toHaveBeenLastCalledWith(false);
  press({ key: 'G', code: 'KeyG', ctrlKey: true });
  expect(bridge.windowSetKey).not.toHaveBeenCalled();
});

test('Atur jendela: changed keys go back to the default keys', async () => {
  const { root, bridge } = await onWindowPage(relabel({ topLeft: '⌃⇧T' }), 'en');
  bridge.windowResetKeys.mockResolvedValue(windowKeys());
  const reset = root.querySelector<HTMLElement>('[data-key="tool.window-keys.reset"]')!;
  expect(reset.textContent).toBe('Back to the default keys');
  expect(winRow(root, 'topLeft').querySelector('.label')!.textContent).toBe('Top left');
  reset.click();
  await settle();
  expect(bridge.windowResetKeys).toHaveBeenCalledTimes(1);
  expect(winCaps(root)).toEqual(LISTED);
  expect(root.querySelector('[data-key="tool.window-keys.reset"]')).toBeNull();
});

test('tool pages follow the language', async () => {
  const { root, app, bridge } = await mountForTest({ ...TOOLS, lang: 'en' });
  app.go({ page: 'module', id: 'cut-files' });
  expect(root.querySelector('[data-row="tool.cut-files.access"]')!.textContent).toContain('Not allowed');
  bridge.emitModuleState({ ...TOOLS, lang: 'en' });
  app.go({ page: 'modules' });
  expect(cats(root).map(d => d.querySelector('.cat-name')!.textContent))
    .toEqual(['Utilities', 'Energy & power', 'Window & Dock', 'App management', 'Files', 'Apps']);
});
