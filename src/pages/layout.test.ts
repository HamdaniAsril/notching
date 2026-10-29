import { expect, test } from 'vitest';
import type { Placement } from '../modules/types';
import { BERANDA, moduleInfo, TEST_STATE } from '../notch/test-helpers';
import { canPlace, firstFree, moveTo, place, removeWidget, slots, widgetCatalog } from './layout';

const p = (widget: string, col: number, width = 1): Placement => ({ widget, col, width });

test('the catalog holds widgets of packages that are installed and on', () => {
  const cat = widgetCatalog(TEST_STATE);
  expect([...cat.keys()]).toEqual(['home/date', 'home/clock', 'home/weather', 'home/prayer', 'home/reminders']);
  expect(cat.get('home/reminders')).toMatchObject({ moduleId: 'home', width: 2, name: 'Reminder' });
  const off = { ...TEST_STATE, modules: [moduleInfo('timer', { enabled: false, widgets: [
    { id: 'timer', name: 'Timer', entry: 'index.html', width: 1, kind: 'work' }] })] };
  expect(widgetCatalog(off).size).toBe(0);
});

test('firstFree finds the first gap wide enough', () => {
  expect(firstFree([p('a/a', 0), p('b/b', 1)], 2)).toBe(2);
  expect(firstFree([p('a/a', 0), p('r/r', 2, 2)], 2)).toBeNull();
  expect(firstFree([p('a/a', 0), p('r/r', 2, 2)], 1)).toBe(1);
  expect(firstFree([], 2)).toBe(0);
});

test('canPlace keeps inside the row and off other widgets', () => {
  expect(canPlace([], 3, 2)).toBe(false);
  expect(canPlace([p('a/a', 1)], 0, 2)).toBe(false);
  expect(canPlace([p('a/a', 1)], 0, 2, 'a/a')).toBe(true);
});

test('place refuses a widget already on the page', () => {
  expect(place(BERANDA.widgets, 'home/date', 1)).toBeNull();
});

test('place at a column checks the room there', () => {
  expect(place([], 'r/r', 2, 3)).toBeNull();
  expect(place([], 'r/r', 2, 2)).toEqual([p('r/r', 2, 2)]);
  expect(place([p('a/a', 3)], 'b/b', 1)).toEqual([p('b/b', 0), p('a/a', 3)]);
});

test('moveTo ignores the widget being moved', () => {
  expect(moveTo([p('r/r', 0, 2)], 'r/r', 1)).toEqual([p('r/r', 1, 2)]);
  expect(moveTo([p('d/d', 0), p('r/r', 2, 2)], 'd/d', 3)).toBeNull();
  expect(moveTo([p('d/d', 0), p('r/r', 2, 2)], 'd/d', 1)).toEqual([p('d/d', 1), p('r/r', 2, 2)]);
});

test('removeWidget frees its columns', () => {
  expect(removeWidget(BERANDA.widgets, 'home/weather')).toEqual([p('home/date', 0), p('home/reminders', 2, 2)]);
});

test('a widget whose source is gone stays in its slot without a widget', () => {
  const page = { ...BERANDA, widgets: [p('timer/timer', 3), p('home/date', 0)] };
  const s = slots(page, widgetCatalog(TEST_STATE));
  expect(s.map(x => [x.placement.col, x.widget?.ref ?? null])).toEqual([[0, 'home/date'], [3, null]]);
});
