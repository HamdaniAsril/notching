// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { ModuleState, Page, Placement } from '../../modules/types';
import { BERANDA, homeWidgets, moduleInfo, TEST_STATE, timerInfo } from '../../notch/test-helpers';
import { pageIconSvg } from '../../pages/icons';
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
    [at('home/date', 0), at('home/weather', 1), at('home/reminders', 2, 2)], null);
});

test('a widget already here or without room is dimmed', async () => {
  const { root, bridge } = await edit('home');
  const buttons = [...root.querySelectorAll<HTMLElement>('.ed-widget')];
  expect(buttons.map(b => b.getAttribute('aria-disabled'))).toEqual(buttons.map(() => 'true'));
  expect(widgetButton(root, 'Tanggal').textContent).toContain('Sudah dipasang');
  expect(widgetButton(root, 'Jam').textContent).toContain('Penuh, seret untuk mengganti');
  expect(widgetButton(root, 'Reminder').title).toBe('Kerja · 2 kolom');
  widgetButton(root, 'Jam').click();
  expect(bridge.setPage).not.toHaveBeenCalled();
});

test('each widget shows a preview with its name below, in a grid', async () => {
  const { root } = await edit('p1');
  const jam = widgetButton(root, 'Jam');
  expect([...jam.children].map(c => c.className)).toEqual(['ed-shot', 'ed-name', 'ed-why']);
  expect(jam.querySelector('.ed-shot .hm-clock .v-num')).not.toBeNull();
  expect(jam.title).toBe('Waktu · 1 kolom');
  expect(jam.dataset.width).toBe('1');
  const tanggal = widgetButton(root, 'Tanggal');
  expect([...tanggal.children].map(c => c.className)).toEqual(['ed-shot', 'ed-name']);
  const reminder = widgetButton(root, 'Reminder');
  expect(reminder.dataset.width).toBe('2');
  expect(reminder.querySelectorAll('.ed-shot .rm')).toHaveLength(3);
  expect(widgetButton(root, 'Cuaca').querySelector('.ed-shot .hm-weather .v-num')).not.toBeNull();
});

test('a widget from another package gets a plain preview', async () => {
  const other = moduleInfo('timer', { entry: null, card: null,
    widgets: [{ id: 'timer', name: 'Timer', entry: 'index.html', width: 1, kind: 'work' }] });
  const { root } = await edit('p1', { ...STATE, modules: [...STATE.modules, other] });
  const timer = widgetButton(root, 'Timer');
  expect(timer.querySelector('.ed-shot')!.textContent).toBe('Timer');
});

test('removing a widget frees its columns', async () => {
  const { root, bridge } = await edit('home');
  const remove = root.querySelector<HTMLElement>('[aria-label="Lepas Reminder"]')!;
  remove.click();
  expect(bridge.setPage).toHaveBeenCalledWith('home', null, 'home', [at('home/date', 0), at('home/weather', 1)], null);
  expect(root.querySelectorAll('.ed-row .ed-empty')).toHaveLength(2);
});

test('the preview lays the slots out in four columns', async () => {
  const { root } = await edit('home');
  const slots = [...root.querySelectorAll<HTMLElement>('.ed-row .ed-slot')];
  expect(slots.map(s => [s.dataset.col, s.dataset.width])).toEqual([['0', '1'], ['1', '1'], ['2', '2']]);
  expect(slots.map(s => s.getAttribute('aria-label'))).toEqual(['Tanggal', 'Cuaca', 'Reminder']);
});

test('the preview is shaped like the notch and shows each widget', async () => {
  const { root } = await edit('home');
  const notch = root.querySelector<HTMLElement>('.ed-notch')!;
  expect(notch.querySelector('.ed-row')).not.toBeNull();
  const [date, weather, reminders] = [...notch.querySelectorAll<HTMLElement>('.ed-slot')];
  expect(date.querySelector('.hm-date .v-num')).not.toBeNull();
  expect(weather.querySelector('.hm-weather .v-num')).not.toBeNull();
  expect(reminders.querySelectorAll('.rm')).toHaveLength(3);
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
  expect(slot.querySelector('.ed-off-name')!.textContent).toBe('timer/timer');
  expect(slot.querySelector('.lab')).toBeNull();
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
  expect(bridge.setPage).toHaveBeenCalledWith('p1', 'Kantor', 'briefcase', [at('home/clock', 0)], null);
});

test('a page name is text, never markup', async () => {
  const evil = { ...KERJA, name: '<img src=x onerror=1>' };
  const { root } = await edit('p1', { ...STATE, pages: [BERANDA, evil] });
  expect(root.querySelector<HTMLInputElement>('.pane h1 [data-key="pageEdit.name"]')!.value).toBe('<img src=x onerror=1>');
  expect(root.querySelector('.pane img')).toBeNull();
});

test('the name and icon are edited in the head, with no rows below', async () => {
  const { root } = await edit('p1');
  const labels = [...root.querySelectorAll('.pane .row .label')].map(l => l.textContent);
  expect(labels).not.toContain('Nama');
  expect(labels).not.toContain('Ikon');
  const iconButton = key(root, 'pageEdit.icon')!;
  expect(iconButton.closest('.head')).not.toBeNull();
  expect(iconButton.querySelector('.ed-edit')).not.toBeNull();
  expect(iconButton.getAttribute('aria-label')).toBe('Ganti ikon');
});

test('clicking the icon opens a popup of icons; picking one saves it', async () => {
  const { root, bridge } = await edit('p1');
  const iconButton = key(root, 'pageEdit.icon')!;
  expect(root.querySelector('.ed-icons')).toBeNull();
  expect(iconButton.getAttribute('aria-expanded')).toBe('false');
  iconButton.click();
  expect(iconButton.getAttribute('aria-expanded')).toBe('true');
  expect(root.querySelectorAll('.ed-icons button')).toHaveLength(24);
  expect(key(root, 'pageEdit.icon.briefcase')!.getAttribute('aria-pressed')).toBe('true');
  key(root, 'pageEdit.icon.book')!.click();
  expect(bridge.setPage).toHaveBeenCalledWith('p1', 'Kerja', 'book', [at('home/clock', 0)], null);
  expect(root.querySelector('.ed-icons')).toBeNull();
});

test('the icon popup closes with Escape or a click elsewhere', async () => {
  const { root, bridge } = await edit('p1');
  key(root, 'pageEdit.icon')!.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(root.querySelector('.ed-icons')).toBeNull();
  key(root, 'pageEdit.icon')!.click();
  root.querySelector<HTMLElement>('.ed-row')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(root.querySelector('.ed-icons')).toBeNull();
  expect(bridge.setPage).not.toHaveBeenCalled();
});

test('deleting takes a second click', async () => {
  const { root, bridge, app } = await edit('p1');
  const del = key(root, 'pageEdit.delete')!;
  expect(del.className).toBe('btn danger');
  del.click();
  expect(bridge.deletePage).not.toHaveBeenCalled();
  expect(del.textContent).toBe('Yakin? Klik lagi');
  expect(del.className).toBe('btn danger confirm');
  del.click();
  expect(bridge.deletePage).toHaveBeenCalledWith('p1');
  await settle();
  expect(app.route).toEqual({ page: 'pages' });
});

test('Beranda has no name field, icon picker or delete button', async () => {
  const { root } = await edit('home');
  expect(key(root, 'pageEdit.name')).toBeNull();
  expect(key(root, 'pageEdit.icon')).toBeNull();
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

// Drags with pointer events over a preview row measured as 400 × 100 at the top left.
function drag(root: HTMLElement, from: HTMLElement, x: number, y = 50): void {
  const row = root.querySelector<HTMLElement>('.ed-row')!;
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
    { left: 0, top: 0, right: 400, bottom: 100, width: 400, height: 100, x: 0, y: 0, toJSON: () => ({}) });
  const at = (type: string, cx: number, cy: number) =>
    from.dispatchEvent(new MouseEvent(type, { clientX: cx, clientY: cy, bubbles: true }));
  at('pointerdown', 10, 300);
  at('pointermove', x, y);
  expect(document.querySelector('.ed-ghost')).not.toBeNull();
  expect(from.classList.contains('ed-dragging')).toBe(true);
  at('pointerup', x, y);
}

test('dragging a slot onto another swaps them', async () => {
  const { root, bridge } = await edit('home');
  const weather = root.querySelector<HTMLElement>('.ed-slot[aria-label="Cuaca"]')!;
  drag(root, weather, 10);
  expect(bridge.setPage).toHaveBeenCalledWith('home', null, 'home',
    [at('home/weather', 0), at('home/date', 1), at('home/reminders', 2, 2)], null);
});

test('dragging a widget onto a full row replaces what it covers', async () => {
  const { root, bridge } = await edit('home');
  drag(root, widgetButton(root, 'Jam'), 350);
  expect(bridge.setPage).toHaveBeenCalledWith('home', null, 'home',
    [at('home/date', 0), at('home/weather', 1), at('home/clock', 2)], null);
});

test('the ghost goes once the drag ends', async () => {
  const { root } = await edit('home');
  drag(root, widgetButton(root, 'Jam'), 999, 999);
  await new Promise(r => setTimeout(r, 300));
  expect(document.querySelector('.ed-ghost')).toBeNull();
  expect(root.querySelector('.ed-dragging')).toBeNull();
});

test('a card draws the widget at its notch size, the same as in the preview', async () => {
  const { root } = await edit('p1');
  const card = widgetButton(root, 'Jam').querySelector<HTMLElement>('.ed-shot')!;
  const slot = root.querySelector<HTMLElement>('.ed-slot[aria-label="Jam"]')!;
  const size = (e: HTMLElement) => e.querySelector<HTMLElement>('.hm-clock .v-num')!.style.fontSize;
  expect(size(card)).toBe('48px');
  expect(size(slot)).toBe('48px');
  expect(card.dataset.width).toBe('1');
  expect(widgetButton(root, 'Reminder').querySelector<HTMLElement>('.ed-shot')!.dataset.width).toBe('2');
});

test('dragging onto the right half of a wide widget swaps with it too', async () => {
  const { root, bridge } = await edit('home');
  const weather = root.querySelector<HTMLElement>('.ed-slot[aria-label="Cuaca"]')!;
  drag(root, weather, 350);
  expect(bridge.setPage).toHaveBeenCalledWith('home', null, 'home',
    [at('home/date', 0), at('home/reminders', 1, 2), at('home/weather', 3)], null);
});

test('the preview refits only when its width changes, so resizing never loops', async () => {
  const seen: (() => void)[] = [];
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb: () => void) { seen.push(cb); }
    observe() {}
    disconnect() {}
  });
  try {
    const { root } = await edit('home');
    const notch = root.querySelector<HTMLElement>('.ed-notch')!;
    const row = root.querySelector<HTMLElement>('.ed-row')!;
    let width = 334;
    Object.defineProperty(notch, 'clientWidth', { get: () => width });
    const fit = seen[seen.length - 1];
    fit();
    expect(row.style.transform).toBe('scale(0.5)');
    // Its own margins change the height and call it again: nothing is rewritten.
    row.style.transform = 'scale(0.9)';
    fit();
    expect(row.style.transform).toBe('scale(0.9)');
    width = 612;
    fit();
    expect(row.style.transform).toBe('');
  } finally {
    vi.unstubAllGlobals();
  }
});

const enterOn = (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

test('a rename and then an icon change keep both, before any echo comes back', async () => {
  const { root, bridge } = await edit('p1');
  const name = key(root, 'pageEdit.name') as HTMLInputElement;
  name.value = 'Kantor';
  enterOn(name);
  key(root, 'pageEdit.icon')!.click();
  key(root, 'pageEdit.icon.book')!.click();
  expect(bridge.setPage).toHaveBeenLastCalledWith('p1', 'Kantor', 'book', [at('home/clock', 0)], null);
  // The head shows the new icon at once.
  const book = document.createElement('span');
  book.innerHTML = pageIconSvg('book');
  expect(key(root, 'pageEdit.icon')!.querySelector('.pg-icon')!.innerHTML).toBe(book.innerHTML);
});

test('the echo of its own save leaves the editor as it is', async () => {
  const { root, bridge } = await edit('p1');
  const name = key(root, 'pageEdit.name') as HTMLInputElement;
  name.value = 'Kantor';
  enterOn(name);
  key(root, 'pageEdit.icon')!.click();
  const popup = root.querySelector('.ed-icons');
  expect(popup).not.toBeNull();
  bridge.emitModuleState({ ...STATE, pages: [BERANDA, { ...KERJA, name: 'Kantor' }] });
  expect(root.querySelector('.ed-icons')).toBe(popup);
  expect(key(root, 'pageEdit.name')).toBe(name);
  // Anything else still rebuilds it.
  bridge.emitModuleState({ ...STATE, pages: [BERANDA, { ...KERJA, name: 'Gudang' }] });
  expect((key(root, 'pageEdit.name') as HTMLInputElement).value).toBe('Gudang');
  expect(root.querySelector('.ed-icons')).toBeNull();
});

const WITH_TIMER: ModuleState = { ...STATE, modules: [...STATE.modules, timerInfo()] };
const stripCard = (root: HTMLElement, ref = 'timer/strip') => key(root, `pageEdit.widget.${ref}`)!;

test('the strip area says Strip when empty and a strip card fills it', async () => {
  const { root, bridge } = await edit('p1', WITH_TIMER);
  expect(root.querySelector('.ed-row .ed-strip-empty')!.textContent).toBe('Strip');
  // No dotted line between the row and the strip (design 2 Nov, Volt §4).
  expect(root.querySelector('.ed-row .ed-strip-line')).toBeNull();
  expect(stripCard(root).dataset.width).toBe('4');
  stripCard(root).click();
  expect(bridge.setPage).toHaveBeenCalledWith('p1', 'Kerja', 'briefcase', [at('home/clock', 0)], 'timer/strip');
  expect(root.querySelector('.ed-row .ed-strip')).not.toBeNull();
});

test('a placed strip shows its sample with a remove button and its card is disabled', async () => {
  const { root, bridge } = await edit('p1', { ...WITH_TIMER, pages: [BERANDA, { ...KERJA, strip: 'timer/strip' }] });
  const strip = root.querySelector<HTMLElement>('.ed-row .ed-strip')!;
  expect(strip.dataset.key).toBe('pageEdit.strip');
  expect(strip.textContent).toContain('30:00');
  expect(strip.textContent).not.toContain('25m');
  expect(stripCard(root).getAttribute('aria-disabled')).toBe('true');
  expect(stripCard(root).textContent).toContain('Sudah dipasang');
  stripCard(root).click();
  expect(bridge.setPage).not.toHaveBeenCalled();
  key(root, 'pageEdit.remove.timer/strip')!.click();
  expect(bridge.setPage).toHaveBeenCalledWith('p1', 'Kerja', 'briefcase', [at('home/clock', 0)], null);
  expect(root.querySelector('.ed-row .ed-strip-empty')).not.toBeNull();
});

test('another strip widget replaces the strip', async () => {
  const bar = moduleInfo('bar', { widgets: [{ id: 'bar', name: 'Bar', entry: 'index.html', width: 4, kind: 'work' }] });
  const state = { ...WITH_TIMER, modules: [...WITH_TIMER.modules, bar], pages: [BERANDA, { ...KERJA, strip: 'timer/strip' }] };
  const { root, bridge } = await edit('p1', state);
  stripCard(root, 'bar/bar').click();
  expect(bridge.setPage).toHaveBeenCalledWith('p1', 'Kerja', 'briefcase', [at('home/clock', 0)], 'bar/bar');
});

test('row widgets still go to the row and keep the strip', async () => {
  const { root, bridge } = await edit('p1', { ...WITH_TIMER, pages: [BERANDA, { ...KERJA, strip: 'timer/strip' }] });
  widgetButton(root, 'Cuaca').click();
  expect(bridge.setPage).toHaveBeenCalledWith('p1', 'Kerja', 'briefcase', [at('home/clock', 0), at('home/weather', 1)], 'timer/strip');
});

test('a strip whose module is off keeps its place, marked off', async () => {
  const state = { ...STATE, modules: [...STATE.modules, timerInfo({ enabled: false })], pages: [BERANDA, { ...KERJA, strip: 'timer/strip' }] };
  const { root } = await edit('p1', state);
  const strip = root.querySelector<HTMLElement>('.ed-row .ed-strip')!;
  expect(strip.classList.contains('off')).toBe(true);
  expect(strip.textContent).toContain('Modul dimatikan');
  expect(strip.querySelector('.ed-off-name')).not.toBeNull();
  expect(strip.querySelector('.lab')).toBeNull();
});

test('the echo of its own save with a null strip leaves the editor as it is', async () => {
  const { root, bridge } = await edit('p1');
  key(root, 'pageEdit.icon')!.click();
  const popup = root.querySelector('.ed-icons');
  (key(root, 'pageEdit.name') as HTMLInputElement).value = 'Kantor';
  enterOn(key(root, 'pageEdit.name') as HTMLInputElement);
  bridge.emitModuleState({ ...STATE, pages: [BERANDA, { ...KERJA, name: 'Kantor', strip: null }] });
  expect(root.querySelector('.ed-icons')).toBe(popup);
});
