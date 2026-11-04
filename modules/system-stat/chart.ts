// The one-minute line charts. Points come from Rust, oldest first, `ago`
// seconds before the latest reading; there are readings only while the card
// is open, so a longer gap is time it was shut and is left blank.

export const WINDOW_S = 60;
const GAP_S = 4;

export interface Pt {
  ago: number;
  v: number | null;
}

export function segments(points: Pt[]): Pt[][] {
  const out: Pt[][] = [];
  let run: Pt[] = [];
  let prev: Pt | null = null;
  for (const pt of points) {
    if (pt.v === null || (prev && prev.ago - pt.ago > GAP_S)) {
      if (run.length) out.push(run);
      run = [];
    }
    if (pt.v !== null) run.push(pt);
    prev = pt;
  }
  if (run.length) out.push(run);
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;

function xy(pt: Pt, w: number, h: number): [number, number] {
  const x = w * (1 - Math.min(WINDOW_S, Math.max(0, pt.ago)) / WINDOW_S);
  const y = h - (Math.min(100, Math.max(0, pt.v ?? 0)) / 100) * h;
  return [round(x), round(y)];
}

export function linePath(seg: Pt[], w: number, h: number): string {
  return seg.map((pt, i) => `${i ? 'L' : 'M'}${xy(pt, w, h).join(' ')}`).join('');
}

export function areaPath(seg: Pt[], w: number, h: number): string {
  if (!seg.length) return '';
  const first = xy(seg[0], w, h)[0];
  const last = xy(seg[seg.length - 1], w, h)[0];
  return `${linePath(seg, w, h)}L${last} ${h}L${first} ${h}Z`;
}
