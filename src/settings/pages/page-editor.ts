import { fill } from '../../i18n';
import type { Page, WidgetKind } from '../../modules/types';
import { PAGE_ICON_NAMES, pageIconSvg } from '../../pages/icons';
import { COLUMNS, moveTo, place, removeWidget, slots, widgetCatalog, type CatalogWidget } from '../../pages/layout';
import { button, el, head } from '../controls';
import { columnAt, dragWith } from '../drag';
import { icon } from '../icons';
import type { PageContext, PageRender } from '../types';
import { UNINSTALL_CONFIRM_MS } from './modules';
import { arrived, pageIcon } from './pages';

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

// Name, icon and delete for a custom page; Beranda keeps all three.
function identity(ctx: PageContext, page: Page, save: (next: Page) => void): HTMLElement[] {
  const s = ctx.strings.pages;
  const name = el('input', 'field ed-name-field');
  name.dataset.key = 'pageEdit.name';
  name.maxLength = 24;
  name.value = page.name ?? '';
  name.setAttribute('aria-label', s.name);
  const commit = () => {
    const v = name.value.trim();
    if (!v || v === page.name) return;
    page = { ...page, name: v };
    save(page);
  };
  name.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
  name.addEventListener('blur', commit);

  const icons = el('div', 'ed-icons');
  icons.setAttribute('role', 'group');
  icons.setAttribute('aria-label', s.icon);
  for (const n of PAGE_ICON_NAMES) {
    const b = el('button', n === page.icon ? 'on' : undefined);
    b.type = 'button';
    b.dataset.key = `pageEdit.icon.${n}`;
    b.setAttribute('aria-pressed', String(n === page.icon));
    b.setAttribute('aria-label', n);
    b.innerHTML = pageIconSvg(n); // one of the fixed icons, never the person's text
    b.addEventListener('click', () => { if (n !== page.icon) save({ ...page, icon: n }); });
    icons.append(b);
  }

  // Deleting takes a second click within a few seconds, like uninstalling a module.
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
    const pending = ctx.bridge.deletePage(page.id);
    ctx.save(`page.${page.id}`, pending);
    pending.then(() => ctx.go({ page: 'pages' }), () => {});
  });
  ctx.onCleanup(() => cancel?.());

  const nameRow = el('div', 'row');
  nameRow.append(el('span', 'label', s.name), name);
  const iconRow = el('div', 'row ed-icon-row');
  iconRow.append(el('span', 'label', s.icon), icons);
  const foot = el('div', 'foot');
  foot.append(el('span'), del);
  return [nameRow, iconRow, foot];
}

// Highlights the cell a drag would land on.
function markColumn(row: HTMLElement, col: number | null): void {
  for (const cell of row.querySelectorAll<HTMLElement>('.ed-slot, .ed-empty')) {
    const from = Number(cell.dataset.col);
    const on = col !== null && col >= from && col < from + Number(cell.dataset.width);
    cell.classList.toggle('ed-target', on);
  }
}

function inside(row: HTMLElement, x: number, y: number): DOMRect | null {
  const r = row.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? r : null;
}

// Drags `from` and, when let go over the row, hands over the column under the pointer.
function dragToRow(e: PointerEvent, from: HTMLElement, row: () => HTMLElement, drop: (col: number) => void): void {
  from.classList.add('ed-dragging');
  const at = (x: number, y: number) => {
    const r = inside(row(), x, y);
    return r ? columnAt(r.left, r.width, x) : null;
  };
  const end = () => {
    from.classList.remove('ed-dragging');
    markColumn(row(), null);
  };
  dragWith(e, {
    onMove: (x, y) => markColumn(row(), at(x, y)),
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
    const label = el('span', 'ed-name', name);
    slot.append(label);
    if (!widget) slot.append(el('small', undefined, s.sourceOff));
    const remove = el('button', 'ed-remove', '×');
    remove.type = 'button';
    remove.dataset.key = `pageEdit.remove.${placement.widget}`;
    remove.setAttribute('aria-label', fill(s.remove, { name }));
    remove.addEventListener('click', () => save({ ...page, widgets: removeWidget(page.widgets, placement.widget) }));
    remove.addEventListener('pointerdown', e => e.stopPropagation());
    slot.append(remove);
    slot.addEventListener('pointerdown', e => dragToRow(e, slot, () => row, col => {
      const next = moveTo(page.widgets, placement.widget, col);
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
    const b = el('button', 'ed-widget');
    b.type = 'button';
    b.dataset.key = `pageEdit.widget.${w.ref}`;
    b.append(el('span', 'ed-name', w.name), el('small', 'ed-kind', `${s.kinds[w.kind]} · ${fill(s.cols, { n: w.width })}`));
    if (!placed) {
      b.setAttribute('aria-disabled', 'true');
      b.append(el('small', 'ed-why', here ? s.placed : s.noRoom));
    }
    b.addEventListener('click', () => { if (placed) save({ ...page, widgets: placed }); });
    if (!here) {
      b.addEventListener('pointerdown', e => dragToRow(e, b, row, col => {
        const next = place(page.widgets, w.ref, w.width, col);
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
  arrived(id);

  let page = found;
  const home = id === 'home';
  const catalog = widgetCatalog(ctx.state);
  const top = head({
    title: page.name ?? ctx.strings.home.homeName,
    sub: home ? s.fixedHint : undefined,
    icon: pageIcon(pageIconSvg(page.icon)),
  });
  top.dataset.row = `page.${id}`;
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
      el('div', 'grp-label', s.preview), row,
      el('div', 'grp-label', s.widgetList), ...widgetList(ctx, page, catalog, () => row, save, draw),
    );
    if (focus) body.querySelector<HTMLElement>(`[data-key="${focus}"]`)?.focus();
  }
  draw();

  out.append(top);
  if (home) {
    out.append(body);
    return out;
  }
  // Name and icon come from the editor's copy; the widgets are always the latest.
  const [nameRow, iconRow, foot] = identity(ctx, page, next => save({ ...next, widgets: page.widgets }));
  out.append(nameRow, iconRow, body, foot);
  return out;
};
