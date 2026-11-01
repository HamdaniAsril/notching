// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { ModuleState } from '../../modules/types';
import { BERANDA, homeWidgets, moduleInfo, TEST_STATE } from '../../notch/test-helpers';
import { mountForTest, settle, TEST_INFO } from '../test-helpers';
import type { SettingsInfo } from '../types';

const STATE: ModuleState = {
  ...TEST_STATE,
  modules: [
    homeWidgets(),
    moduleInfo('system-stat', { name: 'System stat' }),
  ],
};
const key = (root: HTMLElement, k: string) => root.querySelector<HTMLElement>(`[data-key="${k}"]`);

async function open(info: SettingsInfo = TEST_INFO, state: ModuleState = STATE) {
  const t = await mountForTest(state, info);
  t.app.go({ page: 'pages' });
  return { ...t, text: () => t.root.querySelector('.pane')!.textContent! };
}

const enter = (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

test('the city and prayer settings are not on the Halaman page', async () => {
  const { root, text } = await open();
  expect(root.querySelector('.pane h1')!.textContent).toBe('Halaman');
  expect(key(root, 'home.placeChange')).toBeNull();
  expect(key(root, 'home.prayerMethod')).toBeNull();
  expect(text()).not.toContain('Data widget');
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
  expect(rows[2].textContent).toContain('4 per baris');
  expect(rows[0].querySelector('svg')).not.toBeNull();
});

test('a page counts its strip among its widgets', async () => {
  const kerja = { id: 'p1', name: 'Kerja', icon: 'briefcase', widgets: [{ widget: 'home/clock', col: 0, width: 1 },
    { widget: 'home/date', col: 1, width: 1 }], strip: 'timer/strip' };
  const { root } = await open(TEST_INFO, { ...STATE, pages: [BERANDA, kerja] });
  expect(root.querySelector('[data-row="page.p1"]')!.textContent).toContain('3 widget');
});

test('System stat still says it has no settings', async () => {
  const t = await mountForTest(STATE);
  t.app.go({ page: 'module', id: 'system-stat' });
  expect(t.root.querySelector('.pane')!.textContent).toContain('Modul ini belum punya pengaturan.');
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
  // The name is typed in the title itself, ready to be replaced.
  const name = root.querySelector<HTMLInputElement>('.pane h1 [data-key="pageEdit.name"]')!;
  expect(name.value).toBe('Halaman baru');
  expect(document.activeElement).toBe(name);
  expect([name.selectionStart, name.selectionEnd]).toEqual([0, 'Halaman baru'.length]);
});

test('a new page whose state is still on its way waits for it', async () => {
  const { root, app, bridge } = await open();
  key(root, 'pages.add')!.click();
  await settle();
  expect(app.route).toEqual({ page: 'pageEdit', id: 'p1' });
  bridge.emitModuleState({ ...STATE, pages: [BERANDA, { id: 'p1', name: 'Halaman baru', icon: 'star', widgets: [] }] });
  expect(app.route).toEqual({ page: 'pageEdit', id: 'p1' });
  expect((key(root, 'pageEdit.name') as HTMLInputElement).value).toBe('Halaman baru');
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

test('dragging a page by its grip lifts it like a widget', async () => {
  const { root, bridge } = await open(TEST_INFO, { ...STATE, pages: [BERANDA, KERJA, IBADAH] });
  const rows = [...root.querySelectorAll<HTMLElement>('[data-row="page.p1"], [data-row="page.p2"]')];
  rows.forEach((r, i) => vi.spyOn(r, 'getBoundingClientRect').mockReturnValue(
    { left: 0, top: 100 + i * 40, right: 400, bottom: 140 + i * 40, width: 400, height: 40, x: 0, y: 100 + i * 40, toJSON: () => ({}) }));
  const grip = rows[0].querySelector<HTMLElement>('.ed-grip')!;
  const at = (type: string, y: number) => grip.dispatchEvent(new MouseEvent(type, { clientX: 5, clientY: y, bubbles: true }));
  at('pointerdown', 120);
  at('pointermove', 175);
  expect(document.querySelector('.ed-ghost')).not.toBeNull();
  expect(rows[0].classList.contains('ed-dragging')).toBe(true);
  at('pointerup', 175);
  expect(bridge.movePage).toHaveBeenCalledWith('p1', 1);
  await new Promise(r => setTimeout(r, 300));
  expect(document.querySelector('.ed-ghost')).toBeNull();
});
