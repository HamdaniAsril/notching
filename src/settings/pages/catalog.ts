import { fill } from '../../i18n';
import { formatBytes } from '../../kit/format';
import { inCatalog, isModule, type ModuleInfo } from '../../modules/types';
import { STRIP_WIDTH } from '../../pages/layout';
import { button, el, head } from '../controls';
import type { PageContext, PageRender } from '../types';
import { back, moduleIcon, UNINSTALL_CONFIRM_MS } from './modules';
import { widgetPreview } from './widget-preview';

type Filter = 'all' | 'module' | 'widgets';

// Kept while the window is open, like the page editor's filter.
let filter: Filter = 'all';

// A package card shows this many of its widgets; the count says the rest.
const PEEK = 3;

// A system permission's name, from the Izin page's words.
function permissionName(ctx: PageContext, p: string): string {
  const s = ctx.strings.permissions;
  switch (p) {
    case 'accessibility': return s.accessibility;
    case 'camera': return s.camera;
    case 'screen-recording': return s.screenRecording;
    case 'full-disk-access': return s.fullDiskAccess;
    case 'location': return ctx.strings.catalog.location;
    default: return p;
  }
}

// Pasang, or Terpasang with a Copot that takes a second click within a few
// seconds, as on a module's page. Either way the Katalog stays open.
function action(ctx: PageContext, m: ModuleInfo): HTMLElement[] {
  const s = ctx.strings.catalog;
  const row = `catalog.${m.id}`;
  if (!m.installed) {
    return [button(`${row}.install`, s.install, () => ctx.save(row, ctx.bridge.reinstallModule(m.id)), true)];
  }
  let cancel: (() => void) | null = null;
  const reset = () => {
    cancel = null;
    copot.textContent = s.uninstall;
    copot.classList.remove('confirm');
  };
  const copot = button(`${row}.uninstall`, s.uninstall, () => {
    if (!cancel) {
      copot.textContent = s.uninstallConfirm;
      copot.classList.add('confirm');
      cancel = ctx.env.setTimer(reset, UNINSTALL_CONFIRM_MS);
      return;
    }
    cancel();
    reset();
    ctx.save(row, ctx.bridge.uninstallModule(m.id));
  });
  copot.classList.add('danger');
  ctx.onCleanup(() => cancel?.());
  return [el('span', 'cat-on', s.installed), copot];
}

// One card (design 4 Nov §5): icon, name and kind; what it is; what it brings
// (a package's widgets, a module's permissions); version, size and its button.
function card(ctx: PageContext, m: ModuleInfo): HTMLElement {
  const s = ctx.strings.catalog;
  const module = isModule(m);
  const c = el('div', 'cat-card');
  c.dataset.row = `catalog.${m.id}`;
  c.dataset.kind = module ? 'module' : 'widgets';
  c.classList.toggle('off', !m.installed);

  const top = el('div', 'cat-top');
  top.append(moduleIcon(m.iconSvg), el('span', 'cat-name', m.name), el('span', 'cat-kind', module ? s.kindModule : s.kindWidgets));
  c.append(top);
  if (m.description) c.append(el('p', 'cat-desc', m.description));

  if (module) {
    const needs = m.permissions.map(p => permissionName(ctx, p));
    c.append(el('p', 'cat-what', needs.length ? fill(s.needs, { list: needs.join(', ') }) : s.noPermission));
  } else {
    const peek = el('div', 'cat-peek');
    // A strip is a whole row wide: shown only when the package has nothing else.
    const small = m.widgets.filter(w => w.width !== STRIP_WIDTH);
    peek.append(...(small.length ? small : m.widgets).slice(0, PEEK).map(w => widgetPreview({ ...w, ref: `${m.id}/${w.id}`, moduleId: m.id }, ctx.lang)));
    c.append(peek, el('p', 'cat-what', fill(s.widgetCount, { n: m.widgets.length })));
  }

  const foot = el('div', 'cat-foot');
  foot.append(el('span', 'size', fill(s.versionSize, { version: m.version, size: formatBytes(m.size, ctx.lang) })), ...action(ctx, m));
  c.append(foot);
  return c;
}

// The Katalog (design 4 Nov): every built-in module and widget package but
// Beranda's, in the app's order, modules first, each with Pasang or Copot.
export const catalogPage: PageRender = (ctx, route) => {
  const s = ctx.strings.catalog;
  const all = ctx.state.modules.filter(inCatalog);
  const ordered = [...all.filter(isModule), ...all.filter(m => !isModule(m))];
  // Opened for one card (a search result): a filter that hides it gives way.
  const wanted = route.page === 'catalog' && route.id ? all.find(m => m.id === route.id) : undefined;
  if (wanted && filter !== (isModule(wanted) ? 'module' : 'widgets')) filter = 'all';
  const page = el('div');
  page.append(back(ctx), head({ title: s.title, sub: s.sub }));

  const grid = el('div', 'cat-grid');
  const chips = el('div', 'ed-filter cat-filter');
  const labels: Record<Filter, string> = { all: s.all, module: s.modules, widgets: s.widgets };
  const draw = () => {
    for (const b of chips.querySelectorAll<HTMLElement>('button')) {
      const on = b.dataset.key === `catalog.filter.${filter}`;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    grid.replaceChildren(...ordered
      .filter(m => filter === 'all' || (filter === 'module') === isModule(m))
      .map(m => card(ctx, m)));
  };
  for (const f of ['all', 'module', 'widgets'] as const) {
    const b = el('button', undefined, labels[f]);
    b.type = 'button';
    b.dataset.key = `catalog.filter.${f}`;
    b.addEventListener('click', () => {
      filter = f;
      draw();
    });
    chips.append(b);
  }
  draw();
  page.append(chips, grid);
  return page;
};
