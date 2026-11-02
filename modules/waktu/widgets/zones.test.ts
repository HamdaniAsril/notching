// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { zoneLabel } from '../../../src/kit/dates';
import { dotText } from '../../../src/kit/dots';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { DEFAULT_ZONES, type ZonePrefs } from '../zones';
import { host } from './fixtures';
import { renderZones, zonesView, type ZonesActions } from './zones';

afterEach(() => { document.body.innerHTML = ''; });

// Saturday 31 Oct 2026, 02:41 UTC: Tokyo 11:41, London 02:41.
const AT = new Date(Date.UTC(2026, 9, 31, 2, 41));

function setup(lang: 'id' | 'en' = 'id') {
  const root = host();
  const act = { save: vi.fn(async (_p: ZonePrefs) => {}), expand: vi.fn(), collapse: vi.fn() } satisfies ZonesActions;
  const w = renderZones(root, lang === 'en' ? en : id, lang, act);
  return { root, act, w };
}

const select = (root: HTMLElement, n: 0 | 1) => root.querySelectorAll<HTMLSelectElement>('select.wd-zone-select')[n];
const pick = (s: HTMLSelectElement, value: string) => {
  s.value = value;
  s.dispatchEvent(new Event('change', { bubbles: true }));
};
const save = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.wd-zone-save')!;

test('the row: the title and count, then local, Tokyo and London', () => {
  const { root, w } = setup();
  w.update(DEFAULT_ZONES, AT);
  const cols = [...root.querySelectorAll('.wd-zone-col')];
  expect(cols).toHaveLength(3);
  expect([...root.querySelectorAll('.wd-zone-head .lab')].map(e => e.textContent)).toEqual(['ZONA WAKTU', '3 KOTA']);
  const codes = cols.map(c => c.querySelector('.wd-zone-code')!.textContent);
  expect(codes[0]).toBe(zoneLabel('id', AT));
  expect(codes.slice(1)).toEqual(['TYO', 'LON']);
  expect(cols.every(c => c.querySelector('svg.dm'))).toBe(true);
});

test('each column has a time in dots, a marker, and the hours from local', () => {
  const root = host();
  root.append(zonesView(id, 'id', DEFAULT_ZONES, AT));
  const cols = [...root.querySelectorAll('.wd-zone-col')];
  const local = new Date(AT);
  const offset = -local.getTimezoneOffset();
  expect(cols[0].querySelector('.wd-zone-diff')!.textContent).toBe('');
  expect(cols[0].querySelector('.wd-zone-mark')!.classList.contains('local')).toBe(true);
  expect(cols[1].querySelector('.wd-zone-mark')!.classList.contains('local')).toBe(false);
  const hours = (min: number) => {
    const d = (min - offset) / 60;
    return d === 0 ? '0' : `${d < 0 ? '−' : '+'}${String(Math.abs(d)).replace('.', ',')}`;
  };
  expect(cols[1].querySelector('.wd-zone-diff')!.textContent).toBe(hours(540));
  expect(cols[2].querySelector('.wd-zone-diff')!.textContent).toBe(hours(0));
});

test('the dot time is the zone clock, small enough for three in the frame', () => {
  const root = host();
  root.append(zonesView(id, 'id', DEFAULT_ZONES, AT));
  const time = (i: number) => root.querySelectorAll('.wd-zone-col')[i].querySelector('svg.dm')!;
  // "HH:MM" at pitch 2 is 25 dots wide: 50 px, 14 px tall, so three fit in the 234 px frame.
  expect(time(1).getAttribute('width')).toBe('50');
  expect(time(1).getAttribute('height')).toBe('14');
  const ref = document.createElement('div');
  ref.innerHTML = dotText('11:41', 2);
  expect(time(1).innerHTML).toBe(ref.querySelector('svg')!.innerHTML);
  expect(root.querySelectorAll('.wd-zone-col')[1].getAttribute('data-time')).toBe('11:41');
  expect(root.querySelectorAll('.wd-zone-col')[2].getAttribute('data-time')).toBe('02:41');
});

test('night, 22:00 to 05:59, dims the time', () => {
  const root = host();
  // 02:41 in London is night, 11:41 in Tokyo is not.
  root.append(zonesView(id, 'id', DEFAULT_ZONES, AT));
  const cols = root.querySelectorAll('.wd-zone-col');
  expect(cols[1].classList.contains('night')).toBe(false);
  expect(cols[2].classList.contains('night')).toBe(true);
  const edge = (h: number, m: number) => {
    const r = host();
    r.append(zonesView(id, 'id', { cities: ['LON', 'LON'] }, new Date(Date.UTC(2026, 10, 2, h, m))));
    return r.querySelectorAll('.wd-zone-col')[1].classList.contains('night');
  };
  expect(edge(21, 59)).toBe(false);
  expect(edge(22, 0)).toBe(true);
  expect(edge(5, 59)).toBe(true);
  expect(edge(6, 0)).toBe(false);
});

test('English says "WORLD CLOCK", "3 CITIES" and uses a decimal dot', () => {
  const root = host();
  root.append(zonesView(en, 'en', { cities: ['DEL', 'LON'] }, AT));
  expect([...root.querySelectorAll('.wd-zone-head .lab')].map(e => e.textContent)).toEqual(['WORLD CLOCK', '3 CITIES']);
  // Delhi is +5:30; from any machine zone with a whole-hour offset the difference ends in ".5".
  const offset = -AT.getTimezoneOffset();
  const half = (330 - offset) % 60 !== 0;
  expect(root.querySelectorAll('.wd-zone-diff')[1].textContent!.includes('.')).toBe(half);
  expect(root.querySelectorAll('.wd-zone-diff')[1].textContent).not.toContain(',');
});

test('a click, or Enter, asks for the full view at 220 px', () => {
  const { root, act, w } = setup();
  w.update(DEFAULT_ZONES, AT);
  root.querySelector<HTMLElement>('.wd-zones')!.click();
  expect(act.expand).toHaveBeenCalledWith(220);
  root.querySelector<HTMLElement>('.wd-zones')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(act.expand).toHaveBeenCalledTimes(2);
});

test('the full view: two lists of city names in the language, Simpan and back', () => {
  const { root, w } = setup();
  w.update({ cities: ['MKK', 'NYC'] }, AT);
  w.setFull(true);
  expect(select(root, 0).value).toBe('MKK');
  expect(select(root, 1).value).toBe('NYC');
  const names = [...select(root, 0).options].map(o => o.textContent);
  expect(names).toContain('Mekkah');
  expect(names).toContain('Singapura');
  expect(select(root, 0).options.length).toBe(select(root, 1).options.length);
  expect(root.querySelector('.wd-zone-back')!.textContent).toBe('‹ Kembali');
  expect(save(root).textContent).toBe('Simpan');
});

test('English city names and buttons', () => {
  const { root, w } = setup('en');
  w.update(DEFAULT_ZONES, AT);
  w.setFull(true);
  const names = [...select(root, 0).options].map(o => o.textContent);
  expect(names).toContain('Mecca');
  expect(names).toContain('Singapore');
  expect(save(root).textContent).toBe('Save');
  expect(root.querySelector('.wd-zone-back')!.textContent).toBe('‹ Back');
});

test('Simpan saves the chosen cities, then goes back', async () => {
  const { root, act, w } = setup();
  w.update(DEFAULT_ZONES, AT);
  w.setFull(true);
  pick(select(root, 0), 'NYC');
  pick(select(root, 1), 'SYD');
  save(root).click();
  expect(act.save).toHaveBeenCalledWith({ cities: ['NYC', 'SYD'] });
  expect(act.collapse).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(act.collapse).toHaveBeenCalledTimes(1));
});

test('a save that fails stays in the full view and says so', async () => {
  const { root, act, w } = setup();
  act.save.mockRejectedValueOnce(new Error('no'));
  w.update(DEFAULT_ZONES, AT);
  w.setFull(true);
  save(root).click();
  await vi.waitFor(() => expect(root.querySelector('.wd-zone-err')!.textContent).toBe('Gagal menyimpan'));
  expect(act.collapse).not.toHaveBeenCalled();
});

test('Kembali goes back without saving', () => {
  const { root, act, w } = setup();
  w.update(DEFAULT_ZONES, AT);
  w.setFull(true);
  root.querySelector<HTMLButtonElement>('.wd-zone-back')!.click();
  expect(act.collapse).toHaveBeenCalledTimes(1);
  expect(act.save).not.toHaveBeenCalled();
});

test('an update while the form is open keeps the choice; closing shows the row again', () => {
  const { root, w } = setup();
  w.update(DEFAULT_ZONES, AT);
  w.setFull(true);
  pick(select(root, 0), 'PAR');
  w.update(DEFAULT_ZONES, new Date(AT.getTime() + 60_000));
  expect(select(root, 0).value).toBe('PAR');
  w.setFull(false);
  expect(root.querySelector('.wd-zone-col[data-time="11:42"]')).not.toBeNull();
  w.setFull(true);
  expect(select(root, 0).value).toBe('TYO'); // reopened from the saved cities
});
