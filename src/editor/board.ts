import { el } from '../shot/common';
import {
  COLORS,
  History,
  TEXT_SIZES,
  WIDTHS,
  addShape,
  bounds,
  constrain,
  handleAt,
  hitTest,
  isBlank,
  move,
  nextId,
  parse,
  removeShape,
  replaceShape,
  resize,
  scaleFor,
  serialize,
  setTextMeasure,
  textWidth,
  LINE_HEIGHT,
  type Doc,
  type Handle,
  type Shape,
  type Tool,
} from './model';
import { FONT_PROBE, drawSelection, drawShapes, measureText } from './render';

// What the board needs of the opened screenshot.
export interface BoardDoc {
  width: number;
  height: number;
  edits: string | null;
}

// A press, a drag and a release make one change to the history, so an undo
// takes back the whole stroke. While the pointer is down the change is only
// shown (`preview`).
type Gesture =
  | { kind: 'draw'; shape: Shape; x0: number; y0: number }
  | { kind: 'move'; orig: Shape; x0: number; y0: number }
  | { kind: 'resize'; orig: Shape; handle: Handle }
  | { kind: 'place'; x: number; y: number } // a click with the text tool; the box opens on release
  | { kind: 'none' };

const SLOP = 6; // screen pixels around a stroke that still count as a hit
const GRIP = 9; // screen pixels around a grip
const MIN_DRAG = 3; // screen pixels below which a drag is a mere click

export interface Board {
  readonly canvas: HTMLCanvasElement;
  readonly tool: Tool;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly selected: number | null;
  setTool(tool: Tool): void;
  setColor(index: number): void;
  setWidth(index: number): void;
  undo(): boolean;
  redo(): boolean;
  removeSelected(): boolean;
  deselect(): boolean;
  // The JSON for edits.json; '' when nothing is drawn. An open text box is
  // committed first.
  edits(): string;
  destroy(): void;
}

// The picture and what is drawn on it, in one canvas the size of the picture
// and shown shrunk by CSS. `onChange` tells the bars to catch up.
export function createBoard(doc: Document, stage: HTMLElement, d: BoardDoc, image: HTMLImageElement, onChange: () => void): Board {
  const history = new History(parse(d.edits));
  const scale = scaleFor(d.width, d.height);
  const canvas = el(doc, 'canvas', 'ed-canvas');
  canvas.width = d.width;
  canvas.height = d.height;
  canvas.dataset.tool = 'select';
  stage.append(canvas);
  const ctx = canvas.getContext('2d');

  let tool: Tool = 'select';
  let colorIndex = 0;
  let widthIndex = 1;
  let selected: number | null = null;
  let preview: Shape | null = null;
  let gesture: Gesture = { kind: 'none' };
  let textBox: { input: HTMLInputElement; x: number; y: number; size: number; color: string } | null = null;
  let swallow = false; // the press that committed a text box does nothing else

  // Image pixels per screen pixel, which is not 1 once the picture is fitted.
  const units = (): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [r.width > 0 ? canvas.width / r.width : 1, r.height > 0 ? canvas.height / r.height : 1];
  };
  const point = (e: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    const [kx, ky] = units();
    return [(e.clientX - r.left) * kx, (e.clientY - r.top) * ky];
  };

  const shown = (): Shape[] => {
    const shapes = history.doc.shapes;
    if (!preview) return shapes;
    return shapes.some(s => s.id === preview!.id) ? shapes.map(s => (s.id === preview!.id ? preview! : s)) : [...shapes, preview];
  };

  const redraw = () => {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (image.naturalWidth > 0) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const list = shown();
    drawShapes(ctx, list, image);
    const sel = selected === null ? undefined : list.find(s => s.id === selected);
    if (tool === 'select' && sel) drawSelection(ctx, sel, units()[0]);
  };

  const changed = () => {
    if (selected !== null && !history.doc.shapes.some(s => s.id === selected)) selected = null;
    redraw();
    onChange();
  };
  const apply = (next: Doc) => {
    history.apply(next);
    changed();
  };

  // ---- text ----------------------------------------------------------------

  const commitText = () => {
    const box = textBox;
    if (!box) return;
    textBox = null;
    const text = box.input.value;
    box.input.remove();
    if (!text.trim()) return;
    apply(addShape(history.doc, { id: nextId(history.doc.shapes), type: 'text', color: box.color, size: box.size, x: box.x, y: box.y, text }));
  };
  const cancelText = () => {
    const box = textBox;
    if (!box) return;
    textBox = null; // first: removing a focused input blurs it, and a blur commits
    box.input.remove();
  };

  const openText = (x: number, y: number) => {
    const size = TEXT_SIZES[widthIndex] * scale;
    const color = COLORS[colorIndex];
    const input = el(doc, 'input', 'ed-text');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    const r = canvas.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const [kx, ky] = units();
    // The box is the text's own line, so what is typed sits where it will be drawn.
    input.style.left = `${r.left - s.left + x / kx}px`;
    input.style.top = `${r.top - s.top + y / ky}px`;
    input.style.fontSize = `${size / kx}px`;
    input.style.height = `${(size * LINE_HEIGHT) / ky}px`;
    input.style.color = color;
    const fit = () => (input.style.width = `${Math.max(size, textWidth(input.value, size) + size / 2) / kx}px`);
    fit();
    input.addEventListener('input', fit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitText();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelText();
      }
    });
    input.addEventListener('blur', commitText);
    textBox = { input, x, y, size, color };
    stage.append(input);
    input.focus();
  };

  // A press anywhere but in the box commits it; a button does not take the
  // focus on a Mac, so the blur alone would miss a tool or a colour.
  const onPressAnywhere = (e: Event) => {
    if (!textBox || e.target === textBox.input) return;
    commitText();
    swallow = e.target === canvas;
  };
  doc.addEventListener('pointerdown', onPressAnywhere, true);

  // ---- pointer -------------------------------------------------------------

  const draft = (x: number, y: number): Shape | null => {
    const id = nextId(history.doc.shapes);
    const color = COLORS[colorIndex];
    const width = WIDTHS[widthIndex] * scale;
    switch (tool) {
      case 'pen':
        return { id, type: 'pen', color, width, points: [[x, y]] };
      case 'arrow':
      case 'rect':
      case 'ellipse':
      case 'line':
        return { id, type: tool, color, width, x1: x, y1: y, x2: x, y2: y };
      case 'sensor':
        return { id, type: 'sensor', x1: x, y1: y, x2: x, y2: y };
      default:
        return null;
    }
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (swallow) {
      swallow = false;
      return;
    }
    const [x, y] = point(e);
    const [kx] = units();
    if (tool === 'select') {
      const sel = selected === null ? undefined : history.doc.shapes.find(s => s.id === selected);
      const handle = sel ? handleAt(sel, x, y, GRIP * kx) : null;
      if (sel && handle) {
        gesture = { kind: 'resize', orig: sel, handle };
      } else {
        selected = hitTest(history.doc.shapes, x, y, SLOP * kx);
        const hit = history.doc.shapes.find(s => s.id === selected);
        gesture = hit ? { kind: 'move', orig: hit, x0: x, y0: y } : { kind: 'none' };
        redraw();
      }
    } else if (tool === 'text') {
      gesture = { kind: 'place', x, y };
    } else {
      const shape = draft(x, y);
      gesture = shape ? { kind: 'draw', shape, x0: x, y0: y } : { kind: 'none' };
      preview = shape;
      redraw();
    }
    if (gesture.kind !== 'none') canvas.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    const g = gesture;
    if (g.kind === 'none' || g.kind === 'place') return;
    const [x, y] = point(e);
    if (g.kind === 'draw') {
      const s = g.shape;
      if (s.type === 'pen') {
        const last = s.points[s.points.length - 1];
        if (last[0] === x && last[1] === y) return;
        preview = { ...s, points: [...s.points, [x, y]] };
        g.shape = preview;
      } else if (s.type !== 'text') {
        const [x2, y2] = e.shiftKey ? constrain(s.type, g.x0, g.y0, x, y) : [x, y];
        preview = { ...s, x2, y2 };
      }
    } else if (g.kind === 'move') {
      preview = move(g.orig, x - g.x0, y - g.y0);
    } else {
      preview = resize(g.orig, g.handle, x, y);
    }
    redraw();
  };

  // A bare click with a box tool leaves no speck behind; a pen click is a dot.
  const worthKeeping = (s: Shape): boolean => {
    if (s.type === 'pen') return true;
    const [kx, ky] = units();
    const b = bounds(s);
    return s.type === 'text' || b.w >= MIN_DRAG * kx || b.h >= MIN_DRAG * ky;
  };

  const onUp = () => {
    const g = gesture;
    gesture = { kind: 'none' };
    const made = preview;
    preview = null;
    if (g.kind === 'none') return;
    if (g.kind === 'place') {
      openText(g.x, g.y);
      return;
    }
    if (g.kind === 'draw') {
      if (made && worthKeeping(made)) apply(addShape(history.doc, made));
      else redraw();
    } else if (made && JSON.stringify(made) !== JSON.stringify(g.orig)) {
      apply(replaceShape(history.doc, made));
    } else {
      redraw();
    }
  };

  const onCancel = () => {
    gesture = { kind: 'none' };
    preview = null;
    redraw();
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  // ---- the font ------------------------------------------------------------

  if (ctx) setTextMeasure((text, size) => measureText(ctx, text, size));
  // Canvas text cannot use a font the page has not loaded yet.
  doc.fonts?.load(FONT_PROBE).then(redraw, () => {});
  image.addEventListener('load', redraw);

  return {
    canvas,
    get tool() {
      return tool;
    },
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    get selected() {
      return selected;
    },
    setTool(next) {
      commitText();
      tool = next;
      canvas.dataset.tool = next;
      if (next !== 'select') selected = null;
      redraw();
    },
    setColor(i) {
      colorIndex = i;
    },
    setWidth(i) {
      widthIndex = i;
    },
    undo() {
      commitText();
      const ok = history.undo();
      if (ok) changed();
      return ok;
    },
    redo() {
      commitText();
      const ok = history.redo();
      if (ok) changed();
      return ok;
    },
    removeSelected() {
      if (selected === null) return false;
      apply(removeShape(history.doc, selected));
      return true;
    },
    deselect() {
      if (selected === null) return false;
      selected = null;
      redraw();
      return true;
    },
    edits() {
      commitText();
      return isBlank(history.doc) ? '' : serialize(history.doc);
    },
    destroy() {
      doc.removeEventListener('pointerdown', onPressAnywhere, true);
      cancelText();
      setTextMeasure(null);
    },
  };
}
