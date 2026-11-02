import { el } from './widget';

// Volt building blocks for page widgets (styles in volt.css).

// A big number in Barlow Condensed at an exact pixel size.
export function num(text: string, px: number, cls = ''): HTMLDivElement {
  const n = el('div', cls ? `v-num ${cls}` : 'v-num', text);
  n.style.fontSize = `${px}px`;
  return n;
}

// A thin progress track; `frac` is clamped to 0..1.
export function bar(frac: number, cls = ''): HTMLDivElement {
  const b = el('div', cls ? `v-bar ${cls}` : 'v-bar');
  const fill = el('span', 'v-fill');
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, frac)) * 10000) / 100}%`;
  b.append(fill);
  return b;
}

// `count` segments; a number lights the first `lit`, an array lights those indices.
export function segs(count: number, lit: number | number[], cls = ''): HTMLDivElement {
  const row = el('div', cls ? `v-segs ${cls}` : 'v-segs');
  for (let i = 0; i < count; i++) {
    const on = typeof lit === 'number' ? i < lit : lit.includes(i);
    row.append(el('span', on ? 'v-seg on' : 'v-seg'));
  }
  return row;
}

// A small label in Inter.
export function lab(text: string, cls = ''): HTMLSpanElement {
  return el('span', cls ? `v-lab ${cls}` : 'v-lab', text);
}
