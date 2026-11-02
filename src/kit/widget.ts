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
