// The rulers of the Cermin page (design 31 Oct, Cermin §3–4; cermin-v6.html):
// whole ticks slid under a fixed mark, as in Timer.
export interface Scale {
  min: number; // ticks
  max: number;
  px: number; // per tick
}

// Zoom 1.0×–3.0×, a tick each 0.1×.
export const ZOOM: Scale = { min: 10, max: 30, px: 14 };
// Light from cold 6500K on the left to warm 2700K, a tick each 100K.
export const LIGHT: Scale = { min: 0, max: 38, px: 10 };
export const LIGHT_START = 20; // 4500K
const COLD_K = 6500;
const WARM_K = 2700;

// A drag shorter than this is a click, and a click changes nothing.
export const DRAG_PX = 4;

// Dragging left brings the ticks on the right under the mark, as in Timer.
export function dragTick(s: Scale, start: number, dx: number): number {
  return Math.min(s.max, Math.max(s.min, Math.round(start - dx / s.px)));
}

export const zoomScale = (tick: number) => tick / 10;
export const zoomText = (tick: number) => `${(tick / 10).toFixed(1)}×`;
export const kelvin = (tick: number) => COLD_K - tick * 100;

const hex = (rgb: number[]) => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// From cold (0) to warm (1) at this temperature.
function warmth(k: number): number {
  return Math.min(1, Math.max(0, (COLD_K - k) / (COLD_K - WARM_K)));
}

function blend(k: number, cold: number[], warm: number[]): string {
  const t = warmth(k);
  return hex(cold.map((c, i) => c + (warm[i] - c) * t));
}

// The lamp's wings: a pale blue at 6500K to a pale amber at 2700K.
export const lightColor = (k: number) => blend(k, [226, 236, 255], [255, 206, 150]);
// The glow round the panel: the same light, stronger (owner, 31 Oct).
export const glowColor = (k: number) => blend(k, [150, 195, 255], [255, 160, 60]);
