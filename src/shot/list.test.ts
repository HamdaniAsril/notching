// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest';
import { hostStrings } from '../i18n';
import { fakeShotDeps, shot } from './test-helpers';
import { mountShotList, timeLabel } from './list';

let box: HTMLElement;
let deps: ReturnType<typeof fakeShotDeps>;

// 1 Nov 2026, 15.00 local time.
const NOW = new Date(2026, 10, 1, 15, 0).getTime();
const at = (month: number, day: number, h: number, m: number) => new Date(2026, month, day, h, m).getTime();

beforeEach(() => {
  document.body.replaceChildren();
  box = document.createElement('div');
  document.body.append(box);
  deps = fakeShotDeps({ now: () => NOW });
});

const flush = () => new Promise(r => setTimeout(r, 0));
const tiles = () => [...box.querySelectorAll<HTMLElement>('.shot-tile')];
const tile = (id: number) => box.querySelector<HTMLElement>(`.shot-tile[data-id="${id}"]`)!;
const take = (label: string) => [...box.querySelectorAll<HTMLButtonElement>('.shot-take button')].find(b => b.textContent!.startsWith(label))!;
const mouse = (target: EventTarget, type: string, x = 0, y = 0) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: type === 'mouseup' || type === 'click' ? 0 : 1 }));

// 15 shots, oldest first, so the list has to put the newest first.
const fifteen = () => Array.from({ length: 15 }, (_, i) => {
  const taken = i < 3 ? at(9, 30, 9, i) : i < 8 ? at(9, 31, 10, i) : at(10, 1, 14, i - 8 + 2);
  return shot(i + 1, { takenMs: taken });
});

test('time labels: today, yesterday, older', () => {
  const id = hostStrings('id').shot;
  const en = hostStrings('en').shot;
  expect(timeLabel(at(10, 1, 14, 2), NOW, id)).toBe('14.02');
  expect(timeLabel(at(10, 1, 9, 5), NOW, en)).toBe('09:05');
  expect(timeLabel(at(9, 31, 23, 59), NOW, id)).toBe('Kemarin');
  expect(timeLabel(at(9, 31, 0, 1), NOW, en)).toBe('Yesterday');
  expect(timeLabel(at(9, 30, 12, 0), NOW, id)).toBe('30 Okt');
  expect(timeLabel(at(9, 30, 12, 0), NOW, en)).toBe('Oct 30');
  expect(timeLabel(at(7, 17, 12, 0), NOW, id)).toBe('17 Agu');
});

test('15 shots draw 15 tiles in 5 columns, newest first, with times', () => {
  const v = mountShotList(box, deps);
  v.render(fifteen());
  expect(tiles()).toHaveLength(15);
  expect(box.querySelector('.shot-grid')).not.toBeNull();
  expect(tiles().map(t => Number(t.dataset.id))).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  const times = tiles().map(t => t.querySelector('.shot-time')!.textContent);
  expect(times[0]).toBe('14.08');
  expect(times[6]).toBe('14.02');
  expect(times[7]).toBe('Kemarin');
  expect(times[14]).toBe('30 Okt');
  expect(tile(15).querySelector('img')!.getAttribute('src')).toBe('notchshot://localhost/15/thumb.png?v=0');
  expect(box.querySelector('.shot-count')!.textContent).toBe('Screenshot · 15');
});

test('an empty list shows the empty line', () => {
  mountShotList(box, deps).render([]);
  expect(tiles()).toHaveLength(0);
  expect(box.querySelector('.shot-empty')!.textContent).toBe('Tekan ⌘⇧3 atau ⌘⇧4 untuk screenshot pertama');
  expect(box.querySelector('.shot-count')!.textContent).toBe('Screenshot · 0');
});

test('the back bar goes to the Modul page', () => {
  mountShotList(box, deps).render([]);
  const back = box.querySelector<HTMLButtonElement>('.shot-head button')!;
  expect(back.textContent).toBe('‹ Modul');
  back.click();
  expect(deps.back).toHaveBeenCalledTimes(1);
});

test('the take buttons show their keys', () => {
  mountShotList(box, deps).render([]);
  expect([...box.querySelectorAll('.shot-take button')].map(b => b.textContent))
    .toEqual(['Layar⌘⇧3', 'Window⌘⇧4 + klik', 'Area⌘⇧4 + tarik']);
});

test('Layar closes the panel and takes the screen only once it is closed', async () => {
  let closed!: () => void;
  deps.close.mockImplementation(() => new Promise<void>(r => { closed = r; }));
  mountShotList(box, deps).render([]);
  take('Layar').click();
  expect(deps.close).toHaveBeenCalledTimes(1);
  await flush();
  expect(deps.shotTakeScreen).not.toHaveBeenCalled();
  closed();
  await flush();
  expect(deps.shotTakeScreen).toHaveBeenCalledTimes(1);
});

test('Window and Area close the panel, then pick', async () => {
  let closed!: () => void;
  deps.close.mockImplementation(() => new Promise<void>(r => { closed = r; }));
  mountShotList(box, deps).render([]);
  take('Window').click();
  await flush();
  expect(deps.shotPick).not.toHaveBeenCalled();
  closed();
  await flush();
  expect(deps.shotPick).toHaveBeenLastCalledWith('window');
  take('Area').click();
  closed();
  await flush();
  expect(deps.shotPick).toHaveBeenLastCalledWith('area');
  expect(deps.close).toHaveBeenCalledTimes(2);
});

test('the hover buttons copy, save and delete', async () => {
  mountShotList(box, deps).render([shot(4), shot(5)]);
  const act = (id: number, label: string) => tile(id).querySelector<HTMLButtonElement>(`.shot-acts button[aria-label="${label}"]`)!;
  act(4, 'Salin').click();
  expect(deps.shotCopy).toHaveBeenCalledWith(4);
  act(5, 'Simpan').click();
  expect(deps.shotSave).toHaveBeenCalledWith(5);
  act(4, 'Hapus').click();
  expect(deps.shotDelete).toHaveBeenCalledWith(4);
  // None of them opens the editor.
  expect(deps.openEditor).not.toHaveBeenCalled();
  await flush();
  expect(act(5, 'Tersimpan')).not.toBeNull();
});

test('a tile click opens the editor; a drag drags it', () => {
  mountShotList(box, deps).render([shot(4), shot(5)]);
  const pic = (id: number) => tile(id).querySelector<HTMLElement>('.shot-th')!;
  mouse(pic(4), 'mousedown', 10, 10);
  mouse(document, 'mouseup', 10, 10);
  mouse(pic(4), 'click', 10, 10);
  expect(deps.openEditor).toHaveBeenCalledWith(4);
  expect(deps.close).toHaveBeenCalledTimes(1);
  mouse(pic(5), 'mousedown', 10, 10);
  mouse(document, 'mousemove', 10, 20);
  expect(deps.shotStartDrag).toHaveBeenCalledWith(5);
  mouse(document, 'mouseup', 10, 20);
  mouse(pic(5), 'click', 10, 20);
  expect(deps.openEditor).toHaveBeenCalledTimes(1);
});

test('keys still taken by the Mac show the notice, with a button to the settings', async () => {
  deps.shotKeys.mockResolvedValue({ screen: 'mac', pick: 'mac' });
  mountShotList(box, deps).render([]);
  await flush();
  const note = box.querySelector('.shot-note')!;
  expect(note.querySelector('.shot-note-text')!.textContent).toBe('⌘⇧3 dan ⌘⇧4 masih dipakai screenshot bawaan Mac');
  const open = note.querySelector('button')!;
  expect(open.textContent).toBe('Buka Pengaturan Sistem');
  open.click();
  expect(deps.openKeyboardShortcuts).toHaveBeenCalledTimes(1);
  expect(deps.onNotes).toHaveBeenLastCalledWith(1);
});

test('a key taken by another app shows its line without a button', async () => {
  deps.shotKeys.mockResolvedValue({ screen: 'ok', pick: 'other' });
  mountShotList(box, deps).render([]);
  await flush();
  const notes = box.querySelectorAll('.shot-note');
  expect(notes).toHaveLength(1);
  expect(notes[0].textContent).toBe('⌘⇧4 dipakai app lain');
  expect(notes[0].querySelector('button')).toBeNull();
});

test('no permission shows its line, with a button to the settings', async () => {
  deps.shotPermission.mockResolvedValue(false);
  deps.shotKeys.mockResolvedValue({ screen: 'mac', pick: 'ok' });
  mountShotList(box, deps).render([]);
  await flush();
  const notes = box.querySelectorAll('.shot-note');
  expect(notes).toHaveLength(2);
  expect(notes[0].querySelector('.shot-note-text')!.textContent).toBe('Screenshot butuh izin Perekaman Layar');
  notes[0].querySelector('button')!.click();
  expect(deps.openScreenRecordingSettings).toHaveBeenCalledTimes(1);
  expect(notes[1].querySelector('.shot-note-text')!.textContent).toBe('⌘⇧3 masih dipakai screenshot bawaan Mac');
  expect(deps.onNotes).toHaveBeenLastCalledWith(2);
});

test('all keys ours and the permission given: no notice', async () => {
  mountShotList(box, deps).render([shot(1)]);
  await flush();
  expect(box.querySelector('.shot-note')).toBeNull();
  expect(deps.onNotes).toHaveBeenLastCalledWith(0);
});

test('a new list keeps the notices', async () => {
  deps.shotPermission.mockResolvedValue(false);
  const v = mountShotList(box, deps);
  v.render([]);
  await flush();
  v.render([shot(1)]);
  expect(box.querySelectorAll('.shot-note')).toHaveLength(1);
  expect(tiles()).toHaveLength(1);
  expect(deps.shotPermission).toHaveBeenCalledTimes(1);
});

test('names are text, not markup', () => {
  deps = fakeShotDeps({ lang: 'en' });
  mountShotList(box, deps).render([shot(1)]);
  expect(box.querySelector('.shot-head button')!.textContent).toBe('‹ Modules');
  expect(box.querySelector('[style]')).toBeNull();
});
