// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import iconSvg from './icon.svg?raw';
import id from './locales/id.json';
import { type AppRow, type MainRow, type OutputRow, renderPage, type VolumeView } from './view';

const CHROME: AppRow = { app: '/Applications/Google Chrome.app', name: 'Google Chrome', icon: 'data:image/png;base64,AAAA', level: 0.4, playing: true };
const MUSIC: AppRow = { app: '/System/Applications/Music.app', name: 'Music', icon: null, level: 1, playing: false };
const SPEAKERS: MainRow = { name: 'MacBook Air Speakers', level: 0.5, muted: false, settable: true };
const LAPTOP: OutputRow = { uid: 'BuiltInSpeakerDevice', name: 'MacBook Air Speakers', kind: 'builtin', current: true };
const MONITOR: OutputRow = { uid: 'hdmi-lenovo', name: 'LEN L24i-40', kind: 'display', current: false };
const BUDS: OutputRow = { uid: 'aa-bb', name: 'AirPods', kind: 'bluetooth', current: false };
const OK = (apps: AppRow[], main: MainRow | null = SPEAKERS, outputs: OutputRow[] = [LAPTOP, MONITOR, BUDS]): VolumeView => ({ access: 'granted', main, outputs, apps });

function page(v: VolumeView | null) {
  const root = document.createElement('div');
  document.body.append(root);
  const act = { set: vi.fn(), request: vi.fn(), main: vi.fn(), output: vi.fn() };
  const view = renderPage(root, id, act);
  if (v) view.update(v);
  const rows = () => [...root.querySelectorAll<HTMLElement>('.va-row')];
  const slider = (i: number) => rows()[i].querySelector<HTMLInputElement>('input[type="range"]')!;
  const master = () => root.querySelector<HTMLElement>('.va-master');
  return { root, act, view, rows, slider, master };
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
  const { root, act, rows } = page({ access: 'unknown', main: SPEAKERS, outputs: [LAPTOP], apps: [CHROME] });
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

test('the main volume sits on top with the output, a slider and the percentage', () => {
  const { master, rows } = page(OK([CHROME]));
  const m = master()!;
  expect(m.textContent).toContain('Volume utama');
  expect(m.textContent).toContain('MacBook Air Speakers');
  expect(m.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe('50');
  expect(m.querySelector('.va-pct')!.textContent).toBe('50%');
  // Above the apps, and not one of them.
  expect(rows()).toHaveLength(1);
  expect(m.compareDocumentPosition(rows()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('moving the main slider sets the Mac volume, the speaker mutes', () => {
  const { act, master } = page(OK([]));
  const s = master()!.querySelector<HTMLInputElement>('input[type="range"]')!;
  s.value = '80';
  s.dispatchEvent(new Event('input'));
  expect(act.main).toHaveBeenCalledWith({ level: 0.8 });
  expect(master()!.querySelector('.va-pct')!.textContent).toBe('80%');
  const mute = master()!.querySelector<HTMLButtonElement>('button.va-mute')!;
  expect(mute.getAttribute('aria-label')).toBe('Bisukan');
  mute.click();
  expect(act.main).toHaveBeenCalledWith({ muted: true });
});

test('a muted output says so and the speaker unmutes it', () => {
  const { act, master } = page(OK([], { ...SPEAKERS, muted: true }));
  expect(master()!.querySelector('.va-pct')!.textContent).toBe('Bisu');
  expect(master()!.classList.contains('muted')).toBe(true);
  const mute = master()!.querySelector<HTMLButtonElement>('button.va-mute')!;
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  expect(mute.getAttribute('aria-label')).toBe('Nyalakan suara');
  mute.click();
  expect(act.main).toHaveBeenCalledWith({ muted: false });
});

test('an output set on the device has no slider to move', () => {
  const { master } = page(OK([], { name: 'LEN L24i-40', level: 1, muted: false, settable: false }));
  expect(master()!.querySelector<HTMLInputElement>('input[type="range"]')!.disabled).toBe(true);
  expect(master()!.textContent).toContain('LEN L24i-40 · diatur di perangkat');
});

test('the main volume works without the permission and follows the keys', () => {
  const { master, view } = page({ access: 'denied', main: SPEAKERS, outputs: [LAPTOP], apps: [] });
  expect(master()).not.toBeNull();
  view.update({ access: 'denied', main: { ...SPEAKERS, level: 0.25 }, outputs: [LAPTOP], apps: [] });
  expect(master()!.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe('25');
  // No output at all: no main row.
  view.update(OK([], null));
  expect(master()!.hidden).toBe(true);
});

test('the output opens a list of every speaker, the current one marked', () => {
  const { root, master, rows } = page(OK([CHROME]));
  const pick = master()!.querySelector<HTMLButtonElement>('button.va-output')!;
  expect(pick.textContent).toContain('MacBook Air Speakers');
  expect(pick.getAttribute('aria-expanded')).toBe('false');
  expect(root.querySelector<HTMLElement>('.va-picker')!.hidden).toBe(true);
  pick.click();
  expect(pick.getAttribute('aria-expanded')).toBe('true');
  const choices = [...root.querySelectorAll<HTMLButtonElement>('.va-picker button.va-choice')];
  expect(choices.map(c => c.textContent)).toEqual(['MacBook Air Speakers', 'LEN L24i-40', 'AirPods']);
  expect(choices.map(c => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  expect(choices[2].querySelector('.va-kind')!.getAttribute('data-kind')).toBe('bluetooth');
  // The apps step aside while it is open.
  expect(root.querySelector<HTMLElement>('.va-list')!.hidden).toBe(true);
  expect(rows()).toHaveLength(1);
});

test('choosing a speaker moves the sound there and closes the list', () => {
  const { root, act, master } = page(OK([CHROME]));
  master()!.querySelector<HTMLButtonElement>('button.va-output')!.click();
  root.querySelectorAll<HTMLButtonElement>('.va-picker button.va-choice')[1].click();
  expect(act.output).toHaveBeenCalledWith('hdmi-lenovo');
  expect(root.querySelector<HTMLElement>('.va-picker')!.hidden).toBe(true);
  expect(root.querySelector<HTMLElement>('.va-list')!.hidden).toBe(false);
});

test('the list follows a new speaker and closes with Escape or a second click', () => {
  const { root, view, master } = page(OK([]));
  const pick = master()!.querySelector<HTMLButtonElement>('button.va-output')!;
  pick.click();
  view.update(OK([], SPEAKERS, [LAPTOP, MONITOR]));
  expect(root.querySelectorAll('.va-picker button.va-choice')).toHaveLength(2);
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(root.querySelector<HTMLElement>('.va-picker')!.hidden).toBe(true);
  pick.click();
  pick.click();
  expect(root.querySelector<HTMLElement>('.va-picker')!.hidden).toBe(true);
});

test('with one speaker there is nothing to pick', () => {
  const { master } = page(OK([], SPEAKERS, [LAPTOP]));
  expect(master()!.querySelector<HTMLButtonElement>('button.va-output')!.disabled).toBe(true);
});
