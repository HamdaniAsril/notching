import { LINE_HEIGHT, bounds, handles, scaleFor, type Box, type Shape } from './model';

// Drawing of the editor's shapes, in image pixels. The same code serves the
// screen and (task 9) the exported picture.

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
