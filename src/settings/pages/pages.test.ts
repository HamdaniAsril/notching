// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ModuleState } from '../../modules/types';
import { BERANDA, homeWidgets, moduleInfo, TEST_STATE } from '../../notch/test-helpers';
import { mountForTest, settle, TEST_INFO } from '../test-helpers';
import type { Place, SettingsInfo } from '../types';

const STATE: ModuleState = {
  ...TEST_STATE,
  modules: [
    homeWidgets(),
    moduleInfo('system-stat', { name: 'System stat' }),
  ],
};
const BANDUNG: Place = { name: 'Bandung', region: 'Jawa Barat', country: 'Indonesia', latitude: -6.9175, longitude: 107.6191 };
const key = (root: HTMLElement, k: string) => root.querySelector<HTMLElement>(`[data-key="${k}"]`);
const searchBox = (root: HTMLElement) => key(root, 'home.placeSearch') as HTMLInputElement;

async function open(info: SettingsInfo = TEST_INFO, state: ModuleState = STATE) {
  const t = await mountForTest(state, info);
  t.app.go({ page: 'pages' });
  return { ...t, text: () => t.root.querySelector('.pane')!.textContent! };
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

const enter = (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

test('the Halaman page holds the shared widget data', async () => {
  const { root, text } = await open();
  expect(root.querySelector('.pane h1')!.textContent).toBe('Halaman');
  const rows = [...root.querySelectorAll<HTMLElement>('[data-row]')].map(r => r.dataset.row);
  expect(rows).toEqual(expect.arrayContaining(['home.place', 'home.prayerMethod', 'home.prayerNotice']));
  expect(text()).toContain('Data widget');
  expect(text()).toContain('Belum diatur');
});

test('there is no clock switch any more', async () => {
  const { root } = await open();
  expect(key(root, 'home.showClock')).toBeNull();
});

test('the page list shows Beranda, the custom pages, then Modul', async () => {
  const kerja = { id: 'p1', name: '<b>Kerja</b>', icon: 'briefcase', widgets: [{ widget: 'home/clock', col: 0, width: 1 }] };
  const { root } = await open(TEST_INFO, { ...STATE, pages: [BERANDA, kerja] });
  const rows = [...root.querySelectorAll<HTMLElement>('[data-row^="page."]')];
  expect(rows.map(r => r.dataset.row)).toEqual(['page.home', 'page.p1', 'page.modules']);
  expect(rows[0].textContent).toContain('Beranda');
  expect(rows[0].textContent).toContain('3 widget');
  expect(rows[1].querySelector('.label')!.textContent).toBe('<b>Kerja</b>');
  expect(rows[1].querySelector('b')).toBeNull();
  expect(rows[2].textContent).toContain('Modul');
  expect(rows[2].textContent).toContain('6 per baris');
  expect(rows[0].querySelector('svg')).not.toBeNull();
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

test('the prayer method saves at once', async () => {
  const { root, bridge } = await open();
  const method = key(root, 'home.prayerMethod') as HTMLSelectElement;
  expect(method.value).toBe('kemenag');
  expect([...method.options].map(o => o.textContent)[0]).toBe('Kemenag RI');
  method.value = 'karachi';
  method.dispatchEvent(new Event('change'));
  expect(bridge.setPrayerMethod).toHaveBeenCalledWith('karachi');
});

test('the Halaman page has the prayer notification switch', async () => {
  const { root, bridge, text } = await open();
  const sw = key(root, 'home.prayerNotice')!;
  expect(sw.getAttribute('aria-checked')).toBe('false');
  expect(text()).toContain('Tanpa suara, kecuali kamu menyalakannya di Notifikasi.');
  sw.click();
  expect(bridge.setChannel).toHaveBeenCalledWith('home', 'prayer', { on: true, sound: false });
});


const KERJA = { id: 'p1', name: 'Kerja', icon: 'briefcase', widgets: [] };
const IBADAH = { id: 'p2', name: 'Ibadah', icon: 'moon', widgets: [] };

test('a page row opens its editor', async () => {
  const { root, app } = await open(TEST_INFO, { ...STATE, pages: [BERANDA, KERJA] });
  key(root, 'page.p1')!.click();
  expect(app.route).toEqual({ page: 'pageEdit', id: 'p1' });
  app.go({ page: 'pages' });
  enter(key(root, 'page.home')!);
  expect(app.route).toEqual({ page: 'pageEdit', id: 'home' });
  app.go({ page: 'pages' });
  key(root, 'page.modules')!.click();
  expect(app.route).toEqual({ page: 'modules' });
});

test('Tambah halaman makes a page and opens it', async () => {
  const { root, app, bridge } = await open();
  // The native side broadcasts the new page before the command returns.
  bridge.addPage.mockImplementation(async () => {
    bridge.emitModuleState({ ...STATE, pages: [BERANDA, { id: 'p1', name: 'Halaman baru', icon: 'star', widgets: [] }] });
    return 'p1';
  });
  key(root, 'pages.add')!.click();
  expect(bridge.addPage).toHaveBeenCalledWith('Halaman baru', 'star');
  await settle();
  expect(app.route).toEqual({ page: 'pageEdit', id: 'p1' });
  expect(root.querySelector('.pane h1')!.textContent).toBe('Halaman baru');
  expect((key(root, 'pageEdit.name') as HTMLInputElement).value).toBe('Halaman baru');
});

test('a new page whose state is still on its way waits for it', async () => {
  const { root, app, bridge } = await open();
  key(root, 'pages.add')!.click();
  await settle();
  expect(app.route).toEqual({ page: 'pageEdit', id: 'p1' });
  bridge.emitModuleState({ ...STATE, pages: [BERANDA, { id: 'p1', name: 'Halaman baru', icon: 'star', widgets: [] }] });
  expect(app.route).toEqual({ page: 'pageEdit', id: 'p1' });
  expect(root.querySelector('.pane h1')!.textContent).toBe('Halaman baru');
});

test('Alt+Down moves a custom page', async () => {
  const { root, bridge } = await open(TEST_INFO, { ...STATE, pages: [BERANDA, KERJA, IBADAH] });
  const alt = (k: string, dir: string) =>
    key(root, k)!.dispatchEvent(new KeyboardEvent('keydown', { key: dir, altKey: true, bubbles: true }));
  alt('page.p1', 'ArrowDown');
  expect(bridge.movePage).toHaveBeenCalledWith('p1', 1);
  alt('page.p2', 'ArrowUp');
  expect(bridge.movePage).toHaveBeenCalledWith('p2', 0);
  alt('page.p1', 'ArrowUp');
  expect(bridge.movePage).toHaveBeenCalledTimes(2);
  expect(root.querySelectorAll('[data-row="page.p1"] .ed-grip')).toHaveLength(1);
});

test('Beranda has no grip and cannot move', async () => {
  const { root, bridge } = await open(TEST_INFO, { ...STATE, pages: [BERANDA, KERJA] });
  expect(root.querySelector('[data-row="page.home"] .ed-grip')).toBeNull();
  expect(root.querySelector('[data-row="page.modules"] .ed-grip')).toBeNull();
  key(root, 'page.home')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
  expect(bridge.movePage).not.toHaveBeenCalled();
  expect(root.querySelector('.pane')!.textContent).toContain('Beranda selalu pertama, Modul selalu terakhir.');
});
