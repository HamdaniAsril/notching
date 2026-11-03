// A one-column widget is about this wide (484 px row, 4 columns, 8 px gaps).
export const COLUMN_PX = 115;

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
