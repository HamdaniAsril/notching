import type { HostStrings } from '../i18n';
import type { ModuleState } from '../modules/types';
import type { FrameHost, FrameSpec } from '../pages/frames';
import { slots, widgetCatalog } from '../pages/layout';
import { CUSTOM_PAGE, type PageView } from '../pages/route';

export interface PageViewDeps {
  frames: FrameHost;
  moduleUrl: (id: string, file: string) => string;
  onOpenModule: (id: string) => void;
  onBack: () => void;
}

export interface PageViewHost {
  show(v: PageView, s: ModuleState, strings: HostStrings): void;
  readonly full: string | null; // the frame covering the whole page, if any
  expand(key: string, height?: number): void; // height: the page's, while it is full
  collapse(): void;
  clear(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// The row and the full frame follow the page's height (route.ts viewSize).
function setHeight(row: HTMLElement, slot: HTMLElement | undefined, height: number): void {
  row.style.height = `${height}px`;
  const frame = slot?.querySelector<HTMLElement>('iframe');
  if (frame) frame.style.height = `${height}px`;
}

// What the open panel shows: a page's row of widgets, the Modul page's tiles,
// or a module's own page under a back bar. Styles go through CSSOM only.
export function mountPageView(content: HTMLElement, deps: PageViewDeps): PageViewHost {
  const doc = content.ownerDocument;
  let shown = '';
  let full: string | null = null;
  let row: HTMLElement | null = null;
  let slotKeys: string[] = [];

  function reset(): void {
    full = null;
    row = null;
    slotKeys = [];
  }

  function custom(v: Extract<PageView, { kind: 'custom' }>, s: ModuleState, strings: HostStrings): HTMLElement {
    const present = slots(v.page, widgetCatalog(s)).filter(x => x.widget);
    if (present.length === 0) return el(doc, 'div', 'pg-empty lab', strings.pageEmpty);
    const r = el(doc, 'div', 'pg-row');
    r.style.height = `${CUSTOM_PAGE.height}px`;
    const specs: FrameSpec[] = present.map(({ placement, widget }) => ({
      key: `${v.page.id}/${placement.col}/${widget!.ref}`, moduleId: widget!.moduleId, entry: widget!.entry,
      widget: widget!.id, title: widget!.name, height: CUSTOM_PAGE.height,
    }));
    deps.frames.keep(specs.map(x => x.key));
    present.forEach(({ placement }, i) => {
      const slot = el(doc, 'div', 'pg-slot');
      slot.dataset.col = String(placement.col);
      slot.dataset.width = String(placement.width);
      slot.dataset.key = specs[i].key;
      slot.style.gridColumn = `${placement.col + 1} / span ${placement.width}`;
      slot.append(deps.frames.frame(specs[i], s.lang, strings));
      r.append(slot);
    });
    row = r;
    slotKeys = specs.map(x => x.key);
    return r;
  }

  function modules(v: Extract<PageView, { kind: 'modules' }>, strings: HostStrings): HTMLElement {
    deps.frames.keep([]);
    if (v.modules.length === 0) return el(doc, 'div', 'pg-empty lab', strings.noModules);
    const grid = el(doc, 'div', 'mods-grid');
    for (const m of v.modules) {
      const tile = el(doc, 'button', m.activity === 'on' ? 'mods-tile on' : 'mods-tile');
      tile.type = 'button';
      tile.setAttribute('aria-label', m.name);
      const glyph = el(doc, 'i', 'glyph');
      glyph.style.setProperty('--icon', `url("${deps.moduleUrl(m.id, m.icon)}")`);
      tile.append(glyph, el(doc, 'span', 'mods-name', m.shortName));
      if (m.activity === 'running') tile.append(el(doc, 'i', 'mods-run'));
      tile.addEventListener('click', () => deps.onOpenModule(m.id));
      grid.append(tile);
    }
    return grid;
  }

  function module(v: Extract<PageView, { kind: 'module' }>, s: ModuleState, strings: HostStrings): HTMLElement {
    const m = v.module;
    const spec: FrameSpec = {
      key: v.key, moduleId: m.id, entry: m.entry!, widget: null, title: m.name, height: m.card!.height,
    };
    deps.frames.keep([spec.key]);
    const wrap = el(doc, 'div', 'pg-module');
    const bar = el(doc, 'div', 'pg-back');
    const back = el(doc, 'button', 'lab', `‹ ${strings.modules}`);
    back.type = 'button';
    back.addEventListener('click', () => deps.onBack());
    bar.append(back, el(doc, 'span', 'lab pg-title', m.name));
    wrap.append(bar, deps.frames.frame(spec, s.lang, strings));
    return wrap;
  }

  return {
    show(v, s, strings) {
      // The same page with the same widgets keeps its frames (and a full view).
      const sig = JSON.stringify([v, s.lang, v.kind === 'custom' ? slots(v.page, widgetCatalog(s)) : null]);
      if (sig === shown) return;
      shown = sig;
      reset();
      const body = v.kind === 'custom' ? custom(v, s, strings) : v.kind === 'modules' ? modules(v, strings) : module(v, s, strings);
      content.replaceChildren(body);
    },
    get full() { return full; },
    expand(key, height = CUSTOM_PAGE.height) {
      if (!row || !slotKeys.includes(key) || full === key) return;
      if (full) this.collapse();
      full = key;
      row.classList.add('full');
      const slot = [...row.querySelectorAll<HTMLElement>('.pg-slot')].find(x => x.dataset.key === key);
      slot?.classList.add('full');
      setHeight(row, slot, height);
      deps.frames.setFull(key, true);
    },
    collapse() {
      if (!row || !full) return;
      row.classList.remove('full');
      const slot = row.querySelector<HTMLElement>('.pg-slot.full');
      slot?.classList.remove('full');
      setHeight(row, slot ?? undefined, CUSTOM_PAGE.height);
      deps.frames.setFull(full, false);
      full = null;
    },
    clear() {
      shown = '';
      reset();
      deps.frames.clear();
      content.replaceChildren();
    },
  };
}
