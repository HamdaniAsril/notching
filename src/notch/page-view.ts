import type { HostStrings } from '../i18n';
import type { ModuleInfo, ModuleState } from '../modules/types';
import type { FrameHost, FrameSpec } from '../pages/frames';
import { slots, widgetCatalog } from '../pages/layout';
import { CUSTOM_PAGE, type PageView, STRIP_HEIGHT } from '../pages/route';
import { type CleanerDeps, type CleanerView, mountCleaner } from '../cleaner/view';
import { mountShelfView, type ShelfView, type ShelfViewDeps } from '../shelf/view';
import { mountShotList, type ShotList, type ShotListDeps } from '../shot/list';
import { mountShotResult, type ShotResult } from '../shot/result';

export interface PageViewDeps {
  frames: FrameHost;
  moduleUrl: (id: string, file: string) => string;
  onOpenModule: (id: string) => void;
  onAction: (m: ModuleInfo) => void; // a tile that runs an action instead of opening a page
  onBack: () => void;
  shelf: Omit<ShelfViewDeps, 'strings' | 'backLabel' | 'back'>; // Titipan's drag out, remove and clear
  shot: Omit<ShotListDeps, 'lang'>; // Screenshot's pages: the core's calls, close and back
  cleaner: Omit<CleanerDeps, 'lang'>; // Cleaner's pages: the core's calls and the panel's size
}

export interface PageViewHost {
  show(v: PageView, s: ModuleState, strings: HostStrings): void;
  readonly full: string | null; // the frame covering the whole page, if any
  expand(key: string, height?: number): void; // height: the page's, while it is full
  collapse(): void;
  clear(): void;
}

type ShotPage = Extract<PageView, { kind: 'shot' }>;

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
  let page: HTMLElement | null = null; // the row and the strip under it, when there is one
  let slotKeys: string[] = [];
  // Titipan's shelf: kept between renders so its selection lasts.
  let shelf: { view: ShelfView; box: HTMLElement; lang: string } | null = null;

  // Screenshot's result or list, kept while the same one shows.
  let shot: { box: HTMLElement; sig: string; render(v: ShotPage): void; destroy(): void } | null = null;

  // Cleaner: kept even while another page or a closed panel hides it, so its
  // place lasts (design 1 Nov §4); told when it shows and when it goes away.
  let cleaner: { box: HTMLElement; lang: string; view: CleanerView } | null = null;

  function hideCleaner(): void {
    if (!cleaner || !content.contains(cleaner.box)) return;
    cleaner.view.hidden();
    cleaner.box.remove();
  }

  function showCleaner(s: ModuleState): void {
    deps.frames.keep([]);
    if (cleaner && cleaner.lang !== s.lang) {
      cleaner.view.destroy();
      cleaner = null;
    }
    if (!cleaner) {
      const box = el(doc, 'div', 'cl');
      cleaner = { box, lang: s.lang, view: mountCleaner(box, { ...deps.cleaner, lang: s.lang }) };
    }
    if (content.contains(cleaner.box)) return;
    content.replaceChildren(cleaner.box);
    cleaner.view.shown();
  }

  function dropShelf(): void {
    shelf?.view.destroy();
    shelf = null;
  }

  function dropShot(): void {
    shot?.destroy();
    shot = null;
  }

  function mountShot(box: HTMLElement, v: ShotPage, lang: ModuleState['lang']): { render(v: ShotPage): void; destroy(): void } {
    const shotDeps = { ...deps.shot, lang };
    if (v.mode === 'result') {
      const view: ShotResult = mountShotResult(box, shotDeps);
      return {
        render: p => { if (p.mode === 'result') view.render(p.id, p.shots.find(x => x.id === p.id)); },
        destroy: () => view.destroy(),
      };
    }
    const view: ShotList = mountShotList(box, shotDeps);
    return { render: p => view.render(p.shots), destroy: () => view.destroy() };
  }

  function showShot(v: ShotPage, s: ModuleState): void {
    deps.frames.keep([]);
    const sig = JSON.stringify([v.mode, s.lang]);
    if (!shot || shot.sig !== sig || !content.contains(shot.box)) {
      dropShot();
      const box = el(doc, 'div', 'shot');
      shot = { box, sig, ...mountShot(box, v, s.lang) };
      content.replaceChildren(box);
    }
    shot.render(v);
  }

  function showShelf(v: Extract<PageView, { kind: 'shelf' }>, s: ModuleState, strings: HostStrings): void {
    deps.frames.keep([]);
    if (!shelf || shelf.lang !== s.lang || !content.contains(shelf.box)) {
      dropShelf();
      const box = el(doc, 'div', 'sh');
      shelf = { box, lang: s.lang, view: mountShelfView(box, { ...deps.shelf, strings: strings.shelf, backLabel: strings.modules, back: deps.onBack }) };
      content.replaceChildren(box);
    }
    shelf.view.render(v.shelf, v.dropping);
  }

  function reset(): void {
    full = null;
    row = null;
    page = null;
    slotKeys = [];
  }

  function custom(v: Extract<PageView, { kind: 'custom' }>, s: ModuleState, strings: HostStrings): HTMLElement {
    const present = slots(v.page, widgetCatalog(s)).filter(x => x.widget);
    if (present.length === 0 && !v.strip) return el(doc, 'div', 'pg-empty lab', strings.pageEmpty);
    const r = el(doc, 'div', 'pg-row');
    r.style.height = `${CUSTOM_PAGE.height}px`;
    const specs: FrameSpec[] = present.map(({ placement, widget }) => ({
      key: `${v.page.id}/${placement.col}/${widget!.ref}`, moduleId: widget!.moduleId, entry: widget!.entry,
      widget: widget!.id, title: widget!.name, height: CUSTOM_PAGE.height,
    }));
    const strip: FrameSpec | null = v.strip && {
      key: `${v.page.id}/strip/${v.strip.ref}`, moduleId: v.strip.moduleId, entry: v.strip.entry,
      widget: v.strip.id, title: v.strip.name, height: STRIP_HEIGHT,
    };
    deps.frames.keep([...specs.map(x => x.key), ...(strip ? [strip.key] : [])]);
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
    if (!strip) return r;
    const box = el(doc, 'div', 'pg-strip');
    box.dataset.key = strip.key;
    box.append(deps.frames.frame(strip, s.lang, strings));
    page = el(doc, 'div', 'pg-page');
    page.append(r, el(doc, 'div', 'pg-strip-line'), box);
    return page;
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
      tile.addEventListener('click', () => (m.action ? deps.onAction(m) : deps.onOpenModule(m.id)));
      grid.append(tile);
    }
    return grid;
  }

  function module(v: Extract<PageView, { kind: 'module' }>, s: ModuleState, strings: HostStrings): HTMLElement {
    const m = v.module;
    const spec: FrameSpec = {
      key: v.key, moduleId: m.id, entry: m.entry!, widget: null, title: m.name, height: m.card!.height,
      camera: m.permissions.includes('camera'),
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
      if (v.kind === 'cleaner') {
        shown = '';
        reset();
        dropShelf();
        dropShot();
        showCleaner(s);
        return;
      }
      hideCleaner();
      if (v.kind === 'shelf') {
        shown = '';
        reset();
        dropShot();
        showShelf(v, s, strings);
        return;
      }
      dropShelf();
      // Screenshot's pages are drawn here, not in a module frame.
      if (v.kind === 'shot') {
        shown = '';
        reset();
        showShot(v, s);
        return;
      }
      dropShot();
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
      page?.classList.add('full');
      const slot = [...row.querySelectorAll<HTMLElement>('.pg-slot')].find(x => x.dataset.key === key);
      slot?.classList.add('full');
      setHeight(row, slot, height);
      deps.frames.setFull(key, true);
    },
    collapse() {
      if (!row || !full) return;
      row.classList.remove('full');
      page?.classList.remove('full');
      const slot = row.querySelector<HTMLElement>('.pg-slot.full');
      slot?.classList.remove('full');
      setHeight(row, slot ?? undefined, CUSTOM_PAGE.height);
      deps.frames.setFull(full, false);
      full = null;
    },
    clear() {
      shown = '';
      reset();
      hideCleaner();
      dropShelf();
      dropShot();
      deps.frames.clear();
      content.replaceChildren();
    },
  };
}
