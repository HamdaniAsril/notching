// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import iconSvg from './icon.svg?raw';
import id from './locales/id.json';
import { type AppRow, renderPage, type VolumeView } from './view';

const CHROME: AppRow = { app: '/Applications/Google Chrome.app', name: 'Google Chrome', icon: 'data:image/png;base64,AAAA', level: 0.4, playing: true };
const MUSIC: AppRow = { app: '/System/Applications/Music.app', name: 'Music', icon: null, level: 1, playing: false };
const OK = (apps: AppRow[]): VolumeView => ({ access: 'granted', apps });

function page(v: VolumeView | null) {
  const root = document.createElement('div');
  document.body.append(root);
  const act = { set: vi.fn(), request: vi.fn() };
  const view = renderPage(root, id, act);
  if (v) view.update(v);
  const rows = () => [...root.querySelectorAll<HTMLElement>('.va-row')];
  const slider = (i: number) => rows()[i].querySelector<HTMLInputElement>('input[type="range"]')!;
  return { root, act, view, rows, slider };
}

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('one row per app with its icon, name, slider and percentage', () => {
  const { rows, slider } = page(OK([CHROME, MUSIC]));
  expect(rows()).toHaveLength(2);
  expect(rows()[0].querySelector('.va-name')!.textContent).toBe('Google Chrome');
  expect(rows()[0].querySelector<HTMLImageElement>('img.va-icon')!.src).toBe('data:image/png;base64,AAAA');
  expect(slider(0).value).toBe('40');
  expect(rows()[0].querySelector('.va-pct')!.textContent).toBe('40%');
  expect(slider(0).getAttribute('aria-label')).toBe('Google Chrome');
  // No icon: a blank square; not playing: says so.
  expect(rows()[1].querySelector('img')).toBeNull();
  expect(rows()[1].querySelector('.va-icon')).not.toBeNull();
  expect(rows()[1].querySelector('.va-quiet')!.textContent).toBe('Diam');
  expect(rows()[0].querySelector('.va-quiet')).toBeNull();
});

test('moving a slider sets that app', () => {
  const { act, rows, slider } = page(OK([CHROME, MUSIC]));
  slider(1).value = '25';
  slider(1).dispatchEvent(new Event('input'));
  expect(act.set).toHaveBeenCalledWith('/System/Applications/Music.app', 0.25);
  expect(rows()[1].querySelector('.va-pct')!.textContent).toBe('25%');
});

test('without the permission the card asks for it', () => {
  const { root, act, rows } = page({ access: 'unknown', apps: [CHROME] });
  expect(root.textContent).toContain('Volume app butuh izin Rekam Audio Sistem');
  expect(rows()).toHaveLength(0);
  root.querySelector<HTMLButtonElement>('.va-allow')!.click();
  expect(act.request).toHaveBeenCalled();
});

test('reading again keeps a slider being dragged and redraws when apps change', () => {
  const { view, rows, slider } = page(OK([CHROME, MUSIC]));
  slider(0).dispatchEvent(new Event('pointerdown'));
  slider(0).value = '10';
  view.update(OK([{ ...CHROME, level: 0.9 }, MUSIC]));
  expect(slider(0).value).toBe('10');
  slider(0).dispatchEvent(new Event('pointerup'));
  view.update(OK([CHROME, { ...MUSIC, playing: true }]));
  expect(rows()[1].querySelector('.va-quiet')).toBeNull();
  view.update(OK([MUSIC]));
  expect(rows()).toHaveLength(1);
});

test('before the first reading, and with no app playing', () => {
  expect(page(null).root.textContent).toContain('Membaca app…');
  expect(page(OK([])).root.textContent).toContain('Belum ada app yang bersuara');
});
