import { settingsStrings } from '../i18n';
import type { ModuleState } from '../modules/types';
import { el, head, note } from './controls';
import { icon, type IconName } from './icons';
import { generalPage } from './pages/general';
import { aboutPage, notificationsPage, permissionsPage } from './pages/info';
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
  notifications: notificationsPage,
  permissions: permissionsPage,
  about: aboutPage,
};

// The sidebar never grows (spec 8): five sections on top, About at the bottom.
const NAV: [SectionId, IconName][] = [
  ['general', 'gear'], ['look', 'drop'], ['notifications', 'bell'], ['modules', 'grid'], ['permissions', 'shield'],
];

const FOUND_MS = 1200;

// The settings window: sidebar with search, and a pane rebuilt from state.
export async function mountSettings(root: HTMLElement, bridge: SettingsBridge, env: SettingsEnv): Promise<SettingsApp> {
  const doc = root.ownerDocument;
  let [state, info]: [ModuleState, SettingsInfo] = await Promise.all([bridge.moduleState(), bridge.settings()]);
  let route: Route = { page: 'general' };
  let cleanups: (() => void)[] = [];

  const side = el('nav', 'side');
  const sideDrag = el('div', 'drag');
  sideDrag.setAttribute('data-tauri-drag-region', '');
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
    return route.page === 'module' || route.page === 'add' ? 'modules' : route.page;
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
    target.classList.add('found');
    target.scrollIntoView?.({ block: 'nearest' });
    env.setTimer(() => target.classList.remove('found'), FOUND_MS);
  }

  function results(query: string): HTMLElement {
    const list = el('div', 'results');
    const hits = search(searchIndex(strings(), state.modules), query);
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
      if (item.count) item.count.textContent = String(state.modules.filter(m => m.installed).length);
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
  const offState = bridge.onModuleState(next => { state = next; render(); });
  const offInfo = bridge.onSettings(next => { info = next; render(); });
  render();

  return {
    get route() { return route; },
    go,
    destroy(): void {
      doc.removeEventListener('keydown', onKey);
      offState();
      offInfo();
      cleanups.splice(0).forEach(fn => fn());
      root.replaceChildren();
    },
  };
}
