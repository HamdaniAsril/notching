// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Shot } from '../bridge';
import { fakeShotDeps, shot } from './test-helpers';
import { mountShotResult } from './result';

let box: HTMLElement;
let deps: ReturnType<typeof fakeShotDeps>;

beforeEach(() => {
  document.body.replaceChildren();
  box = document.createElement('div');
  document.body.append(box);
  deps = fakeShotDeps();
});

const flush = () => new Promise(r => setTimeout(r, 0));
const button = (text: string) => [...box.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === text)!;
const picture = () => box.querySelector<HTMLElement>('.shot-pic')!;
const mouse = (target: EventTarget, type: string, x = 0, y = 0) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: type === 'mouseup' || type === 'click' ? 0 : 1 }));

function mount(s: Shot = shot(7)) {
  const v = mountShotResult(box, deps);
  v.render(s.id, s);
  return v;
}

test('it shows the label for each kind, the copied line and the size', () => {
  const v = mountShotResult(box, deps);
  const label = () => box.querySelector('.shot-lab')!.textContent;
  v.render(1, shot(1, { kind: 'window' }));
  expect(label()).toBe('Screenshot · Window');
  v.render(2, shot(2, { kind: 'screen' }));
  expect(label()).toBe('Screenshot · Layar');
  v.render(3, shot(3, { kind: 'area', width: 2940, height: 1718 }));
  expect(label()).toBe('Screenshot · Area');
  expect(box.querySelector('.shot-done')!.textContent).toBe('Tersalin ke clipboard');
  expect(box.querySelector('.shot-size')!.textContent).toBe('2940 × 1718');
  expect(box.querySelector('.shot-hint')!.textContent).toBe('Klik untuk edit');
  expect(picture().querySelector('img')!.getAttribute('src')).toBe('notchshot://localhost/3/current.png?v=0');
});

test('Volt look: no dot-matrix label, Salin is the accent button, Hapus is danger', () => {
  mount();
  expect(box.querySelector('.lab')).toBeNull();
  expect(button('Salin').classList.contains('primary')).toBe(true);
  expect(button('Hapus').classList.contains('danger')).toBe(true);
  expect(button('Simpan').classList.contains('primary')).toBe(false);
  expect(button('Simpan').classList.contains('danger')).toBe(false);
});

test('English labels', () => {
  deps = fakeShotDeps({ lang: 'en' });
  mount(shot(1, { kind: 'screen' }));
  expect(box.querySelector('.shot-lab')!.textContent).toBe('Screenshot · Screen');
  expect(box.querySelector('.shot-done')!.textContent).toBe('Copied to clipboard');
  expect(button('Copy')).toBeTruthy();
  expect(button('Save')).toBeTruthy();
  expect(button('Delete')).toBeTruthy();
});

test('Salin copies, then closes', () => {
  mount();
  button('Salin').click();
  expect(deps.shotCopy).toHaveBeenCalledWith(7);
  expect(deps.close).toHaveBeenCalledTimes(1);
  expect(deps.shotCopy.mock.invocationCallOrder[0]).toBeLessThan(deps.close.mock.invocationCallOrder[0]);
});

test('Cmd+C on the document copies, then closes', () => {
  mount();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }));
  expect(deps.shotCopy).toHaveBeenCalledWith(7);
  expect(deps.close).toHaveBeenCalledTimes(1);
  // A plain c does nothing.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
  expect(deps.shotCopy).toHaveBeenCalledTimes(1);
});

test('a copy from the Edit menu does the same', () => {
  mount();
  const e = new Event('copy', { bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  expect(deps.shotCopy).toHaveBeenCalledWith(7);
  expect(deps.close).toHaveBeenCalledTimes(1);
});

test('Cmd+C does nothing once the page is gone', () => {
  mount().destroy();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }));
  document.dispatchEvent(new Event('copy', { bubbles: true }));
  expect(deps.shotCopy).not.toHaveBeenCalled();
});

test('Simpan saves, reads Tersimpan, and the panel stays open', async () => {
  mount();
  button('Simpan').click();
  expect(deps.shotSave).toHaveBeenCalledWith(7);
  await flush();
  expect(button('Tersimpan')).toBeTruthy();
  expect(button('Simpan')).toBeUndefined();
  expect(deps.close).not.toHaveBeenCalled();
});

test('a failed Simpan says so for 2 s, then offers Simpan again', async () => {
  vi.useFakeTimers();
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  deps.shotSave.mockRejectedValue('gone');
  mount();
  button('Simpan').click();
  await vi.advanceTimersByTimeAsync(0);
  expect(button('Gagal menyimpan')).toBeTruthy();
  expect(logged).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1999);
  expect(button('Gagal menyimpan')).toBeTruthy();
  await vi.advanceTimersByTimeAsync(1);
  expect(button('Simpan')).toBeTruthy();
  expect(button('Tersimpan')).toBeUndefined();
  expect(deps.close).not.toHaveBeenCalled();
});

test('a saved item starts as Tersimpan', () => {
  mount(shot(7, { saved: true }));
  expect(button('Tersimpan')).toBeTruthy();
});

test('Hapus deletes, then closes', () => {
  mount();
  button('Hapus').click();
  expect(deps.shotDelete).toHaveBeenCalledWith(7);
  expect(deps.close).toHaveBeenCalledTimes(1);
  expect(deps.shotDelete.mock.invocationCallOrder[0]).toBeLessThan(deps.close.mock.invocationCallOrder[0]);
});

test('a click on the picture opens the editor, then closes', () => {
  mount();
  mouse(picture(), 'mousedown', 10, 10);
  mouse(document, 'mouseup', 10, 10);
  mouse(picture(), 'click', 10, 10);
  expect(deps.openEditor).toHaveBeenCalledWith(7);
  expect(deps.close).toHaveBeenCalledTimes(1);
  expect(deps.shotStartDrag).not.toHaveBeenCalled();
});

test('the editor failing to open is logged and breaks nothing', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = new Error('unknown command open_editor');
  deps.openEditor.mockRejectedValue(failure);
  mount();
  mouse(picture(), 'click', 10, 10);
  await flush();
  expect(deps.close).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith('notching: the editor did not open', failure);
  error.mockRestore();
});

test('a press on the picture and a move past 4 px drags it', () => {
  mount();
  mouse(picture(), 'mousedown', 10, 10);
  mouse(document, 'mousemove', 13, 10);
  expect(deps.shotStartDrag).not.toHaveBeenCalled();
  mouse(document, 'mousemove', 16, 10);
  expect(deps.shotStartDrag).toHaveBeenCalledWith(7);
  mouse(document, 'mousemove', 30, 10);
  expect(deps.shotStartDrag).toHaveBeenCalledTimes(1);
  // The click that ends the drag opens nothing.
  mouse(document, 'mouseup', 30, 10);
  mouse(picture(), 'click', 30, 10);
  expect(deps.openEditor).not.toHaveBeenCalled();
});

test('a gone event for the shown id closes; another id does not', () => {
  mount();
  deps.emitShot({ phase: 'gone', id: 3 });
  deps.emitShot({ phase: 'taken', id: 7 });
  expect(deps.close).not.toHaveBeenCalled();
  deps.emitShot({ phase: 'gone', id: 7 });
  expect(deps.close).toHaveBeenCalledTimes(1);
});

test('a result still waiting for its picture closes when its id goes', () => {
  const v = mountShotResult(box, deps);
  v.render(9, undefined);
  expect(box.querySelector('.shot-pic')).toBeNull();
  deps.emitShot({ phase: 'gone', id: 9 });
  expect(deps.close).toHaveBeenCalledTimes(1);
});

test('destroy stops listening', () => {
  mount().destroy();
  deps.emitShot({ phase: 'gone', id: 7 });
  expect(deps.close).not.toHaveBeenCalled();
  expect(box.childElementCount).toBe(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
