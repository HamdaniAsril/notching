import { applyAccent } from '../kit/accent';
import type { Lang } from '../kit/protocol';
import { fill, peekStrings } from '../i18n';
import { dark, el, ICON, picture, type PeekView } from './view';

// Same shapes as SwitchViewDto in src-tauri/src/switch_service.rs.
export interface SwitchItem {
  kind: 'window' | 'app';
  pid: number;
  id: number | null; // the window's number; null for an app card
  title: string;
  appName: string;
  minimized: boolean;
  icon: string | null;
}
export interface SwitchApp { pid: number; name: string; icon: string | null; count: number }
export interface SwitchView {
  items: SwitchItem[];
  apps: SwitchApp[];
  sel: number; // per window: the item; per app: the app
  win: number; // per app: the chosen app's window
  layout: 'windows' | 'apps';
  place: 'center' | 'notch';
  card: PeekView['card'];
  material: PeekView['material'];
  accent: string;
  lang: Lang;
  sticky: boolean; // after a window button: letting go of ⌘ no longer opens
  maxWidth?: number;
}
export type SwitchAct = 'minimize' | 'close' | 'quit';

// What the switcher asks of the native side. `index` is the item (per window)
// or the app (per app); `win` the app's window, per app only.
export interface SwitchCalls {
  size(w: number, h: number): void;
  pointer(inside: boolean): void;
  pick(index: number, win: number | null): void;
  open(index: number, win: number | null): void;
  act(index: number, win: number | null, act: SwitchAct): void;
  picture(id: number): Promise<string | null>;
}

interface Pointer { at: string | null; inside: boolean }
const POINTERS = new WeakMap<HTMLElement, Pointer>();
const pointerOf = (root: HTMLElement): Pointer => {
  let p = POINTERS.get(root);
  if (!p) POINTERS.set(root, p = { at: null, inside: false });
  return p;
};

const where = (e: HTMLElement): [number, number | null] =>
  [Number(e.dataset.index), e.dataset.win === undefined ? null : Number(e.dataset.win)];

// The panel is never key, so the native side sends where the pointer is: this
// picks the card or app under it and lights the button there.
export function pointSwitcher(root: HTMLElement, target: Element | null, calls: SwitchCalls): void {
  const p = pointerOf(root);
  const inside = !!(target && root.querySelector('#sw')?.contains(target));
  if (inside !== p.inside) {
    p.inside = inside;
    calls.pointer(inside);
  }
  const card = inside ? target!.closest<HTMLElement>('.sc, .ap') : null;
  const ab = inside ? target!.closest<HTMLElement>('.ab') : null;
  root.querySelectorAll('.ab.hover').forEach(e => { if (e !== ab) e.classList.remove('hover'); });
  ab?.classList.add('hover');
  const at = card ? `${card.dataset.index}/${card.dataset.win ?? ''}` : null;
  if (card && at !== p.at) calls.pick(...where(card));
  p.at = at;
}

function buttons(item: SwitchItem, app: string, s: ReturnType<typeof peekStrings>): HTMLElement {
  const acts = el('div', 'acts');
  const list: [SwitchAct, string, string, string][] = item.kind === 'window'
    ? [['minimize', 'min', item.minimized ? s.restore : s.minimize, item.minimized ? ICON.restore : ICON.minimize],
      ['close', 'close', s.close, ICON.close], ['quit', 'quit', fill(s.quit, { app }), ICON.quit]]
    : [['quit', 'quit', fill(s.quit, { app }), ICON.quit]];
  for (const [act, cls, label, svg] of list) {
    const b = el('button', `ab ${cls}`);
    b.type = 'button';
    b.dataset.act = act;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = svg;
    acts.append(b);
  }
  return acts;
}

function card(item: SwitchItem, index: number, win: number | null, chosen: boolean, s: ReturnType<typeof peekStrings>,
  calls: SwitchCalls): HTMLElement {
  const c = el('div', ['sc', item.kind === 'app' ? 'app' : '', item.minimized ? 'min' : '', chosen ? 'sel' : ''].filter(Boolean).join(' '));
  c.dataset.index = String(index);
  if (win !== null) c.dataset.win = String(win);
  const box = el('div', 'box');
  box.append(picture(item.icon, item.title, 'icon'));
  const cap = el('div', 'cap');
  const ico = picture(item.icon, item.appName, 'ico');
  cap.append(ico, el('span', undefined, item.title || item.appName));
  if (item.minimized) cap.append(el('i', 'chip', s.min));
  c.append(box, cap, buttons(item, item.appName, s));
  c.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (b) calls.act(index, win, b.dataset.act as SwitchAct);
    else calls.open(index, win);
  });
  if (item.kind === 'window' && item.id !== null) {
    const id = item.id;
    void calls.picture(id).then(src => {
      if (src && c.isConnected) box.replaceChildren(picture(src, item.title));
    });
  }
  return c;
}

// The window switcher (design 5 Nov §2.3, prototype): every window as a card,
// or the apps in a row with the chosen app's windows under them; centred, or
// dropping from the notch.
export function renderSwitcher(root: HTMLElement, v: SwitchView, calls: SwitchCalls): void {
  const s = peekStrings(v.lang);
  applyAccent(document.documentElement, v.accent);
  const entering = !root.firstChild;
  const sw = el('div', [v.place, dark(v.card) ? 'card-dark' : 'card-light', `mat-${v.material}`].join(' '));
  sw.id = 'sw';
  if (v.maxWidth) sw.style.setProperty('--max-w', `${v.maxWidth}px`);
  if (entering) sw.dataset.enter = '';

  const head = el('div', 'swh');
  const count = v.layout === 'windows'
    ? fill(v.items.length === 1 ? s.window : s.windows, { n: v.items.length })
    : fill(v.apps.length === 1 ? s.app : s.apps, { n: v.apps.length });
  const keys = v.sticky ? s.keysSticky : v.layout === 'apps' ? s.keysApps : s.keys;
  head.append(el('span', 'cond', count), el('span', 'keys', keys));
  sw.append(head);

  if (v.layout === 'windows') {
    const grid = el('div', 'swgrid');
    v.items.forEach((item, i) => grid.append(card(item, i, null, i === v.sel, s, calls)));
    sw.append(grid);
  } else {
    const row = el('div', 'apps');
    v.apps.forEach((a, i) => {
      const ap = el('div', i === v.sel ? 'ap sel' : 'ap');
      ap.dataset.index = String(i);
      ap.append(picture(a.icon, a.name, 'di'), el('div', 'nm', a.name));
      if (a.count > 1) ap.append(el('i', 'n', String(a.count)));
      ap.addEventListener('click', () => calls.open(i, null));
      row.append(ap);
    });
    const chosen = v.apps[v.sel];
    const sub = el('div', 'subwins');
    const windows = v.items.filter(it => it.kind === 'window' && it.pid === chosen?.pid);
    windows.forEach((item, j) => sub.append(card(item, v.sel, j, j === v.win, s, calls)));
    sw.append(row, sub);
  }
  root.replaceChildren(sw);
  calls.size(sw.offsetWidth, sw.offsetHeight);
}
