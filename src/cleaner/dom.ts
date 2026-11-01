export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function button(doc: Document, cls: string, text = ''): HTMLButtonElement {
  const b = el(doc, 'button', cls, text);
  b.type = 'button';
  return b;
}

// Drawn in currentColor, as in the mockups.
export const BROOM_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l-4 8"/><path d="M6 12h8l2 8H4z"/><path d="M8 16v4M12 16v4"/></svg>';
export const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>';
