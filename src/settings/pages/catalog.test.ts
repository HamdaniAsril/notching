// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ModuleState, WidgetInfo } from '../../modules/types';
import { homeWidgets, moduleInfo, TEST_STATE, timers } from '../../notch/test-helpers';
import { h1, mountForTest, settle } from '../test-helpers';

const widget = (id: string, name: string, width = 1): WidgetInfo => ({ id, name, entry: 'index.html', width, kind: 'time' });

const STATE: ModuleState = {
  ...TEST_STATE,
  modules: [
    homeWidgets(),
    moduleInfo('system-stat', { name: 'System stat', description: 'CPU, memori, jaringan', size: 140 * 1024 }),
    moduleInfo('mirror', { name: 'Cermin', description: 'Kamera untuk berkaca', permissions: ['camera'], installed: false, enabled: false }),
    moduleInfo('waktu', {
      name: 'Waktu', description: 'Jam dan kalender', entry: null, card: null, size: 48 * 1024,
      widgets: [widget('clockdate', 'Jam + tanggal', 2), widget('analog', 'Analog'), widget('yearday', 'Hari ke'), widget('zones', 'Zona', 2)],
    }),
    moduleInfo('musik', {
      name: 'Musik', entry: null, card: null, installed: false, enabled: false,
      widgets: [widget('player', 'Pemutar', 2), widget('strip', 'Strip', 4), widget('mini', 'Mini')],
    }),
  ],
};

const card = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`.cat-card[data-row="catalog.${id}"]`)!;
const key = (root: HTMLElement, k: string) => root.querySelector<HTMLElement>(`[data-key="${k}"]`)!;
const ids = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.cat-card')].map(c => c.dataset.row);

async function open(state = STATE) {
  const t = await mountForTest(state);
  t.app.go({ page: 'catalog' });
  return t;
}

test('Modul opens the Katalog', async () => {
  const { root, app } = await mountForTest(STATE);
  app.go({ page: 'modules' });
  expect(key(root, 'modules.catalog').textContent).toBe('Katalog');
  key(root, 'modules.catalog').click();
  expect(app.route).toEqual({ page: 'catalog' });
  expect(h1(root)).toBe('Katalog');
  expect(root.querySelector('.head .sub')!.textContent).toBe('Semua isi Notching. Sudah ada di app, tanpa unduhan.');
  expect(root.querySelector('button.nav.on')?.textContent).toContain('Modul');
});

test('modules come first, then widget packages, never Beranda', async () => {
  const { root } = await open();
  expect(ids(root)).toEqual(['catalog.system-stat', 'catalog.mirror', 'catalog.waktu', 'catalog.musik']);
  expect(card(root, 'mirror').dataset.kind).toBe('module');
  expect(card(root, 'waktu').dataset.kind).toBe('widgets');
  expect(card(root, 'mirror').querySelector('.cat-kind')!.textContent).toBe('Modul');
  expect(card(root, 'waktu').querySelector('.cat-kind')!.textContent).toBe('Widget');
});

test('a module card says which system permission it needs', async () => {
  const { root } = await open();
  expect(card(root, 'mirror').textContent).toContain('Butuh izin: Kamera');
  expect(card(root, 'system-stat').textContent).toContain('Tanpa izin sistem');
  expect(card(root, 'system-stat').textContent).toContain('v1.0.0 · 140 KB');
});

test('a package card shows up to three of its widgets and how many there are', async () => {
  const { root } = await open();
  expect(card(root, 'waktu').querySelectorAll('.cat-peek > .ed-shot')).toHaveLength(3);
  expect(card(root, 'waktu').textContent).toContain('4 widget');
  // The strip is left out of the picture, not the count.
  expect([...card(root, 'musik').querySelectorAll<HTMLElement>('.cat-peek > .ed-shot')].map(e => e.dataset.width)).toEqual(['2', '1']);
  expect(card(root, 'musik').textContent).toContain('3 widget');
});

test('Pasang installs and stays on the Katalog', async () => {
  const { root, app, bridge } = await open();
  expect(key(root, 'catalog.mirror.install').textContent).toBe('Pasang');
  expect(key(root, 'catalog.mirror.install').className).toBe('btn solid');
  key(root, 'catalog.musik.install').click();
  expect(bridge.reinstallModule).toHaveBeenCalledWith('musik');
  await settle();
  expect(app.route).toEqual({ page: 'catalog' });
});

test('an installed card says so, and Copot takes a second click', async () => {
  const { root, app, bridge } = await open();
  expect(card(root, 'waktu').textContent).toContain('Terpasang');
  const copot = key(root, 'catalog.waktu.uninstall');
  expect(copot.textContent).toBe('Copot');
  expect(copot.className).toBe('btn danger');
  copot.click();
  expect(key(root, 'catalog.waktu.uninstall').textContent).toBe('Yakin? Klik lagi');
  expect(bridge.uninstallModule).not.toHaveBeenCalled();
  key(root, 'catalog.waktu.uninstall').click();
  expect(bridge.uninstallModule).toHaveBeenCalledWith('waktu');
  await settle();
  expect(app.route).toEqual({ page: 'catalog' });
});

test('the Copot confirmation wears off', async () => {
  const { root, bridge } = await open();
  key(root, 'catalog.system-stat.uninstall').click();
  timers.advance(4000);
  expect(key(root, 'catalog.system-stat.uninstall').textContent).toBe('Copot');
  key(root, 'catalog.system-stat.uninstall').click();
  expect(bridge.uninstallModule).not.toHaveBeenCalled();
});

test('a failed install leaves the button and says it failed', async () => {
  const { root, bridge } = await open();
  bridge.reinstallModule.mockRejectedValueOnce(new Error('disk'));
  key(root, 'catalog.mirror.install').click();
  await settle();
  expect(card(root, 'mirror').querySelector('.err')!.textContent).toBe('Gagal menyimpan. Coba lagi.');
  expect(key(root, 'catalog.mirror.install')).not.toBeNull();
});

test('the chips show modules or widget packages only', async () => {
  const { root } = await open();
  expect(key(root, 'catalog.filter.all').getAttribute('aria-pressed')).toBe('true');
  key(root, 'catalog.filter.module').click();
  expect(ids(root)).toEqual(['catalog.system-stat', 'catalog.mirror']);
  expect(key(root, 'catalog.filter.module').getAttribute('aria-pressed')).toBe('true');
  key(root, 'catalog.filter.widgets').click();
  expect(ids(root)).toEqual(['catalog.waktu', 'catalog.musik']);
  key(root, 'catalog.filter.all').click();
  expect(ids(root)).toHaveLength(4);
});

test('the Katalog follows the language', async () => {
  const { root, bridge } = await open();
  bridge.emitModuleState({ ...STATE, lang: 'en' });
  expect(h1(root)).toBe('Catalog');
  expect(key(root, 'catalog.mirror.install').textContent).toBe('Install');
  expect(card(root, 'mirror').textContent).toContain('Needs: Camera');
  expect(card(root, 'waktu').textContent).toContain('4 widgets');
});

test('the back button returns to Modul', async () => {
  const { root, app } = await open();
  key(root, 'module.back').click();
  expect(app.route).toEqual({ page: 'modules' });
});

test('a search for a package opens the Katalog with its card marked', async () => {
  const { root, app } = await mountForTest(STATE);
  const input = root.querySelector<HTMLInputElement>('input.search')!;
  input.value = 'musik';
  input.dispatchEvent(new Event('input'));
  root.querySelector<HTMLElement>('.result')!.click();
  expect(app.route).toEqual({ page: 'catalog' });
  expect(card(root, 'musik').classList.contains('found')).toBe(true);
});
