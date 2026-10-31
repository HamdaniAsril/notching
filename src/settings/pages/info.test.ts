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
