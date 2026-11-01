import { afterEach, expect, test } from 'vitest';
import {
  History,
  addShape,
  bounds,
  constrain,
  emptyDoc,
  handleAt,
  handles,
  hitTest,
  isBlank,
  move,
  nextId,
  parse,
  removeShape,
  replaceShape,
  resize,
  GRADIENTS,
  SOLIDS,
  scaleFor,
  serialize,
  setTextMeasure,
  withStyle,
  type Doc,
  type Shape,
} from './model';

const rect = (id: number, x1: number, y1: number, x2: number, y2: number): Shape => ({ id, type: 'rect', color: '#E8262E', width: 8, x1, y1, x2, y2 });
const pen = (id: number, points: [number, number][]): Shape => ({ id, type: 'pen', color: '#2F80ED', width: 8, points });
const text = (id: number, x: number, y: number, t = 'halo'): Shape => ({ id, type: 'text', color: '#111111', size: 40, x, y, text: t });
const sensor = (id: number, x1: number, y1: number, x2: number, y2: number): Shape => ({ id, type: 'sensor', x1, y1, x2, y2 });

afterEach(() => setTextMeasure(null));

test('undo and redo walk the history and a new apply clears redo', () => {
  const a = emptyDoc();
  const b = addShape(a, rect(1, 0, 0, 10, 10));
  const c = addShape(b, rect(2, 0, 0, 20, 20));
  const h = new History(a);
  expect([h.canUndo, h.canRedo]).toEqual([false, false]);
  expect(h.undo()).toBe(false);
  expect(h.redo()).toBe(false);
  h.apply(b);
  h.apply(c);
  expect(h.doc).toBe(c);
  expect(h.canUndo).toBe(true);
  expect(h.undo()).toBe(true);
  expect(h.doc).toBe(b);
  expect(h.canRedo).toBe(true);
  expect(h.undo()).toBe(true);
  expect(h.doc).toBe(a);
  expect(h.undo()).toBe(false);
  expect(h.redo()).toBe(true);
  expect(h.doc).toBe(b);
  // A new edit after an undo drops what could have been redone.
  const d = addShape(b, text(3, 5, 5));
  h.apply(d);
  expect(h.canRedo).toBe(false);
  expect(h.redo()).toBe(false);
  expect(h.doc).toBe(d);
  expect(h.undo()).toBe(true);
  expect(h.doc).toBe(b);
});

test('add, replace and remove build new docs and leave the old one alone', () => {
  const a = addShape(emptyDoc(), rect(1, 0, 0, 10, 10));
  const b = replaceShape(a, rect(1, 0, 0, 50, 50));
  const c = removeShape(b, 1);
  expect(a.shapes[0]).toMatchObject({ x2: 10 });
  expect(b.shapes[0]).toMatchObject({ x2: 50 });
  expect(c.shapes).toEqual([]);
  expect(nextId([])).toBe(1);
  expect(nextId(b.shapes)).toBe(2);
});

test('hitTest finds the top-most shape and respects slop', () => {
  const shapes: Shape[] = [
    rect(1, 100, 100, 300, 300),
    rect(2, 100, 100, 300, 300), // on top of 1
    { id: 3, type: 'line', color: '#000', width: 4, x1: 0, y1: 0, x2: 100, y2: 0 },
    pen(4, [[500, 500], [600, 500]]),
    text(5, 700, 700),
    sensor(6, 800, 100, 900, 200),
    { id: 7, type: 'ellipse', color: '#000', width: 8, x1: 1000, y1: 1000, x2: 1200, y2: 1100 },
  ];
  // A frame is hit on its outline, not inside it.
  expect(hitTest(shapes, 100, 200, 0)).toBe(2);
  expect(hitTest(shapes, 200, 200, 0)).toBeNull();
  // Slop reaches beyond the stroke: width 8 gives 4, slop 6 gives 10.
  expect(hitTest(shapes, 109, 200, 6)).toBe(2);
  expect(hitTest(shapes, 112, 200, 6)).toBeNull();
  expect(hitTest(shapes, 50, 1, 0)).toBe(3);
  expect(hitTest(shapes, 50, 20, 0)).toBeNull();
  expect(hitTest(shapes, 50, 20, 20)).toBe(3);
  expect(hitTest(shapes, 550, 504, 0)).toBe(4);
  expect(hitTest(shapes, 550, 520, 0)).toBeNull();
  // Text and sensor are solid.
  expect(hitTest(shapes, 710, 710, 0)).toBe(5);
  expect(hitTest(shapes, 850, 150, 0)).toBe(6);
  expect(hitTest(shapes, 850, 250, 0)).toBeNull();
  // An ellipse: on the outline at the right end, not in the middle.
  expect(hitTest(shapes, 1200, 1050, 0)).toBe(7);
  expect(hitTest(shapes, 1100, 1050, 0)).toBeNull();
  expect(hitTest(shapes, 1100, 1100, 0)).toBe(7);
  expect(hitTest([], 1, 1, 10)).toBeNull();
});

test('a single-point pen is a dot to hit', () => {
  expect(hitTest([pen(1, [[50, 50]])], 53, 50, 0)).toBe(1);
  expect(hitTest([pen(1, [[50, 50]])], 70, 50, 0)).toBeNull();
});

test('move and resize keep the type and the colour', () => {
  const shapes: Shape[] = [
    pen(1, [[10, 10], [20, 30]]),
    rect(2, 10, 10, 50, 40),
    { id: 3, type: 'arrow', color: '#27AE60', width: 8, x1: 10, y1: 10, x2: 90, y2: 50 },
    text(4, 100, 100),
    sensor(5, 0, 0, 20, 20),
  ];
  for (const s of shapes) {
    const m = move(s, 5, -5);
    expect(m.type).toBe(s.type);
    expect(m.id).toBe(s.id);
    expect((m as { color?: string }).color).toBe((s as { color?: string }).color);
    const r = resize(s, 'se', 200, 200);
    expect(r.type).toBe(s.type);
    expect((r as { color?: string }).color).toBe((s as { color?: string }).color);
  }
  expect(move(shapes[0], 5, -5)).toMatchObject({ points: [[15, 5], [25, 25]] });
  expect(move(shapes[1], 5, -5)).toMatchObject({ x1: 15, y1: 5, x2: 55, y2: 35 });
  expect(move(shapes[3], 5, -5)).toMatchObject({ x: 105, y: 95 });
  // The original is not touched.
  expect(shapes[1]).toMatchObject({ x1: 10, y1: 10 });
});

test('resize drags one corner and keeps the opposite one', () => {
  const r = resize(rect(1, 10, 10, 50, 40), 'se', 90, 70);
  expect(r).toMatchObject({ x1: 10, y1: 10, x2: 90, y2: 70 });
  expect(resize(rect(1, 10, 10, 50, 40), 'nw', 0, 0)).toMatchObject({ x1: 0, y1: 0, x2: 50, y2: 40 });
  // Dragging past the opposite corner flips it.
  const f = resize(rect(1, 10, 10, 50, 40), 'se', 0, 0);
  expect(bounds(f)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  // An arrow keeps its direction: the end that was the tip is still the tip.
  const a = resize({ id: 1, type: 'arrow', color: '#000', width: 8, x1: 90, y1: 10, x2: 10, y2: 50 }, 'sw', 0, 100);
  expect(a).toMatchObject({ x1: 90, y1: 10, x2: 0, y2: 100 });
  // A pen scales its points inside the new box.
  const p = resize(pen(1, [[0, 0], [10, 10], [20, 0]]), 'se', 40, 20);
  expect(p).toMatchObject({ points: [[0, 0], [20, 20], [40, 0]] });
});

test('resizing a text changes its size with its height and keeps the opposite corner', () => {
  setTextMeasure((t, size) => t.length * size * 0.5);
  const t = text(1, 100, 100, 'ab'); // size 40: 40 wide, 48 tall
  const big = resize(t, 'se', 999, 100 + 96);
  expect(big).toMatchObject({ type: 'text', size: 80, x: 100, y: 100, color: '#111111', text: 'ab' });
  const fromNw = resize(t, 'nw', 0, 100 + 48 - 24 * 1.2);
  expect(fromNw).toMatchObject({ size: 24 });
  const b = bounds(fromNw);
  expect(b.x + b.w).toBeCloseTo(140);
  expect(b.y + b.h).toBeCloseTo(148);
  expect(resize(t, 'se', 0, 100)).toMatchObject({ size: 8 });
});

test('handles: corners for a box, the two ends for an arrow, and handleAt picks within a radius', () => {
  const r = rect(1, 10, 10, 50, 40);
  expect(handles(r).map(h => h.handle).sort()).toEqual(['ne', 'nw', 'se', 'sw']);
  const up: Shape = { id: 2, type: 'arrow', color: '#000', width: 8, x1: 10, y1: 60, x2: 90, y2: 10 };
  expect(handles(up)).toEqual([
    { handle: 'sw', x: 10, y: 60 },
    { handle: 'ne', x: 90, y: 10 },
  ]);
  expect(handleAt(r, 52, 42, 5)).toBe('se');
  expect(handleAt(r, 30, 25, 5)).toBeNull();
  expect(handleAt(up, 88, 12, 5)).toBe('ne');
  expect(handleAt(up, 90, 60, 5)).toBeNull(); // the empty corner of an arrow has no grip
});

test('constrain snaps to 45 degrees and squares', () => {
  const [lx, ly] = constrain('line', 0, 0, 100, 10);
  expect(lx).toBeCloseTo(100.5, 0);
  expect(ly).toBeCloseTo(0, 5);
  const [dx, dy] = constrain('arrow', 0, 0, 80, 100);
  expect(dx).toBeCloseTo(dy, 5);
  expect(Math.hypot(dx, dy)).toBeCloseTo(Math.hypot(80, 100), 5);
  expect(constrain('rect', 10, 10, 90, 50)).toEqual([90, 90]);
  expect(constrain('ellipse', 10, 10, -30, 20)).toEqual([-30, 50]);
  expect(constrain('rect', 10, 10, 20, -60)).toEqual([80, -60]);
  // Nothing to constrain for the others.
  expect(constrain('sensor', 0, 0, 10, 20)).toEqual([10, 20]);
  expect(constrain('pen', 0, 0, 10, 20)).toEqual([10, 20]);
});

test('serialize round-trips and parse of junk is an empty doc', () => {
  const doc: Doc = {
    v: 1,
    shapes: [
      pen(1, [[1, 2], [3, 4]]),
      rect(2, 0, 0, 5, 5),
      { id: 3, type: 'arrow', color: '#000', width: 4, x1: 0, y1: 0, x2: 9, y2: 9 },
      { id: 4, type: 'ellipse', color: '#000', width: 4, x1: 0, y1: 0, x2: 9, y2: 9 },
      { id: 5, type: 'line', color: '#000', width: 4, x1: 0, y1: 0, x2: 9, y2: 9 },
      text(6, 3, 4, 'Kopi — 咖啡'),
      sensor(7, 1, 1, 8, 8),
    ],
    style: { corner: 12, padding: 80, background: { kind: 'none' } },
  };
  expect(parse(serialize(doc))).toEqual(doc);
  for (const junk of [null, '', 'nope', '[]', '42', 'null', '{"v":2,"shapes":[]}', '{"shapes":[]}']) {
    expect(parse(junk)).toEqual(emptyDoc());
  }
  // A shape that is not whole is left out; the rest survive.
  const odd = parse(JSON.stringify({
    v: 1,
    shapes: [rect(1, 0, 0, 5, 5), { id: 2, type: 'rect' }, { id: 3, type: 'star' }, null, 7, { id: 4, type: 'pen', color: '#000', width: 4, points: [] }],
    style: { corner: 'x', padding: -3 },
  }));
  expect(odd.shapes.map(s => s.id)).toEqual([1]);
  expect(odd.style).toEqual(emptyDoc().style);
});

test('scaleFor is 1 at 1500 px and 2 at 3000 px', () => {
  expect(scaleFor(1500, 800)).toBe(1);
  expect(scaleFor(800, 3000)).toBe(2);
  expect(scaleFor(3000, 1000)).toBe(2);
  expect(scaleFor(640, 480)).toBe(1); // never below 1
  expect(scaleFor(2940, 1718)).toBeCloseTo(1.96);
});

test('isBlank', () => {
  expect(isBlank(emptyDoc())).toBe(true);
  expect(isBlank(addShape(emptyDoc(), sensor(1, 0, 0, 5, 5)))).toBe(false);
  const rounded = emptyDoc();
  rounded.style.corner = 12;
  expect(isBlank(rounded)).toBe(false);
  // Padding alone changes nothing without a background.
  const padded = emptyDoc();
  padded.style.padding = 200;
  expect(isBlank(padded)).toBe(true);
});

test('an end grip re-angles a flat line or arrow, whichever way it lies', () => {
  for (const type of ['line', 'arrow'] as const) {
    const flat: Shape = { id: 1, type, color: '#27AE60', width: 8, x1: 100, y1: 100, x2: 300, y2: 100 };
    // Horizontal: each end can leave the line, and the other end stays.
    expect(resize(flat, 'ne', 320, 40)).toMatchObject({ type, color: '#27AE60', x1: 100, y1: 100, x2: 320, y2: 40 });
    expect(resize(flat, 'nw', 80, 160)).toMatchObject({ x1: 80, y1: 160, x2: 300, y2: 100 });
    // Vertical: the same.
    const upright: Shape = { id: 2, type, color: '#000', width: 8, x1: 100, y1: 100, x2: 100, y2: 300 };
    expect(resize(upright, 'sw', 160, 320)).toMatchObject({ x1: 100, y1: 100, x2: 160, y2: 320 });
    expect(resize(upright, 'nw', 20, 90)).toMatchObject({ x1: 20, y1: 90, x2: 100, y2: 300 });
    // And back to flat, then tilted again: nothing stays locked.
    const back = resize(resize(flat, 'ne', 320, 40), 'ne', 300, 100);
    expect(back).toMatchObject({ x2: 300, y2: 100 });
    // The grips offered are the ones that work.
    for (const h of handles(flat)) expect(resize(flat, h.handle, h.x + 5, h.y + 50)).not.toEqual(flat);
    for (const h of handles(upright)) expect(resize(upright, h.handle, h.x + 50, h.y + 5)).not.toEqual(upright);
  }
  // A tilted one still moves just the end under the grip.
  const tilted: Shape = { id: 3, type: 'arrow', color: '#000', width: 8, x1: 10, y1: 10, x2: 90, y2: 50 };
  expect(resize(tilted, 'se', 200, 10)).toMatchObject({ x1: 10, y1: 10, x2: 200, y2: 10 });
});

test('a flat pen, rect or sensor can be dragged out of its flat axis', () => {
  const flatPen = pen(1, [[0, 50], [20, 50], [40, 50]]);
  // A pen with no height slides to the pointer's height; its width still scales.
  expect(resize(flatPen, 'se', 80, 90)).toMatchObject({ points: [[0, 90], [40, 90], [80, 90]] });
  const dot = pen(2, [[10, 10]]);
  expect(resize(dot, 'se', 30, 40)).toMatchObject({ points: [[30, 40]] });
  const vertical = pen(3, [[50, 0], [50, 20]]);
  expect(resize(vertical, 'ne', 90, -10)).toMatchObject({ points: [[90, -10], [90, 20]] });
  // A flat frame or sensor gets a height.
  expect(resize(rect(4, 10, 10, 90, 10), 'se', 90, 60)).toMatchObject({ x1: 10, y1: 10, x2: 90, y2: 60 });
  expect(resize(sensor(5, 10, 10, 10, 90), 'se', 60, 90)).toMatchObject({ x1: 10, y1: 10, x2: 60, y2: 90 });
});

test('the preset colours and gradients', () => {
  expect(SOLIDS).toEqual(['#FFFFFF', '#111111', '#E8262E', '#F5B700', '#2F80ED']);
  expect(GRADIENTS).toHaveLength(5);
  expect(GRADIENTS[0]).toEqual(['#FF7A18', '#7A1FA2']);
});

test('parse keeps every kind of background, and the style it was saved with', () => {
  const backgrounds = [
    { kind: 'solid', color: '#E8262E' },
    { kind: 'gradient', from: '#FF7A18', to: '#7A1FA2' },
    { kind: 'image', src: 'data:image/jpeg;base64,/9j/AA==', from: 'wallpaper' },
    { kind: 'image', src: 'data:image/jpeg;base64,/9j/BB==', from: 'file' },
  ] as const;
  for (const background of backgrounds) {
    const doc = withStyle(emptyDoc(), { corner: 12, padding: 90, background });
    expect(parse(serialize(doc))).toEqual(doc);
  }
});

test('an old doc without a style, or with a background that is not whole, gets the defaults', () => {
  expect(parse('{"v":1,"shapes":[]}').style).toEqual({ corner: 0, padding: 64, background: { kind: 'none' } });
  for (const background of [null, 'red', {}, { kind: 'solid' }, { kind: 'solid', color: 'url(x)' }, { kind: 'gradient', from: '#000000' }, { kind: 'image', src: 'http://x/y.jpg', from: 'file' }, { kind: 'image', src: 'data:image/jpeg;base64,AA', from: 'web' }]) {
    expect(parse(JSON.stringify({ v: 1, shapes: [], style: { corner: 4, padding: 80, background } })).style).toEqual({ corner: 4, padding: 80, background: { kind: 'none' } });
  }
});

test('corner and padding are held to their ranges', () => {
  expect(parse('{"v":1,"shapes":[],"style":{"corner":900,"padding":5000}}').style).toMatchObject({ corner: 40, padding: 160 });
  expect(parse('{"v":1,"shapes":[],"style":{"corner":3,"padding":2}}').style).toMatchObject({ corner: 3, padding: 16 });
});

test('a background makes a doc worth exporting', () => {
  expect(isBlank(withStyle(emptyDoc(), { background: { kind: 'solid', color: '#FFFFFF' } }))).toBe(false);
});
