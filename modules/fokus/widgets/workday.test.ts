// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { DEFAULT_WORK, type WorkPrefs } from '../work';
import { renderWorkday, workdayView, type WorkdayActions } from './workday';

afterEach(() => { document.body.innerHTML = ''; });

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m);
const TUE = at(27, 10, 18);

function setup(lang: 'id' | 'en' = 'id') {
  const root = document.createElement('div');
  document.body.append(root);
  const act = { save: vi.fn(async (_p: WorkPrefs) => {}), expand: vi.fn(), collapse: vi.fn() } satisfies WorkdayActions;
  const w = renderWorkday(root, lang === 'en' ? en : id, lang, act);
  return { root, act, w };
}

const input = (root: HTMLElement, which: 'start' | 'end') => root.querySelector<HTMLInputElement>(`input.wd-work-${which}`)!;
const type = (inp: HTMLInputElement, value: string) => {
  inp.value = value;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
};
const save = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.wd-work-save')!;

test('working: the name and hours, what is left big, ten dots and the time worked', () => {
  const { root, w } = setup();
  w.update(DEFAULT_WORK, TUE);
  const labs = [...root.querySelectorAll('.lab')].map(e => e.textContent);
  expect(labs).toEqual(['JAM KERJA', '09–17', 'SUDAH 1 J 18 M']);
  expect(root.querySelector('.wd-work-time')!.textContent).toBe('6 J 42 M');
  const dots = [...root.querySelectorAll('.wd-row .d')];
  expect(dots).toHaveLength(10);
  // 78 of 480 minutes is 16 %: one dot lit, then the red one, then the rest dim.
  expect(dots.map(d => d.className)).toEqual(['d lit', 'd now', ...Array(8).fill('d')]);
});

test('working in English', () => {
  const { root, w } = setup('en');
  w.update(DEFAULT_WORK, at(27, 14, 0));
  expect(root.textContent).toContain('WORK');
  expect(root.querySelector('.wd-work-time')!.textContent).toBe('3 H 0 M');
  expect([...root.querySelectorAll('.lab')].pop()!.textContent).toBe('5 H 0 M DONE');
  const dots = [...root.querySelectorAll('.wd-row .d')];
  expect(dots.filter(d => d.className === 'd lit')).toHaveLength(6); // 62 % lights six, the next is red
  expect(dots[6].className).toBe('d now');
});

test('the hours with minutes show them, and the head may wrap rather than cut', () => {
  const view = workdayView(id, 'id', { start: '08:30', end: '16:45', days: [1] }, at(26, 10, 0));
  expect(view.querySelectorAll('.lab')[1].textContent).toBe('08:30–16:45');
});

test('before, done and off say so in a word', () => {
  const { root, w } = setup();
  w.update(DEFAULT_WORK, at(27, 8, 0));
  expect(root.querySelector('.wd-work-time')!.textContent).toBe('Mulai 09.00');
  w.update(DEFAULT_WORK, at(27, 17, 0));
  expect(root.querySelector('.wd-work-time')!.textContent).toBe('Selesai');
  w.update(DEFAULT_WORK, at(31, 10, 0));
  expect(root.querySelector('.wd-work-time')!.textContent).toBe('Libur');
  expect(root.querySelector('.wd-row')).toBeNull();
});

test('English before, done and off', () => {
  const { root, w } = setup('en');
  w.update(DEFAULT_WORK, at(27, 8, 0));
  expect(root.querySelector('.wd-work-time')!.textContent).toBe('Starts 9:00');
  w.update(DEFAULT_WORK, at(27, 17, 0));
  expect(root.querySelector('.wd-work-time')!.textContent).toBe('Done');
  w.update(DEFAULT_WORK, at(31, 10, 0));
  expect(root.querySelector('.wd-work-time')!.textContent).toBe('Day off');
});

test('a click, or Enter, asks for the full view at 200 px', () => {
  const { root, act, w } = setup();
  w.update(DEFAULT_WORK, TUE);
  root.querySelector<HTMLElement>('.wd-work')!.click();
  expect(act.expand).toHaveBeenCalledWith(200);
  root.querySelector<HTMLElement>('.wd-work')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(act.expand).toHaveBeenCalledTimes(2);
});

test('the full view: two time fields, seven days Monday first, Simpan and back', () => {
  const { root, w } = setup();
  w.update({ start: '08:00', end: '16:00', days: [1, 3, 0] }, TUE);
  w.setFull(true);
  expect(input(root, 'start').type).toBe('time');
  expect(input(root, 'start').value).toBe('08:00');
  expect(input(root, 'end').value).toBe('16:00');
  const days = [...root.querySelectorAll<HTMLButtonElement>('.wd-work-day')];
  expect(days.map(d => d.textContent)).toEqual(['S', 'S', 'R', 'K', 'J', 'S', 'M']);
  expect(days.map(d => d.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true', 'false', 'false', 'false', 'true']);
  expect(root.querySelector('.wd-work-back')!.textContent).toBe('‹ Kembali');
  expect(save(root).textContent).toBe('Simpan');
  expect(save(root).disabled).toBe(false);
});

test('English day letters start on Monday too', () => {
  const { root, w } = setup('en');
  w.update(DEFAULT_WORK, TUE);
  w.setFull(true);
  expect([...root.querySelectorAll('.wd-work-day')].map(d => d.textContent)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  expect(save(root).textContent).toBe('Save');
  expect(root.querySelector('.wd-work-back')!.textContent).toBe('‹ Back');
});

test('an end before the start, a cleared field or no day leaves Simpan disabled', () => {
  const { root, w } = setup();
  w.update(DEFAULT_WORK, TUE);
  w.setFull(true);
  type(input(root, 'end'), '08:00');
  expect(save(root).disabled).toBe(true);
  type(input(root, 'end'), '17:00');
  expect(save(root).disabled).toBe(false);
  type(input(root, 'start'), '');
  expect(save(root).disabled).toBe(true);
  type(input(root, 'start'), '09:00');
  for (const d of root.querySelectorAll<HTMLButtonElement>('.wd-work-day[aria-pressed="true"]')) d.click();
  expect(save(root).disabled).toBe(true);
  root.querySelector<HTMLButtonElement>('.wd-work-day')!.click();
  expect(save(root).disabled).toBe(false);
});

test('Simpan saves the form, then goes back', async () => {
  const { root, act, w } = setup();
  w.update(DEFAULT_WORK, TUE);
  w.setFull(true);
  type(input(root, 'start'), '08:00');
  type(input(root, 'end'), '16:00');
  const days = root.querySelectorAll<HTMLButtonElement>('.wd-work-day');
  days[5].click(); // Saturday on
  days[0].click(); // Monday off
  save(root).click();
  expect(act.save).toHaveBeenCalledWith({ start: '08:00', end: '16:00', days: [2, 3, 4, 5, 6] });
  expect(act.collapse).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(act.collapse).toHaveBeenCalledTimes(1));
});

test('a save that fails stays in the full view and says so', async () => {
  const { root, act, w } = setup();
  act.save.mockRejectedValueOnce(new Error('no'));
  w.update(DEFAULT_WORK, TUE);
  w.setFull(true);
  save(root).click();
  await vi.waitFor(() => expect(root.querySelector('.wd-work-err')!.textContent).toBe('Gagal menyimpan'));
  expect(act.collapse).not.toHaveBeenCalled();
});

test('Kembali goes back without saving', () => {
  const { root, act, w } = setup();
  w.update(DEFAULT_WORK, TUE);
  w.setFull(true);
  root.querySelector<HTMLButtonElement>('.wd-work-back')!.click();
  expect(act.collapse).toHaveBeenCalledTimes(1);
  expect(act.save).not.toHaveBeenCalled();
});

test('an update while the form is open keeps what was typed; closing shows the row again', () => {
  const { root, w } = setup();
  w.update(DEFAULT_WORK, TUE);
  w.setFull(true);
  type(input(root, 'start'), '07:30');
  w.update(DEFAULT_WORK, at(27, 10, 19));
  expect(input(root, 'start').value).toBe('07:30');
  w.setFull(false);
  expect(root.querySelector('.wd-work-time')!.textContent).toBe('6 J 41 M');
  w.setFull(true);
  expect(input(root, 'start').value).toBe('09:00'); // reopened from the saved hours
});
