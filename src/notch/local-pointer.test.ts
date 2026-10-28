// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { localPointer } from './local-pointer';

afterEach(() => { document.body.innerHTML = ''; });

// jsdom lays nothing out: the root's box is at 0,0, so local = client coordinates.
const move = (x: number, y: number) => document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
const click = (x: number, y: number) => document.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y }));

test('reports entering and leaving the hit rects', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const p = localPointer(root);
  const cb = vi.fn();
  p.onPointer(cb);
  await p.setHitRects([{ x: 0, y: 0, w: 10, h: 10 }]);
  move(5, 5);
  expect(cb).toHaveBeenLastCalledWith({ inside: true, x: 5, y: 5 });
  move(50, 50);
  expect(cb).toHaveBeenLastCalledWith({ inside: false, x: 50, y: 50 });
  p.dispose();
});

test('a click outside the rects resigns; dispose stops listening', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const p = localPointer(root);
  const resign = vi.fn();
  p.onResignKey(resign);
  await p.setHitRects([{ x: 0, y: 0, w: 10, h: 10 }]);
  click(50, 50);
  expect(resign).toHaveBeenCalledTimes(1);
  p.dispose();
  click(50, 50);
  expect(resign).toHaveBeenCalledTimes(1);
});
