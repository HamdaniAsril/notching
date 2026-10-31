import type { ShelfItem, ShelfState } from '../bridge';
import { fill, type HostStrings } from '../i18n';

// Past this many pixels with the button down, a press on a tile becomes a drag.
export const DRAG_SLOP = 4;
const NAME_MAX = 12;

// Titipan's tray, as in modules/shelf/icon.svg, drawn in currentColor for the pill.
export const SHELF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/></svg>';
const DROP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
const FOLDER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 7h6l2 2h10v10H3z"/></svg>';
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';

export interface ShelfViewDeps {
  strings: HostStrings['shelf'];
  startDrag(ids: number[]): void;
  remove(ids: number[]): void;
  clear(): void;
}

export interface ShelfView {
  render(s: ShelfState, dropping: boolean): void;
  destroy(): void;
}

// A long name cut in the middle, so its extension still shows (design 1 Nov §4).
export function middleTruncate(name: string, max = NAME_MAX): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot - 4) : '';
  const head = max - 1 - ext.length;
  if (ext && head >= 3) return `${name.slice(0, head)}…${ext}`;
  const back = Math.floor((max - 1) / 2);
  return `${name.slice(0, max - 1 - back)}…${name.slice(name.length - back)}`;
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// The shelf: its drop zone while a file drag is over the notch, else a head line
// and a grid of kept files. Click selects (Cmd adds, Shift a range, as in
// Finder); dragging a tile drags it, or the whole selection when it is in it.
export function mountShelfView(box: HTMLElement, deps: ShelfViewDeps): ShelfView {
  const doc = box.ownerDocument;
  const s = deps.strings;
  let items: ShelfItem[] = [];
  let selected = new Set<number>();
  let anchor: number | null = null;
  let built = ''; // what the tiles show, but their thumbs
  // A press on a tile that may become a drag.
  let press: { id: number; x: number; y: number; dragged: boolean } | null = null;

  const draggable = (i: ShelfItem | undefined) => i?.state === 'ready';

  function select(id: number, e: MouseEvent): void {
    const order = items.map(i => i.id);
    if (e.shiftKey && anchor !== null && order.includes(anchor)) {
      const [a, b] = [order.indexOf(anchor), order.indexOf(id)].sort((x, y) => x - y);
      selected = new Set(order.slice(a, b + 1));
    } else if (e.metaKey) {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      anchor = id;
    } else {
      selected = new Set([id]);
      anchor = id;
    }
    paintSelection();
  }

  function paintSelection(): void {
    box.querySelectorAll<HTMLElement>('.sh-tile').forEach(t => t.classList.toggle('sel', selected.has(Number(t.dataset.id))));
  }

  function onMove(e: MouseEvent): void {
    if (!press || press.dragged || (e.buttons & 1) === 0) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= DRAG_SLOP) return;
    press.dragged = true;
    const id = press.id;
    const ids = selected.has(id) ? items.filter(i => selected.has(i.id) && draggable(i)).map(i => i.id) : [id];
    if (ids.length > 0) deps.startDrag(ids);
  }

  function onUp(): void {
    // Cleared after the click that follows, so that click knows it was a drag.
    setTimeout(() => { if (press && !press.dragged) press = null; }, 0);
  }

  doc.addEventListener('mousemove', onMove);
  doc.addEventListener('mouseup', onUp);

  function image(src: string): HTMLImageElement {
    const img = el(doc, 'img');
    img.src = src;
    img.alt = '';
    img.draggable = false;
    return img;
  }

  function tile(i: ShelfItem): HTMLElement {
    const t = el(doc, 'div', ['sh-tile', i.state === 'ready' ? '' : i.state, selected.has(i.id) ? 'sel' : ''].filter(Boolean).join(' '));
    t.dataset.id = String(i.id);
    t.title = i.name;
    const thumb = el(doc, 'div', 'sh-thumb');
    if (i.thumb) {
      thumb.append(image(i.thumb));
    } else {
      thumb.innerHTML = i.folder ? FOLDER_ICON : FILE_ICON;
    }
    t.append(thumb, el(doc, 'span', 'sh-name', middleTruncate(i.name)));
    if (i.state !== 'ready') t.append(el(doc, 'span', 'sh-note', i.state === 'missing' ? s.missing : s.receiving));
    const x = el(doc, 'button', 'sh-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', s.remove);
    x.addEventListener('mousedown', e => e.stopPropagation());
    x.addEventListener('click', e => {
      e.stopPropagation();
      deps.remove([i.id]);
    });
    t.append(x);
    t.addEventListener('dragstart', e => e.preventDefault());
    t.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      press = draggable(i) ? { id: i.id, x: e.clientX, y: e.clientY, dragged: false } : null;
    });
    t.addEventListener('click', e => {
      const wasDrag = press?.dragged === true && press.id === i.id;
      press = null;
      if (!wasDrag) select(i.id, e);
    });
    return t;
  }

  return {
    render(state, dropping) {
      items = state.items;
      const ids = new Set(items.map(i => i.id));
      selected = new Set([...selected].filter(id => ids.has(id)));
      if (anchor !== null && !ids.has(anchor)) anchor = null;
      // Only previews came in (one at a time, as Quick Look makes them): the tiles
      // stay, so a press or click on one is not lost.
      const sig = JSON.stringify([dropping, items.map(i => [i.id, i.name, i.folder, i.state])]);
      if (sig === built && !dropping) {
        for (const i of items) {
          const thumb = box.querySelector<HTMLElement>(`.sh-tile[data-id="${i.id}"] .sh-thumb`);
          if (thumb && i.thumb && thumb.querySelector('img')?.getAttribute('src') !== i.thumb) thumb.replaceChildren(image(i.thumb));
        }
        return;
      }
      built = sig;
      if (dropping) {
        const zone = el(doc, 'div', 'sh-drop');
        zone.innerHTML = DROP_ICON;
        zone.append(el(doc, 'span', 'lab', s.drop));
        box.replaceChildren(zone);
        return;
      }
      const head = el(doc, 'div', 'sh-head');
      head.append(el(doc, 'span', 'lab sh-title', fill(s.title, { n: items.length })));
      if (items.length === 0) {
        box.replaceChildren(head, el(doc, 'div', 'sh-empty lab', s.empty));
        return;
      }
      const clear = el(doc, 'button', 'lab sh-clear', s.clear);
      clear.type = 'button';
      clear.addEventListener('click', () => deps.clear());
      head.append(el(doc, 'span', 'lab sh-hint', s.hint), clear);
      const grid = el(doc, 'div', 'sh-grid');
      grid.append(...items.map(tile));
      box.replaceChildren(head, grid);
    },
    destroy() {
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseup', onUp);
      box.replaceChildren();
    },
  };
}
