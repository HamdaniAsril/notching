// The editor's document and the maths on it, with no DOM: shapes in image
// pixels, undo and redo, hit tests, move and resize, and the JSON that is kept
// next to the screenshot as edits.json (design 1 Nov §7).

export type Tool = 'select' | 'pen' | 'arrow' | 'rect' | 'ellipse' | 'line' | 'text' | 'sensor';
export const TOOLS: Tool[] = ['select', 'pen', 'arrow', 'rect', 'ellipse', 'line', 'text', 'sensor'];
export const TOOL_KEYS: Record<string, Tool> = { v: 'select', p: 'pen', a: 'arrow', r: 'rect', o: 'ellipse', l: 'line', t: 'text', s: 'sensor' };

export const COLORS = ['#E8262E', '#F5B700', '#27AE60', '#2F80ED', '#111111', '#FFFFFF'];
export const WIDTHS = [4, 8, 14];
export const TEXT_SIZES = [24, 40, 64]; // × scale; the same three buttons as WIDTHS

// A 1500 px screenshot is drawn at the sizes above; a bigger one scales them,
// so a mark is as big on the screen however sharp the picture is.
export function scaleFor(w: number, h: number): number {
  return Math.max(1, Math.max(w, h) / 1500);
}

export type LineType = 'arrow' | 'rect' | 'ellipse' | 'line';
export type Shape =
  | { id: number; type: 'pen'; color: string; width: number; points: [number, number][] }
  | { id: number; type: LineType; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { id: number; type: 'text'; color: string; size: number; x: number; y: number; text: string }
  | { id: number; type: 'sensor'; x1: number; y1: number; x2: number; y2: number };

// Task 9 adds the background kinds and the controls.
export interface Style {
  corner: number;
  padding: number;
  background: { kind: 'none' };
}

export interface Doc {
  v: 1;
  shapes: Shape[];
  style: Style;
}

export function emptyDoc(): Doc {
  return { v: 1, shapes: [], style: { corner: 0, padding: 64, background: { kind: 'none' } } };
}

export const nextId = (shapes: Shape[]): number => shapes.reduce((m, s) => Math.max(m, s.id), 0) + 1;

// Edits are immutable: a change is a new Doc.
export const withShapes = (doc: Doc, shapes: Shape[]): Doc => ({ ...doc, shapes });
export const addShape = (doc: Doc, shape: Shape): Doc => withShapes(doc, [...doc.shapes, shape]);
export const replaceShape = (doc: Doc, shape: Shape): Doc =>
  withShapes(doc, doc.shapes.map(s => (s.id === shape.id ? shape : s)));
export const removeShape = (doc: Doc, id: number): Doc => withShapes(doc, doc.shapes.filter(s => s.id !== id));

export class History {
  private now: Doc;
  private past: Doc[] = [];
  private future: Doc[] = [];

  constructor(doc: Doc) {
    this.now = doc;
  }

  get doc(): Doc {
    return this.now;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  apply(next: Doc): void {
    this.past.push(this.now);
    this.now = next;
    this.future = [];
  }

  undo(): boolean {
    const prev = this.past.pop();
    if (!prev) return false;
    this.future.push(this.now);
    this.now = prev;
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.now);
    this.now = next;
    return true;
  }
}

// ---- text size -------------------------------------------------------------

// A text box is one line, LINE_HEIGHT × the size tall. Its width is measured by
// the page once the font is there (setTextMeasure); until then, and in tests,
// it is a guess of the average letter.
export const LINE_HEIGHT = 1.2;
type Measure = (text: string, size: number) => number;
let measure: Measure | null = null;

export function setTextMeasure(fn: Measure | null): void {
  measure = fn;
}

export const textWidth = (text: string, size: number): number =>
  measure ? measure(text, size) : text.length * size * 0.56;

// ---- geometry --------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function bounds(s: Shape): Box {
  if (s.type === 'pen') {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const [x, y] of s.points) {
      l = Math.min(l, x);
      t = Math.min(t, y);
      r = Math.max(r, x);
      b = Math.max(b, y);
    }
    if (!s.points.length) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: l, y: t, w: r - l, h: b - t };
  }
  if (s.type === 'text') return { x: s.x, y: s.y, w: textWidth(s.text, s.size), h: s.size * LINE_HEIGHT };
  return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function rectOutlineDistance(px: number, py: number, b: Box): number {
  const outside = Math.hypot(Math.max(b.x - px, 0, px - (b.x + b.w)), Math.max(b.y - py, 0, py - (b.y + b.h)));
  if (outside > 0) return outside;
  return Math.min(px - b.x, b.x + b.w - px, py - b.y, b.y + b.h - py);
}

// First-order distance to an ellipse's outline: |f - 1| / |grad f|.
function ellipseOutlineDistance(px: number, py: number, b: Box): number {
  const a = Math.max(b.w / 2, 0.5);
  const c = Math.max(b.h / 2, 0.5);
  const dx = px - (b.x + b.w / 2);
  const dy = py - (b.y + b.h / 2);
  const f = Math.hypot(dx / a, dy / c);
  if (f === 0) return Math.min(a, c);
  return Math.abs(f - 1) / (Math.hypot(dx / (a * a), dy / (c * c)) / f);
}

function hits(s: Shape, x: number, y: number, slop: number): boolean {
  switch (s.type) {
    case 'pen': {
      const reach = s.width / 2 + slop;
      if (s.points.length === 1) return Math.hypot(x - s.points[0][0], y - s.points[0][1]) <= reach;
      for (let i = 1; i < s.points.length; i++) {
        const [ax, ay] = s.points[i - 1];
        const [bx, by] = s.points[i];
        if (segmentDistance(x, y, ax, ay, bx, by) <= reach) return true;
      }
      return false;
    }
    case 'line':
    case 'arrow':
      return segmentDistance(x, y, s.x1, s.y1, s.x2, s.y2) <= s.width / 2 + slop;
    case 'rect':
      return rectOutlineDistance(x, y, bounds(s)) <= s.width / 2 + slop;
    case 'ellipse':
      return ellipseOutlineDistance(x, y, bounds(s)) <= s.width / 2 + slop;
    case 'text':
    case 'sensor': {
      // A filled thing: anywhere inside it, a little outside too.
      const b = bounds(s);
      return x >= b.x - slop && x <= b.x + b.w + slop && y >= b.y - slop && y <= b.y + b.h + slop;
    }
  }
}

// The top-most shape under the point: the last one drawn. A frame is hit on its
// outline, so what lies inside it can still be picked.
export function hitTest(shapes: Shape[], x: number, y: number, slop: number): number | null {
  for (let i = shapes.length - 1; i >= 0; i--) if (hits(shapes[i], x, y, slop)) return shapes[i].id;
  return null;
}

export function move(s: Shape, dx: number, dy: number): Shape {
  switch (s.type) {
    case 'pen':
      return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    case 'text':
      return { ...s, x: s.x + dx, y: s.y + dy };
    default:
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  }
}

export type Handle = 'nw' | 'ne' | 'sw' | 'se';

// Where an axis goes when one edge is dragged: the edge `moved` of the old
// range [o0, o1] goes to `to`, the other stays. Returns the map for a coordinate.
// A range of no size cannot be stretched, so it slides to `to` instead.
function stretch(o0: number, o1: number, movesLow: boolean, to: number): (v: number) => number {
  if (o1 === o0) return v => v + (to - o0);
  const n0 = movesLow ? to : o0;
  const n1 = movesLow ? o1 : to;
  return v => n0 + ((v - o0) / (o1 - o0)) * (n1 - n0);
}

// Drag a corner of the shape's box to (x, y); the opposite corner stays. The
// shape keeps its type, colour and the direction of its endpoints. A text keeps
// its proportions: the size follows the height.
export function resize(s: Shape, handle: Handle, x: number, y: number): Shape {
  const b = bounds(s);
  const west = handle === 'nw' || handle === 'sw';
  const north = handle === 'nw' || handle === 'ne';
  if (s.type === 'text') {
    const anchorX = west ? b.x + b.w : b.x;
    const anchorY = north ? b.y + b.h : b.y;
    const size = Math.max(8, Math.abs(y - anchorY) / LINE_HEIGHT);
    const w = textWidth(s.text, size);
    return { ...s, size, x: west ? anchorX - w : anchorX, y: north ? anchorY - size * LINE_HEIGHT : anchorY };
  }
  if (s.type === 'line' || s.type === 'arrow') {
    // The grip is an end: that end goes to the pointer, the other stays. This
    // is what lets a flat line be tilted, which a box map could not do.
    const at = handles(s).findIndex(h => h.handle === handle);
    if (at === 0) return { ...s, x1: x, y1: y };
    if (at === 1) return { ...s, x2: x, y2: y };
  }
  const mx = stretch(b.x, b.x + b.w, west, x);
  const my = stretch(b.y, b.y + b.h, north, y);
  if (s.type === 'pen') return { ...s, points: s.points.map(([px, py]) => [mx(px), my(py)] as [number, number]) };
  // A frame or sensor with no width or height gets one: its second corner goes
  // to the pointer on that axis.
  const flatX = b.w === 0;
  const flatY = b.h === 0;
  return {
    ...s,
    x1: flatX ? s.x1 : mx(s.x1),
    y1: flatY ? s.y1 : my(s.y1),
    x2: flatX ? x : mx(s.x2),
    y2: flatY ? y : my(s.y2),
  };
}

export interface HandlePoint {
  handle: Handle;
  x: number;
  y: number;
}

// The grips of a selected shape: the four corners of its box, but only the two
// ends of an arrow or a line.
export function handles(s: Shape): HandlePoint[] {
  const b = bounds(s);
  const all: HandlePoint[] = [
    { handle: 'nw', x: b.x, y: b.y },
    { handle: 'ne', x: b.x + b.w, y: b.y },
    { handle: 'sw', x: b.x, y: b.y + b.h },
    { handle: 'se', x: b.x + b.w, y: b.y + b.h },
  ];
  if (s.type !== 'arrow' && s.type !== 'line') return all;
  const ends: [number, number][] = [[s.x1, s.y1], [s.x2, s.y2]];
  return ends.map(([ex, ey]) => {
    const h = all.find(p => (p.x === ex || b.w === 0) && (p.y === ey || b.h === 0)) ?? all[0];
    return { handle: h.handle, x: ex, y: ey };
  });
}

export function handleAt(s: Shape, x: number, y: number, radius: number): Handle | null {
  for (const p of handles(s)) if (Math.hypot(x - p.x, y - p.y) <= radius) return p.handle;
  return null;
}

// Shift: a line goes to the nearest 45°; a frame gets equal sides. Returns the
// second corner to use.
export function constrain(type: Tool, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (type === 'line' || type === 'arrow') {
    const len = Math.hypot(dx, dy);
    const step = Math.PI / 4;
    const a = Math.round(Math.atan2(dy, dx) / step) * step;
    return [x1 + len * Math.cos(a), y1 + len * Math.sin(a)];
  }
  if (type === 'rect' || type === 'ellipse') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return [x1 + (dx < 0 ? -side : side), y1 + (dy < 0 ? -side : side)];
  }
  return [x2, y2];
}

// ---- edits.json ------------------------------------------------------------

export const serialize = (doc: Doc): string => JSON.stringify(doc);

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';

function shapeOf(raw: unknown): Shape | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!num(r.id)) return null;
  const id = r.id;
  switch (r.type) {
    case 'pen': {
      if (!str(r.color) || !num(r.width) || !Array.isArray(r.points)) return null;
      const points = r.points.filter((p): p is [number, number] => Array.isArray(p) && num(p[0]) && num(p[1]));
      if (!points.length) return null;
      return { id, type: 'pen', color: r.color, width: r.width, points: points.map(([x, y]) => [x, y]) };
    }
    case 'arrow':
    case 'rect':
    case 'ellipse':
    case 'line':
      if (!str(r.color) || !num(r.width) || !num(r.x1) || !num(r.y1) || !num(r.x2) || !num(r.y2)) return null;
      return { id, type: r.type, color: r.color, width: r.width, x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };
    case 'text':
      if (!str(r.color) || !num(r.size) || !num(r.x) || !num(r.y) || !str(r.text)) return null;
      return { id, type: 'text', color: r.color, size: r.size, x: r.x, y: r.y, text: r.text };
    case 'sensor':
      if (!num(r.x1) || !num(r.y1) || !num(r.x2) || !num(r.y2)) return null;
      return { id, type: 'sensor', x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };
    default:
      return null;
  }
}

// Anything that is not our JSON is an empty doc, and a shape that is not whole
// is left out, so an old or damaged edits.json can still be opened.
export function parse(s: string | null): Doc {
  const doc = emptyDoc();
  if (!s) return doc;
  let raw: unknown;
  try {
    raw = JSON.parse(s);
  } catch {
    return doc;
  }
  if (typeof raw !== 'object' || raw === null) return doc;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return doc;
  if (Array.isArray(r.shapes)) {
    doc.shapes = r.shapes.map(shapeOf).filter((x): x is Shape => x !== null);
  }
  const st = r.style as Record<string, unknown> | undefined;
  if (st && typeof st === 'object') {
    if (num(st.corner) && st.corner >= 0) doc.style.corner = st.corner;
    if (num(st.padding) && st.padding >= 0) doc.style.padding = st.padding;
  }
  return doc;
}

export function isBlank(doc: Doc): boolean {
  return doc.shapes.length === 0 && doc.style.background.kind === 'none' && doc.style.corner === 0;
}
