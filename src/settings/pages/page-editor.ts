import { fill } from '../../i18n';
import type { Page, WidgetKind } from '../../modules/types';
import { PAGE_ICON_NAMES, pageIconSvg } from '../../pages/icons';
import { COLUMNS, place, removeWidget, replaceAt, slots, swapInto, widgetCatalog, type CatalogWidget } from '../../pages/layout';
import { button, el, head } from '../controls';
import { columnAt, dragWith, liftGhost } from '../drag';
import { icon } from '../icons';
import type { PageContext, PageRender } from '../types';
import { UNINSTALL_CONFIRM_MS } from './modules';
import { arrived, pageIcon } from './pages';
import { widgetPreview, widgetSample } from './widget-preview';

const KINDS: WidgetKind[] = ['time', 'weather', 'worship', 'work', 'media'];

// The kind picked in the widget list; kept while the page is rebuilt, like the
// city search's draft in home.ts.
let filter: WidgetKind | 'all' = 'all';

function back(ctx: PageContext): HTMLElement {
  const b = el('button', 'back');
  b.type = 'button';
  b.dataset.key = 'pageEdit.back';
  b.append(icon('back'), el('span', undefined, ctx.strings.sections.pages));
  b.addEventListener('click', () => ctx.go({ page: 'pages' }));
  return b;
}

// The name, typed straight into the title.
function titleField(ctx: PageContext, page: Page, save: (next: Page) => void): HTMLInputElement {
  const name = el('input', 'ed-title');
  name.dataset.key = 'pageEdit.name';
  name.maxLength = 24;
  name.value = page.name ?? '';
  name.spellcheck = false;
  name.setAttribute('aria-label', ctx.strings.pages.name);
  const commit = () => {
    const v = name.value.trim();
    if (!v || v === page.name) return;
    page = { ...page, name: v };
    save(page);
  };
  name.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') name.value = page.name ?? '';
  });
  name.addEventListener('blur', commit);
  return name;
}

// The page's icon with a pencil mark; a click opens the 24 icons in a popup.
function iconPicker(ctx: PageContext, page: Page, save: (next: Page) => void): HTMLElement {
  const s = ctx.strings.pages;
  const wrap = el('div', 'ed-icon-wrap');
  const open = el('button', 'ico ed-icon-btn');
  open.type = 'button';
  open.dataset.key = 'pageEdit.icon';
  open.setAttribute('aria-label', s.changeIcon);
  open.setAttribute('aria-haspopup', 'true');
  open.setAttribute('aria-expanded', 'false');
  const mark = icon('pencil');
  mark.classList.add('ed-edit');
  open.append(pageIcon(pageIconSvg(page.icon)), mark);
  wrap.append(open);

  const doc = wrap.ownerDocument;
  let popup: HTMLElement | null = null;
  const close = () => {
    popup?.remove();
    popup = null;
    open.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('pointerdown', onOutside);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    close();
    open.focus();
  };
  const onOutside = (e: Event) => { if (!wrap.contains(e.target as Node)) close(); };
  open.addEventListener('click', () => {
    if (popup) {
      close();
      return;
    }
    popup = el('div', 'ed-icons');
    popup.setAttribute('role', 'group');
    popup.setAttribute('aria-label', s.icon);
    for (const n of PAGE_ICON_NAMES) {
      const b = el('button', n === page.icon ? 'on' : undefined);
      b.type = 'button';
      b.dataset.key = `pageEdit.icon.${n}`;
      b.setAttribute('aria-pressed', String(n === page.icon));
      b.setAttribute('aria-label', n);
      b.innerHTML = pageIconSvg(n); // one of the fixed icons, never the person's text
      b.addEventListener('click', () => {
        close();
        if (n !== page.icon) save({ ...page, icon: n });
      });
      popup.append(b);
    }
    wrap.append(popup);
    open.setAttribute('aria-expanded', 'true');
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('pointerdown', onOutside);
    popup.querySelector<HTMLElement>('.on')?.focus();
  });
  ctx.onCleanup(close);
  return wrap;
}

// Deleting takes a second click within a few seconds, like uninstalling a module.
function deleteButton(ctx: PageContext, id: string): HTMLElement {
  const s = ctx.strings.pages;
  let cancel: (() => void) | null = null;
  const reset = () => {
    cancel = null;
    del.textContent = s.delete;
    del.classList.remove('confirm');
  };
  const del = button('pageEdit.delete', s.delete, () => {
    if (!cancel) {
      del.textContent = s.deleteConfirm;
      del.classList.add('confirm');
      cancel = ctx.env.setTimer(reset, UNINSTALL_CONFIRM_MS);
      return;
    }
    cancel();
    reset();
    const pending = ctx.bridge.deletePage(id);
    ctx.save(`page.${id}`, pending);
    pending.then(() => ctx.go({ page: 'pages' }), () => {});
  });
  ctx.onCleanup(() => cancel?.());
  const foot = el('div', 'foot');
  foot.append(el('span'), del);
  return foot;
}

// Highlights where a drag `width` columns wide lands with the pointer over `col`:
// the whole widget there, which it trades places with, or the free cells it takes.
function markColumns(row: HTMLElement, col: number | null, width: number): void {
  const cells = [...row.querySelectorAll<HTMLElement>('.ed-slot, .ed-empty')];
  const span = (cell: HTMLElement) => [Number(cell.dataset.col), Number(cell.dataset.width)];
  const hit = col === null ? undefined : cells.find(cell => {
    const [from, w] = span(cell);
    return cell.classList.contains('ed-slot') && !cell.classList.contains('ed-dragging') && from <= col && col < from + w;
  });
  const at = col === null ? null : Math.max(0, Math.min(COLUMNS - width, col));
  for (const cell of cells) {
    const [from, w] = span(cell);
    const on = hit ? cell === hit : at !== null && from < at + width && at < from + w;
    cell.classList.toggle('ed-target', on);
  }
}

function inside(row: HTMLElement, x: number, y: number): DOMRect | null {
  const r = row.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? r : null;
}

// Drags `from`, `width` columns wide: a copy of it follows the pointer while the
// original fades, and when let go over the row the column under it is handed over.
function dragToRow(e: PointerEvent, from: HTMLElement, width: number, row: () => HTMLElement,
  drop: (col: number) => void): void {
  let ghost: ReturnType<typeof liftGhost> | null = null;
  const at = (x: number, y: number) => {
    const r = inside(row(), x, y);
    return r ? columnAt(r.left, r.width, x) : null;
  };
  const end = () => {
    from.classList.remove('ed-dragging');
    markColumns(row(), null, width);
    ghost?.end();
    ghost = null;
  };
  const [sx, sy] = [e.clientX, e.clientY];
  dragWith(e, {
    onMove: (x, y) => {
      if (!ghost) {
        ghost = liftGhost(from, sx, sy);
        from.classList.add('ed-dragging');
      }
      ghost.move(x, y);
      markColumns(row(), at(x, y), width);
    },
    onDrop: (x, y) => {
      const col = at(x, y);
      end();
      if (col !== null) drop(col);
    },
    onCancel: end,
  });
}

function preview(ctx: PageContext, page: Page, catalog: Map<string, CatalogWidget>, save: (next: Page) => void): HTMLElement {
  const s = ctx.strings.pages;
  const row = el('div', 'ed-row');
  const taken = new Set<number>();
  for (const { placement, widget } of slots(page, catalog)) {
    const name = widget?.name ?? placement.widget;
    const slot = el('div', widget ? 'ed-slot' : 'ed-slot off');
    slot.dataset.col = String(placement.col);
    slot.dataset.width = String(placement.width);
    slot.style.gridColumn = `${placement.col + 1} / span ${placement.width}`;
    slot.setAttribute('aria-label', name);
    slot.title = name;
    if (widget) slot.append(...widgetSample(widget, ctx.lang));
    else slot.append(el('div', 'lab', name), el('small', undefined, s.sourceOff));
    const remove = el('button', 'ed-remove', '×');
    remove.type = 'button';
    remove.dataset.key = `pageEdit.remove.${placement.widget}`;
    remove.setAttribute('aria-label', fill(s.remove, { name }));
    remove.addEventListener('click', () => save({ ...page, widgets: removeWidget(page.widgets, placement.widget) }));
    remove.addEventListener('pointerdown', e => e.stopPropagation());
    slot.append(remove);
    // Dropped on another widget, the two trade places.
    slot.addEventListener('pointerdown', e => dragToRow(e, slot, placement.width, () => row, col => {
      const next = swapInto(page.widgets, placement.widget, col);
      if (next) save({ ...page, widgets: next });
    }));
    for (let c = placement.col; c < placement.col + placement.width; c++) taken.add(c);
    row.append(slot);
  }
  for (let c = 0; c < COLUMNS; c++) {
    if (taken.has(c)) continue;
    const empty = el('div', 'ed-empty', s.empty);
    empty.dataset.col = String(c);
    empty.dataset.width = '1';
    empty.style.gridColumn = `${c + 1}`;
    row.append(empty);
  }
  return row;
}

// The row as wide as in the notch (520 px and its 18 px sides), and the room the
// ears and the strip around it take.
const ROW_PX = 556;
const AROUND_PX = 56;

// The row inside a panel shaped like the open notch: square on top where it
// meets the screen's edge, round below. It is drawn at the notch's own size and
// scaled down as a whole to fit the window; negative margins give back the room
// the scale frees, since a transform keeps the full-size box.
function notchFrame(ctx: PageContext, row: HTMLElement): HTMLElement {
  const notch = el('div', 'ed-notch');
  notch.append(row);
  const fit = () => {
    const room = notch.clientWidth - AROUND_PX;
    if (room <= 0) return;
    const z = Math.min(1, room / ROW_PX);
    row.style.transform = z < 1 ? `scale(${z})` : '';
    row.style.marginInline = `${(-ROW_PX * (1 - z)) / 2}px`;
    row.style.marginBottom = `${-row.offsetHeight * (1 - z)}px`;
  };
  if (typeof ResizeObserver !== 'undefined') {
    const watch = new ResizeObserver(fit);
    watch.observe(notch);
    ctx.onCleanup(() => watch.disconnect());
  }
  return notch;
}

function widgetList(ctx: PageContext, page: Page, catalog: Map<string, CatalogWidget>, row: () => HTMLElement,
  save: (next: Page) => void, redraw: () => void): HTMLElement[] {
  const s = ctx.strings.pages;
  const all = [...catalog.values()];
  const kinds = KINDS.filter(k => all.some(w => w.kind === k));
  if (filter !== 'all' && !kinds.includes(filter)) filter = 'all';

  const chips = el('div', 'ed-filter');
  for (const k of ['all', ...kinds] as const) {
    const b = el('button', filter === k ? 'on' : undefined, k === 'all' ? s.all : s.kinds[k]);
    b.type = 'button';
    b.dataset.key = `pageEdit.filter.${k}`;
    b.setAttribute('aria-pressed', String(filter === k));
    b.addEventListener('click', () => {
      filter = k;
      redraw();
    });
    chips.append(b);
  }

  const list = el('div', 'ed-widgets');
  for (const w of all.filter(x => filter === 'all' || x.kind === filter)) {
    const here = page.widgets.some(p => p.widget === w.ref);
    const placed = here ? null : place(page.widgets, w.ref, w.width);
    // A picture of the widget with its name below; a 2-column widget is twice as wide.
    const b = el('button', 'ed-widget');
    b.type = 'button';
    b.dataset.key = `pageEdit.widget.${w.ref}`;
    b.dataset.width = String(w.width);
    b.title = `${s.kinds[w.kind]} · ${fill(s.cols, { n: w.width })}`;
    b.append(widgetPreview(w, ctx.lang), el('span', 'ed-name', w.name));
    if (!placed) {
      b.setAttribute('aria-disabled', 'true');
      b.classList.toggle('ed-full', !here);
      b.append(el('small', 'ed-why', here ? s.placed : s.noRoom));
    }
    b.addEventListener('click', () => { if (placed) save({ ...page, widgets: placed }); });
    // Dropped on free room it goes there; on a widget it takes that widget's place.
    if (!here) {
      b.addEventListener('pointerdown', e => dragToRow(e, b, w.width, row, col => {
        const next = place(page.widgets, w.ref, w.width, col) ?? replaceAt(page.widgets, w.ref, w.width, col);
        if (next) save({ ...page, widgets: next });
      }));
    }
    list.append(b);
  }
  return [chips, list];
}

// One page of the pill (design 30 Oct §9): a preview of its row, the widgets to
// put in it and, for a custom page, its name, icon and delete. Every change sends
// the whole page; the editor shows it at once and the broadcast that follows
// rebuilds it from the native side's answer.
export const pageEditor: PageRender = (ctx, route) => {
  const s = ctx.strings.pages;
  const id = route.page === 'pageEdit' ? route.id : '';
  const out = el('div');
  out.append(back(ctx));
  const found = ctx.state.pages.find(p => p.id === id);
  // A page just added whose state is still on its way.
  if (!found) return out;
  const fresh = arrived(id);

  let page = found;
  const home = id === 'home';
  const catalog = widgetCatalog(ctx.state);
  const body = el('div', 'ed-body');

  const save = (next: Page) => {
    page = next;
    ctx.save(`page.${id}`, ctx.bridge.setPage(id, home ? null : next.name, next.icon, next.widgets));
    draw();
  };
  function draw(): void {
    const focus = (body.ownerDocument.activeElement as HTMLElement | null)?.dataset.key;
    const row = preview(ctx, page, catalog, save);
    body.replaceChildren(
      el('div', 'grp-label', s.preview), notchFrame(ctx, row),
      el('div', 'grp-label', s.widgetList), ...widgetList(ctx, page, catalog, () => row, save, draw),
    );
    if (focus) body.querySelector<HTMLElement>(`[data-key="${focus}"]`)?.focus();
  }
  draw();

  if (home) {
    const top = head({ title: ctx.strings.home.homeName, sub: s.fixedHint, icon: pageIcon(pageIconSvg(page.icon)) });
    top.dataset.row = `page.${id}`;
    out.append(top, body);
    return out;
  }
  // Name and icon are edited in the head itself; the widgets sent with them are always the latest.
  const keepWidgets = (next: Page) => save({ ...next, widgets: page.widgets });
  const top = el('div', 'head');
  top.dataset.row = `page.${id}`;
  const title = el('h1');
  const name = titleField(ctx, page, keepWidgets);
  title.append(name);
  const titles = el('div', 'titles');
  titles.append(title);
  top.append(iconPicker(ctx, page, keepWidgets), titles);
  out.append(top, body, deleteButton(ctx, id));
  // A page just added: ready to type its name over the placeholder one.
  if (fresh) {
    queueMicrotask(() => {
      name.focus();
      name.select();
    });
  }
  return out;
};
