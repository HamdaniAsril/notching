// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { renderHome, type HomeActions } from './card';
import { progress } from './format';
import en from './locales/en.json';
import id from './locales/id.json';
import type { HomeSnapshot, Reminder } from './types';

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();
const NOW = new Date(2026, 9, 27, 10, 18); // a Tuesday
const rem = (rid: number, title: string, day: string, when: number | null, done = false): Reminder =>
  ({ id: rid, title, day, at: when, done, notified: false });

const SNAP: HomeSnapshot = {
  place: { name: 'Jakarta', region: 'Jakarta', country: 'Indonesia', latitude: -6.21462, longitude: 106.84513 },
  weather: { temp: 31.4, code: 3, min: 24.7, max: 33.2, fetchedAt: at(27, 10, 0), latitude: -6.21, longitude: 106.85 },
  prayer: {
    today: [],
    prev: { name: 'fajr', at: at(27, 4, 10) },
    next: { name: 'dhuhr', at: at(27, 11, 40) },
  },
  reminders: [
    rem(3, 'Beli kopi', '2026-10-27', null, true),
    rem(2, 'Bayar listrik', '2026-10-27', null),
    rem(1, 'Kirim invoice', '2026-10-27', at(27, 14, 0)),
  ],
  showClock: true,
  statuses: [],
};

afterEach(() => { document.body.innerHTML = ''; });

function mount(snap: HomeSnapshot = SNAP, lang: 'id' | 'en' = 'id') {
  const root = document.createElement('div');
  document.body.append(root);
  const actions = { add: vi.fn(async () => {}), setDone: vi.fn(async () => {}) } satisfies HomeActions;
  const card = renderHome(root, lang === 'en' ? en : id, lang, actions);
  card.update(snap, NOW);
  const text = (sel: string) => root.querySelector(sel)?.textContent ?? '';
  return { root, card, actions, text };
}

const flush = () => new Promise(r => setTimeout(r, 0));

function typeIn(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

const enter = (el: Element) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

test('three columns: date, weather, next', () => {
  const { root, text } = mount();
  expect(text('.col[data-k="today"]')).toContain('Selasa');
  expect(text('.col[data-k="today"]')).toContain('Oktober 2026');
  expect(root.querySelectorAll('.rd')).toHaveLength(1);
  expect(text('.col[data-k="weather"]')).toContain('Jakarta');
  expect(text('.col[data-k="weather"]')).toContain('Berawan · 25°/33°');
  expect(text('.col[data-k="next"] .next')).toBe('Dzuhur 11.40');
  expect(text('.col[data-k="next"] .bar')).toContain('1 j 22 m');
  const lit = progress(SNAP.prayer!.prev.at, SNAP.prayer!.next.at, NOW.getTime(), 18);
  expect(root.querySelectorAll('.bar circle[fill="#fff"]')).toHaveLength(lit);
  const rows = [...root.querySelectorAll('.col[data-k="next"] .rm')];
  expect(rows.map(r => r.querySelector('.t')!.textContent)).toEqual(['Kirim invoice', 'Bayar listrik']);
  expect(rows.map(r => r.querySelector('.m')!.textContent)).toEqual(['14.00', 'Hari ini']);
});

test('English names and times', () => {
  const { text } = mount(SNAP, 'en');
  expect(text('.col[data-k="today"]')).toContain('Tuesday');
  expect(text('.col[data-k="today"]')).toContain('October 2026');
  expect(text('.col[data-k="weather"]')).toContain('Cloudy · 25°/33°');
  expect(text('.col[data-k="next"] .next')).toBe('Dhuhr 11:40');
  expect(text('.col[data-k="next"] .bar')).toContain('1 h 22 m');
  expect(text('.col[data-k="next"]')).toContain('Today');
});

test('without a city it asks for one and shows reminders only', () => {
  const { root, text } = mount({ ...SNAP, place: null, weather: null, prayer: null });
  expect(text('.col[data-k="weather"]')).toContain('Atur kota di Pengaturan');
  expect(root.querySelector('.next')).toBeNull();
  expect(root.querySelectorAll('.col[data-k="next"] .rm')).toHaveLength(2);
});

test('no reminders says so', () => {
  const { text } = mount({ ...SNAP, reminders: [] });
  expect(text('.col[data-k="next"]')).toContain('Belum ada reminder.');
});

test('reminder titles are text, never markup', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { root } = mount({ ...SNAP, reminders: [rem(9, evil, '2026-10-27', null)] });
  expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('.rm .t')!.textContent).toBe(evil);
});

test('the clock and the running modules sit in the bottom row', () => {
  expect(mount().text('.foot .clk')).toBe('10.18');
  const off = mount({ ...SNAP, showClock: false });
  expect(off.root.querySelector('.foot')).not.toBeNull();
  expect(off.root.querySelector('.clk')).toBeNull();
  const timer = mount({ ...SNAP, statuses: [{ module: 'timer', label: 'Timer', value: '12.30' }] });
  expect(timer.text('.foot')).toContain('Timer');
  expect(timer.text('.foot b')).toBe('12.30');
});

test('the next column opens the full list; back returns', () => {
  const { root, card, text } = mount();
  root.querySelector<HTMLElement>('.col[data-k="next"]')!.click();
  expect(card.view).toBe('list');
  expect(text('.list .head')).toContain('Reminder · 2');
  expect(root.querySelectorAll('.list .items .rm')).toHaveLength(3);
  root.querySelector<HTMLElement>('.list .back')!.click();
  expect(card.view).toBe('main');
  expect(root.querySelector('.cols')).not.toBeNull();
});

test('Enter on the next column opens the list too', () => {
  const { root, card } = mount();
  enter(root.querySelector('.col[data-k="next"]')!);
  expect(card.view).toBe('list');
});

test('adding a reminder with a time', async () => {
  const { root, actions } = mount();
  root.querySelector<HTMLElement>('.col[data-k="next"]')!.click();
  const title = root.querySelector<HTMLInputElement>('.add input.title')!;
  const time = root.querySelector<HTMLInputElement>('.add input.time')!;
  typeIn(title, 'Kirim invoice');
  typeIn(time, '14.00');
  enter(time);
  expect(actions.add).toHaveBeenCalledWith('Kirim invoice', '2026-10-27', at(27, 14, 0));
  await flush();
  expect([title.value, time.value]).toEqual(['', '']);
});

test('a reminder without a time is for today', () => {
  const { root, actions } = mount();
  root.querySelector<HTMLElement>('.col[data-k="next"]')!.click();
  typeIn(root.querySelector<HTMLInputElement>('.add input.title')!, '  Beli susu ');
  enter(root.querySelector('.add input.title')!);
  expect(actions.add).toHaveBeenCalledWith('Beli susu', '2026-10-27', null);
});

test('an empty title adds nothing', () => {
  const { root, actions } = mount();
  root.querySelector<HTMLElement>('.col[data-k="next"]')!.click();
  enter(root.querySelector('.add input.title')!);
  expect(actions.add).not.toHaveBeenCalled();
});

test('an unreadable time says so and adds nothing', () => {
  const { root, actions, text } = mount();
  root.querySelector<HTMLElement>('.col[data-k="next"]')!.click();
  typeIn(root.querySelector<HTMLInputElement>('.add input.title')!, 'Rapat');
  typeIn(root.querySelector<HTMLInputElement>('.add input.time')!, '25.00');
  enter(root.querySelector('.add input.time')!);
  expect(text('.add .err')).toBe('Jam tidak dikenali');
  expect(actions.add).not.toHaveBeenCalled();
});

test('a failed save says so', async () => {
  const { root, actions, text } = mount();
  actions.add.mockRejectedValueOnce(new Error('too many'));
  root.querySelector<HTMLElement>('.col[data-k="next"]')!.click();
  typeIn(root.querySelector<HTMLInputElement>('.add input.title')!, 'Rapat');
  enter(root.querySelector('.add input.title')!);
  await flush();
  expect(text('.add .err')).toBe('Gagal menyimpan');
  expect(root.querySelector<HTMLInputElement>('.add input.title')!.value).toBe('Rapat');
});

test('a circle marks a reminder done', () => {
  const { root, actions } = mount();
  root.querySelector<HTMLElement>('.col[data-k="next"]')!.click();
  const first = root.querySelector<HTMLButtonElement>('.list .items .rm .ck')!;
  expect(first.getAttribute('aria-pressed')).toBe('false');
  expect(first.getAttribute('aria-label')).toBe('Tandai selesai');
  first.click();
  expect(actions.setDone).toHaveBeenCalledWith(1, true);
  const all = root.querySelectorAll<HTMLButtonElement>('.list .items .rm .ck');
  const done = all[all.length - 1];
  expect(done.getAttribute('aria-pressed')).toBe('true');
  done.click();
  expect(actions.setDone).toHaveBeenCalledWith(3, false);
});

test('an update keeps what you are typing', () => {
  const { root, card } = mount();
  root.querySelector<HTMLElement>('.col[data-k="next"]')!.click();
  const title = root.querySelector<HTMLInputElement>('.add input.title')!;
  typeIn(title, 'Kir');
  title.focus();
  card.update({ ...SNAP, reminders: SNAP.reminders.slice(1) }, NOW);
  expect(root.querySelector<HTMLInputElement>('.add input.title')).toBe(title);
  expect(title.value).toBe('Kir');
  expect(document.activeElement).toBe(title);
  expect(root.querySelectorAll('.list .items .rm')).toHaveLength(2);
});

test('both languages have the same keys', () => {
  const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]).sort();
  expect(keys(en)).toEqual(keys(id));
});
