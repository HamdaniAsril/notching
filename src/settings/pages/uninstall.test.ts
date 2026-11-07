// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { TEST_STATE, timers } from '../../notch/test-helpers';
import { mountForTest, settle } from '../test-helpers';

const key = (root: HTMLElement, k: string) => root.querySelector<HTMLButtonElement>(`[data-key="${k}"]`)!;
const hint = (root: HTMLElement, k: string) => root.querySelector(`[data-row="${k}"] small`)!;

async function onPage(state = TEST_STATE) {
  const t = await mountForTest(state);
  t.app.go({ page: 'uninstall' });
  await settle();
  return t;
}

test('Copot Notching lists what moves to the Trash', async () => {
  const { root } = await onPage();
  expect(root.querySelector('.pane h1')!.textContent).toBe('Copot Notching');
  expect([...root.querySelectorAll('.uninstall-list .label')].map(e => e.textContent))
    .toEqual(['/Applications/Notching.app', '~/Library/Caches/id.web.notching']);
  expect(key(root, 'uninstall.app').disabled).toBe(false);
});

test('releasing the permissions asks once more, then says it is done', async () => {
  const { root, bridge } = await onPage();
  key(root, 'uninstall.permissions').click();
  expect(key(root, 'uninstall.permissions').textContent).toBe('Yakin? Klik lagi');
  expect(bridge.releasePermissions).not.toHaveBeenCalled();
  key(root, 'uninstall.permissions').click();
  expect(bridge.releasePermissions).toHaveBeenCalledTimes(1);
  await settle();
  expect(hint(root, 'uninstall.permissions').textContent).toContain('Semua izin sudah dilepas');
});

test('releasing names each permission as System Settings on this macOS does', async () => {
  expect(hint((await onPage()).root, 'uninstall.permissions').textContent)
    .toMatch(/^Aksesibilitas, Perekaman Layar, Akses Disk Penuh, dan Kamera dicabut dari Notching\./);
  expect(hint((await onPage({ ...TEST_STATE, macos: 27 })).root, 'uninstall.permissions').textContent)
    .toMatch(/^Kontrol Perangkat dan Akses Data, Rekaman Layar & Audio Sistem, Akses Disk Penuh, dan Kamera dicabut dari Notching\./);
});

test('the confirmation wears off', async () => {
  const { root, bridge } = await onPage();
  key(root, 'uninstall.app').click();
  timers.advance(4000);
  expect(key(root, 'uninstall.app').textContent).toBe('Copot Notching');
  key(root, 'uninstall.app').click();
  expect(bridge.uninstallNotching).not.toHaveBeenCalled();
});

test('uninstalling asks once more; a failure says why and can be tried again', async () => {
  const { root, bridge } = await onPage();
  bridge.uninstallNotching.mockRejectedValueOnce('no access');
  key(root, 'uninstall.app').click();
  key(root, 'uninstall.app').click();
  expect(bridge.uninstallNotching).toHaveBeenCalledTimes(1);
  await settle();
  expect(hint(root, 'uninstall.app').textContent).toBe('Notching belum bisa dicopot: no access');
  expect(hint(root, 'uninstall.app').classList.contains('err')).toBe(true);
  expect(key(root, 'uninstall.app').disabled).toBe(false);
  key(root, 'uninstall.app').click();
  key(root, 'uninstall.app').click();
  await settle();
  expect(hint(root, 'uninstall.app').textContent).toBe('Notching sudah dicopot. Sampai jumpa.');
});

test('a dev build cannot uninstall itself', async () => {
  const t = await mountForTest();
  t.bridge.uninstallPreview.mockResolvedValue({ app: null, files: [] });
  t.app.go({ page: 'uninstall' });
  await settle();
  expect(key(t.root, 'uninstall.app').disabled).toBe(true);
  expect(hint(t.root, 'uninstall.app').textContent).toBe('Hanya bisa dari Notching.app yang terpasang.');
  expect(t.root.querySelector('.uninstall-list')!.textContent).toContain('Tidak ada file Notching yang ditemukan.');
});
