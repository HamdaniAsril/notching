import type { CleanStrings } from '../i18n';

// Esc presses that end Keyboard Cleaning Mode (ESC_PRESSES in src-tauri/src/keyclean.rs).
export const ESC_PRESSES = 5;

function el(doc: Document, tag: string, cls: string, text = ''): HTMLElement {
  const e = doc.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

// Mockup C (2026-10-31-keyboard-clean-mockups/clean-look.html): the title, five
// esc keys that light up one per press, and how to leave. Classes start with kc-.
export function renderClean(root: HTMLElement, s: CleanStrings): { update(presses: number): void } {
  const doc = root.ownerDocument;
  const keys = el(doc, 'div', 'kc-keys');
  const each = Array.from({ length: ESC_PRESSES }, () => el(doc, 'span', 'kc-key', 'esc'));
  keys.append(...each);
  const box = el(doc, 'div', 'kc-box');
  box.append(el(doc, 'div', 'kc-title', s.title), keys, el(doc, 'div', 'kc-hint', s.hint));
  root.replaceChildren(box);
  return {
    update(presses) {
      each.forEach((k, i) => k.classList.toggle('kc-on', i < presses));
    },
  };
}
