import type { ModuleState, Page, Placement, WidgetInfo } from '../modules/types';

// One row of 4 equal columns; a widget takes 1 or 2 (design 30 Oct §4).
export const COLUMNS = 4;

export interface CatalogWidget extends WidgetInfo {
  ref: string; // "<package>/<widget>"
  moduleId: string;
}

// A placement, with its widget unless the widget's package is off or gone.
export interface Slot {
  placement: Placement;
  widget: CatalogWidget | null;
}

// Every widget the packages that are installed and on offer, in catalog order.
export function widgetCatalog(s: ModuleState): Map<string, CatalogWidget> {
  const out = new Map<string, CatalogWidget>();
  for (const m of s.modules) {
    if (!m.installed || !m.enabled) continue;
    for (const w of m.widgets) out.set(`${m.id}/${w.id}`, { ...w, ref: `${m.id}/${w.id}`, moduleId: m.id });
  }
  return out;
}

export function slots(page: Page, catalog: Map<string, CatalogWidget>): Slot[] {
  return [...page.widgets]
    .sort((a, b) => a.col - b.col)
    .map(p => {
      const widget = catalog.get(p.widget) ?? null;
      return { placement: widget ? { ...p, width: widget.width } : p, widget };
    });
}

// Inside the row and clear of every widget but `ignore`.
export function canPlace(widgets: Placement[], col: number, width: number, ignore?: string): boolean {
  if (col < 0 || col + width > COLUMNS) return false;
  return widgets.every(p => p.widget === ignore || p.col + p.width <= col || col + width <= p.col);
}

export function firstFree(widgets: Placement[], width: number): number | null {
  for (let col = 0; col + width <= COLUMNS; col++) if (canPlace(widgets, col, width)) return col;
  return null;
}

const byCol = (widgets: Placement[]) => [...widgets].sort((a, b) => a.col - b.col);

// Null when the widget is already on the page or there is no room.
export function place(widgets: Placement[], ref: string, width: number, col?: number): Placement[] | null {
  if (widgets.some(p => p.widget === ref)) return null;
  const at = col ?? firstFree(widgets, width);
  if (at === null || !canPlace(widgets, at, width)) return null;
  return byCol([...widgets, { widget: ref, col: at, width }]);
}

export function moveTo(widgets: Placement[], ref: string, col: number): Placement[] | null {
  const it = widgets.find(p => p.widget === ref);
  if (!it || !canPlace(widgets, col, it.width, ref)) return null;
  return byCol(widgets.map(p => (p.widget === ref ? { ...p, col } : p)));
}

export function removeWidget(widgets: Placement[], ref: string): Placement[] {
  return widgets.filter(p => p.widget !== ref);
}

const clampCol = (col: number, width: number) => Math.max(0, Math.min(COLUMNS - width, col));
const overlaps = (p: Placement, col: number, width: number) => p.col < col + width && col < p.col + p.width;

// The widget covering `col`, other than `ignore`.
const under = (widgets: Placement[], col: number, ignore?: string) =>
  widgets.find(p => p.widget !== ignore && p.col <= col && col < p.col + p.width);

// Swaps two widgets as blocks: the stretch from the first to the last column of
// the two is laid out again with them traded, widgets and gaps between keeping
// their order. The stretch keeps its width, so everything still fits.
function trade(widgets: Placement[], a: Placement, b: Placement): Placement[] {
  const lo = Math.min(a.col, b.col);
  const hi = Math.max(a.col + a.width, b.col + b.width);
  const seq: (Placement | null)[] = [];
  for (let c = lo; c < hi;) {
    const p = widgets.find(w => w.col === c);
    seq.push(p ?? null);
    c += p ? p.width : 1;
  }
  const [i, j] = [seq.indexOf(a), seq.indexOf(b)];
  [seq[i], seq[j]] = [seq[j], seq[i]];
  const moved = new Map<string, number>();
  let c = lo;
  for (const p of seq) {
    if (p) moved.set(p.widget, c);
    c += p ? p.width : 1;
  }
  return byCol(widgets.map(p => (moved.has(p.widget) ? { ...p, col: moved.get(p.widget)! } : p)));
}

// Moves a widget to the column under the pointer. Dropped on another widget, on
// either half of a wide one, the two trade places. Into free room it is a move;
// a wide widget overlapping a neighbour there pushes it to the moved widget's old
// place or the first room left. Null when nothing fits.
export function swapInto(widgets: Placement[], ref: string, col: number): Placement[] | null {
  const it = widgets.find(p => p.widget === ref);
  if (!it) return null;
  const target = under(widgets, col, ref);
  if (target) return trade(widgets, it, target);
  const at = clampCol(col, it.width);
  const plain = moveTo(widgets, ref, at);
  if (plain) return plain;
  const others = widgets.filter(p => p.widget !== ref);
  const hit = others.filter(p => overlaps(p, at, it.width));
  let next = [...others.filter(p => !hit.includes(p)), { ...it, col: at }];
  for (const h of hit) {
    const back = canPlace(next, it.col, h.width) ? it.col : firstFree(next, h.width);
    if (back === null) return null;
    next = [...next, { ...h, col: back }];
  }
  return byCol(next);
}

// Puts a widget not yet on the page where the pointer is, taking the place of
// whatever it covers; dropped on a widget, it starts where that widget starts.
export function replaceAt(widgets: Placement[], ref: string, width: number, col: number): Placement[] | null {
  if (widgets.some(p => p.widget === ref)) return null;
  const at = clampCol(under(widgets, col)?.col ?? col, width);
  return byCol([...widgets.filter(p => !overlaps(p, at, width)), { widget: ref, col: at, width }]);
}
