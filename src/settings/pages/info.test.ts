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
  const r = root.querySelector<HTMLElement>('[data-row="permission.keyboard-clean.accessibility"]')!;
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
  expect(root.querySelector('[data-row="permission.keyboard-clean.accessibility"]')!.textContent).toContain('Diizinkan');
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
  const r = row(root, 'permission.screenshot.screen-recording')!;
  expect(r.textContent).toContain('Screenshot');
  expect(r.textContent).toContain('Perekaman Layar');
  expect(r.textContent).toContain('Belum diizinkan');
  expect(row(root, 'permission.screenshot.accessibility')).toBeNull();
  key(root, 'permissions.openScreenRecording')!.click();
  expect(bridge.openScreenRecordingSettings).toHaveBeenCalled();
  expect(bridge.openAccessibility).not.toHaveBeenCalled();
  bridge.settings.mockResolvedValue({ ...TEST_INFO, screenRecording: true });
  timers.advance(2000);
  await settle();
  expect(row(root, 'permission.screenshot.screen-recording')!.textContent).toContain('Diizinkan');
});

test('each permission keeps its own state and button when both are needed', async () => {
  const both: ModuleState = { ...TEST_STATE, modules: [...TEST_STATE.modules, CLEAN, SHOT] };
  const { root, app, bridge } = await mountForTest(both, { ...TEST_INFO, accessibility: true, screenRecording: false });
  app.go({ page: 'permissions' });
  expect(row(root, 'permission.keyboard-clean.accessibility')!.textContent).toContain('Diizinkan');
  expect(row(root, 'permission.screenshot.screen-recording')!.textContent).toContain('Belum diizinkan');
  expect(row(root, 'permission.screenshot.accessibility')).toBeNull();
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
  expect(row(root, 'permission.screenshot.screen-recording')).toBeNull();
});
