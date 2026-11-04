import { settingsStrings } from '../i18n';
import logoDark from './assets/logo-dark.png';
import logoLight from './assets/logo-light.png';
import { applyAccent } from '../kit/accent';
import type { ModuleState } from '../modules/types';
import { el, head, note } from './controls';
import { icon, type IconName } from './icons';
import { generalPage } from './pages/general';
import { aboutPage, permissionsPage } from './pages/info';
import { notificationsPage } from './pages/notifications';
import { lookPage } from './pages/look';
import { catalogPage } from './pages/catalog';
import { shortcutsPage } from './pages/shortcuts';
import { modulePage, modulesPage } from './pages/modules';
import { isOwnEcho, pageEditor } from './pages/page-editor';
import { pagesPage, waitingFor } from './pages/pages';
import { isModule, isTool } from '../modules/types';
import { search, searchIndex } from './search';
import type {
  PageContext, PageRender, Route, SectionId, SettingsBridge, SettingsEnv, SettingsInfo,
} from './types';

export interface SettingsApp {
  readonly route: Route;
  go(route: Route): void;
  destroy(): void;
}

export const PAGES: Partial<Record<Route['page'], PageRender>> = {
  general: generalPage,
  look: lookPage,
  notifications: notificationsPage,
  pages: pagesPage,
  pageEdit: pageEditor,
  modules: modulesPage,
  module: modulePage,
  catalog: catalogPage,
  shortcuts: shortcutsPage,
  permissions: permissionsPage,
  about: aboutPage,
};

// The sidebar never grows (spec 8, design 30 Oct §9): six sections on top, About at the bottom.
const NAV: [SectionId, IconName][] = [
  ['general', 'gear'], ['look', 'drop'], ['notifications', 'bell'], ['pages', 'layers'], ['modules', 'grid'],
  ['shortcuts', 'command'], ['permissions', 'shield'],
];

const FOUND_MS = 1200;

const SECTIONS: SectionId[] = [...NAV.map(([id]) => id), 'about'];

// A page asked for from outside, as lastPage writes it: a section, or
// "module:<id>" (design 3 Nov tombol §6). Anything else is null.
export function parseRoute(s: string | null): Route | null {
  if (!s) return null;
  if (s.startsWith('module:')) {
    const id = s.slice('module:'.length);
    return id ? { page: 'module', id } : null;
  }
  return SECTIONS.find(id => id === s) ? { page: s as SectionId } : null;
}

// The settings window: sidebar with search, and a pane rebuilt from state.
// `start`: the page to open at, else Umum.
export async function mountSettings(root: HTMLElement, bridge: SettingsBridge, env: SettingsEnv, start?: Route | null): Promise<SettingsApp> {
  const doc = root.ownerDocument;
  let [state, info]: [ModuleState, SettingsInfo] = await Promise.all([bridge.moduleState(), bridge.settings()]);
  applyAccent(doc.documentElement, state.accent);
  let route: Route = start ?? { page: 'general' };
  let cleanups: (() => void)[] = [];

  const side = el('nav', 'side');
  const sideDrag = el('div', 'drag');
  sideDrag.setAttribute('data-tauri-drag-region', '');
  // The wordmark at the sidebar's right edge in the title bar, in the device's light or
  // dark (brand kit: always an image; black on light, the lime ø on dark). Clicks pass
  // through to the drag region.
  const logo = el('picture', 'logo');
  const dark = doc.createElement('source');
  dark.media = '(prefers-color-scheme: dark)';
  dark.srcset = logoDark;
  const img = doc.createElement('img');
  img.src = logoLight;
  img.alt = 'Notching';
  img.draggable = false;
  logo.append(dark, img);
  sideDrag.append(logo);
  const searchLabel = el('label', 'search-box');
  const searchInput = el('input', 'search');
  searchInput.type = 'search';
  searchInput.spellcheck = false;
  searchLabel.append(icon('search'), searchInput);

  const navItems = new Map<SectionId, { button: HTMLButtonElement; label: HTMLElement; count?: HTMLElement }>();
  const navButton = (id: SectionId, name: IconName) => {
    const button = el('button', 'nav');
    button.type = 'button';
    button.dataset.key = `nav.${id}`;
    const label = el('span', 'label');
    button.append(icon(name), label);
    let count: HTMLElement | undefined;
    if (id === 'modules') {
      count = el('span', 'n');
      button.append(count);
    }
    button.addEventListener('click', () => {
      searchInput.value = '';
      go({ page: id });
    });
    navItems.set(id, { button, label, count });
    return button;
  };
  side.append(sideDrag, searchLabel, ...NAV.map(([id, name]) => navButton(id, name)), el('div', 'grow'),
    navButton('about', 'info'));

  const pane = el('section', 'pane');
  const paneDrag = el('div', 'drag');
  paneDrag.setAttribute('data-tauri-drag-region', '');
  const body = el('div', 'pane-body');
  pane.append(paneDrag, body);
  root.classList.add('settings');
  root.replaceChildren(side, pane);

  const strings = () => settingsStrings(state.lang);

  function section(): SectionId {
    if (route.page === 'pageEdit') return 'pages';
    // A background tool's page is reached from Pintasan.
    if (route.page === 'module') {
      const id = route.id;
      return state.modules.some(m => m.id === id && isTool(m)) ? 'shortcuts' : 'modules';
    }
    return route.page === 'catalog' ? 'modules' : route.page;
  }

  function find(selector: string): HTMLElement | null {
    return body.querySelector<HTMLElement>(selector);
  }

  function save(key: string, pending: Promise<void>): void {
    pending.catch(() => {
      const place = find(`[data-row="${key}"]`) ?? find(`[data-key="${key}"]`)?.parentElement;
      if (!place || place.querySelector(':scope > .err')) return;
      place.append(el('small', 'err', strings().saveFailed));
    });
  }

  function highlight(key: string): void {
    const target = find(`[data-row="${key}"]`);
    if (!target) return;
    const fold = target.closest('details');
    if (fold) fold.open = true;
    target.classList.add('found');
    target.scrollIntoView?.({ block: 'nearest' });
    env.setTimer(() => target.classList.remove('found'), FOUND_MS);
  }

  function results(query: string): HTMLElement {
    const list = el('div', 'results');
    const hits = search(searchIndex(strings(), state.modules, state.pages), query);
    if (hits.length === 0) list.append(note(strings().noResults));
    for (const hit of hits) {
      const b = el('button', 'result');
      b.type = 'button';
      b.dataset.key = `result.${hit.key}`;
      b.append(el('span', 'label', hit.label));
      if (hit.where) b.append(el('small', undefined, hit.where));
      b.addEventListener('click', () => {
        searchInput.value = '';
        go(hit.route);
        highlight(hit.key);
      });
      list.append(b);
    }
    return list;
  }

  function page(): HTMLElement {
    // A module page whose module is gone falls back to the list.
    if (route.page === 'module') {
      const id = route.id;
      if (!state.modules.some(m => m.id === id && m.installed)) route = { page: 'modules' };
    }
    // So does a page deleted elsewhere, but not one just added whose state is still on its way.
    if (route.page === 'pageEdit') {
      const id = route.id;
      if (!state.pages.some(p => p.id === id) && !waitingFor(id)) route = { page: 'pages' };
    }
    const ctx: PageContext = {
      strings: strings(), lang: state.lang, state, info, bridge, env, go, save,
      onCleanup: fn => cleanups.push(fn),
    };
    const render = PAGES[route.page];
    return render ? render(ctx, route) : head({ title: strings().sections[section()] });
  }

  function render(): void {
    const s = strings();
    doc.title = s.title;
    doc.documentElement.lang = state.lang;
    searchInput.placeholder = s.search;
    searchInput.setAttribute('aria-label', s.search);
    for (const [id, item] of navItems) {
      item.label.textContent = s.sections[id];
      const on = id === section();
      item.button.classList.toggle('on', on);
      if (on) item.button.setAttribute('aria-current', 'page');
      else item.button.removeAttribute('aria-current');
      if (item.count) item.count.textContent = String(state.modules.filter(m => m.installed && isModule(m) && !isTool(m)).length);
    }

    const active = doc.activeElement as HTMLElement | null;
    const focusKey = active && body.contains(active) ? active.dataset.key : undefined;
    const scroll = pane.scrollTop;
    cleanups.splice(0).forEach(fn => fn());
    const query = searchInput.value.trim();
    body.replaceChildren(query ? results(query) : page());
    if (focusKey) find(`[data-key="${focusKey}"]`)?.focus();
    pane.scrollTop = scroll;
  }

  function go(next: Route): void {
    route = next;
    render();
    pane.scrollTop = 0;
  }

  function onKey(e: KeyboardEvent): void {
    if (!e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (key === 'q') {
      e.preventDefault();
      void bridge.quit();
    }
  }

  searchInput.addEventListener('input', render);
  searchInput.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !searchInput.value) return;
    searchInput.value = '';
    render();
  });
  doc.addEventListener('keydown', onKey);
  // The Look page already shows the values it just saved; rebuilding it for their
  // echo would put a slider back one step while an arrow key is held down, or
  // take the colour picker away from under the pointer.
  // Nor does it show the live fields, which change while a module runs.
  const look = (s: ModuleState) => ({
    ...s, notch: null, accent: null, accentCustom: null, missed: null, lastPage: null, sampleStatus: null,
    modules: s.modules.map(m => ({ ...m, activity: null })),
  });
  const onlyLookChanged = (a: ModuleState, b: ModuleState) => JSON.stringify(look(a)) === JSON.stringify(look(b));
  const offState = bridge.onModuleState(next => {
    if (next.accent !== state.accent) applyAccent(doc.documentElement, next.accent);
    const quiet = !searchInput.value.trim();
    const echo = (route.page === 'look' && quiet && onlyLookChanged(state, next))
      || (route.page === 'pageEdit' && quiet && isOwnEcho(state, next, route.id));
    state = next;
    if (!echo) render();
  });
  const offInfo = bridge.onSettings(next => { info = next; render(); });
  // Asked from the notch while open, e.g. Screenshot's "use my own keys".
  const offGo = bridge.onGo(next => {
    const to = parseRoute(next);
    if (!to) return;
    searchInput.value = '';
    go(to);
  });
  render();

  return {
    get route() { return route; },
    go,
    destroy(): void {
      doc.removeEventListener('keydown', onKey);
      offState();
      offInfo();
      offGo();
      cleanups.splice(0).forEach(fn => fn());
      root.replaceChildren();
    },
  };
}
