// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Shot } from '../bridge';
import type { Lang } from '../kit/protocol';
import { COLORS, WIDTHS, parse, scaleFor, serialize, type Shape } from './model';
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

// jsdom has no canvas: the context is a stand-in that takes every call, and the
// picture is shown at half its size, from (100, 50): a screen pixel is 2 image
// pixels.
const SHOWN = { left: 100, top: 50, width: DOC.width / 2, height: DOC.height / 2 };

beforeEach(() => {
  const ctx = new Proxy({}, { get: (_t, name) => (name === 'measureText' ? (t: string) => ({ width: t.length * 10 }) : () => {}), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...SHOWN, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
  document.body.replaceChildren();
  document.title = '';
  root = document.createElement('div');
  document.body.append(root);
  fake = fakeBridge();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
  // Nothing to undo or redo yet.
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

// ---- the drawing tools -----------------------------------------------------

const canvas = () => root.querySelector<HTMLCanvasElement>('.ed-canvas')!;
const toolBtn = (tool: string) => root.querySelector<HTMLButtonElement>(`.ed-tools [data-tool="${tool}"]`)!;
const on = () => [...root.querySelectorAll('.ed-tools .ed-on')].map(b => (b as HTMLElement).dataset.tool);
const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = document) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

// Screen pixels as the pointer sees them: the picture starts at (100, 50).
const px = (ix: number, iy: number): [number, number] => [100 + ix / 2, 50 + iy / 2];
const mouse = (type: string, [x, y]: [number, number], init: MouseEventInit = {}, target: EventTarget = canvas()) =>
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true, ...init }));
// A drag in image pixels, through the points given.
function drag(path: [number, number][], init: MouseEventInit = {}) {
  mouse('pointerdown', px(...path[0]), init);
  for (const p of path.slice(1)) mouse('pointermove', px(...p), init);
  mouse('pointerup', px(...path[path.length - 1]), init);
}
const click = (ix: number, iy: number) => drag([[ix, iy]]);
const swatch = (i: number) => root.querySelectorAll<HTMLButtonElement>('.ed-sw')[i];
const thick = (i: number) => root.querySelectorAll<HTMLButtonElement>('.ed-wd')[i];

// What a Simpan would send now: the edits as a doc.
async function sent(): Promise<Shape[]> {
  root.querySelector<HTMLButtonElement>('.ed-btn:not(.ed-pri)')!.click();
  await flush();
  const calls = fake.bridge.commit.mock.calls;
  return parse(calls[calls.length - 1][1]).shapes;
}
const SCALE = scaleFor(DOC.width, DOC.height);

test('the 8 tools are in the left bar, named in the language, with their keys', async () => {
  await mount();
  const tools = [...root.querySelectorAll<HTMLButtonElement>('.ed-tools button')];
  expect(tools.map(b => b.dataset.tool)).toEqual(['select', 'pen', 'arrow', 'rect', 'ellipse', 'line', 'text', 'sensor']);
  expect(tools.map(b => b.getAttribute('aria-label'))).toEqual(['Pilih / geser', 'Coretan', 'Panah', 'Kotak', 'Lingkaran', 'Garis', 'Teks', 'Sensor']);
  expect(tools.map(b => b.title.slice(-3))).toEqual(['(V)', '(P)', '(A)', '(R)', '(O)', '(L)', '(T)', '(S)']);
  // The mockup opens on the pen.
  expect(on()).toEqual(['pen']);
  expect(toolBtn('pen').getAttribute('aria-pressed')).toBe('true');
  expect(toolBtn('rect').getAttribute('aria-pressed')).toBe('false');
  toolBtn('rect').click();
  expect(on()).toEqual(['rect']);
  expect(canvas().dataset.tool).toBe('rect');
});

test('English names for the tools, colours and widths', async () => {
  await mount('en');
  expect(root.querySelector('[data-tool="sensor"]')!.getAttribute('aria-label')).toBe('Censor');
  expect(root.querySelector('.ed-c0')!.getAttribute('aria-label')).toBe('Red');
  expect(root.querySelector('.ed-wd')!.getAttribute('aria-label')).toBe('Thin');
});

test('the keys v, p, a, r, o, l, t, s pick tools', async () => {
  await mount();
  const keys: Record<string, string> = { v: 'select', p: 'pen', a: 'arrow', r: 'rect', o: 'ellipse', l: 'line', t: 'text', s: 'sensor' };
  for (const [k, tool] of Object.entries(keys)) {
    key(k === 'v' ? 'V' : k); // Caps Lock or Shift do not matter
    expect(on()).toEqual([tool]);
    expect(canvas().dataset.tool).toBe(tool);
  }
  key('x');
  expect(on()).toEqual(['sensor']);
  // With Cmd, Ctrl or Alt a letter is not a tool.
  key('p', { ctrlKey: true });
  key('p', { altKey: true });
  key('p', { metaKey: true });
  expect(on()).toEqual(['sensor']);
});

test("the keys are the text box's while it has the focus", async () => {
  await mount();
  toolBtn('text').click();
  click(100, 100);
  const input = root.querySelector<HTMLInputElement>('.ed-text')!;
  expect(document.activeElement).toBe(input);
  key('r', {}, input);
  key('Backspace', {}, input);
  key('z', { metaKey: true }, input);
  expect(on()).toEqual(['text']);
});

test('the 6 colours and 3 widths are in the bottom bar', async () => {
  await mount();
  const colors = [...root.querySelectorAll<HTMLButtonElement>('.ed-bar .ed-sw')];
  expect(colors).toHaveLength(COLORS.length);
  expect(colors.map(b => b.getAttribute('aria-label'))).toEqual(['Merah', 'Kuning', 'Hijau', 'Biru', 'Hitam', 'Putih']);
  expect(colors.map(b => b.className.match(/ed-c\d/)![0])).toEqual(['ed-c0', 'ed-c1', 'ed-c2', 'ed-c3', 'ed-c4', 'ed-c5']);
  const widths = [...root.querySelectorAll<HTMLButtonElement>('.ed-bar .ed-wd')];
  expect(widths).toHaveLength(WIDTHS.length);
  expect(widths.map(b => b.getAttribute('aria-label'))).toEqual(['Tipis', 'Sedang', 'Tebal']);
  // Red and the middle width to begin with.
  expect(colors.map(b => b.classList.contains('ed-sel'))).toEqual([true, false, false, false, false, false]);
  expect(widths.map(b => b.classList.contains('ed-sel'))).toEqual([false, true, false]);
  colors[3].click();
  widths[2].click();
  expect(colors.map(b => b.classList.contains('ed-sel'))).toEqual([false, false, false, true, false, false]);
  expect(widths.map(b => b.classList.contains('ed-sel'))).toEqual([false, false, true]);
  // No style attribute anywhere, though the picture is now a canvas.
  expect(root.querySelector('[style]')).toBeNull();
});

test('a drag with each shape tool draws that shape, in image pixels, in the chosen colour and width', async () => {
  await mount();
  swatch(3).click(); // blue
  thick(2).click(); // thick
  for (const tool of ['arrow', 'rect', 'ellipse', 'line']) {
    toolBtn(tool).click();
    drag([[100, 200], [300, 400], [500, 600]]);
  }
  toolBtn('sensor').click();
  drag([[10, 20], [90, 80]]);
  toolBtn('pen').click();
  drag([[0, 0], [20, 10], [40, 0]]);
  const shapes = await sent();
  expect(shapes.map(s => s.type)).toEqual(['arrow', 'rect', 'ellipse', 'line', 'sensor', 'pen']);
  expect(shapes.map(s => s.id)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(shapes[1]).toEqual({ id: 2, type: 'rect', color: COLORS[3], width: 14 * SCALE, x1: 100, y1: 200, x2: 500, y2: 600 });
  expect(shapes[4]).toEqual({ id: 5, type: 'sensor', x1: 10, y1: 20, x2: 90, y2: 80 });
  expect(shapes[5]).toEqual({ id: 6, type: 'pen', color: COLORS[3], width: 14 * SCALE, points: [[0, 0], [20, 10], [40, 0]] });
});

test('Shift draws a line at 45 degrees and a square', async () => {
  await mount();
  toolBtn('line').click();
  drag([[100, 100], [400, 130]], { shiftKey: true });
  toolBtn('rect').click();
  drag([[0, 0], [100, 40]], { shiftKey: true });
  const [line, square] = (await sent()) as Extract<Shape, { x1: number }>[];
  expect(line.x2).toBeCloseTo(100 + Math.hypot(300, 30));
  expect(line.y2).toBeCloseTo(100);
  expect([square.x2, square.y2]).toEqual([100, 100]);
});

test('a bare click with a box tool draws nothing, a click with the pen is a dot', async () => {
  await mount();
  toolBtn('rect').click();
  click(300, 300);
  toolBtn('sensor').click();
  drag([[10, 10], [11, 11]]);
  expect(await sent()).toEqual([]);
  toolBtn('pen').click();
  click(50, 60);
  expect(await sent()).toMatchObject([{ type: 'pen', points: [[50, 60]] }]);
});

test('select picks a shape on its outline, Delete removes it and Escape lets go', async () => {
  await mount();
  toolBtn('rect').click();
  drag([[200, 200], [600, 500]]);
  toolBtn('select').click();
  click(300, 300); // inside the frame, not on it
  key('Delete');
  expect(await sent()).toHaveLength(1);
  click(202, 350); // on the left edge, within the slop
  key('Escape');
  key('Delete'); // nothing selected now
  expect(await sent()).toHaveLength(1);
  click(202, 350);
  key('Delete');
  expect(await sent()).toEqual([]);
  expect(fake.bridge.close).not.toHaveBeenCalled(); // Escape never closes the window
  // Backspace does the same.
  key('z', { metaKey: true });
  click(202, 350);
  key('Backspace');
  expect(await sent()).toEqual([]);
});

test('Escape is taken: it lets the selection go and the window stays', async () => {
  await mount();
  toolBtn('rect').click();
  drag([[200, 200], [600, 500]]);
  toolBtn('select').click();
  click(202, 350);
  expect(key('Escape')).toBe(false); // preventDefault was called
  expect(fake.bridge.close).not.toHaveBeenCalled();
  expect(fake.bridge.commit).not.toHaveBeenCalled();
});

test('select drags a shape to a new place as one change', async () => {
  await mount();
  toolBtn('rect').click();
  drag([[200, 200], [600, 500]]);
  toolBtn('select').click();
  drag([[202, 350], [250, 360], [302, 450]]);
  expect(await sent()).toMatchObject([{ type: 'rect', x1: 300, y1: 300, x2: 700, y2: 600 }]);
  key('z', { metaKey: true }); // one undo takes the whole drag back
  expect(await sent()).toMatchObject([{ x1: 200, y1: 200, x2: 600, y2: 500 }]);
});

test('a grip resizes the selected shape', async () => {
  await mount();
  toolBtn('rect').click();
  drag([[200, 200], [600, 500]]);
  toolBtn('select').click();
  click(202, 350); // selects it
  drag([[600, 500], [800, 700]]); // the south-east grip
  expect(await sent()).toMatchObject([{ x1: 200, y1: 200, x2: 800, y2: 700 }]);
});

test('Cmd+Z and Cmd+Shift+Z undo and redo, and so do the buttons', async () => {
  await mount();
  const undo = root.querySelector<HTMLButtonElement>('[aria-label="Urungkan"]')!;
  const redo = root.querySelector<HTMLButtonElement>('[aria-label="Ulangi"]')!;
  toolBtn('rect').click();
  drag([[0, 0], [100, 100]]);
  toolBtn('line').click();
  drag([[0, 0], [100, 50]]);
  expect([undo.disabled, redo.disabled]).toEqual([false, true]);
  expect(await sent()).toHaveLength(2);

  key('z', { metaKey: true });
  expect(await sent()).toMatchObject([{ type: 'rect' }]);
  expect([undo.disabled, redo.disabled]).toEqual([false, false]);
  key('z', { metaKey: true });
  expect(await sent()).toEqual([]);
  expect([undo.disabled, redo.disabled]).toEqual([true, false]);
  key('Z', { metaKey: true, shiftKey: true });
  expect(await sent()).toMatchObject([{ type: 'rect' }]);
  redo.click();
  expect(await sent()).toHaveLength(2);
  expect(redo.disabled).toBe(true);
  undo.click();
  expect(await sent()).toHaveLength(1);
  // A new stroke after an undo ends the redo.
  toolBtn('rect').click();
  drag([[5, 5], [50, 50]]);
  expect(redo.disabled).toBe(true);
});

test('the colour and width are the ones chosen, for each stroke after', async () => {
  await mount();
  toolBtn('rect').click();
  drag([[0, 0], [100, 100]]);
  swatch(5).click(); // white
  thick(0).click(); // thin
  drag([[200, 0], [300, 100]]);
  const [a, b] = (await sent()) as Extract<Shape, { color: string; width: number }>[];
  expect([a.color, a.width]).toEqual([COLORS[0], 8 * SCALE]);
  expect([b.color, b.width]).toEqual(['#FFFFFF', 4 * SCALE]);
});

test('the text tool places a text box, and Enter commits it', async () => {
  await mount();
  swatch(1).click(); // yellow
  thick(0).click(); // 24 × scale
  toolBtn('text').click();
  click(400, 300);
  const input = root.querySelector<HTMLInputElement>('.ed-text')!;
  expect(input).toBeTruthy();
  // It sits on the click, in screen pixels, at the size it will be drawn.
  expect(input.style.left).toBe('300px');
  expect(input.style.top).toBe('200px');
  expect(parseFloat(input.style.fontSize)).toBeCloseTo((24 * SCALE) / 2);
  expect(input.style.color).not.toBe('');
  input.value = 'klik di sini';
  key('Enter', {}, input);
  expect(root.querySelector('.ed-text')).toBeNull();
  expect(await sent()).toEqual([{ id: 1, type: 'text', color: COLORS[1], size: 24 * SCALE, x: 400, y: 300, text: 'klik di sini' }]);
});

test('a click outside commits the text, and does not start another', async () => {
  await mount();
  toolBtn('text').click();
  click(400, 300);
  root.querySelector<HTMLInputElement>('.ed-text')!.value = 'satu';
  // The press on the picture lands first, as it does in the browser.
  mouse('pointerdown', px(900, 700));
  mouse('pointerup', px(900, 700));
  expect(root.querySelector('.ed-text')).toBeNull();
  expect(await sent()).toMatchObject([{ type: 'text', text: 'satu' }]);
  // The next click then does start one.
  click(900, 700);
  expect(root.querySelector('.ed-text')).toBeTruthy();
});

test('a press on a tool button commits the text too', async () => {
  await mount();
  toolBtn('text').click();
  click(400, 300);
  root.querySelector<HTMLInputElement>('.ed-text')!.value = 'dua';
  mouse('pointerdown', [5, 5], {}, toolBtn('rect'));
  toolBtn('rect').click();
  expect(await sent()).toMatchObject([{ text: 'dua' }]);
});

test('losing the focus commits the text', async () => {
  await mount();
  toolBtn('text').click();
  click(400, 300);
  const input = root.querySelector<HTMLInputElement>('.ed-text')!;
  input.value = 'tiga';
  input.blur();
  expect(await sent()).toMatchObject([{ text: 'tiga' }]);
});

test('Salin commits the text being typed', async () => {
  await mount();
  toolBtn('text').click();
  click(10, 10);
  root.querySelector<HTMLInputElement>('.ed-text')!.value = 'terakhir';
  button('Salin')!.click();
  await flush();
  const [, edits] = fake.bridge.commit.mock.calls[0];
  expect(parse(edits).shapes).toMatchObject([{ type: 'text', text: 'terakhir' }]);
});

test('an empty text box leaves nothing, and Escape drops it', async () => {
  await mount();
  toolBtn('text').click();
  click(10, 10);
  const first = root.querySelector<HTMLInputElement>('.ed-text')!;
  first.value = '   ';
  key('Enter', {}, first);
  click(10, 10);
  const input = root.querySelector<HTMLInputElement>('.ed-text')!;
  input.value = 'batal';
  // A browser blurs a focused input as it is removed, and a blur commits.
  input.remove = () => {
    input.dispatchEvent(new Event('blur'));
    HTMLElement.prototype.remove.call(input);
  };
  key('Escape', {}, input);
  expect(root.querySelector('.ed-text')).toBeNull();
  expect(await sent()).toEqual([]);
});

test('a text is picked and moved like the others', async () => {
  await mount();
  toolBtn('text').click();
  click(400, 300);
  const input = root.querySelector<HTMLInputElement>('.ed-text')!;
  input.value = 'abc';
  key('Enter', {}, input);
  toolBtn('select').click();
  drag([[410, 310], [510, 410]]);
  expect(await sent()).toMatchObject([{ type: 'text', x: 500, y: 400, size: 40 * SCALE }]);
});

test('edits survive a re-open: the saved doc comes back, and drawing continues from it', async () => {
  await mount();
  toolBtn('rect').click();
  drag([[10, 10], [200, 100]]);
  toolBtn('text').click();
  click(300, 300);
  const input = root.querySelector<HTMLInputElement>('.ed-text')!;
  input.value = 'Kopi — 咖啡';
  key('Enter', {}, input);
  const first = await sent();
  const edits = fake.bridge.commit.mock.calls[fake.bridge.commit.mock.calls.length - 1][1];
  expect(edits).toBe(serialize({ v: 1, shapes: first, style: { corner: 0, padding: 64, background: { kind: 'none' } } }));

  // A new window on the same screenshot, with the edits the core kept.
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
  fake = fakeBridge({ ...DOC, edits });
  await mount();
  expect(await sent()).toEqual(first);
  toolBtn('select').click();
  click(10, 50); // the rect from before can be picked
  key('Delete');
  expect(await sent()).toMatchObject([{ id: 2, type: 'text', text: 'Kopi — 咖啡' }]);
  toolBtn('line').click();
  drag([[0, 0], [100, 100]]);
  expect((await sent()).map(s => s.id)).toEqual([2, 3]); // ids go on from the highest
});

test('damaged edits open as an empty doc, and nothing drawn sends empty edits', async () => {
  fake = fakeBridge({ ...DOC, edits: '{not json' });
  await mount();
  button('Simpan')!.click();
  await flush();
  expect(fake.bridge.commit).toHaveBeenCalledWith(7, '', null, 'save');
});

test('the edits are committed with a close from outside as well', async () => {
  await mount();
  toolBtn('rect').click();
  drag([[0, 0], [100, 100]]);
  fake.emitClose();
  await flush();
  const [id, edits, png, action] = fake.bridge.commit.mock.calls[0];
  expect([id, png, action]).toEqual([7, null, 'keep']);
  expect(parse(edits).shapes).toHaveLength(1);
});

test('destroy drops a text box', async () => {
  const view = await mount();
  toolBtn('text').click();
  click(10, 10);
  expect(root.querySelector('.ed-text')).toBeTruthy();
  view.destroy();
  expect(root.querySelector('.ed-text')).toBeNull();
});
