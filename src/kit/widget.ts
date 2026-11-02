import { dotText, fitPitch } from './dots';

// A one-column widget is about this wide (520 px panel, 4 columns, 16 px gaps).
export const COLUMN_PX = 109;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function svgBox(cls: string, svg: string): HTMLDivElement {
  const d = el('div', cls);
  d.innerHTML = svg;
  return d;
}

// A big dot-matrix number at the shared size, one dot smaller if the column is too narrow.
export function big(root: HTMLElement, text: string, cls = 'wd-big'): HTMLDivElement {
  return svgBox(cls, dotText(text, fitPitch(text, root.clientWidth || COLUMN_PX)));
}

// A small dot-matrix text (pitch 2 or 3: 14 or 21 px tall).
export function small(text: string, pitch: 2 | 3, cls = 'wd-small'): HTMLDivElement {
  return svgBox(cls, dotText(text, pitch));
}

// `count` 5 px dots spread across the width: the first `lit` white, `now` a bigger red one, the rest dim.
export function dotRow(count: number, lit: number, now: number | null, cls = 'wd-row'): HTMLDivElement {
  const row = el('div', cls);
  for (let i = 0; i < count; i++) {
    const d = el('span', i === now ? 'd now' : i < lit ? 'd lit' : 'd');
    row.append(d);
  }
  return row;
}
