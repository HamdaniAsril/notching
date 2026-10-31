// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import iconSvg from './icon.svg?raw';
import id from './locales/id.json';
import { type AwakeView, endClock, renderPage } from './view';

const OFF: AwakeView = { on: false, until: null, forever: false, text: null };
const at1520 = new Date(2026, 9, 31, 15, 20).getTime();
const TIMED: AwakeView = { on: true, until: at1520, forever: false, text: '1:42' };
const FOREVER: AwakeView = { on: true, until: null, forever: true, text: '∞' };

function page(v: AwakeView) {
  const root = document.createElement('div');
  document.body.append(root);
  const act = { start: vi.fn(), add: vi.fn(), stop: vi.fn() };
  renderPage(root, id, 'id', act).update(v);
  const box = root.querySelector<HTMLButtonElement>('.ka-box')!;
  const button = (text: string) => [...root.querySelectorAll('button')].find(b => b.textContent === text);
  const field = root.querySelector<HTMLInputElement>('input')!;
  return { root, act, box, button, field };
}

function enter(field: HTMLInputElement, value: string) {
  field.value = value;
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

test('off shows Mati, the start buttons and the hint, but no add buttons', () => {
  const { root, box, button } = page(OFF);
  expect(box.textContent).toBe('Mati');
  expect(box.getAttribute('aria-pressed')).toBe('false');
  for (const t of ['1 jam', '2 jam', '∞']) expect(button(t)).toBeDefined();
  expect(root.textContent).toContain('menit');
  expect(root.textContent).toContain('Klik kotak: tanpa batas');
  expect(button('+15 m')).toBeUndefined();
});

test('clicking the box when off starts with no limit', () => {
  const { act, box } = page(OFF);
  box.click();
  expect(act.start).toHaveBeenCalledWith(null);
  expect(act.stop).not.toHaveBeenCalled();
});

test('the duration buttons start 60, 120 and no limit', () => {
  const { act, button } = page(OFF);
  button('1 jam')!.click();
  button('2 jam')!.click();
  button('∞')!.click();
  expect(act.start.mock.calls).toEqual([[60], [120], [null]]);
});

test('typed minutes start on Enter only when they are 1–1440', () => {
  const { act, field } = page(OFF);
  for (const bad of ['0', '1441', '', 'abc', '1.5']) enter(field, bad);
  field.value = '45';
  field.dispatchEvent(new Event('input', { bubbles: true }));
  expect(act.start).not.toHaveBeenCalled();
  enter(field, '45');
  expect(act.start.mock.calls).toEqual([[45]]);
  expect(field.value).toBe('');
});

test('on with an end shows the time left, the end clock and the add buttons', () => {
  const { root, act, box, button } = page(TIMED);
  expect(box.textContent).toBe('1:42');
  expect(box.getAttribute('aria-pressed')).toBe('true');
  expect(root.textContent).toContain('Menyala sampai 15.20');
  expect(root.textContent).toContain('Klik kotak untuk mematikan');
  button('+15 m')!.click();
  button('+30 m')!.click();
  button('+1 jam')!.click();
  expect(act.add.mock.calls).toEqual([[15], [30], [60]]);
  expect(button('2 jam')).toBeUndefined();
});

test('clicking the box when on stops', () => {
  const { act, box } = page(TIMED);
  box.click();
  expect(act.stop).toHaveBeenCalled();
  expect(act.start).not.toHaveBeenCalled();
});

test('no limit shows ∞ and no add buttons', () => {
  const { root, box, button } = page(FOREVER);
  expect(box.textContent).toBe('∞');
  expect(root.textContent).toContain('Menyala tanpa batas');
  expect(button('+15 m')).toBeUndefined();
});

test('a reading that changes nothing keeps what is being typed', () => {
  const root = document.createElement('div');
  document.body.append(root);
  const view = renderPage(root, id, 'id', { start: vi.fn(), add: vi.fn(), stop: vi.fn() });
  view.update(OFF);
  const field = root.querySelector('input')!;
  field.value = '4';
  view.update(OFF);
  expect(root.querySelector('input')).toBe(field);
  expect(field.value).toBe('4');
});

test('the end clock follows the language', () => {
  expect(endClock(at1520, 'id')).toBe('15.20');
  expect(endClock(at1520, 'en')).toBe('15:20');
});

test('the box shows the same coffee cup as the module icon', () => {
  const { box } = page(OFF);
  const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map(m => m[1]);
  expect(paths(box.innerHTML)).toEqual(paths(iconSvg));
  expect(paths(iconSvg).join(' ')).toContain('M17 10h1.5');
});
