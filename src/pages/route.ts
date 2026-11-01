import type { ShelfState } from '../bridge';
import type { HostStrings } from '../i18n';
import { hasPage, isModule, type ModuleInfo, type ModuleState, type Page } from '../modules/types';
import type { CardSize } from '../notch/controller';
import { type CatalogWidget, stripSlot, widgetCatalog } from './layout';

// Every custom page has the same size, so the panel stays put between them (§4).
export const CUSTOM_PAGE: CardSize = { width: 520, height: 104 };
// "‹ Modul" above a module's own card.
export const BACK_BAR = 24;
// The tallest a full view may make a page.
export const FULL_PAGE_MAX = 240;
export const MODULES_GRID = { columns: 6, gap: 6, tile: 64, width: 520, empty: 56 } as const;
// A page's strip (design 31 Oct, Timer §3): a dotted line, then the strip.
export const STRIP_GAP = 20;
export const STRIP_HEIGHT = 40;

// Titipan's shelf (design 1 Nov §4, titipan-tempat.html A): a head line, then 6
// tiles a row; past 3 rows the grid scrolls. While a drag is over the notch it is
// the drop zone, as tall as a custom page.
export const SHELF = { width: 520, head: 22, tile: 84, gap: 8, columns: 6, maxRows: 3, drop: 104, empty: 84 } as const;
export const SHELF_KEY = 'shelf';
export const SHOT_KEY = 'screenshot';

const MODULE_PREFIX = 'module:';

// Screenshot's two notch views: the result of a capture, and the history list.
export type ShotTarget = { kind: 'shot'; mode: 'result'; id: number } | { kind: 'shot'; mode: 'list' };

// What the panel shows, keyed like lastPage: a page id, 'modules' or 'module:<id>'.
// `strip`: the page's strip widget when it is there to show.
export type PageView =
  | { kind: 'custom'; key: string; page: Page; strip: CatalogWidget | null }
  | { kind: 'modules'; key: 'modules'; modules: ModuleInfo[] }
  | { kind: 'module'; key: string; module: ModuleInfo }
  // `height`: while dropping on a panel already taller than the drop zone, it keeps
  // that height, so the drag stays over it.
  | { kind: 'shelf'; key: typeof SHELF_KEY; shelf: ShelfState; dropping: boolean; height?: number }
  | (ShotTarget & { key: typeof SHOT_KEY });

// The Modul page's modules: installed, on, with a page or a tile action; in catalog order.
export function pageModules(s: ModuleState): ModuleInfo[] {
  return s.modules.filter(m => m.installed && m.enabled && isModule(m));
}

export function resolvePage(s: ModuleState, key: string | null): PageView | null {
  if (key === null) return null;
  if (key === 'modules') return { kind: 'modules', key, modules: pageModules(s) };
  if (key.startsWith(MODULE_PREFIX)) {
    const module = pageModules(s).find(m => m.id === key.slice(MODULE_PREFIX.length) && hasPage(m));
    return module ? { kind: 'module', key, module } : null;
  }
  const page = s.pages.find(p => p.id === key);
  return page ? custom(s, page) : null;
}

function custom(s: ModuleState, page: Page): PageView {
  return { kind: 'custom', key: page.id, page, strip: stripSlot(page, widgetCatalog(s))?.widget ?? null };
}

function beranda(s: ModuleState): PageView {
  return custom(s, s.pages.find(p => p.id === 'home') ?? s.pages[0] ?? { id: 'home', name: null, icon: 'home', widgets: [] });
}

// An open panel keeps its page while it lasts, else the last page opened. A
// module page whose module went away gives the Modul page; anything else gone
// gives Beranda.
export function pickPage(s: ModuleState, current: string | null, panelOpen: boolean): PageView {
  const known = (panelOpen ? resolvePage(s, current) : null) ?? resolvePage(s, s.lastPage);
  if (known) return known;
  const wanted = panelOpen ? current : s.lastPage;
  if (wanted?.startsWith(MODULE_PREFIX)) return resolvePage(s, 'modules')!;
  return beranda(s);
}

// `fullHeight`: what a widget's full view asked for, kept between the page's own
// height and FULL_PAGE_MAX. A strip there to show makes the page taller.
export function viewSize(v: PageView, fullHeight?: number): CardSize {
  if (v.kind === 'custom') {
    const height = CUSTOM_PAGE.height + (v.strip ? STRIP_GAP + STRIP_HEIGHT : 0);
    if (fullHeight === undefined) return { ...CUSTOM_PAGE, height };
    return { ...CUSTOM_PAGE, height: Math.round(Math.min(FULL_PAGE_MAX, Math.max(height, fullHeight))) };
  }
  if (v.kind === 'module') return { width: v.module.card!.width, height: BACK_BAR + v.module.card!.height };
  // Placeholder until the screenshot views have their own sizes.
  if (v.kind === 'shot') return { ...CUSTOM_PAGE };
  if (v.kind === 'shelf') {
    const height = shelfHeight(v.shelf.items.length, v.dropping);
    return { width: SHELF.width, height: v.dropping ? Math.max(height, v.height ?? 0) : height };
  }
  const { columns, gap, tile, width, empty } = MODULES_GRID;
  const rows = Math.ceil(v.modules.length / columns);
  return { width, height: rows === 0 ? empty : rows * tile + (rows - 1) * gap };
}

export function shelfHeight(items: number, dropping: boolean): number {
  const { head, tile, gap, columns, maxRows, drop, empty } = SHELF;
  if (dropping) return drop;
  if (items === 0) return head + empty;
  const rows = Math.min(maxRows, Math.ceil(items / columns));
  return head + rows * tile + (rows - 1) * gap;
}

export function pageName(p: Page, strings: HostStrings): string {
  return p.name ?? strings.home;
}

// Where a click on a notice leads (design 30 Oct §10): the first page holding
// the widget that sent it, else the module's own page, else Beranda. The sample
// notice leads nowhere. Screenshot's notices lead to its own list, not a page.
export function noticeTarget(s: ModuleState, moduleId: string | null, channel: string | null): string | ShotTarget | null {
  if (moduleId === null) return null;
  if (moduleId === SHOT_KEY) return { kind: 'shot', mode: 'list' };
  const m = s.modules.find(x => x.id === moduleId);
  const widget = m?.channels.find(c => c.id === channel)?.widget;
  if (widget) {
    const ref = `${moduleId}/${widget}`;
    return s.pages.find(p => p.strip === ref || p.widgets.some(w => w.widget === ref))?.id ?? beranda(s).key;
  }
  if (m && hasPage(m)) return `${MODULE_PREFIX}${m.id}`;
  return beranda(s).key;
}

// Pill icons that get the white missed dot.
export function missedTargets(s: ModuleState): Set<string> {
  const out = new Set<string>();
  for (const entry of s.missed) {
    const dot = entry.indexOf('.');
    const target = noticeTarget(s, entry.slice(0, dot), entry.slice(dot + 1));
    if (typeof target === 'string') out.add(target.startsWith(MODULE_PREFIX) ? 'modules' : target);
  }
  return out;
}
