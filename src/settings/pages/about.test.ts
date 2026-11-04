// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { mountForTest, settle, TEST_UPDATE } from '../test-helpers';
import type { UpdateInfo } from '../types';

const key = (root: HTMLElement, k: string) => root.querySelector<HTMLButtonElement>(`[data-key="${k}"]`);
const label = (root: HTMLElement) => root.querySelector('[data-row="about.update"] .label')!.textContent;
const hint = (root: HTMLElement) => root.querySelector('[data-row="about.update"] small');

async function onAbout(u: Partial<UpdateInfo> = {}) {
  const t = await mountForTest();
  t.bridge.updateState.mockResolvedValue({ ...TEST_UPDATE, ...u });
  t.app.go({ page: 'about' });
  await settle();
  return t;
}

test('Tentang shows the wordmark, the tagline, the version and the update switch', async () => {
  const { root, bridge } = await onAbout();
  expect(root.querySelector('.about-hero img')!.getAttribute('alt')).toBe('Notching');
  expect(root.querySelector('.about-tagline')!.textContent).toBe('Notch-mu bekerja lebih. Komputermu hampir tak merasakannya.');
  const sw = key(root, 'about.auto')!;
  expect(sw.getAttribute('aria-checked')).toBe('true');
  sw.click();
  expect(bridge.setAutoUpdate).toHaveBeenCalledWith(false);
  expect(label(root)).toBe('Versi terpasang 0.1.2');
  expect(hint(root)!.textContent).toBe('Belum pernah dicek');
});

test('checking asks GitHub and shows what came back', async () => {
  const { root, bridge } = await onAbout();
  bridge.updateCheck.mockResolvedValue({ ...TEST_UPDATE, latest: '0.1.2', checkedAt: Date.UTC(2026, 10, 4, 7, 5) });
  key(root, 'about.check')!.click();
  await settle();
  expect(bridge.updateCheck).toHaveBeenCalledTimes(1);
  expect(label(root)).toBe('Notching sudah versi terbaru');
  expect(hint(root)!.textContent).toContain('Versi terpasang 0.1.2 · Terakhir dicek');
});

test('a newer version offers its notes and Update & install, and dots Tentang in the sidebar', async () => {
  const { root, bridge } = await onAbout({ latest: '0.1.3', available: true, size: 6551363, page: 'https://github.com/x' });
  expect(label(root)).toBe('Notching 0.1.3 tersedia');
  expect(hint(root)!.textContent).toContain('Notching akan tertutup sebentar lalu terbuka lagi.');
  expect(key(root, 'about.check')).toBeNull();
  key(root, 'about.notes')!.click();
  expect(bridge.openReleaseNotes).toHaveBeenCalledTimes(1);
  key(root, 'about.install')!.click();
  expect(bridge.updateInstall).toHaveBeenCalledTimes(1);
  bridge.emitUpdate({ ...TEST_UPDATE, latest: '0.1.3', available: true });
  expect(root.querySelector('[data-key="nav.about"] .update-dot')).not.toBeNull();
  bridge.emitUpdate({ ...TEST_UPDATE, latest: '0.1.3', available: false });
  expect(root.querySelector('[data-key="nav.about"] .update-dot')).toBeNull();
});

test('installing shows each step, with a bar while downloading', async () => {
  const { root, bridge } = await onAbout({ latest: '0.1.3', available: true });
  bridge.emitUpdate({ ...TEST_UPDATE, latest: '0.1.3', available: true, phase: 'downloading', progress: 0.42 });
  expect(label(root)).toBe('Mengunduh Notching 0.1.3… 42%');
  expect(root.querySelector<HTMLElement>('.about-progress i')!.style.width).toBe('42%');
  expect(key(root, 'about.check')!.disabled).toBe(true);
  bridge.emitUpdate({ ...TEST_UPDATE, latest: '0.1.3', available: true, phase: 'verifying' });
  expect(label(root)).toBe('Memeriksa tanda tangan Apple…');
  bridge.emitUpdate({ ...TEST_UPDATE, latest: '0.1.3', available: true, phase: 'restarting' });
  expect(label(root)).toBe('Membuka ulang Notching…');
});

test('a refused download says so; a dev build cannot install', async () => {
  const { root, bridge } = await onAbout({ latest: '0.1.3', available: true, error: 'signature' });
  expect(hint(root)!.textContent).toBe('Unduhan ditolak: tanda tangannya bukan milik Notching. Tidak ada yang diubah.');
  expect(hint(root)!.classList.contains('err')).toBe(true);
  bridge.emitUpdate({ ...TEST_UPDATE, latest: '0.1.3', available: true, installable: false });
  expect(key(root, 'about.install')!.disabled).toBe(true);
  expect(hint(root)!.textContent).toBe('Update hanya bisa dipasang dari Notching.app yang terpasang.');
});

test('the links open only the fixed pages', async () => {
  const { root, bridge } = await onAbout();
  root.querySelector<HTMLElement>('[data-row="about.link.repo"]')!.click();
  root.querySelector<HTMLElement>('[data-row="about.link.privacy"]')!.click();
  expect(bridge.openLink.mock.calls).toEqual([['repo'], ['privacy']]);
});
