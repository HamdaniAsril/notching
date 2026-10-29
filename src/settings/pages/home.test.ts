// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ModuleState } from '../../modules/types';
import { moduleInfo, TEST_STATE } from '../../notch/test-helpers';
import { mountForTest, settle, TEST_INFO } from '../test-helpers';
import type { Place, SettingsInfo } from '../types';

const STATE: ModuleState = {
  ...TEST_STATE,
  modules: [
    moduleInfo('home', { name: 'Beranda', channels: [
      { id: 'reminder', name: 'Reminder', on: true, sound: true },
      { id: 'prayer', name: 'Waktu sholat', on: false, sound: false },
    ] }),
    moduleInfo('system-stat', { name: 'System stat' }),
  ],
};
const BANDUNG: Place = { name: 'Bandung', region: 'Jawa Barat', country: 'Indonesia', latitude: -6.9175, longitude: 107.6191 };
const key = (root: HTMLElement, k: string) => root.querySelector<HTMLElement>(`[data-key="${k}"]`);
const searchBox = (root: HTMLElement) => key(root, 'home.placeSearch') as HTMLInputElement;

async function open(info: SettingsInfo = TEST_INFO, state: ModuleState = STATE) {
  const t = await mountForTest(state, info);
  t.app.go({ page: 'module', id: 'home' });
  return { ...t, text: () => t.root.querySelector('.pane')!.textContent! };
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

const enter = (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

test('the Beranda page has its settings instead of the empty note', async () => {
  const { root, text } = await open();
  const rows = [...root.querySelectorAll<HTMLElement>('[data-row]')].map(r => r.dataset.row);
  expect(rows).toEqual(expect.arrayContaining(['home.place', 'home.prayerMethod', 'home.showClock']));
  expect(text()).not.toContain('Modul ini belum punya pengaturan.');
  expect(text()).toContain('Belum diatur');
});

test('System stat still says it has no settings', async () => {
  const t = await mountForTest(STATE);
  t.app.go({ page: 'module', id: 'system-stat' });
  expect(t.root.querySelector('.pane')!.textContent).toContain('Modul ini belum punya pengaturan.');
});

test('finding a city and choosing it', async () => {
  const { root, bridge, text } = await open();
  bridge.searchPlaces.mockResolvedValueOnce([BANDUNG]);
  key(root, 'home.placeChange')!.click();
  expect(document.activeElement).toBe(searchBox(root));
  type(searchBox(root), 'Bandung');
  enter(searchBox(root));
  expect(bridge.searchPlaces).toHaveBeenCalledWith('Bandung');
  await settle();
  const pick = key(root, 'home.place.0')!;
  expect(pick.textContent).toBe('Bandung, Jawa Barat, Indonesia');
  pick.click();
  expect(bridge.setPlace).toHaveBeenCalledWith(BANDUNG);
  await settle();
  expect(searchBox(root)).toBeNull();
  expect(text()).not.toContain('Ketik nama kota');
});

test('the Search button searches too', async () => {
  const { root, bridge } = await open();
  key(root, 'home.placeChange')!.click();
  type(searchBox(root), 'Medan');
  key(root, 'home.placeFind')!.click();
  expect(bridge.searchPlaces).toHaveBeenCalledWith('Medan');
});

test('typing alone never searches', async () => {
  const { root, bridge } = await open();
  key(root, 'home.placeChange')!.click();
  for (const v of ['B', 'Ba', 'Ban', 'Band']) type(searchBox(root), v);
  await settle();
  expect(bridge.searchPlaces).not.toHaveBeenCalled();
});

test('a failed search says so', async () => {
  const { root, bridge, text } = await open();
  bridge.searchPlaces.mockRejectedValueOnce(new Error('offline'));
  key(root, 'home.placeChange')!.click();
  type(searchBox(root), 'Bandung');
  enter(searchBox(root));
  await settle();
  expect(text()).toContain('Tidak bisa mencari. Periksa internetmu.');
});

test('no city found says so', async () => {
  const { root, bridge, text } = await open();
  bridge.searchPlaces.mockResolvedValueOnce([]);
  key(root, 'home.placeChange')!.click();
  type(searchBox(root), 'Zzzqqq');
  enter(searchBox(root));
  await settle();
  expect(text()).toContain('Kota tidak ditemukan.');
});

test('cancel closes the search box', async () => {
  const { root } = await open();
  key(root, 'home.placeChange')!.click();
  key(root, 'home.placeCancel')!.click();
  expect(searchBox(root)).toBeNull();
});

test('what you typed survives a broadcast', async () => {
  const { root, bridge } = await open();
  key(root, 'home.placeChange')!.click();
  type(searchBox(root), 'Band');
  searchBox(root).focus();
  bridge.emitSettings({ ...TEST_INFO });
  expect(searchBox(root).value).toBe('Band');
  expect(document.activeElement).toBe(searchBox(root));
  key(root, 'home.placeCancel')!.click();
});

test('the chosen city shows with a Change button', async () => {
  const { root, text } = await open({ ...TEST_INFO, home: { ...TEST_INFO.home, place: BANDUNG } });
  expect(text()).toContain('Bandung, Jawa Barat, Indonesia');
  expect(key(root, 'home.placeChange')!.textContent).toBe('Ganti');
});

test('the prayer method and the clock save at once', async () => {
  const { root, bridge } = await open();
  const method = key(root, 'home.prayerMethod') as HTMLSelectElement;
  expect(method.value).toBe('kemenag');
  expect([...method.options].map(o => o.textContent)[0]).toBe('Kemenag RI');
  method.value = 'karachi';
  method.dispatchEvent(new Event('change'));
  expect(bridge.setPrayerMethod).toHaveBeenCalledWith('karachi');
  key(root, 'home.showClock')!.click();
  expect(bridge.setShowClock).toHaveBeenCalledWith(false);
});

test('the Beranda page has the prayer notification switch', async () => {
  const { root, bridge, text } = await open();
  const sw = key(root, 'home.prayerNotice')!;
  expect(sw.getAttribute('aria-checked')).toBe('false');
  expect(text()).toContain('Tanpa suara, kecuali kamu menyalakannya di Notifikasi.');
  sw.click();
  expect(bridge.setChannel).toHaveBeenCalledWith('home', 'prayer', { on: true, sound: false });
});

