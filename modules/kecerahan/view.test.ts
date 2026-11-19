// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import iconSvg from './icon.svg?raw';
import id from './locales/id.json';
import { renderPage, type Screen } from './view';

const BUILT_IN: Screen = { id: 1, name: 'Built-in Retina Display', level: 0.62, way: 'system' };
const LENOVO: Screen = { id: 4, name: 'L24i-40', level: 0.5, way: 'soft' };

function page(screens: Screen[] | null) {
  const root = document.createElement('div');
  document.body.append(root);
  const act = { set: vi.fn() };
  const view = renderPage(root, id, act);
  if (screens) view.update(screens);
  const rows = () => [...root.querySelectorAll<HTMLElement>('.kc-row')];
  const slider = (i: number) => rows()[i].querySelector<HTMLInputElement>('input[type="range"]')!;
  return { root, act, view, rows, slider };
}

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('one row per screen with its name, slider and percentage', () => {
  const { rows, slider } = page([BUILT_IN, LENOVO]);
  expect(rows()).toHaveLength(2);
  expect(rows()[0].querySelector('.kc-name')!.textContent).toBe('Built-in Retina Display');
  expect(slider(0).value).toBe('62');
  expect([slider(0).min, slider(0).max]).toEqual(['0', '100']);
  expect(rows()[0].querySelector('.kc-pct')!.textContent).toBe('62%');
  expect(slider(0).getAttribute('aria-label')).toBe('Built-in Retina Display');
});

test('a software-dimmed screen says so, with why', () => {
  const { rows } = page([BUILT_IN, LENOVO]);
  expect(rows()[0].querySelector('.kc-tag')).toBeNull();
  const tag = rows()[1].querySelector<HTMLElement>('.kc-tag')!;
  expect(tag.textContent).toBe('Software');
  expect(tag.title).toContain('tidak menerima perintah kecerahan');
});

test('moving a slider sets that screen and its percentage', () => {
  const { act, rows, slider } = page([BUILT_IN, LENOVO]);
  slider(1).value = '30';
  slider(1).dispatchEvent(new Event('input'));
  expect(act.set).toHaveBeenCalledWith(4, 0.3);
  expect(rows()[1].querySelector('.kc-pct')!.textContent).toBe('30%');
});

test('a screen with no name gets one', () => {
  const { rows } = page([{ ...BUILT_IN, name: '' }, { ...LENOVO, name: '' }]);
  expect(rows().map(r => r.querySelector('.kc-name')!.textContent)).toEqual(['Layar bawaan', 'Layar 2']);
});

test('reading again keeps a slider being dragged, and redraws when screens change', () => {
  const { view, rows, slider } = page([BUILT_IN, LENOVO]);
  slider(1).dispatchEvent(new Event('pointerdown'));
  slider(1).value = '20';
  view.update([BUILT_IN, { ...LENOVO, level: 0.9 }]);
  expect(slider(1).value).toBe('20');
  slider(1).dispatchEvent(new Event('pointerup'));
  view.update([{ ...BUILT_IN, level: 0.1 }, LENOVO]);
  expect(slider(0).value).toBe('10');
  view.update([BUILT_IN]);
  expect(rows()).toHaveLength(1);
});

test('before the first reading, and with no screen', () => {
  const loading = page(null);
  expect(loading.root.textContent).toContain('Membaca layar…');
  const none = page([]);
  expect(none.root.textContent).toContain('Tidak ada layar yang bisa diatur');
});
