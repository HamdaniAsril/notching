// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Shot } from '../bridge';
import type { Lang } from '../kit/protocol';
import { mountEditor, type EditorAction, type EditorBridge, type EditorDoc } from './view';

const DOC: EditorDoc = {
  id: 7,
  width: 2940,
  height: 1718,
  original: 'notchshot://localhost/7/original.png',
  edits: null,
  wallpaper: null,
};

const DESKTOP = '/Users/me/Desktop/Screenshot 2026-11-01 14.02.05.png';

function fakeBridge(doc: EditorDoc | null = DOC) {
  let onClose: (() => void) | null = null;
  let onShots: ((list: Shot[]) => void) | null = null;
  const order: string[] = [];
  const bridge = {
    doc: vi.fn(async () => doc),
    commit: vi.fn(async (_id: number, _edits: string, _png: Blob | null, action: EditorAction) => {
      order.push(`commit ${action}`);
      return action === 'save' ? DESKTOP : null;
    }),
    close: vi.fn(async () => {
      order.push('close');
    }),
    closing: vi.fn(async () => {
      order.push('closing');
    }),
    onClose: vi.fn((cb: () => void) => {
      onClose = cb;
      return () => (onClose = null);
    }),
    onShots: vi.fn((cb: (list: Shot[]) => void) => {
      onShots = cb;
      return () => (onShots = null);
    }),
  } satisfies EditorBridge;
  return {
    bridge,
    order,
    emitClose: () => onClose?.(),
    emitShots: (ids: number[]) => onShots?.(ids.map(id => ({ id }) as Shot)),
    listening: () => onClose !== null || onShots !== null,
  };
}

let root: HTMLElement;
let fake: ReturnType<typeof fakeBridge>;

beforeEach(() => {
  document.body.replaceChildren();
  document.title = '';
  root = document.createElement('div');
  document.body.append(root);
  fake = fakeBridge();
});

afterEach(() => vi.useRealTimers());

const flush = () => new Promise(r => setTimeout(r, 0));
const mount = (lang: Lang = 'id') => mountEditor(root, { bridge: fake.bridge, lang });
const button = (text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === text);
const cmdC = (target: EventTarget = document, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true, ...init }));

test('the shell shows the size label, Salin and Simpan', async () => {
  await mount();
  expect(root.querySelector('.ed-lab')!.textContent).toBe('Screenshot · 2940 × 1718');
  expect(document.title).toBe('Screenshot · 2940 × 1718');
  expect(button('Salin')!.classList.contains('ed-pri')).toBe(true);
  expect(button('Simpan')).toBeTruthy();
  const img = root.querySelector<HTMLImageElement>('.ed-stage img')!;
  expect(img.getAttribute('src')).toBe(DOC.original);
  // Drawn into a canvas later, which needs a CORS-clean picture.
  expect(img.crossOrigin).toBe('anonymous');
  // Undo and redo wait for the drawing tools.
  const undo = root.querySelector<HTMLButtonElement>('[aria-label="Urungkan"]')!;
  expect(undo.disabled).toBe(true);
  expect(root.querySelector<HTMLButtonElement>('[aria-label="Ulangi"]')!.disabled).toBe(true);
  // The header moves the window, and no style attribute is written.
  expect(root.querySelector('.ed-head')!.hasAttribute('data-tauri-drag-region')).toBe(true);
  expect(root.querySelector('[style]')).toBeNull();
});

test('English labels', async () => {
  await mount('en');
  expect(button('Copy')).toBeTruthy();
  expect(button('Save')).toBeTruthy();
  expect(root.querySelector('[aria-label="Undo"]')).toBeTruthy();
  expect(root.querySelector('[aria-label="Redo"]')).toBeTruthy();
});

test('Salin commits copy, then closes', async () => {
  await mount();
  button('Salin')!.click();
  await flush();
  expect(fake.bridge.commit).toHaveBeenCalledWith(7, '', null, 'copy');
  expect(fake.order).toEqual(['commit copy', 'close']);
  // Once only: a second click or a close request after it commits nothing more
  // (the request is still acknowledged, the page is closing anyway).
  button('Salin')!.click();
  fake.emitClose();
  await flush();
  expect(fake.order).toEqual(['commit copy', 'close', 'closing']);
});

test('Cmd+C does the same, but not while a text box is focused', async () => {
  await mount();
  const input = document.createElement('input');
  const box = document.createElement('div');
  box.setAttribute('contenteditable', 'true');
  const inner = document.createElement('span');
  box.append(inner);
  root.append(input, box);

  input.focus();
  expect(cmdC(input)).toBe(true);
  box.tabIndex = 0;
  box.focus();
  cmdC(inner);
  // Other key combinations are not Cmd+C.
  input.blur();
  box.blur();
  cmdC(document, { shiftKey: true });
  cmdC(document, { metaKey: false, ctrlKey: true });
  await flush();
  expect(fake.bridge.commit).not.toHaveBeenCalled();

  expect(cmdC()).toBe(false); // taken: no second copy from the Edit menu
  await flush();
  expect(fake.order).toEqual(['commit copy', 'close']);
});

test('a copy event (the Edit menu took Cmd+C) does the same outside a text box', async () => {
  await mount();
  const input = document.createElement('input');
  root.append(input);
  input.focus();
  input.dispatchEvent(new Event('copy', { bubbles: true, cancelable: true }));
  await flush();
  expect(fake.bridge.commit).not.toHaveBeenCalled();
  input.blur();
  const copy = new Event('copy', { bubbles: true, cancelable: true });
  document.dispatchEvent(copy);
  await flush();
  expect(copy.defaultPrevented).toBe(true);
  expect(fake.order).toEqual(['commit copy', 'close']);
});

test('Simpan commits save and stays open', async () => {
  await mount();
  button('Simpan')!.click();
  await flush();
  expect(fake.bridge.commit).toHaveBeenCalledWith(7, '', null, 'save');
  expect(fake.bridge.close).not.toHaveBeenCalled();
  expect(button('Tersimpan')).toBeTruthy();
  // Simpan again saves again (the Desktop gets "(2)").
  button('Tersimpan')!.click();
  await flush();
  expect(fake.order).toEqual(['commit save', 'commit save']);
});

test('a failed Simpan says so for 2 s, then offers Simpan again', async () => {
  vi.useFakeTimers();
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  fake.bridge.commit.mockRejectedValueOnce('no space');
  await mount();
  button('Simpan')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(button('Gagal menyimpan')).toBeTruthy();
  await vi.advanceTimersByTimeAsync(1999);
  expect(button('Gagal menyimpan')).toBeTruthy();
  await vi.advanceTimersByTimeAsync(1);
  expect(button('Simpan')).toBeTruthy();
  expect(error).toHaveBeenCalledWith('notching: screenshot not saved', 'no space');
  expect(fake.bridge.close).not.toHaveBeenCalled();
  error.mockRestore();
});

test('close_request_commits_keep', async () => {
  await mount();
  fake.emitClose();
  await flush();
  expect(fake.bridge.commit).toHaveBeenCalledWith(7, '', null, 'keep');
  // Acknowledged first, so the core waits for the commit rather than 5 s.
  expect(fake.order).toEqual(['closing', 'commit keep', 'close']);
  // A second request while closing commits nothing more.
  fake.emitClose();
  await flush();
  expect(fake.order).toEqual(['closing', 'commit keep', 'close', 'closing']);
});

test('the close request is acknowledged before a Simpan under way ends', async () => {
  let saved!: () => void;
  fake.bridge.commit.mockImplementationOnce(async () => {
    await new Promise<void>(r => (saved = r));
    return DESKTOP;
  });
  await mount();
  button('Simpan')!.click();
  fake.emitClose();
  // At once, not after the Simpan.
  expect(fake.bridge.closing).toHaveBeenCalledTimes(1);
  await flush();
  expect(fake.bridge.close).not.toHaveBeenCalled();
  saved();
  await flush();
  expect(fake.bridge.close).toHaveBeenCalledTimes(1);
});

test('a failed acknowledgement still commits and closes', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  fake.bridge.closing.mockRejectedValueOnce('ipc');
  await mount();
  fake.emitClose();
  await flush();
  expect(fake.order).toEqual(['commit keep', 'close']);
  expect(error).toHaveBeenCalledWith('notching: editor close not acknowledged', 'ipc');
  error.mockRestore();
});

test('a close request during a Simpan commits keep after it', async () => {
  let saved!: () => void;
  fake.bridge.commit.mockImplementationOnce(async (_i, _e, _p, action) => {
    await new Promise<void>(r => (saved = r));
    fake.order.push(`commit ${action}`);
    return DESKTOP;
  });
  await mount();
  button('Simpan')!.click();
  fake.emitClose();
  await flush();
  expect(fake.order).toEqual(['closing']);
  saved();
  await flush();
  expect(fake.order).toEqual(['closing', 'commit save', 'commit keep', 'close']);
});

test('a commit that fails still closes, so the window never stays stuck', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  fake.bridge.commit.mockRejectedValue('gone');
  await mount();
  fake.emitClose();
  await flush();
  expect(fake.bridge.close).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith('notching: editor commit failed', 'gone');
  error.mockRestore();
});

test('a shots list without the doc id closes without committing', async () => {
  await mount();
  fake.emitShots([3, 7, 9]);
  await flush();
  expect(fake.bridge.close).not.toHaveBeenCalled();
  fake.emitShots([3, 9]);
  await flush();
  expect(fake.bridge.close).toHaveBeenCalledTimes(1);
  expect(fake.bridge.commit).not.toHaveBeenCalled();
  // Nothing left to commit to.
  fake.emitClose();
  button('Salin')!.click();
  await flush();
  expect(fake.bridge.commit).not.toHaveBeenCalled();
  expect(fake.bridge.close).toHaveBeenCalledTimes(1);
});

test('a screenshot gone before the page loaded closes it', async () => {
  fake = fakeBridge(null);
  await mount();
  expect(fake.bridge.close).toHaveBeenCalledTimes(1);
  expect(fake.bridge.commit).not.toHaveBeenCalled();
});

test('a close request before the doc arrived closes without a commit', async () => {
  let give!: (d: EditorDoc) => void;
  fake.bridge.doc.mockImplementationOnce(() => new Promise<EditorDoc>(r => (give = r)));
  const mounted = mount();
  fake.emitClose();
  give(DOC);
  await mounted;
  await flush();
  expect(fake.bridge.commit).not.toHaveBeenCalled();
  expect(fake.bridge.close).toHaveBeenCalledTimes(1);
});

test('destroy stops listening', async () => {
  const view = await mount();
  view.destroy();
  expect(fake.listening()).toBe(false);
  cmdC();
  await flush();
  expect(fake.bridge.commit).not.toHaveBeenCalled();
});
