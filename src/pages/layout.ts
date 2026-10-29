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
