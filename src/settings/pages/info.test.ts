// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ModuleState } from '../../modules/types';
import { moduleInfo, TEST_STATE, timers } from '../../notch/test-helpers';
import { mountForTest, settle, TEST_INFO } from '../test-helpers';

const CLEAN = moduleInfo('keyboard-clean', { name: 'Keyboard Cleaning Mode', entry: null, card: null,
  action: { capability: 'keyclean', method: 'toggle' }, permissions: ['accessibility'] });
const WITH: ModuleState = { ...TEST_STATE, modules: [...TEST_STATE.modules, CLEAN] };
const key = (root: HTMLElement, k: string) => root.querySelector<HTMLElement>(`[data-key="${k}"]`);

test('the Izin page lists modules that need Accessibility and their state', async () => {
  const { root, app } = await mountForTest(WITH, { ...TEST_INFO, accessibility: false });
  app.go({ page: 'permissions' });
  const r = root.querySelector<HTMLElement>('[data-row="permission.accessibility"]')!;
  expect(r.textContent).toContain('Keyboard Cleaning Mode');
  expect(r.textContent).toContain('Aksesibilitas');
  expect(r.textContent).toContain('Belum diizinkan');
  expect(root.querySelector('.pane')!.textContent).not.toContain('Belum ada modul yang butuh izin sistem.');
});

test('its button opens System Settings, and the state follows what macOS says', async () => {
  const { root, app, bridge } = await mountForTest(WITH, { ...TEST_INFO, accessibility: false });
  app.go({ page: 'permissions' });
  key(root, 'permissions.open')!.click();
  expect(bridge.openAccessibility).toHaveBeenCalled();
  bridge.settings.mockResolvedValue({ ...TEST_INFO, accessibility: true });
  timers.advance(2000);
  await settle();
  expect(root.querySelector('[data-row="permission.accessibility"]')!.textContent).toContain('Diizinkan');
});

test('without such modules it keeps the old note', async () => {
  const { root, app } = await mountForTest(TEST_STATE, TEST_INFO);
  app.go({ page: 'permissions' });
  expect(root.querySelector('.pane')!.textContent).toContain('Belum ada modul yang butuh izin sistem.');
  expect(key(root, 'permissions.open')).toBeNull();
});

const SHOT = moduleInfo('screenshot', { name: 'Screenshot', entry: null, card: null,
  action: { capability: 'screenshot', method: 'open' }, permissions: ['screen-recording'] });
const WITH_SHOT: ModuleState = { ...TEST_STATE, modules: [...TEST_STATE.modules, SHOT] };
const row = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-row="${id}"]`);

test('screen recording row shows for screenshot and its state', async () => {
  const { root, app, bridge } = await mountForTest(WITH_SHOT, { ...TEST_INFO, screenRecording: false });
  app.go({ page: 'permissions' });
  const r = row(root, 'permission.screen-recording')!;
  expect(r.textContent).toContain('Screenshot');
  expect(r.textContent).toContain('Perekaman Layar');
  expect(r.textContent).toContain('Belum diizinkan');
  expect(row(root, 'permission.accessibility')).toBeNull();
  key(root, 'permissions.openScreenRecording')!.click();
  expect(bridge.openScreenRecordingSettings).toHaveBeenCalled();
  expect(bridge.openAccessibility).not.toHaveBeenCalled();
  bridge.settings.mockResolvedValue({ ...TEST_INFO, screenRecording: true });
  timers.advance(2000);
  await settle();
  expect(row(root, 'permission.screen-recording')!.textContent).toContain('Diizinkan');
});

test('each permission keeps its own state and button when both are needed', async () => {
  const both: ModuleState = { ...TEST_STATE, modules: [...TEST_STATE.modules, CLEAN, SHOT] };
  const { root, app, bridge } = await mountForTest(both, { ...TEST_INFO, accessibility: true, screenRecording: false });
  app.go({ page: 'permissions' });
  expect(row(root, 'permission.accessibility')!.textContent).toContain('Diizinkan');
  expect(row(root, 'permission.screen-recording')!.textContent).toContain('Belum diizinkan');
  key(root, 'permissions.open')!.click();
  expect(bridge.openAccessibility).toHaveBeenCalledTimes(1);
  expect(bridge.openScreenRecordingSettings).not.toHaveBeenCalled();
});

test('leaving the Izin page stops asking macOS', async () => {
  const { app, bridge } = await mountForTest(WITH_SHOT, TEST_INFO);
  app.go({ page: 'permissions' });
  app.go({ page: 'general' });
  bridge.settings.mockClear();
  timers.advance(10000);
  await settle();
  expect(bridge.settings).not.toHaveBeenCalled();
});

test('a module that is not installed asks for no permission', async () => {
  const gone: ModuleState = { ...TEST_STATE, modules: [...TEST_STATE.modules, { ...SHOT, installed: false }] };
  const { root, app } = await mountForTest(gone, TEST_INFO);
  app.go({ page: 'permissions' });
  expect(row(root, 'permission.screen-recording')).toBeNull();
});

const CLEANER = moduleInfo('cleaner', { name: 'Cleaner', entry: null, card: null,
  action: { capability: 'cleaner', method: 'open' }, permissions: ['full-disk-access'] });

test('full disk access row shows for cleaner and its state', async () => {
  const { root, app, bridge } = await mountForTest({ ...TEST_STATE, modules: [...TEST_STATE.modules, CLEANER] }, { ...TEST_INFO, fullDiskAccess: false });
  app.go({ page: 'permissions' });
  const r = row(root, 'permission.full-disk-access')!;
  expect(r.querySelector('.label')!.textContent).toBe('Full Disk Access');
  expect(r.querySelector('.hint')!.textContent).toBe('Cleaner · Untuk membaca cache, Tempat Sampah, dan cadangan iPhone.');
  expect(r.textContent).toContain('Belum diizinkan');
  key(root, 'permissions.openFullDiskAccess')!.click();
  expect(bridge.openFullDiskAccessSettings).toHaveBeenCalled();
  bridge.settings.mockResolvedValue({ ...TEST_INFO, fullDiskAccess: true });
  timers.advance(2000);
  await settle();
  expect(row(root, 'permission.full-disk-access')!.textContent).toContain('Diizinkan');
});

const MIRROR = moduleInfo('mirror', { name: 'Cermin', permissions: ['camera'] });

test('the camera row shows for Cermin, with its state and its own System Settings pane', async () => {
  const { root, app, bridge } = await mountForTest({ ...TEST_STATE, modules: [...TEST_STATE.modules, MIRROR] }, { ...TEST_INFO, camera: false });
  app.go({ page: 'permissions' });
  const r = row(root, 'permission.camera')!;
  expect(r.querySelector('.label')!.textContent).toBe('Kamera');
  expect(r.querySelector('.hint')!.textContent).toBe('Cermin · Untuk menampilkan kamera di Cermin.');
  expect(r.textContent).toContain('Belum diizinkan');
  key(root, 'permissions.openCamera')!.click();
  expect(bridge.openCameraSettings).toHaveBeenCalled();
  bridge.settings.mockResolvedValue({ ...TEST_INFO, camera: true });
  timers.advance(2000);
  await settle();
  expect(row(root, 'permission.camera')!.querySelector('.perm-state.on')!.textContent).toBe('Diizinkan');
});

// Owner 3 Nov: the page as Umum is, one card of rows, each with its state and button at its end.
test('every permission is a row of one card, its state and button inside the row', async () => {
  const all: ModuleState = { ...TEST_STATE, modules: [...TEST_STATE.modules, CLEAN, SHOT, CLEANER, MIRROR] };
  const { root, app } = await mountForTest(all, { ...TEST_INFO, screenRecording: true });
  app.go({ page: 'permissions' });
  const pane = root.querySelector('.perms')!;
  expect(pane.querySelectorAll('.grp')).toHaveLength(1);
  expect(pane.querySelectorAll(':scope > .btn')).toHaveLength(0);
  const rows = [...pane.querySelectorAll<HTMLElement>('.grp > .row')];
  expect(rows.map(r => r.dataset.row)).toEqual([
    'permission.accessibility', 'permission.screen-recording', 'permission.full-disk-access', 'permission.camera',
  ]);
  for (const r of rows) {
    const ctl = r.querySelector(':scope > .ctl')!;
    expect([...ctl.children].map(c => c.className)).toEqual([expect.stringMatching(/^perm-state/), 'btn']);
  }
  expect(rows[1].querySelector('.perm-state')!.classList.contains('on')).toBe(true);
  expect(rows[0].querySelector('.perm-state')!.classList.contains('on')).toBe(false);
});

test('two modules that need the same permission share its row', async () => {
  const second = moduleInfo('keyboard-two', { name: 'Kunci Lain', entry: null, card: null, permissions: ['accessibility'] });
  const { root, app } = await mountForTest({ ...TEST_STATE, modules: [...TEST_STATE.modules, CLEAN, second] }, TEST_INFO);
  app.go({ page: 'permissions' });
  expect(root.querySelectorAll('[data-row="permission.accessibility"]')).toHaveLength(1);
  expect(row(root, 'permission.accessibility')!.querySelector('.hint')!.textContent).toBe('Keyboard Cleaning Mode, Kunci Lain · Untuk mengunci keyboard.');
});

test('Tentang shows the version in the text font, not the old mono one', async () => {
  const { root, app } = await mountForTest();
  app.go({ page: 'about' });
  const version = root.querySelector('[data-row="about.version"] .version')!;
  expect(version.textContent).toBe(TEST_INFO.version);
  expect(root.querySelector('.mono')).toBeNull();
});
