// The Volt accent and its shades, worked out from the one colour the person
// picked in Tampilan (design 3 Nov, warna aksen §3). Every surface writes these
// as CSS variables on its root, so stylesheets only ever say var(--v-acc…).

export const DEFAULT_ACCENT = '#c8f04a';

// Names show only as a tooltip and to screen readers, the same in both languages.
export const ACCENT_PRESETS: readonly { name: string; hex: string }[] = [
  { name: 'Lime', hex: '#c8f04a' },
  { name: 'Citrus', hex: '#ffd23f' },
  { name: 'Mango', hex: '#ff8a3d' },
  { name: 'Peach', hex: '#ffa07a' },
  { name: 'Blossom', hex: '#ff6fa8' },
  { name: 'Lavender', hex: '#b18cff' },
  { name: 'Sky', hex: '#5ac8fa' },
  { name: 'Mint', hex: '#3ee6c4' },
];

export interface AccentPalette {
  acc: string; // on black: text, bars, buttons
  hi: string; // hover over acc
  soft: string; // a quiet fill on black
  deep: string; // on white: Cermin's lamp, Settings in light mode
  deepHi: string; // hover over deep
  deepSoft: string; // a quiet fill on white
  onAcc: string; // text on an acc fill
  rgb: string; // "r, g, b" of acc, for rgba(var(--v-acc-rgb), a)
}

// Lime's shades were picked by hand before the accent could change; they stay.
const LIME: AccentPalette = {
  acc: '#c8f04a', hi: '#d6f56e', soft: '#1d260b', deep: '#4c6b12', deepHi: '#5a7d17',
  deepSoft: 'rgba(76, 107, 18, 0.13)', onAcc: '#0f1404', rgb: '200, 240, 74',
};

const MIN_ON_BLACK = 6; // just under the darkest preset, so none of them moves
const MIN_DEEP_ON_WHITE = 5.5;
const MIN_SATURATION = 0.45;
const MAX_LIGHTNESS = 0.8;
const LIME_HUE = 74.5;

type Rgb = [number, number, number];

export function normalizeHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
}

const toRgb = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => `#${c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (c: Rgb, to: Rgb, t: number): Rgb => c.map((v, i) => v + (to[i] - v) * t) as Rgb;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

function luminance(c: Rgb): number {
  const [r, g, b] = c.map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// The WCAG ratio, 1 to 21.
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(toRgb(a)), luminance(toRgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const ratio = (c: Rgb, to: Rgb) => contrast(toHex(c), toHex(to));

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [LIME_HUE, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// A white or grey pick gets some colour; a dark one is lightened until it reads
// on the black notch (owner, 3 Nov: "diam diam menerangkan sedikit").
// Lightening raises the HSL lightness and keeps the hue and the saturation, so a
// near-black pick stays a colour instead of fading to grey.
function readable(c: Rgb): Rgb {
  const [h, s, l] = toHsl(c);
  if (s >= MIN_SATURATION && l <= MAX_LIGHTNESS && ratio(c, BLACK) >= MIN_ON_BLACK) return c;
  const sat = Math.max(s, MIN_SATURATION);
  let light = Math.min(l, MAX_LIGHTNESS);
  const at = (v: number) => fromHsl(h, sat, v).map(Math.round) as Rgb;
  let out = at(light);
  while (ratio(out, BLACK) < MIN_ON_BLACK && light < 1) {
    light = Math.min(1, light + 0.02);
    out = at(light);
  }
  return out;
}

export function accentPalette(hex: string): AccentPalette {
  const picked = normalizeHex(hex);
  if (picked === null || picked === DEFAULT_ACCENT) return LIME;
  const acc = readable(toRgb(picked));
  let deep = acc;
  for (let t = 0.02; ratio(deep, WHITE) < MIN_DEEP_ON_WHITE && t <= 1; t += 0.02) deep = mix(acc, BLACK, t);
  const deepRgb = toRgb(toHex(deep));
  return {
    acc: toHex(acc),
    hi: toHex(mix(acc, WHITE, 0.25)),
    soft: toHex(mix(BLACK, acc, 0.15)),
    deep: toHex(deepRgb),
    deepHi: toHex(mix(deepRgb, WHITE, 0.1)),
    deepSoft: `rgba(${deepRgb.join(', ')}, 0.13)`,
    onAcc: toHex(mix(BLACK, acc, 0.08)),
    rgb: toRgb(toHex(acc)).join(', '),
  };
}

export function applyAccent(root: HTMLElement, hex: string): void {
  const p = accentPalette(hex);
  const vars: [string, string][] = [
    ['--v-acc', p.acc], ['--v-acc-hi', p.hi], ['--v-acc-soft', p.soft], ['--v-acc-deep', p.deep],
    ['--v-acc-deep-hi', p.deepHi], ['--v-acc-deep-soft', p.deepSoft], ['--v-on-acc', p.onAcc], ['--v-acc-rgb', p.rgb],
  ];
  for (const [name, value] of vars) root.style.setProperty(name, value);
}
