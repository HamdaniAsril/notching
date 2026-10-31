// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { columnAt, dropIndex, liftGhost } from './drag';

test('dropIndex inserts before the first midpoint past the pointer', () => {
  expect([5, 20, 60].map(y => dropIndex([10, 30, 50], y))).toEqual([0, 1, 3]);
  expect(dropIndex([], 99)).toBe(0);
});

test('columnAt splits the row into four', () => {
  expect([99, 100, 399, -5, 450].map(x => columnAt(0, 400, x))).toEqual([0, 1, 3, 0, 3]);
  expect(columnAt(50, 400, 260)).toBe(2);
});

test('a ghost is drawn at the size it shows, without zoom, and follows the pointer', () => {
  const el = document.createElement('div');
  document.body.append(el);
  Object.defineProperty(el, 'offsetWidth', { value: 200 });
  Object.defineProperty(el, 'offsetHeight', { value: 100 });
  // Shown at half size, e.g. inside the shrunk notch preview.
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
    { left: 50, top: 20, right: 150, bottom: 70, width: 100, height: 50, x: 50, y: 20, toJSON: () => ({}) });
  const g = liftGhost(el, 60, 30);
  const ghost = document.querySelector<HTMLElement>('.ed-ghost')!;
  expect([ghost.style.width, ghost.style.height]).toEqual(['200px', '100px']);
  expect(ghost.style.getPropertyValue('--s')).toBe('0.5');
  expect(ghost.style.getPropertyValue('zoom')).toBe('');
  // Scaled around where it was grabbed (10, 10 shown; 20, 20 drawn), so that
  // point stays under the pointer.
  expect(ghost.style.transformOrigin).toBe('20px 20px');
  expect([ghost.style.left, ghost.style.top]).toEqual(['40px', '10px']);
  g.move(160, 130);
  expect([ghost.style.left, ghost.style.top]).toEqual(['140px', '110px']);
  g.end();
});
