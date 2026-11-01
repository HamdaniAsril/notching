// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { DRAG_SLOP, presses } from './presses';

let a: HTMLElement;
let b: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  a = document.createElement('div');
  b = document.createElement('div');
  document.body.append(a, b);
});

const mouse = (target: EventTarget, type: string, x = 0, y = 0, over: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: type === 'mouseup' || type === 'click' ? 0 : 1, ...over }));

test('a press that moves past DRAG_SLOP drags once, and its click is swallowed', () => {
  const drag = vi.fn();
  const click = vi.fn();
  const p = presses(document, drag);
  p.watch(a, 1, click);
  mouse(a, 'mousedown', 10, 10);
  mouse(document, 'mousemove', 10 + DRAG_SLOP, 10);
  expect(drag).not.toHaveBeenCalled();
  mouse(document, 'mousemove', 10 + DRAG_SLOP + 1, 10);
  mouse(document, 'mousemove', 40, 10);
  expect(drag).toHaveBeenCalledTimes(1);
  expect(drag).toHaveBeenCalledWith(1);
  mouse(document, 'mouseup', 40, 10);
  mouse(a, 'click', 40, 10);
  expect(click).not.toHaveBeenCalled();
  // The next plain click is a click again, with its event.
  mouse(a, 'mousedown', 10, 10);
  mouse(document, 'mouseup', 10, 10);
  mouse(a, 'click', 10, 10);
  expect(click).toHaveBeenCalledTimes(1);
  expect(click.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
});

test('each target drags its own id', () => {
  const drag = vi.fn();
  const p = presses(document, drag);
  p.watch(a, 1, vi.fn());
  p.watch(b, 2, vi.fn());
  mouse(b, 'mousedown', 0, 0);
  mouse(document, 'mousemove', 0, 9);
  expect(drag).toHaveBeenCalledWith(2);
});

test('no drag without the left button, or when the target cannot be dragged', () => {
  const drag = vi.fn();
  const click = vi.fn();
  const p = presses(document, drag);
  p.watch(a, 1, click, () => false);
  p.watch(b, 2, vi.fn());
  mouse(a, 'mousedown', 0, 0);
  mouse(document, 'mousemove', 30, 0);
  mouse(b, 'mousedown', 0, 0, { button: 2 });
  mouse(document, 'mousemove', 30, 0);
  mouse(b, 'mousedown', 0, 0);
  mouse(document, 'mousemove', 30, 0, { buttons: 0 });
  expect(drag).not.toHaveBeenCalled();
  mouse(a, 'click', 30, 0);
  expect(click).toHaveBeenCalledTimes(1);
});

test('destroy stops watching the document', () => {
  const drag = vi.fn();
  const p = presses(document, drag);
  p.watch(a, 1, vi.fn());
  p.destroy();
  mouse(a, 'mousedown', 0, 0);
  mouse(document, 'mousemove', 30, 0);
  expect(drag).not.toHaveBeenCalled();
});
