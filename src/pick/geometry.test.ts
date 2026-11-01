// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { dragBox, finish, isDrag, windowAt, DRAG_SLOP } from './geometry';
import { mountPicker, type PickState } from './main';

// Front to back, in the panel's local points: a small window over a big one.
const windows = [
  { number: 7, x: 100, y: 100, w: 200, h: 150 },
  { number: 3, x: 0, y: 0, w: 800, h: 600 },
];

test('windowAt picks the front-most window under the point', () => {
  expect(windowAt(windows, 150, 120)).toBe(7);
  expect(windowAt(windows, 50, 50)).toBe(3);
  expect(windowAt(windows, 900, 50)).toBeNull();
  expect(windowAt([], 10, 10)).toBeNull();
});

test('dragBox normalizes any direction', () => {
  const box = { x: 10, y: 20, w: 90, h: 60 };
  expect(dragBox(10, 20, 100, 80)).toEqual(box);
  expect(dragBox(100, 80, 10, 20)).toEqual(box);
  expect(dragBox(100, 20, 10, 80)).toEqual(box);
  expect(dragBox(10, 80, 100, 20)).toEqual(box);
});

test('isDrag needs more than DRAG_SLOP in either direction', () => {
  expect(isDrag(0, 0, DRAG_SLOP, DRAG_SLOP)).toBe(false);
  expect(isDrag(0, 0, DRAG_SLOP + 1, 0)).toBe(true);
  expect(isDrag(10, 10, 10, 10 - DRAG_SLOP - 1)).toBe(true);
});

test('a click in both mode picks the window', () => {
  expect(finish('both', { x: 150, y: 120 }, { x: 152, y: 121 }, windows)).toEqual({ kind: 'window', number: 7 });
  expect(finish('window', { x: 50, y: 50 }, { x: 50, y: 50 }, windows)).toEqual({ kind: 'window', number: 3 });
});

test('a drag in both mode picks the area', () => {
  expect(finish('both', { x: 300, y: 200 }, { x: 100, y: 120 }, windows)).toEqual({
    kind: 'area',
    x: 100,
    y: 120,
    w: 200,
    h: 80,
  });
  expect(finish('area', { x: 0, y: 0 }, { x: 40, y: 30 }, windows)).toEqual({ kind: 'area', x: 0, y: 0, w: 40, h: 30 });
  // A flat line has no picture in it: the picker stays open.
  expect(finish('both', { x: 0, y: 10 }, { x: 40, y: 10 }, windows)).toBeNull();
});

test('window mode ignores drags', () => {
  expect(finish('window', { x: 300, y: 200 }, { x: 100, y: 120 }, windows)).toBeNull();
});

test('area mode ignores clicks', () => {
  expect(finish('area', { x: 150, y: 120 }, { x: 150, y: 120 }, windows)).toBeNull();
});

test('a click on no window returns null', () => {
  expect(finish('both', { x: 900, y: 50 }, { x: 900, y: 50 }, windows)).toBeNull();
});

function mount(state?: PickState) {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const invoke = vi.fn((_cmd: string, _args?: Record<string, unknown>) => Promise.resolve(null));
  const picker = mountPicker(root, { invoke, dpr: () => 2 });
  if (state) picker.show(state);
  return { root, invoke, picker };
}

const mouse = (type: string, x: number, y: number) =>
  document.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));

test('esc_cancels', () => {
  const { invoke } = mount({ mode: 'both', windows, cursor: null });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  expect(invoke).not.toHaveBeenCalled();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('shot_pick_cancel');
});

test('a click on a window sends it as the choice', () => {
  const { invoke } = mount({ mode: 'both', windows, cursor: null });
  mouse('mousedown', 150, 120);
  mouse('mouseup', 151, 120);
  expect(invoke).toHaveBeenCalledWith('shot_pick_done', { choice: { kind: 'window', number: 7 } });
});

test('the window under the cursor is cut out, and a drag shows its size in pixels', () => {
  const { root, invoke } = mount({ mode: 'both', windows, cursor: { x: 150, y: 120 } });
  const hole = root.querySelector<HTMLElement>('.pk-hole')!;
  const size = root.querySelector<HTMLElement>('.pk-size')!;
  expect(root.classList.contains('pk-cut')).toBe(true);
  expect([hole.style.left, hole.style.top, hole.style.width, hole.style.height]).toEqual(['100px', '100px', '200px', '150px']);
  mouse('mousemove', 50, 50);
  expect(hole.style.width).toBe('800px');
  mouse('mousemove', 900, 50);
  expect(root.classList.contains('pk-cut')).toBe(false);

  mouse('mousedown', 10, 20);
  mouse('mousemove', 110, 70);
  expect(root.classList.contains('pk-drag')).toBe(true);
  expect([hole.style.left, hole.style.top, hole.style.width, hole.style.height]).toEqual(['10px', '20px', '100px', '50px']);
  expect(size.textContent).toBe('200 × 100');
  mouse('mouseup', 110, 70);
  expect(invoke).toHaveBeenCalledWith('shot_pick_done', { choice: { kind: 'area', x: 10, y: 20, w: 100, h: 50 } });
  expect(root.classList.contains('pk-drag')).toBe(false);
});

test('area mode shows no window, and a click there leaves the picker up', () => {
  const { root, invoke } = mount({ mode: 'area', windows, cursor: { x: 150, y: 120 } });
  expect(root.classList.contains('pk-cut')).toBe(false);
  mouse('mousedown', 150, 120);
  mouse('mouseup', 150, 120);
  expect(invoke).not.toHaveBeenCalled();
});
