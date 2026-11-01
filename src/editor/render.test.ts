import { afterEach, expect, test, vi } from 'vitest';
import { emptyDoc, type Doc, type Shape, type Style } from './model';
import { arrowHead, compose, coverRect, drawSelection, drawShapes, exportPng, measureText, outputSize, textFont, type Source } from './render';

type Call = [string, ...unknown[]];

// A 2D context that writes down what it is asked to do, with the properties it
// had at the time of each stroke or fill.
function recorder() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get(_t, name: string) {
        if (name === 'measureText') return (text: string) => ({ width: text.length * 10 });
        if (name in props) return props[name];
        return (...args: unknown[]) => {
          calls.push([name, ...args]);
          if (name === 'stroke' || name === 'fill' || name === 'fillText' || name === 'fillRect') calls.push(['@', { ...props }]);
          // The gradient writes down its stops.
          if (name === 'createLinearGradient') return { addColorStop: (...stop: unknown[]) => calls.push(['stop', ...stop]) };
        };
      },
      set(_t, name: string, value) {
        props[name] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, props };
}

const names = (calls: Call[]) => calls.filter(c => c[0] !== '@').map(c => c[0]);
const image = (w = 3000, h = 1000): Source => ({ width: w, height: h }) as unknown as Source;

test('a pen is a round-capped polyline', () => {
  const { ctx, calls } = recorder();
  drawShapes(ctx, [{ id: 1, type: 'pen', color: '#2F80ED', width: 8, points: [[1, 2], [3, 4], [5, 6]] }], image());
  expect(calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo')).toEqual([['moveTo', 1, 2], ['lineTo', 3, 4], ['lineTo', 5, 6]]);
  const props = calls.find(c => c[0] === '@')![1] as Record<string, unknown>;
  expect(props).toMatchObject({ strokeStyle: '#2F80ED', lineWidth: 8, lineCap: 'round', lineJoin: 'round' });
});

test('a single point is a dot, a zero-length segment', () => {
  const { ctx, calls } = recorder();
  drawShapes(ctx, [{ id: 1, type: 'pen', color: '#000', width: 8, points: [[9, 9]] }], image());
  expect(calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo')).toEqual([['moveTo', 9, 9], ['lineTo', 9, 9]]);
});

test('an arrow has a head of max(16, width x 4) at 28 degrees on the end point', () => {
  expect(arrowHead(4)).toBe(16);
  expect(arrowHead(14)).toBe(56);
  const { ctx, calls } = recorder();
  // Pointing right: the head's barbs lie back to the left of the tip.
  drawShapes(ctx, [{ id: 1, type: 'arrow', color: '#E8262E', width: 14, x1: 0, y1: 0, x2: 200, y2: 0 }], image());
  const lines = calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo');
  expect(lines.slice(0, 2)).toEqual([['moveTo', 0, 0], ['lineTo', 200, 0]]);
  const [, , tipA, barbA, tipB, barbB] = lines as [string, number, number][];
  expect(tipA.slice(1)).toEqual([200, 0]);
  expect(tipB.slice(1)).toEqual([200, 0]);
  const rad = (28 * Math.PI) / 180;
  expect(barbA[1]).toBeCloseTo(200 - 56 * Math.cos(rad));
  expect(Math.abs(barbA[2])).toBeCloseTo(56 * Math.sin(rad));
  expect(barbA[2]).toBeCloseTo(-barbB[2]);
  expect(barbA[1]).toBeCloseTo(barbB[1]);
});

test('an arrow with no length draws nothing', () => {
  const { ctx, calls } = recorder();
  drawShapes(ctx, [{ id: 1, type: 'arrow', color: '#000', width: 4, x1: 5, y1: 5, x2: 5, y2: 5 }], image());
  expect(names(calls)).not.toContain('stroke');
});

test('a rectangle and an ellipse use the box whichever corner was dragged first', () => {
  const { ctx, calls } = recorder();
  drawShapes(ctx, [
    { id: 1, type: 'rect', color: '#000', width: 4, x1: 50, y1: 40, x2: 10, y2: 10 },
    { id: 2, type: 'ellipse', color: '#000', width: 4, x1: 100, y1: 60, x2: 20, y2: 20 },
  ], image());
  expect(calls).toContainEqual(['strokeRect', 10, 10, 40, 30]);
  expect(calls).toContainEqual(['ellipse', 60, 40, 40, 20, 0, 0, Math.PI * 2]);
});

test('text is Space Grotesk 600, in its colour, from its corner', () => {
  const { ctx, calls } = recorder();
  drawShapes(ctx, [{ id: 1, type: 'text', color: '#F5B700', size: 40, x: 100, y: 200, text: 'halo' }], image());
  expect(textFont(40)).toContain('600 40px "Space Grotesk"');
  const fill = calls.find(c => c[0] === 'fillText')!;
  expect(fill.slice(0, 2)).toEqual(['fillText', 'halo']);
  expect(fill[2]).toBe(100);
  expect(fill[3] as number).toBeCloseTo(204); // half the leading of a 1.2 line
  const props = calls.find(c => c[0] === '@')![1] as Record<string, unknown>;
  expect(props).toMatchObject({ fillStyle: '#F5B700', font: textFont(40), textBaseline: 'top' });
});

test('measureText measures in the same font and leaves the context as it was', () => {
  const { ctx, calls } = recorder();
  expect(measureText(ctx, 'abc', 40)).toBe(30);
  expect(names(calls)).toEqual(['save', 'restore']);
});

// The scratch canvas stands in for the small canvas a sensor shrinks into.
function scratch() {
  const drawn: Call[] = [];
  const small = {
    width: 0,
    height: 0,
    getContext: () => ({
      imageSmoothingEnabled: false,
      drawImage: (...a: unknown[]) => drawn.push(['drawImage', ...a]),
    }),
  };
  return { drawn, small, make: () => small as unknown as HTMLCanvasElement };
}

test('a sensor shrinks the region of the original to blocks and draws it back unsmoothed', () => {
  const { ctx, calls, props } = recorder();
  const sc = scratch();
  const img = image(3000, 1000); // scale 2: blocks of 24
  const shape: Shape = { id: 1, type: 'sensor', x1: 480, y1: 240, x2: 100, y2: 100 };
  drawShapes(ctx, [shape], img, sc.make);
  // The region is x 100-480, y 100-240: 380 × 140, so 16 × 6 blocks of 24.
  expect([sc.small.width, sc.small.height]).toEqual([16, 6]);
  expect(sc.drawn).toEqual([['drawImage', img, 100, 100, 380, 140, 0, 0, 16, 6]]);
  expect(calls).toContainEqual(['rect', 100, 100, 380, 140]);
  expect(calls).toContainEqual(['clip']);
  expect(calls).toContainEqual(['drawImage', sc.small, 0, 0, 16, 6, 100, 100, 16 * 24, 6 * 24]);
  expect(props.imageSmoothingEnabled).toBe(false);
});

test('a sensor block is at least 8 px, and the region stays inside the picture', () => {
  const { ctx } = recorder();
  const sc = scratch();
  const img = image(600, 400); // scale 1: blocks of 12
  drawShapes(ctx, [{ id: 1, type: 'sensor', x1: -50, y1: -50, x2: 700, y2: 120 }], img, sc.make);
  expect(sc.drawn).toEqual([['drawImage', img, 0, 0, 600, 120, 0, 0, 50, 10]]);
});

test('a sensor wholly outside the picture draws nothing', () => {
  const { ctx, calls } = recorder();
  const sc = scratch();
  drawShapes(ctx, [{ id: 1, type: 'sensor', x1: 700, y1: 10, x2: 800, y2: 50 }], image(600, 400), sc.make);
  expect(sc.drawn).toEqual([]);
  expect(names(calls)).not.toContain('clip');
});

test('each shape is drawn between a save and a restore, in order', () => {
  const { ctx, calls } = recorder();
  drawShapes(ctx, [
    { id: 1, type: 'line', color: '#111111', width: 4, x1: 0, y1: 0, x2: 9, y2: 9 },
    { id: 2, type: 'line', color: '#FFFFFF', width: 4, x1: 1, y1: 1, x2: 5, y2: 5 },
  ], image());
  expect(names(calls)).toEqual(['save', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'restore', 'save', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'restore']);
  const strokes = calls.filter(c => c[0] === '@').map(c => (c[1] as { strokeStyle: string }).strokeStyle);
  expect(strokes).toEqual(['#111111', '#FFFFFF']);
});

test('the selection keeps its size on screen: 4 grips for a box, 2 for an arrow', () => {
  const box = recorder();
  drawSelection(box.ctx, { id: 1, type: 'rect', color: '#000', width: 4, x1: 10, y1: 10, x2: 60, y2: 40 }, 2);
  expect(box.calls.filter(c => c[0] === 'strokeRect')).toEqual([['strokeRect', 10, 10, 50, 30], ['strokeRect', 10, 10, 50, 30]]); // black dashes, then white
  expect(box.calls.filter(c => c[0] === 'rect')).toHaveLength(4);
  expect(box.calls).toContainEqual(['rect', 1, 1, 18, 18]); // a 9 px grip at unit 2, centred on the corner
  const arrow = recorder();
  drawSelection(arrow.ctx, { id: 2, type: 'arrow', color: '#000', width: 4, x1: 0, y1: 0, x2: 90, y2: 50 }, 1);
  expect(arrow.calls.filter(c => c[0] === 'rect')).toHaveLength(2);
  expect(names(arrow.calls)).not.toContain('strokeRect');
});

const style = (patch: Partial<Style> = {}): Style => ({ ...emptyDoc().style, ...patch });

test('outputSize adds padding only with a background', () => {
  expect(outputSize(2940, 1718, style(), 1)).toEqual({ w: 2940, h: 1718, ox: 0, oy: 0 });
  // Even a wide padding and rounded corners leave the size alone without one.
  expect(outputSize(2940, 1718, style({ padding: 160, corner: 40 }), 2)).toEqual({ w: 2940, h: 1718, ox: 0, oy: 0 });
  expect(outputSize(2940, 1718, style({ padding: 64, background: { kind: 'solid', color: '#111111' } }), 1)).toEqual({ w: 3068, h: 1846, ox: 64, oy: 64 });
});

test('outputSize scales padding', () => {
  const bg = { kind: 'gradient', from: '#000000', to: '#FFFFFF' } as const;
  expect(outputSize(3000, 1000, style({ padding: 64, background: bg }), 2)).toEqual({ w: 3256, h: 1256, ox: 128, oy: 128 });
  expect(outputSize(2940, 1718, style({ padding: 33, background: bg }), 1.96)).toEqual({ w: 3070, h: 1848, ox: 65, oy: 65 }); // whole pixels
});

test('an image background covers the box without squashing', () => {
  // Wider than the box: the sides are cut, centred.
  expect(coverRect(4000, 1000, 1000, 1000)).toEqual({ sx: 1500, sy: 0, sw: 1000, sh: 1000 });
  // Taller: the top and bottom are cut.
  expect(coverRect(1000, 3000, 600, 300)).toEqual({ sx: 0, sy: 1250, sw: 1000, sh: 500 });
  expect(coverRect(500, 500, 1000, 1000)).toEqual({ sx: 0, sy: 0, sw: 500, sh: 500 });
});

const comp = (st: Style, shapes: Shape[] = [], backdrop: Source | null = null) => ({ image: image(3000, 1000), w: 3000, h: 1000, shapes, style: st, scale: 2, backdrop });

test('without a background the picture keeps its size and a rounded corner leaves the rest transparent', () => {
  const { ctx, calls, props } = recorder();
  const img = image(3000, 1000);
  compose(ctx, { ...comp(style({ corner: 10 })), image: img });
  expect(calls[0]).toEqual(['clearRect', 0, 0, 3000, 1000]);
  // A radius of 10 × scale 2, at the picture's own corner.
  const arcs = calls.filter(c => c[0] === 'arcTo');
  expect(arcs).toHaveLength(4);
  expect(arcs.every(a => a[5] === 20)).toBe(true);
  expect(calls).toContainEqual(['moveTo', 20, 0]);
  expect(names(calls).indexOf('clip')).toBeGreaterThan(-1);
  expect(names(calls).indexOf('clip')).toBeLessThan(names(calls).indexOf('drawImage'));
  expect(calls).toContainEqual(['drawImage', img, 0, 0, 3000, 1000]);
  expect(props.shadowBlur).toBeUndefined();
  expect(names(calls)).not.toContain('fillRect');
});

test('square corners and no background draw the picture as it is', () => {
  const { ctx, calls } = recorder();
  compose(ctx, comp(style()));
  expect(names(calls)).not.toContain('clip');
  expect(names(calls)).not.toContain('arcTo');
});

test('a radius never passes half the short side', () => {
  const { ctx, calls } = recorder();
  compose(ctx, { ...comp(style({ corner: 40 })), h: 100, image: image(3000, 100) });
  expect(calls.filter(c => c[0] === 'arcTo').every(a => a[5] === 50)).toBe(true);
});

test('a solid background is padded, the picture is shadowed, rounded and moved by the padding', () => {
  const { ctx, calls } = recorder();
  const img = image(3000, 1000);
  const sc = scratch();
  compose(ctx, { ...comp(style({ padding: 64, corner: 12, background: { kind: 'solid', color: '#E8262E' } }), [{ id: 1, type: 'sensor', x1: 0, y1: 0, x2: 10, y2: 10 }]), image: img, scratch: sc.make });
  // 3000 × 1000 plus 128 on every side.
  expect(calls[0]).toEqual(['clearRect', 0, 0, 3256, 1256]);
  const fills = calls.filter(c => c[0] === '@').map(c => c[1] as Record<string, unknown>);
  expect(calls).toContainEqual(['fillRect', 0, 0, 3256, 1256]);
  expect(fills[0]).toMatchObject({ fillStyle: '#E8262E' });
  // 0 14px 30px rgba(0,0,0,.35), times the scale of 2; only the shadow lands in
  // the picture: the shape itself lies off to the left.
  const shadow = fills[1];
  expect(shadow).toMatchObject({ shadowColor: 'rgba(0,0,0,0.35)', shadowBlur: 60, shadowOffsetY: 28 });
  const off = shadow.shadowOffsetX as number;
  expect(off).toBeGreaterThanOrEqual(3256);
  expect(calls).toContainEqual(['moveTo', 128 - off + 24, 128]);
  expect(calls).toContainEqual(['translate', 128, 128]);
  expect(calls).toContainEqual(['drawImage', img, 0, 0, 3000, 1000]);
  // The sensor reads the original, not the padded canvas.
  expect(sc.drawn[0][1]).toBe(img);
  expect(sc.drawn[0].slice(2, 6)).toEqual([0, 0, 10, 10]);
});

test('the shadow is drawn between a save and a restore of its own', () => {
  const { ctx, calls } = recorder();
  compose(ctx, comp(style({ background: { kind: 'solid', color: '#111111' } })));
  const at = calls.findIndex(c => c[0] === '@' && 'shadowBlur' in (c[1] as object));
  expect(at).toBeGreaterThan(-1);
  expect(calls.slice(0, at).some(c => c[0] === 'save')).toBe(true);
  const restore = at + calls.slice(at).findIndex(c => c[0] === 'restore');
  const picture = calls.findIndex(c => c[0] === 'drawImage');
  expect(restore).toBeLessThan(picture);
});

test('a gradient runs corner to corner at 135 degrees', () => {
  const { ctx, calls } = recorder();
  compose(ctx, { ...comp(style({ padding: 16, background: { kind: 'gradient', from: '#FF7A18', to: '#7A1FA2' } })), w: 100, h: 100, image: image(100, 100), scale: 1 });
  // 132 × 132 box; the line is the box's own diagonal for a square.
  const g = calls.find(c => c[0] === 'createLinearGradient')!;
  expect(g[1] as number).toBeCloseTo(0);
  expect(g[2] as number).toBeCloseTo(0);
  expect(g[3] as number).toBeCloseTo(132);
  expect(g[4] as number).toBeCloseTo(132);
  expect(calls.filter(c => c[0] === 'stop')).toEqual([['stop', 0, '#FF7A18'], ['stop', 1, '#7A1FA2']]);
});

test('a gradient on a wide box is centred and its length is the sum of the sides over root 2', () => {
  const { ctx, calls } = recorder();
  compose(ctx, { ...comp(style({ padding: 16, background: { kind: 'gradient', from: '#000000', to: '#FFFFFF' } })), w: 400, h: 100, image: image(400, 100), scale: 1 });
  const g = calls.find(c => c[0] === 'createLinearGradient')!;
  const [, x0, y0, x1, y1] = g as number[];
  expect((x0 + x1) / 2).toBeCloseTo(216);
  expect((y0 + y1) / 2).toBeCloseTo(66);
  expect(x1 - x0).toBeCloseTo(y1 - y0); // 45° down and to the right
  expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo((432 + 132) / Math.SQRT2);
});

test('an image background is drawn to cover the whole output', () => {
  const { ctx, calls } = recorder();
  const wall = image(4000, 1000);
  compose(ctx, comp(style({ padding: 64, background: { kind: 'image', src: 'data:image/jpeg;base64,AA', from: 'wallpaper' } }), [], wall));
  const d = calls.find(c => c[0] === 'drawImage' && c[1] === wall)!;
  const crop = coverRect(4000, 1000, 3256, 1256);
  expect(d.slice(2)).toEqual([crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, 3256, 1256]);
  expect(crop.sw / crop.sh).toBeCloseTo(3256 / 1256);
});

test('an image background that has not loaded yet leaves the plain backdrop out', () => {
  const { ctx, calls } = recorder();
  compose(ctx, comp(style({ background: { kind: 'image', src: 'data:image/jpeg;base64,AA', from: 'file' } })));
  expect(names(calls)).not.toContain('fillRect');
  expect(calls.some(c => c[0] === 'drawImage')).toBe(true); // the picture itself
});

const bgDoc = (patch: Partial<Style>): Doc => ({ ...emptyDoc(), style: style(patch) });

afterEach(() => vi.unstubAllGlobals());

test('exportPng returns null for a blank doc, and never makes a canvas', async () => {
  const create = vi.fn();
  vi.stubGlobal('document', { createElement: create });
  expect(await exportPng(image(), emptyDoc(), 1)).toBeNull();
  // Padding alone changes nothing without a background.
  expect(await exportPng(image(), bgDoc({ padding: 120 }), 1)).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

test('exportPng renders at full resolution plus padding and hands back a PNG', async () => {
  const canvas = recorder();
  const blob = new Blob(['png'], { type: 'image/png' });
  const made = {
    width: 0,
    height: 0,
    getContext: () => canvas.ctx,
    toBlob: vi.fn((cb: (b: Blob | null) => void, type?: string) => {
      expect(type).toBe('image/png');
      cb(blob);
    }),
  };
  vi.stubGlobal('document', { createElement: vi.fn(() => made) });
  const out = await exportPng(image(3000, 1000), bgDoc({ padding: 64, background: { kind: 'solid', color: '#111111' } }), 2);
  expect(out).toBe(blob);
  expect([made.width, made.height]).toEqual([3256, 1256]);
  expect(canvas.calls).toContainEqual(['drawImage', expect.anything(), 0, 0, 3000, 1000]);
});

test('rounded corners alone are exported at the picture size, with the corners cleared', async () => {
  const canvas = recorder();
  const made = { width: 0, height: 0, getContext: () => canvas.ctx, toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['x'])) };
  vi.stubGlobal('document', { createElement: () => made });
  expect(await exportPng(image(3000, 1000), bgDoc({ corner: 12 }), 2)).toBeInstanceOf(Blob);
  expect([made.width, made.height]).toEqual([3000, 1000]);
  expect(canvas.calls[0]).toEqual(['clearRect', 0, 0, 3000, 1000]);
});

test('exportPng rejects when the canvas gives no PNG, so the editor can say so', async () => {
  const canvas = recorder();
  const made = { width: 0, height: 0, getContext: () => canvas.ctx, toBlob: (cb: (b: Blob | null) => void) => cb(null) };
  vi.stubGlobal('document', { createElement: () => made });
  await expect(exportPng(image(), bgDoc({ corner: 5 }), 1)).rejects.toThrow();
});
