import type { HostStrings } from '../i18n';
import { hasPage, type ModuleInfo, type ModuleState, type Page } from '../modules/types';
import type { CardSize } from '../notch/controller';

// Every custom page has the same size, so the panel stays put between them (§4).
export const CUSTOM_PAGE: CardSize = { width: 520, height: 104 };
// "‹ Modul" above a module's own card.
export const BACK_BAR = 24;
// The tallest a full view may make a page.
export const FULL_PAGE_MAX = 240;
export const MODULES_GRID = { columns: 6, gap: 6, tile: 64, width: 520, empty: 56 } as const;

const MODULE_PREFIX = 'module:';

// What the panel shows, keyed like lastPage: a page id, 'modules' or 'module:<id>'.
export type PageView =
  | { kind: 'custom'; key: string; page: Page }
  | { kind: 'modules'; key: 'modules'; modules: ModuleInfo[] }
  | { kind: 'module'; key: string; module: ModuleInfo };

// The Modul page's modules: installed, on, with a page; in catalog order.
export function pageModules(s: ModuleState): ModuleInfo[] {
  return s.modules.filter(m => m.installed && m.enabled && hasPage(m));
}

export function resolvePage(s: ModuleState, key: string | null): PageView | null {
  if (key === null) return null;
  if (key === 'modules') return { kind: 'modules', key, modules: pageModules(s) };
  if (key.startsWith(MODULE_PREFIX)) {
    const module = pageModules(s).find(m => m.id === key.slice(MODULE_PREFIX.length));
    return module ? { kind: 'module', key, module } : null;
  }
  const page = s.pages.find(p => p.id === key);
  return page ? { kind: 'custom', key, page } : null;
}

function beranda(s: ModuleState): PageView {
  const page = s.pages.find(p => p.id === 'home') ?? s.pages[0] ?? { id: 'home', name: null, icon: 'home', widgets: [] };
  return { kind: 'custom', key: page.id, page };
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
// height and FULL_PAGE_MAX.
export function viewSize(v: PageView, fullHeight?: number): CardSize {
  if (v.kind === 'custom') {
    if (fullHeight === undefined) return CUSTOM_PAGE;
    return { ...CUSTOM_PAGE, height: Math.round(Math.min(FULL_PAGE_MAX, Math.max(CUSTOM_PAGE.height, fullHeight))) };
  }
  if (v.kind === 'module') return { width: v.module.card!.width, height: BACK_BAR + v.module.card!.height };
  const { columns, gap, tile, width, empty } = MODULES_GRID;
  const rows = Math.ceil(v.modules.length / columns);
  return { width, height: rows === 0 ? empty : rows * tile + (rows - 1) * gap };
}

export function pageName(p: Page, strings: HostStrings): string {
  return p.name ?? strings.home;
}

// Where a click on a notice leads (design 30 Oct §10): the first page holding
// the widget that sent it, else the module's own page, else Beranda. The sample
// notice leads nowhere.
export function noticeTarget(s: ModuleState, moduleId: string | null, channel: string | null): string | null {
  if (moduleId === null) return null;
  const m = s.modules.find(x => x.id === moduleId);
  const widget = m?.channels.find(c => c.id === channel)?.widget;
  if (widget) {
    const ref = `${moduleId}/${widget}`;
    return s.pages.find(p => p.widgets.some(w => w.widget === ref))?.id ?? beranda(s).key;
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
    if (target) out.add(target.startsWith(MODULE_PREFIX) ? 'modules' : target);
  }
  return out;
}
