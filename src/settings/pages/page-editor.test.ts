// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ModuleState, Page, Placement } from '../../modules/types';
import { BERANDA, homeWidgets, moduleInfo, TEST_STATE } from '../../notch/test-helpers';
import { mountForTest, settle, TEST_INFO } from '../test-helpers';

const at = (widget: string, col: number, width = 1): Placement => ({ widget, col, width });
const KERJA: Page = { id: 'p1', name: 'Kerja', icon: 'briefcase', widgets: [at('home/clock', 0)] };
const STATE: ModuleState = {
  ...TEST_STATE,
  modules: [homeWidgets(), moduleInfo('system-stat', { name: 'System stat' })],
  pages: [BERANDA, KERJA],
};
const key = (root: HTMLElement, k: string) => root.querySelector<HTMLElement>(`[data-key="${k}"]`);
const widgetButton = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('.ed-widget')].find(b => b.querySelector('.ed-name')!.textContent === name)!;

async function edit(id: string, state: ModuleState = STATE) {
  const t = await mountForTest(state, TEST_INFO);
  t.app.go({ page: 'pageEdit', id });
  return t;
}

test('clicking a widget puts it in the first free spot', async () => {
  const noWeather = { ...BERANDA, widgets: [at('home/date', 0), at('home/reminders', 2, 2)] };
  const { root, bridge } = await edit('home', { ...STATE, pages: [noWeather, KERJA] });
  expect(root.querySelector('.pane h1')!.textContent).toBe('Beranda');
  widgetButton(root, 'Cuaca').click();
  expect(bridge.setPage).toHaveBeenCalledWith('home', null, 'home',
    [at('home/date', 0), at('home/weather', 1), at('home/reminders', 2, 2)]);
});

test('a widget already here or without room is dimmed', async () => {
  const { root, bridge } = await edit('home');
  const buttons = [...root.querySelectorAll<HTMLElement>('.ed-widget')];
  expect(buttons.map(b => b.getAttribute('aria-disabled'))).toEqual(buttons.map(() => 'true'));
  expect(widgetButton(root, 'Tanggal').textContent).toContain('Sudah dipasang');
  expect(widgetButton(root, 'Jam').textContent).toContain('Tidak muat');
  expect(widgetButton(root, 'Reminder').textContent).toContain('2 kolom');
  widgetButton(root, 'Jam').click();
  expect(bridge.setPage).not.toHaveBeenCalled();
});

test('removing a widget frees its columns', async () => {
  const { root, bridge } = await edit('home');
  const remove = root.querySelector<HTMLElement>('[aria-label="Lepas Reminder"]')!;
  remove.click();
  expect(bridge.setPage).toHaveBeenCalledWith('home', null, 'home', [at('home/date', 0), at('home/weather', 1)]);
  expect(root.querySelectorAll('.ed-row .ed-empty')).toHaveLength(2);
});

test('the preview lays the slots out in four columns', async () => {
  const { root } = await edit('home');
  const slots = [...root.querySelectorAll<HTMLElement>('.ed-row .ed-slot')];
  expect(slots.map(s => [s.dataset.col, s.dataset.width])).toEqual([['0', '1'], ['1', '1'], ['2', '2']]);
  expect(slots.map(s => s.querySelector('.ed-name')!.textContent)).toEqual(['Tanggal', 'Cuaca', 'Reminder']);
});

test('the kind filter keeps only that kind and survives a rebuild', async () => {
  const { root, bridge } = await edit('p1');
  const chips = [...root.querySelectorAll<HTMLElement>('.ed-filter button')];
  expect(chips.map(c => c.textContent)).toEqual(['Semua', 'Waktu', 'Cuaca', 'Ibadah', 'Kerja']);
  key(root, 'pageEdit.filter.worship')!.click();
  const names = () => [...root.querySelectorAll('.ed-widget .ed-name')].map(n => n.textContent);
  expect(names()).toEqual(['Waktu sholat']);
  bridge.emitModuleState({ ...STATE });
  expect(names()).toEqual(['Waktu sholat']);
  expect(key(root, 'pageEdit.filter.worship')!.getAttribute('aria-pressed')).toBe('true');
  key(root, 'pageEdit.filter.all')!.click();
  expect(names()).toHaveLength(5);
});

test('a missing widget shows as switched off', async () => {
  const timer = { ...KERJA, widgets: [at('timer/timer', 3)] };
  const { root } = await edit('p1', { ...STATE, pages: [BERANDA, timer] });
  const slot = root.querySelector<HTMLElement>('.ed-slot.off')!;
  expect(slot.dataset.col).toBe('3');
  expect(slot.textContent).toContain('Modul dimatikan');
});

test('renaming saves on Enter, not when unchanged', async () => {
  const { root, bridge } = await edit('p1');
  const name = key(root, 'pageEdit.name') as HTMLInputElement;
  expect(name.maxLength).toBe(24);
  name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  name.dispatchEvent(new Event('blur'));
  expect(bridge.setPage).not.toHaveBeenCalled();
  name.value = 'Kantor';
  name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  name.dispatchEvent(new Event('blur'));
  expect(bridge.setPage).toHaveBeenCalledTimes(1);
  expect(bridge.setPage).toHaveBeenCalledWith('p1', 'Kantor', 'briefcase', [at('home/clock', 0)]);
});

test('a page name is text, never markup', async () => {
  const evil = { ...KERJA, name: '<img src=x onerror=1>' };
  const { root } = await edit('p1', { ...STATE, pages: [BERANDA, evil] });
  expect(root.querySelector('.pane h1')!.textContent).toBe('<img src=x onerror=1>');
  expect((key(root, 'pageEdit.name') as HTMLInputElement).value).toBe('<img src=x onerror=1>');
  expect(root.querySelector('.pane img')).toBeNull();
});

test('picking an icon saves it', async () => {
  const { root, bridge } = await edit('p1');
  const icons = [...root.querySelectorAll<HTMLElement>('.ed-icons button')];
  expect(icons).toHaveLength(24);
  expect(key(root, 'pageEdit.icon.briefcase')!.getAttribute('aria-pressed')).toBe('true');
  key(root, 'pageEdit.icon.book')!.click();
  expect(bridge.setPage).toHaveBeenCalledWith('p1', 'Kerja', 'book', [at('home/clock', 0)]);
});

test('deleting takes a second click', async () => {
  const { root, bridge, app } = await edit('p1');
  const del = key(root, 'pageEdit.delete')!;
  del.click();
  expect(bridge.deletePage).not.toHaveBeenCalled();
  expect(del.textContent).toBe('Yakin? Klik lagi');
  del.click();
  expect(bridge.deletePage).toHaveBeenCalledWith('p1');
  await settle();
  expect(app.route).toEqual({ page: 'pages' });
});

test('Beranda has no name field, icon picker or delete button', async () => {
  const { root } = await edit('home');
  expect(key(root, 'pageEdit.name')).toBeNull();
  expect(root.querySelector('.ed-icons')).toBeNull();
  expect(key(root, 'pageEdit.delete')).toBeNull();
  expect(root.querySelector('.nav.on')!.textContent).toContain('Halaman');
});

test('the back button returns to the list', async () => {
  const { root, app } = await edit('p1');
  expect(key(root, 'pageEdit.back')!.textContent).toContain('Halaman');
  key(root, 'pageEdit.back')!.click();
  expect(app.route).toEqual({ page: 'pages' });
});

test('a page deleted elsewhere sends the editor back to the list', async () => {
  const { bridge, app } = await edit('p1');
  bridge.emitModuleState({ ...STATE, pages: [BERANDA] });
  expect(app.route).toEqual({ page: 'pages' });
});
