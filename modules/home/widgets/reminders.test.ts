// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import type { HomeSnapshot } from '../types';
import { at, host, NOW, rem, SNAP } from './fixtures';
import { renderReminders, type ReminderActions } from './reminders';

afterEach(() => { document.body.innerHTML = ''; });

function mount(snap: HomeSnapshot = SNAP, lang: 'id' | 'en' = 'id') {
  const root = host();
  const actions = {
    add: vi.fn(async () => {}), setDone: vi.fn(async () => {}), expand: vi.fn(), collapse: vi.fn(),
  } satisfies ReminderActions;
  const widget = renderReminders(root, lang === 'en' ? en : id, lang, actions);
  widget.update(snap, NOW);
  const text = (sel: string) => root.querySelector(sel)?.textContent ?? '';
  // What the host does when the widget asks to expand.
  const full = () => widget.setFull(true);
  return { root, widget, actions, text, full };
}

const flush = () => new Promise(r => setTimeout(r, 0));

function typeIn(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

const enter = (el: Element) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

test('the widget shows the two nearest reminders', () => {
  const { root, text } = mount();
  expect(text('.wd-reminders .lab')).toBe('Reminder · 2');
  const rows = [...root.querySelectorAll('.wd-reminders .rm')];
  expect(rows.map(r => r.querySelector('.t')!.textContent)).toEqual(['Kirim invoice', 'Bayar listrik']);
  expect(rows.map(r => r.querySelector('.m')!.textContent)).toEqual(['14.00', 'Hari ini']);
  expect(root.querySelector('.wd-reminders button')).toBeNull();
});

test('English labels', () => {
  const { text } = mount(SNAP, 'en');
  expect(text('.wd-reminders .lab')).toBe('Reminders · 2');
  expect(text('.wd-reminders')).toContain('Today');
});

test('no reminders says so', () => {
  const { text } = mount({ ...SNAP, reminders: [] });
  expect(text('.wd-reminders')).toContain('Belum ada reminder.');
});

test('clicking the widget asks to expand', () => {
  const { root, actions, widget } = mount();
  const w = root.querySelector<HTMLElement>('.wd-reminders')!;
  expect(w.getAttribute('role')).toBe('button');
  w.click();
  enter(w);
  expect(actions.expand).toHaveBeenCalledTimes(2);
  expect(widget.full).toBe(false);
});

test('reminder titles are text, never markup', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { root, full } = mount({ ...SNAP, reminders: [rem(9, evil, '2026-10-27', null)] });
  expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('.rm .t')!.textContent).toBe(evil);
  full();
  expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('.list .rm .t')!.textContent).toBe(evil);
});

test('the full view lists every reminder; Kembali asks to collapse', () => {
  const { root, widget, actions, text, full } = mount();
  full();
  expect(widget.full).toBe(true);
  expect(text('.list .head')).toContain('Reminder · 2');
  expect(root.querySelectorAll('.list .items .rm')).toHaveLength(3);
  expect(document.activeElement).toBe(root.querySelector('.add input.title'));
  root.querySelector<HTMLElement>('.list .back')!.click();
  expect(actions.collapse).toHaveBeenCalled();
  widget.setFull(false);
  expect(root.querySelector('.list')).toBeNull();
  expect(text('.wd-reminders .lab')).toBe('Reminder · 2');
});

test('adding a reminder with a time', async () => {
  const { root, actions, full } = mount();
  full();
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
  const { root, actions, full } = mount();
  full();
  typeIn(root.querySelector<HTMLInputElement>('.add input.title')!, '  Beli susu ');
  enter(root.querySelector('.add input.title')!);
  expect(actions.add).toHaveBeenCalledWith('Beli susu', '2026-10-27', null);
});

test('an empty title adds nothing', () => {
  const { root, actions, full } = mount();
  full();
  enter(root.querySelector('.add input.title')!);
  expect(actions.add).not.toHaveBeenCalled();
});

test('an unreadable time says so and adds nothing', () => {
  const { root, actions, text, full } = mount();
  full();
  typeIn(root.querySelector<HTMLInputElement>('.add input.title')!, 'Rapat');
  typeIn(root.querySelector<HTMLInputElement>('.add input.time')!, '25.00');
  enter(root.querySelector('.add input.time')!);
  expect(text('.add .err')).toBe('Jam tidak dikenali');
  expect(actions.add).not.toHaveBeenCalled();
});

test('a failed save says so', async () => {
  const { root, actions, text, full } = mount();
  actions.add.mockRejectedValueOnce(new Error('too many'));
  full();
  typeIn(root.querySelector<HTMLInputElement>('.add input.title')!, 'Rapat');
  enter(root.querySelector('.add input.title')!);
  await flush();
  expect(text('.add .err')).toBe('Gagal menyimpan');
  expect(root.querySelector<HTMLInputElement>('.add input.title')!.value).toBe('Rapat');
});

test('a circle marks a reminder done', () => {
  const { root, actions, full } = mount();
  full();
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

test('typing survives an update in the full view', () => {
  const { root, widget, full } = mount();
  full();
  const title = root.querySelector<HTMLInputElement>('.add input.title')!;
  typeIn(title, 'Kir');
  title.focus();
  widget.update({ ...SNAP, reminders: SNAP.reminders.slice(1) }, NOW);
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
