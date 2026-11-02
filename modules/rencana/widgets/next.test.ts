// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { at, host, NOW, rem, SNAP } from '../../home/widgets/fixtures';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { renderNext } from './next';

afterEach(() => { document.body.innerHTML = ''; });

test('the next timed reminder: name and countdown pill on top, title, the day and the time', () => {
  const root = host();
  renderNext(root, id, 'id').update(SNAP, NOW);
  expect(root.querySelector('.v-card')).not.toBeNull();
  expect(root.querySelector('.wd-nx-top .v-lab.ink')!.textContent).toBe('Berikutnya');
  expect(root.querySelector('.wd-nx-top .v-pill.soft')!.textContent).toBe('3 jam lagi');
  expect(root.querySelector('.wd-nx-title')!.textContent).toBe('Kirim invoice');
  expect(root.querySelector('.wd-nx-detail')!.textContent).toBe('Hari ini');
  const time = root.querySelector('.wd-nx-foot .v-num')!;
  expect(time.textContent).toBe('14.00');
  expect(time.classList.contains('v-acc')).toBe(true);
});

test('English labels and a colon in the time', () => {
  const root = host();
  renderNext(root, en, 'en').update(SNAP, NOW);
  expect(root.querySelector('.wd-nx-top .v-lab.ink')!.textContent).toBe('Up next');
  expect(root.querySelector('.v-pill')!.textContent).toBe('in 3 h');
  expect(root.querySelector('.wd-nx-detail')!.textContent).toBe('Today');
  expect(root.querySelector('.wd-nx-foot .v-num')!.textContent).toBe('14:00');
});

test('under an hour the time left is in minutes', () => {
  const root = host();
  renderNext(root, id, 'id').update(SNAP, new Date(2026, 9, 27, 13, 42));
  expect(root.querySelector('.v-pill')!.textContent).toBe('18 menit lagi');
});

test('tomorrow and a later day are named', () => {
  const root = host();
  const rs = [rem(1, 'Rapat', '2026-10-28', at(28, 9, 0))];
  renderNext(root, id, 'id').update({ ...SNAP, reminders: rs }, NOW);
  expect(root.querySelector('.wd-nx-detail')!.textContent).toBe('Besok');
  expect(root.querySelector('.v-pill')!.textContent).toBe('22 jam lagi');
  const friday = host();
  renderNext(friday, id, 'id').update({ ...SNAP, reminders: [rem(1, 'Rapat', '2026-10-30', at(30, 9, 0))] }, NOW);
  expect(friday.querySelector('.wd-nx-detail')!.textContent).toBe('Jumat');
  const english = host();
  renderNext(english, en, 'en').update({ ...SNAP, reminders: [rem(1, 'Rapat', '2026-10-30', at(30, 9, 0))] }, NOW);
  expect(english.querySelector('.wd-nx-detail')!.textContent).toBe('Friday');
  expect(english.querySelector('.v-pill')!.textContent).toBe('in 2 days');
});

test('a day a week or more away shows its date', () => {
  const root = host();
  renderNext(root, en, 'en').update({ ...SNAP, reminders: [rem(1, 'Pajak', '2026-11-15', new Date(2026, 10, 15, 9, 0).getTime())] }, NOW);
  expect(root.querySelector('.wd-nx-detail')!.textContent).toBe('Nov 15');
});

test('without a timed open reminder it says nothing is scheduled', () => {
  const root = host();
  const rs = [rem(1, 'Selesai', '2026-10-27', at(27, 14, 0), true), rem(2, 'Bayar listrik', '2026-10-27', null)];
  renderNext(root, id, 'id').update({ ...SNAP, reminders: rs }, NOW);
  expect(root.textContent).toContain(id.nextEmpty);
  expect(root.querySelector('.v-pill')).toBeNull();
  expect(root.querySelector('.wd-nx-foot')).toBeNull();
  expect(root.querySelector('.wd-nx-top .v-lab.ink')!.textContent).toBe('Berikutnya');
  const english = host();
  renderNext(english, en, 'en').update({ ...SNAP, reminders: [] }, NOW);
  expect(english.textContent).toContain('Nothing scheduled');
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderNext(root, id, 'id');
  w.update(SNAP, NOW);
  w.update(SNAP, NOW);
  expect(root.querySelectorAll('.wd-next')).toHaveLength(1);
});
