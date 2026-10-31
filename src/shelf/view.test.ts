// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { hostStrings } from '../i18n';
import type { ShelfItem, ShelfState } from '../bridge';
import { middleTruncate, mountShelfView } from './view';

const strings = hostStrings('id').shelf;
const item = (id: number, name: string, over: Partial<ShelfItem> = {}): ShelfItem =>
  ({ id, name, folder: false, state: 'ready', thumb: `data:image/png;base64,${id}`, ...over });
const shelf = (...items: ShelfItem[]): ShelfState => ({ items });

let box: HTMLElement;
const fakes = () => ({ strings, startDrag: vi.fn((_ids: number[]) => {}), remove: vi.fn((_ids: number[]) => {}), clear: vi.fn(() => {}) });
let deps: ReturnType<typeof fakes>;

beforeEach(() => {
  document.body.replaceChildren();
  box = document.createElement('div');
  document.body.append(box);
  deps = fakes();
});

const tile = (id: number) => box.querySelector<HTMLElement>(`.sh-tile[data-id="${id}"]`)!;
const mouse = (target: EventTarget, type: string, x = 0, y = 0, over: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: type === 'mouseup' || type === 'click' ? 0 : 1, ...over }));
const click = (id: number, over: MouseEventInit = {}) => {
  mouse(tile(id), 'mousedown', 10, 10, over);
  mouse(document, 'mouseup', 10, 10, over);
  mouse(tile(id), 'click', 10, 10, over);
};
const selected = () => [...box.querySelectorAll<HTMLElement>('.sh-tile.sel')].map(t => Number(t.dataset.id));

test('middleTruncate keeps the extension', () => {
  expect(middleTruncate('laporan-tahunan-2026.pdf')).toBe('lap…2026.pdf');
  expect(middleTruncate('foto-01.jpg')).toBe('foto-01.jpg');
  expect(middleTruncate('Desain')).toBe('Desain');
  expect(middleTruncate('a-very-long-folder-name')).toHaveLength(12);
});

test('drop mode shows the drop zone only', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, 'a.txt')), true);
  expect(box.querySelector('.sh-drop')!.textContent).toContain('Lepas untuk menitipkan');
  expect(box.querySelector('.sh-tile')).toBeNull();
});

test('head shows count and hint', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, 'a'), item(2, 'b'), item(3, 'c')), false);
  expect(box.querySelector('.sh-title')!.textContent).toBe('Titipan · 3');
  expect(box.querySelector('.sh-hint')!.textContent).toBe('Seret keluar untuk menyalin');
});

test('empty shelf shows the empty line', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(), false);
  expect(box.querySelector('.sh-empty')!.textContent).toBe('Seret file ke notch untuk menitipkan');
  expect(box.querySelector('.sh-clear')).toBeNull();
});

test('tiles show thumb and truncated name', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, 'laporan-tahunan-2026.pdf')), false);
  const img = tile(1).querySelector('img')!;
  expect(img.getAttribute('src')).toBe('data:image/png;base64,1');
  expect(img.draggable).toBe(false);
  expect(tile(1).querySelector('.sh-name')!.textContent).toBe('lap…2026.pdf');
  expect(tile(1).title).toBe('laporan-tahunan-2026.pdf');
});

test('names are text, not markup', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, '<b>x</b>')), false);
  expect(box.querySelector('b')).toBeNull();
});

test('click selects; cmd-click adds; shift-click selects a range', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, 'a'), item(2, 'b'), item(3, 'c'), item(4, 'd')), false);
  click(2);
  expect(selected()).toEqual([2]);
  click(4, { metaKey: true });
  expect(selected()).toEqual([2, 4]);
  click(4, { metaKey: true });
  expect(selected()).toEqual([2]);
  click(2);
  click(4, { shiftKey: true });
  expect(selected()).toEqual([2, 3, 4]);
  click(1);
  expect(selected()).toEqual([1]);
  // A new render keeps the selection of items still there.
  v.render(shelf(item(1, 'a'), item(3, 'c')), false);
  expect(selected()).toEqual([1]);
});

test('dragging a selected tile drags the whole selection', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, 'a'), item(2, 'b'), item(3, 'c')), false);
  click(1);
  click(2, { metaKey: true });
  mouse(tile(2), 'mousedown', 10, 10);
  mouse(document, 'mousemove', 13, 10);
  expect(deps.startDrag).not.toHaveBeenCalled();
  mouse(document, 'mousemove', 15, 10);
  expect(deps.startDrag).toHaveBeenCalledWith([1, 2]);
  mouse(document, 'mousemove', 30, 10);
  expect(deps.startDrag).toHaveBeenCalledTimes(1);
});

test('dragging an unselected tile drags only it', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, 'a'), item(2, 'b')), false);
  click(1);
  mouse(tile(2), 'mousedown', 10, 10);
  mouse(document, 'mousemove', 10, 16);
  expect(deps.startDrag).toHaveBeenCalledWith([2]);
});

test('missing_items_are_not_draggable', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, 'a', { state: 'missing' })), false);
  expect(tile(1).classList.contains('missing')).toBe(true);
  expect(tile(1).querySelector('.sh-note')!.textContent).toBe('Tidak ditemukan');
  mouse(tile(1), 'mousedown', 10, 10);
  mouse(document, 'mousemove', 30, 30);
  expect(deps.startDrag).not.toHaveBeenCalled();
});

test('receiving items are dimmed with "Menerima…"', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, 'IMG_1.heic', { state: 'receiving', thumb: null })), false);
  expect(tile(1).classList.contains('receiving')).toBe(true);
  expect(tile(1).querySelector('.sh-note')!.textContent).toBe('Menerima…');
  mouse(tile(1), 'mousedown', 10, 10);
  mouse(document, 'mousemove', 30, 30);
  expect(deps.startDrag).not.toHaveBeenCalled();
});

test('× removes one, Kosongkan clears all', () => {
  const v = mountShelfView(box, deps);
  v.render(shelf(item(1, 'a'), item(2, 'b')), false);
  tile(2).querySelector<HTMLButtonElement>('.sh-x')!.click();
  expect(deps.remove).toHaveBeenCalledWith([2]);
  const clear = box.querySelector<HTMLButtonElement>('.sh-clear')!;
  expect(clear.textContent).toBe('Kosongkan');
  clear.click();
  expect(deps.clear).toHaveBeenCalled();
});
