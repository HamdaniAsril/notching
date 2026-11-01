import { loadImage } from './background';
import { LINE_HEIGHT, bounds, handles, isBlank, scaleFor, type Box, type Doc, type Shape, type Style } from './model';

// Drawing of the editor's shapes, in image pixels. The same code serves the
// screen and the exported picture.

export const TEXT_FAMILY = '"Space Grotesk"';
export const textFont = (size: number): string => `600 ${size}px ${TEXT_FAMILY}, -apple-system, sans-serif`;

// Space Grotesk 600 has to be loaded before canvas text can use it.
export const FONT_PROBE = `600 24px ${TEXT_FAMILY}`;

export type Source = CanvasImageSource & { width: number; height: number };
export type Scratch = () => HTMLCanvasElement;

const ARROW_ANGLE = (28 * Math.PI) / 180;

export const arrowHead = (width: number): number => Math.max(16, width * 4);

// The picture's own size: an <img> is measured by what it loaded, not by how
// it is shown.
export function sourceSize(image: Source): { w: number; h: number } {
  const i = image as Partial<HTMLImageElement>;
  return { w: i.naturalWidth || image.width, h: i.naturalHeight || image.height };
}

export function measureText(ctx: CanvasRenderingContext2D, text: string, size: number): number {
  ctx.save();
  ctx.font = textFont(size);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

function stroke(ctx: CanvasRenderingContext2D, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function normalized(s: { x1: number; y1: number; x2: number; y2: number }): Box {
  return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
}

// A sensor is the picture's own region, shrunk to blocks and drawn back big
// without smoothing. It reads the original, never what is drawn over it.
function pixelate(ctx: CanvasRenderingContext2D, box: Box, image: Source, scratch: Scratch): void {
  const { w: iw, h: ih } = sourceSize(image);
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(iw, Math.ceil(box.x + box.w)) - x;
  const h = Math.min(ih, Math.ceil(box.y + box.h)) - y;
  if (w <= 0 || h <= 0) return;
  const block = Math.max(8, 12 * scaleFor(iw, ih));
  const small = scratch();
  small.width = Math.max(1, Math.ceil(w / block));
  small.height = Math.max(1, Math.ceil(h / block));
  const sctx = small.getContext('2d');
  if (!sctx) return;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(image, x, y, w, h, 0, 0, small.width, small.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  // The last block runs past the region; the clip cuts it.
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, small.width * block, small.height * block);
  ctx.restore();
}

function drawOne(ctx: CanvasRenderingContext2D, s: Shape, image: Source, scratch: Scratch): void {
  switch (s.type) {
    case 'pen': {
      stroke(ctx, s.color, s.width);
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      // One point is a dot: a zero-length segment with round caps.
      if (s.points.length === 1) ctx.lineTo(s.points[0][0], s.points[0][1]);
      ctx.stroke();
      return;
    }
    case 'line':
      stroke(ctx, s.color, s.width);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      return;
    case 'arrow': {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      if (len === 0) return;
      stroke(ctx, s.color, s.width);
      const back = Math.atan2(s.y1 - s.y2, s.x1 - s.x2); // from the tip back along the shaft
      const head = arrowHead(s.width);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      for (const a of [back + ARROW_ANGLE, back - ARROW_ANGLE]) {
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 + head * Math.cos(a), s.y2 + head * Math.sin(a));
      }
      ctx.stroke();
      return;
    }
    case 'rect': {
      const b = normalized(s);
      stroke(ctx, s.color, s.width);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      return;
    }
    case 'ellipse': {
      const b = normalized(s);
      stroke(ctx, s.color, s.width);
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'text':
      ctx.save();
      ctx.fillStyle = s.color;
      ctx.font = textFont(s.size);
      ctx.textBaseline = 'top';
      // The line box is taller than the letters; this centres them in it, as
      // the text box on the page does.
      ctx.fillText(s.text, s.x, s.y + ((LINE_HEIGHT - 1) / 2) * s.size);
      ctx.restore();
      return;
    case 'sensor':
      pixelate(ctx, normalized(s), image, scratch);
      return;
  }
}

// Draws the shapes in order. `image` is the original: a sensor samples it. The
// scratch canvas is for pixelating; tests give a stand-in.
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], image: Source, scratch?: Scratch): void {
  const make = scratch ?? (() => ctx.canvas.ownerDocument.createElement('canvas'));
  for (const s of shapes) {
    ctx.save();
    drawOne(ctx, s, image, make);
    ctx.restore();
  }
}

// The selection: a dashed box and grips. `unit` is image pixels per screen
// pixel, so they keep their size on screen however far the picture is shrunk.
export function drawSelection(ctx: CanvasRenderingContext2D, s: Shape, unit: number): void {
  ctx.save();
  if (s.type !== 'line' && s.type !== 'arrow') {
    const b = bounds(s);
    // Black dashes with white ones between them, to be seen on light and dark.
    ctx.lineWidth = 1.5 * unit;
    ctx.setLineDash([5 * unit, 5 * unit]);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.lineDashOffset = 5 * unit;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
  }
  const r = 4.5 * unit;
  for (const h of handles(s)) {
    ctx.beginPath();
    ctx.rect(h.x - r, h.y - r, 2 * r, 2 * r);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = unit;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
  }
  ctx.restore();
}

// ---- output ------------------------------------------------------------------
// The picture, its corners, its background and shadow: one drawing for the
// board and for the exported PNG, so what is seen is what is saved.

// The output's size and where the picture sits in it. Only a background adds
// room around the picture; corners alone keep its size.
export function outputSize(w: number, h: number, style: Style, scale: number): { w: number; h: number; ox: number; oy: number } {
  if (style.background.kind === 'none') return { w, h, ox: 0, oy: 0 };
  const pad = Math.round(style.padding * scale);
  return { w: w + 2 * pad, h: h + 2 * pad, ox: pad, oy: pad };
}

// The part of a picture that fills a box without squashing: the long side is
// cut, evenly from both ends.
export function coverRect(iw: number, ih: number, w: number, h: number): { sx: number; sy: number; sw: number; sh: number } {
  const k = Math.max(w / iw, h / ih);
  const sw = w / k;
  const sh = h / k;
  return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh };
}

// A rounded-rectangle path; `arcTo` rather than `roundRect`, which older
// WebKit lacks. The radius never passes half the short side.
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A gradient at 135° (CSS): from the top-left to the bottom-right, as long as
// the box's two sides along that direction, centred.
function diagonal(ctx: CanvasRenderingContext2D, from: string, to: string, w: number, h: number): CanvasGradient {
  const half = (w + h) / 4; // half the length of (w + h) / √2, along each axis
  const g = ctx.createLinearGradient(w / 2 - half, h / 2 - half, w / 2 + half, h / 2 + half);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  return g;
}

// 0 14px 30px rgba(0,0,0,.35), × scale.
const SHADOW = { color: 'rgba(0,0,0,0.35)', y: 14, blur: 30 };

export interface Composition {
  image: Source; // the original
  w: number; // its size, which an <img> that has not loaded cannot say
  h: number;
  shapes: Shape[];
  style: Style;
  scale: number;
  backdrop: Source | null; // an image background, once loaded
  scratch?: Scratch;
}

// Everything under the marks: clears `ctx` (which is `outputSize` big), then the
// background, the shadow and the original. None of it changes while a shape is
// being drawn, so the board keeps it in a layer (`createBaseCache`).
export function composeBase(ctx: CanvasRenderingContext2D, c: Composition): void {
  const { w, h, style, scale } = c;
  const out = outputSize(w, h, style, scale);
  const bg = style.background;
  ctx.clearRect(0, 0, out.w, out.h);
  const radius = style.corner * scale;
  if (bg.kind !== 'none') {
    ctx.save();
    if (bg.kind === 'solid') {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, out.w, out.h);
    } else if (bg.kind === 'gradient') {
      ctx.fillStyle = diagonal(ctx, bg.from, bg.to, out.w, out.h);
      ctx.fillRect(0, 0, out.w, out.h);
    } else if (c.backdrop) {
      const { w: bw, h: bh } = sourceSize(c.backdrop);
      const crop = coverRect(bw, bh, out.w, out.h);
      ctx.drawImage(c.backdrop, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, out.w, out.h);
    }
    ctx.restore();
    // Only the shadow is to land in the output: the shape that casts it is
    // drawn off to the left and its shadow offset back in.
    ctx.save();
    const away = out.w + 2 * SHADOW.blur * scale;
    ctx.shadowColor = SHADOW.color;
    ctx.shadowBlur = SHADOW.blur * scale;
    ctx.shadowOffsetX = away;
    ctx.shadowOffsetY = SHADOW.y * scale;
    ctx.fillStyle = '#000000';
    roundedRect(ctx, out.ox - away, out.oy, w, h, radius);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(out.ox, out.oy);
  if (radius > 0) {
    roundedRect(ctx, 0, 0, w, h, radius);
    ctx.clip();
  }
  if (sourceSize(c.image).w > 0) ctx.drawImage(c.image, 0, 0, w, h);
  ctx.restore();
}

// The marks, on the picture and clipped to its corners.
export function drawMarks(ctx: CanvasRenderingContext2D, c: Composition): void {
  const out = outputSize(c.w, c.h, c.style, c.scale);
  const radius = c.style.corner * c.scale;
  ctx.save();
  ctx.translate(out.ox, out.oy);
  if (radius > 0) {
    roundedRect(ctx, 0, 0, c.w, c.h, radius);
    ctx.clip();
  }
  drawShapes(ctx, c.shapes, c.image, c.scratch);
  ctx.restore();
}

// The base kept in an offscreen canvas of its own, drawn again only when what
// it is made of changes: the style (an object, replaced on every change), the
// size, the loaded background picture, or the original once it has loaded. A
// shape drawn or moved leaves it alone, so a stroke costs one blit and the marks,
// not a background and a 60 px shadow per pointer move. The board and the export
// both draw as `base.draw` then `drawMarks`, so they agree to the pixel.
export interface BaseCache {
  readonly rebuilds: number;
  // Clears `ctx` and draws the base on it.
  draw(ctx: CanvasRenderingContext2D, c: Composition): void;
  drop(): void;
}

export function createBaseCache(make: () => HTMLCanvasElement): BaseCache {
  let layer: HTMLCanvasElement | null = null;
  let key: unknown[] | null = null;
  const cache: BaseCache & { rebuilds: number } = {
    rebuilds: 0,
    draw(ctx, c) {
      const out = outputSize(c.w, c.h, c.style, c.scale);
      const now = [c.style, c.w, c.h, c.scale, c.backdrop, c.image, sourceSize(c.image).w > 0];
      if (!layer || !key || key.some((k, i) => k !== now[i])) {
        layer ??= make();
        // A new size reallocates the bitmap, so only a real change sets it.
        if (layer.width !== out.w) layer.width = out.w;
        if (layer.height !== out.h) layer.height = out.h;
        const lctx = layer.getContext('2d');
        if (!lctx) return composeBase(ctx, c);
        composeBase(lctx, c);
        key = now;
        cache.rebuilds++;
      }
      ctx.clearRect(0, 0, out.w, out.h);
      ctx.drawImage(layer, 0, 0);
    },
    drop() {
      layer = null;
      key = null;
    },
  };
  return cache;
}

// The PNG for Salin, Simpan and keep, at the original's resolution plus the
// padding. Null when nothing was changed, so the core restores the original.
export async function exportPng(image: Source, doc: Doc, scale: number): Promise<Blob | null> {
  if (isBlank(doc)) return null;
  const { w, h } = sourceSize(image);
  const out = outputSize(w, h, doc.style, scale);
  const canvas = document.createElement('canvas');
  canvas.width = out.w;
  canvas.height = out.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context for the export');
  const bg = doc.style.background;
  const backdrop = bg.kind === 'image' ? await loadImage(bg.src) : null;
  // The same two steps as the board's redraw (a base layer, then the marks), so
  // the board and the file agree to the pixel.
  const c = { image, w, h, shapes: doc.shapes, style: doc.style, scale, backdrop };
  const base = createBaseCache(() => document.createElement('canvas'));
  base.draw(ctx, c);
  drawMarks(ctx, c);
  base.drop();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('the canvas gave no PNG'))), 'image/png');
  });
}
