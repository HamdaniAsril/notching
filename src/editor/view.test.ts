// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Shot } from '../bridge';
import type { Lang } from '../kit/protocol';
import { fileJpeg, wallpaperJpeg } from './background';
import { COLORS, GRADIENTS, SOLIDS, WIDTHS, parse, scaleFor, serialize, type Shape } from './model';
import { mountEditor, type EditorAction, type EditorBridge, type EditorDoc } from './view';

// A picture from a file or the wallpaper cannot load or be read back in jsdom.
vi.mock('./background', () => ({
  loadImage: vi.fn(async () => ({ width: 800, height: 600, naturalWidth: 800, naturalHeight: 600 })),
  wallpaperJpeg: vi.fn(async () => 'data:image/jpeg;base64,WALL'),
  fileJpeg: vi.fn(async () => 'data:image/jpeg;base64,FILE'),
}));

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
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === 'measureText') return (t: string) => ({ width: t.length * 10 });
        if (name === 'createLinearGradient') return () => ({ addColorStop() {} });
        return () => {};
      },
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(new Blob(['png'], { type: 'image/png' })));
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
  expect([id, action]).toEqual([7, 'keep']);
  expect(png).toBeInstanceOf(Blob); // the marks are in the picture too
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

test('a Shift-drawn flat arrow can be tilted by dragging its end grip', async () => {
  await mount();
  toolBtn('arrow').click();
  drag([[100, 300], [500, 330]], { shiftKey: true }); // snapped flat
  toolBtn('select').click();
  click(300, 300); // on the shaft
  drag([[500, 300], [500, 500]]); // the tip's grip, straight down
  expect(await sent()).toMatchObject([{ type: 'arrow', x1: 100, y1: 300, x2: 500, y2: 500 }]);
});

// ---- corners, background and export ------------------------------------------

const undoBtn = () => root.querySelector<HTMLButtonElement>('[aria-label="Urungkan"]')!;
const redoBtn = () => root.querySelector<HTMLButtonElement>('[aria-label="Ulangi"]')!;
const pop = () => root.querySelector<HTMLElement>('.ed-pop')!;
const openPop = () => button('Background')!.click();
const cornerRange = () => root.querySelector<HTMLInputElement>('.ed-bar .ed-corner-range')!;
const paddingRange = () => pop().querySelector<HTMLInputElement>('input[data-padding]')!;
const solid = (color: string) => pop().querySelector<HTMLButtonElement>(`[data-solid="${color}"]`)!;
const grad = (i: number) => pop().querySelector<HTMLButtonElement>(`[data-gradient="${i}"]`)!;
const custom = (which: string) => pop().querySelector<HTMLInputElement>(`input[data-custom="${which}"]`)!;
const fire = (node: Element, type: string) => node.dispatchEvent(new Event(type, { bubbles: true }));
const setRange = (input: HTMLInputElement, value: number, live = true) => {
  input.value = String(value);
  if (live) fire(input, 'input');
};
// What Salin hands to the core.
async function salin() {
  button('Salin')!.click();
  await flush();
  const calls = fake.bridge.commit.mock.calls;
  const [, edits, png] = calls[calls.length - 1];
  return { edits: edits as string, png: png as Blob | null, doc: parse(edits as string) };
}

test('the Sudut slider is in the bottom bar, from 0 to 40, with its number', async () => {
  await mount();
  const bar = root.querySelector('.ed-bar')!;
  expect(bar.querySelector('.ed-corner')!.textContent).toContain('Sudut');
  expect(cornerRange()).toBeTruthy();
  expect([cornerRange().min, cornerRange().max, cornerRange().value]).toEqual(['0', '40', '0']);
  expect(bar.querySelector('.ed-cval')!.textContent).toBe('0');
  expect(button('Background')).toBeTruthy();
  expect(bar.contains(button('Background')!)).toBe(true);
  // The bar still has no style attribute.
  expect(root.querySelector('[style]')).toBeNull();
});

test('the Background popover lists 5 solids and a wheel, 5 gradients and a pair, Pilih file… and Jarak', async () => {
  await mount();
  expect(pop().hidden).toBe(true);
  openPop();
  expect(pop().hidden).toBe(false);
  expect(button('Background')!.getAttribute('aria-expanded')).toBe('true');
  expect([...pop().querySelectorAll<HTMLElement>('[data-solid]')].map(b => b.dataset.solid)).toEqual(SOLIDS);
  expect(pop().querySelectorAll('[data-none]')).toHaveLength(1);
  expect(pop().querySelectorAll('[data-gradient]')).toHaveLength(5);
  expect(custom('solid').type).toBe('color');
  expect(custom('from').type).toBe('color');
  expect(custom('to').type).toBe('color');
  expect(pop().querySelectorAll('input[type="color"]')).toHaveLength(3);
  const file = pop().querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(file.accept).toBe('image/*');
  expect(button('Pilih file…')).toBeTruthy();
  const heads = [...pop().querySelectorAll('.ed-plab')].map(h => h.textContent);
  expect(heads).toEqual(['Warna solid', 'Gradient', 'Gambar', 'Jarak']);
  expect([paddingRange().min, paddingRange().max, paddingRange().value]).toEqual(['16', '160', '64']);
  // Everything it draws comes from the stylesheet.
  expect(root.querySelector('[style]')).toBeNull();
  // The button closes it again.
  openPop();
  expect(pop().hidden).toBe(true);
});

test('English names in the popover', async () => {
  await mount('en');
  expect([...pop().querySelectorAll('.ed-plab')].map(h => h.textContent)).toEqual(['Solid color', 'Gradient', 'Image', 'Spacing']);
  expect(button('Choose file…')).toBeTruthy();
  expect(root.querySelector('.ed-corner')!.textContent).toContain('Corners');
});

test('Wallpaper Mac is hidden without a wallpaper and shown with one', async () => {
  await mount();
  expect(button('Wallpaper Mac')).toBeUndefined();
  root.replaceChildren();
  fake = fakeBridge({ ...DOC, wallpaper: 'notchshot://localhost/wallpaper' });
  await mount();
  expect(button('Wallpaper Mac')).toBeTruthy();
});

test('choosing a solid goes through the history: undo takes it back, redo brings it again', async () => {
  await mount();
  openPop();
  expect(undoBtn().disabled).toBe(true);
  solid('#E8262E').click();
  expect(undoBtn().disabled).toBe(false);
  expect(solid('#E8262E').classList.contains('ed-sel')).toBe(true);
  // The canvas is the output: the picture plus 64 × the scale on every side.
  const pad = Math.round(64 * scaleFor(DOC.width, DOC.height));
  expect([canvas().width, canvas().height]).toEqual([DOC.width + 2 * pad, DOC.height + 2 * pad]);

  undoBtn().click();
  expect(solid('#E8262E').classList.contains('ed-sel')).toBe(false);
  expect(pop().querySelector('[data-none]')!.classList.contains('ed-sel')).toBe(true);
  expect([canvas().width, canvas().height]).toEqual([DOC.width, DOC.height]);
  expect(redoBtn().disabled).toBe(false);
  redoBtn().click();
  expect(solid('#E8262E').classList.contains('ed-sel')).toBe(true);

  const out = await salin();
  expect(out.doc.style.background).toEqual({ kind: 'solid', color: '#E8262E' });
  expect(out.png).toBeInstanceOf(Blob);
});

test('with the background undone the doc is blank again: no picture, empty edits', async () => {
  await mount();
  solid('#111111').click();
  undoBtn().click();
  const out = await salin();
  expect(out.png).toBeNull();
  expect(out.edits).toBe('');
});

test('Tanpa background takes a background away, one step', async () => {
  await mount();
  solid('#FFFFFF').click();
  pop().querySelector<HTMLElement>('[data-none]')!.click();
  expect([canvas().width, canvas().height]).toEqual([DOC.width, DOC.height]);
  undoBtn().click();
  expect(solid('#FFFFFF').classList.contains('ed-sel')).toBe(true);
});

test('a gradient preset and the custom pair', async () => {
  await mount();
  grad(1).click();
  expect(grad(1).classList.contains('ed-sel')).toBe(true);
  // The pair starts from the gradient that is on.
  expect([custom('from').value, custom('to').value]).toEqual(GRADIENTS[1].map(c => c.toLowerCase()));
  custom('from').value = '#ff0000';
  fire(custom('from'), 'input');
  fire(custom('from'), 'change');
  custom('to').value = '#0000ff';
  fire(custom('to'), 'change');
  expect(grad(1).classList.contains('ed-sel')).toBe(false);
  const out = await salin();
  expect(out.doc.style.background).toEqual({ kind: 'gradient', from: '#ff0000', to: '#0000ff' });
});

test('the custom colour wheel gives a solid; its live moves are one history step', async () => {
  await mount();
  const wheel = custom('solid');
  for (const c of ['#112233', '#223344', '#334455']) {
    wheel.value = c;
    fire(wheel, 'input');
  }
  // Shown at once, in the history only at the end.
  expect(undoBtn().disabled).toBe(true);
  fire(wheel, 'change');
  expect(undoBtn().disabled).toBe(false);
  undoBtn().click();
  expect(undoBtn().disabled).toBe(true);
  expect((await salin()).edits).toBe('');
});

test('a Sudut drag is one history step, on change and not on every input', async () => {
  await mount();
  for (const v of [3, 8, 12, 20]) setRange(cornerRange(), v);
  expect(root.querySelector('.ed-cval')!.textContent).toBe('20');
  expect(undoBtn().disabled).toBe(true);
  fire(cornerRange(), 'change');
  expect(undoBtn().disabled).toBe(false);
  undoBtn().click();
  expect(undoBtn().disabled).toBe(true);
  expect(cornerRange().value).toBe('0');
  expect(root.querySelector('.ed-cval')!.textContent).toBe('0');
  redoBtn().click();
  expect(cornerRange().value).toBe('20');
});

test('a Sudut drag back to where it began leaves no step', async () => {
  await mount();
  setRange(cornerRange(), 15);
  setRange(cornerRange(), 0);
  fire(cornerRange(), 'change');
  expect(undoBtn().disabled).toBe(true);
});

test('Sudut alone exports at the picture size, and Salin sends the PNG with the corner in the edits', async () => {
  await mount();
  setRange(cornerRange(), 12, false);
  fire(cornerRange(), 'change');
  expect([canvas().width, canvas().height]).toEqual([DOC.width, DOC.height]);
  const out = await salin();
  expect(out.doc.style).toMatchObject({ corner: 12, background: { kind: 'none' } });
  expect(out.png).toBeInstanceOf(Blob);
});

test('Jarak goes through the history too, and shows in the canvas', async () => {
  await mount();
  solid('#FFFFFF').click();
  const k = scaleFor(DOC.width, DOC.height);
  setRange(paddingRange(), 100);
  expect(canvas().width).toBe(DOC.width + 2 * Math.round(100 * k)); // live
  fire(paddingRange(), 'change');
  undoBtn().click(); // the padding
  expect(paddingRange().value).toBe('64');
  expect(canvas().width).toBe(DOC.width + 2 * Math.round(64 * k));
  undoBtn().click(); // the background
  expect(canvas().width).toBe(DOC.width);
});

test('a drag whose change never comes is still kept by Salin', async () => {
  await mount();
  setRange(cornerRange(), 18);
  const out = await salin();
  expect(out.doc.style.corner).toBe(18);
  expect(out.png).toBeInstanceOf(Blob);
});

test('Cmd+Z while a drag is on takes the drag back, not an older step', async () => {
  await mount();
  solid('#FFFFFF').click();
  setRange(cornerRange(), 9);
  key('z', { metaKey: true });
  expect(cornerRange().value).toBe('0');
  expect(solid('#FFFFFF').classList.contains('ed-sel')).toBe(true);
});

test('Pilih file… reads the file, shrinks it to twice the output, and sets it as the background', async () => {
  await mount();
  const input = pop().querySelector<HTMLInputElement>('input[type="file"]')!;
  const click = vi.spyOn(input, 'click').mockImplementation(() => {});
  button('Pilih file…')!.click();
  expect(click).toHaveBeenCalled();
  const file = new File(['x'], 'pic.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fire(input, 'change');
  await flush();
  // 64 px padding × 1.96 is 125 on each side: 3190 wide, so at most 6380.
  expect(fileJpeg).toHaveBeenCalledWith(file, 6380);
  expect(button('Pilih file…')!.classList.contains('ed-sel')).toBe(true);
  undoBtn().click();
  expect(button('Pilih file…')!.classList.contains('ed-sel')).toBe(false);
  redoBtn().click();
  const out = await salin();
  expect(out.doc.style.background).toEqual({ kind: 'image', src: 'data:image/jpeg;base64,FILE', from: 'file' });
});

test('Wallpaper Mac loads the wallpaper into the doc, so a re-open does not need it', async () => {
  fake = fakeBridge({ ...DOC, wallpaper: 'notchshot://localhost/wallpaper' });
  await mount();
  button('Wallpaper Mac')!.click();
  await flush();
  expect(wallpaperJpeg).toHaveBeenCalledWith('notchshot://localhost/wallpaper', 6380);
  const out = await salin();
  expect(out.doc.style.background).toEqual({ kind: 'image', src: 'data:image/jpeg;base64,WALL', from: 'wallpaper' });
  // The doc alone opens again, with no wallpaper to ask for.
  fake = fakeBridge({ ...DOC, wallpaper: null, edits: out.edits });
  root.replaceChildren();
  await mount();
  expect(button('Wallpaper Mac')).toBeUndefined();
  expect(button('Pilih file…')).toBeTruthy();
  expect((await salin()).png).toBeInstanceOf(Blob);
});

test('a picture that cannot be read changes nothing', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(fileJpeg).mockRejectedValueOnce(new Error('not a picture'));
  await mount();
  const input = pop().querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.txt')], configurable: true });
  fire(input, 'change');
  await flush();
  expect(undoBtn().disabled).toBe(true);
  expect(error).toHaveBeenCalledWith('notching: background picture not used', expect.any(Error));
  error.mockRestore();
});

test('a press in the padding draws nothing', async () => {
  await mount();
  solid('#FFFFFF').click();
  // The canvas is wider than the picture now; the mock rect still shows it
  // 1470 wide, so one screen pixel is more than 2 canvas pixels.
  mouse('pointerdown', [101, 51]);
  mouse('pointerup', [101, 51]);
  expect(parse((await salin()).edits).shapes).toHaveLength(0);
});

test('a press on the picture draws at the picture\'s own pixels, not the canvas\'s', async () => {
  await mount();
  solid('#FFFFFF').click();
  const pad = Math.round(64 * scaleFor(DOC.width, DOC.height));
  const kx = (DOC.width + 2 * pad) / SHOWN.width;
  const ky = (DOC.height + 2 * pad) / SHOWN.height;
  toolBtn('rect').click();
  // From canvas pixel (pad + 100, pad + 100) to (pad + 300, pad + 300).
  const at = (c: number): [number, number] => [SHOWN.left + (pad + c) / kx, SHOWN.top + (pad + c) / ky];
  mouse('pointerdown', at(100));
  mouse('pointermove', at(300));
  mouse('pointerup', at(300));
  const shape = parse((await salin()).edits).shapes[0] as Shape & { x1: number; y2: number };
  expect(shape.x1).toBeCloseTo(100);
  expect(shape.y2).toBeCloseTo(300);
});

test('Escape puts the Background box away before it takes a selection away', async () => {
  await mount();
  openPop();
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  expect(pop().hidden).toBe(true);
  expect(fake.bridge.close).not.toHaveBeenCalled();
});

test('a press outside the box puts it away, a press inside does not', async () => {
  await mount();
  openPop();
  solid('#F5B700').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(pop().hidden).toBe(false);
  mouse('pointerdown', [200, 200]);
  expect(pop().hidden).toBe(true);
});

test('Cmd+Z works with a slider focused', async () => {
  await mount();
  setRange(cornerRange(), 10, false);
  fire(cornerRange(), 'change');
  cornerRange().focus();
  key('z', { metaKey: true }, cornerRange());
  expect(cornerRange().value).toBe('0');
});

test('when the picture cannot be made, Salin does not claim a copy, and a close still keeps the edits', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(HTMLCanvasElement.prototype.toBlob as ReturnType<typeof vi.fn>).mockImplementation(cb => cb(null));
  await mount();
  solid('#FFFFFF').click();
  button('Salin')!.click();
  await flush();
  expect(fake.bridge.commit).not.toHaveBeenCalled();
  expect(fake.bridge.close).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith('notching: the picture was not exported', expect.any(Error));
  error.mockRestore();
});

test('a close request with no picture to give still keeps the edits', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(HTMLCanvasElement.prototype.toBlob as ReturnType<typeof vi.fn>).mockImplementation(cb => cb(null));
  await mount();
  solid('#FFFFFF').click();
  fake.emitClose();
  await flush();
  const [id, edits, png, action] = fake.bridge.commit.mock.calls[0];
  expect([id, png, action]).toEqual([7, null, 'keep']);
  expect(parse(edits).style.background).toEqual({ kind: 'solid', color: '#FFFFFF' });
  error.mockRestore();
});

test('a failed Simpan with no picture says so', async () => {
  vi.useFakeTimers();
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(HTMLCanvasElement.prototype.toBlob as ReturnType<typeof vi.fn>).mockImplementation(cb => cb(null));
  await mount();
  solid('#FFFFFF').click();
  button('Simpan')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(button('Gagal menyimpan')).toBeTruthy();
  expect(fake.bridge.commit).not.toHaveBeenCalled();
  error.mockRestore();
});

test('a doc saved with a background opens with it, and its controls show it', async () => {
  const saved = serialize({ v: 1, shapes: [], style: { corner: 20, padding: 120, background: { kind: 'solid', color: '#2F80ED' } } });
  fake = fakeBridge({ ...DOC, edits: saved });
  await mount();
  expect(cornerRange().value).toBe('20');
  expect(paddingRange().value).toBe('120');
  expect(solid('#2F80ED').classList.contains('ed-sel')).toBe(true);
  const k = scaleFor(DOC.width, DOC.height);
  expect(canvas().width).toBe(DOC.width + 2 * Math.round(120 * k));
  expect(undoBtn().disabled).toBe(true);
});
