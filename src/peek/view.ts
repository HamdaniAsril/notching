import { applyAccent } from '../kit/accent';
import type { Lang } from '../kit/protocol';
import { fill, peekStrings } from '../i18n';

// Same shapes as PeekViewDto and WindowAct in src-tauri/src/peek_service.rs.
export interface PeekWindow { id: number; title: string; minimized: boolean; front: boolean }
export interface PeekView {
  app: string;
  icon: string | null; // the app's icon as a data URL, until a window's picture comes
  windows: PeekWindow[];
  card: 'system' | 'light' | 'dark';
  material: 'solid' | 'glass';
  accent: string;
  lang: Lang;
  maxWidth?: number; // the screen's visible width less its margins: the cards wrap there
}
export type WindowAct = 'minimize' | 'restore' | 'close' | 'quit';

// What the card asks of the native side (main.ts turns these into commands).
export interface PeekCalls {
  size(w: number, h: number): void;
  pointer(inside: boolean): void;
  open(id: number): void;
  act(id: number, act: WindowAct): void;
  hover(id: number | null): void;
  picture(id: number): Promise<string | null>;
}

const ICON: Record<'minimize' | 'restore' | 'close' | 'quit', string> = {
  minimize: '<svg viewBox="0 0 16 16"><path d="M4 8.5h8"/></svg>',
  restore: '<svg viewBox="0 0 16 16"><path d="M5 11l6-6M6.5 5H11v4.5"/></svg>',
  close: '<svg viewBox="0 0 16 16"><path d="M5 5l6 6M11 5l-6 6"/></svg>',
  quit: '<svg viewBox="0 0 16 16"><path d="M8 2.8v5"/><path d="M5 4.8a4.4 4.4 0 1 0 6 0"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// The cards' colour: "system" follows the Mac's light or dark.
function dark(card: PeekView['card']): boolean {
  if (card !== 'system') return card === 'dark';
  return typeof matchMedia !== 'function' || matchMedia('(prefers-color-scheme: dark)').matches;
}

function picture(src: string | null, alt: string, cls?: string): HTMLElement {
  if (!src) return el('span', 'blank');
  const img = el('img', cls);
  img.src = src;
  img.alt = alt;
  img.draggable = false;
  return img;
}

// Where the pointer is, per card root: the window peeked at and whether the
// pointer is on the card at all.
interface Pointer { hovered: number | null; inside: boolean }
const POINTERS = new WeakMap<HTMLElement, Pointer>();
const pointerOf = (root: HTMLElement): Pointer => {
  let p = POINTERS.get(root);
  if (!p) POINTERS.set(root, p = { hovered: null, inside: false });
  return p;
};

// The panel is never key, so WebKit gives it no hover (shot_pick.rs): the
// native side sends where the pointer is, and this lights the card and button
// under it and tells which window to peek at. `target`: the element there, or
// null off the card.
export function pointPeek(root: HTMLElement, target: Element | null, calls: PeekCalls): void {
  const p = pointerOf(root);
  const peek = root.querySelector('#peek');
  const inside = !!(target && peek?.contains(target));
  if (inside !== p.inside) {
    p.inside = inside;
    calls.pointer(inside);
  }
  const th = inside ? target!.closest<HTMLElement>('.th') : null;
  const ab = inside ? target!.closest<HTMLElement>('.ab') : null;
  root.querySelectorAll('.th.hover, .ab.hover').forEach(e => {
    if (e !== th && e !== ab) e.classList.remove('hover');
  });
  th?.classList.add('hover');
  ab?.classList.add('hover');
  const id = th ? Number(th.dataset.id) : null;
  if (id !== p.hovered) {
    p.hovered = id;
    calls.hover(id);
  }
}

// Intip jendela's card (design 5 Nov §2, prototype): the app's name and count,
// then one card per window with its marks and its three buttons. Each window
// starts with the app's icon; its picture takes that place once it comes.
export function renderPeek(root: HTMLElement, v: PeekView, calls: PeekCalls): void {
  const s = peekStrings(v.lang);
  applyAccent(document.documentElement, v.accent);
  const entering = !root.firstChild;
  const peek = el('div', `${dark(v.card) ? 'card-dark' : 'card-light'} mat-${v.material}`);
  peek.id = 'peek';
  if (v.maxWidth) peek.style.setProperty('--max-w', `${v.maxWidth}px`);
  const p = pointerOf(root);
  // Rises in only as the panel appears, not when it changes to another app.
  if (entering) peek.dataset.enter = '';

  const head = el('div', 'ph');
  const n = v.windows.length;
  head.append(el('span', 'nm', v.app), el('span', 'ct', n ? fill(n === 1 ? s.window : s.windows, { n }) : ''));
  peek.append(head);
  if (!n) peek.append(el('div', 'empty', s.empty));

  const thumbs = el('div', 'thumbs');
  for (const w of v.windows) {
    const title = w.title || v.app;
    const th = el('div', w.minimized ? 'th min' : 'th');
    th.dataset.id = String(w.id);
    const box = el('div', 'box');
    box.append(picture(v.icon, title, 'icon'));
    const cap = el('div', 'cap');
    cap.append(el('span', undefined, title));
    if (w.front) cap.append(el('i', 'chip acc', s.front));
    else if (w.minimized) cap.append(el('i', 'chip', s.minimized));
    const acts = el('div', 'acts');
    const first = w.minimized ? 'restore' : 'minimize';
    for (const [act, cls, label] of [
      [first, 'min', w.minimized ? s.restore : s.minimize],
      ['close', 'close', s.close],
      ['quit', 'quit', fill(s.quit, { app: v.app })],
    ] as const) {
      const b = el('button', `ab ${cls}`);
      b.type = 'button';
      b.dataset.act = act;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = ICON[act];
      acts.append(b);
    }
    th.append(box, cap, acts);
    th.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (b) calls.act(w.id, b.dataset.act as WindowAct);
      else calls.open(w.id);
    });
    if (w.id === p.hovered) th.classList.add('hover');
    thumbs.append(th);
    void calls.picture(w.id).then(src => {
      if (src && th.isConnected) box.replaceChildren(picture(src, title));
    });
  }
  peek.append(thumbs);
  root.replaceChildren(peek);
  // The window peeked at is gone (closed, or minimized and hidden): stop peeking.
  if (p.hovered !== null && !v.windows.some(w => w.id === p.hovered)) {
    p.hovered = null;
    calls.hover(null);
  }
  calls.size(peek.offsetWidth, peek.offsetHeight);
}
