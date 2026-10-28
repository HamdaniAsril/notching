import { fill } from '../../i18n';
import { formatBytes } from '../../kit/format';
import type { ModuleInfo } from '../../modules/types';
import { button, el, group, head, note, toggle } from '../controls';
import { icon } from '../icons';
import type { PageContext, PageRender } from '../types';

export const UNINSTALL_CONFIRM_MS = 4000;

// The module's own SVG as a mask in the text colour, like the pill. The SVG never
// enters the DOM, so nothing in the file can run.
export function moduleIcon(svg: string): HTMLElement {
  if (!svg) return icon('grid');
  const glyph = el('i', 'glyph');
  glyph.style.setProperty('--icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  return glyph;
}

function onSwitch(ctx: PageContext, m: ModuleInfo): HTMLElement {
  const key = `module.${m.id}.on`;
  return toggle(key, m.name, m.enabled, on => ctx.save(key, ctx.bridge.setModuleEnabled(m.id, on)));
}

function moduleRow(ctx: PageContext, m: ModuleInfo, ...controls: HTMLElement[]): HTMLElement {
  const r = el('div', 'row module');
  r.dataset.row = `module.${m.id}`;
  const t = el('div', 't');
  t.append(el('span', 'label', m.name), el('small', undefined, m.description));
  r.append(moduleIcon(m.iconSvg), t, el('span', 'size', formatBytes(m.size, ctx.lang)), ...controls);
  return r;
}

function back(ctx: PageContext): HTMLElement {
  const b = el('button', 'back');
  b.type = 'button';
  b.dataset.key = 'module.back';
  b.append(icon('back'), el('span', undefined, ctx.strings.sections.modules));
  b.addEventListener('click', () => ctx.go({ page: 'modules' }));
  return b;
}

export const modulesPage: PageRender = ctx => {
  const s = ctx.strings.modules;
  const installed = ctx.state.modules.filter(m => m.installed);
  const total = installed.reduce((sum, m) => sum + m.size, 0);
  const page = el('div');
  page.append(head({
    title: ctx.strings.sections.modules,
    sub: fill(s.summary, { n: installed.length, size: formatBytes(total, ctx.lang) }),
    side: button('modules.add', s.add, () => ctx.go({ page: 'add' }), true),
  }));
  if (installed.length === 0) {
    page.append(note(s.none));
    return page;
  }
  page.append(group(...installed.map(m => {
    const r = moduleRow(ctx, m, onSwitch(ctx, m), icon('chev'));
    // The row opens the module's page; the switch stops its own clicks.
    r.dataset.key = `module.${m.id}`;
    r.setAttribute('role', 'button');
    r.tabIndex = 0;
    const open = () => ctx.go({ page: 'module', id: m.id });
    r.addEventListener('click', open);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === r) open(); });
    return r;
  })));
  return page;
};

export const modulePage: PageRender = (ctx, route) => {
  const s = ctx.strings.modules;
  const m = ctx.state.modules.find(x => route.page === 'module' && x.id === route.id)!;
  const page = el('div');
  const top = head({ title: m.name, sub: m.description, icon: moduleIcon(m.iconSvg), side: onSwitch(ctx, m) });
  top.dataset.row = `module.${m.id}`;

  // Uninstall takes a second click within a few seconds.
  const key = `module.${m.id}.uninstall`;
  let cancel: (() => void) | null = null;
  const reset = () => {
    cancel = null;
    uninstall.textContent = s.uninstall;
    uninstall.classList.remove('confirm');
  };
  const uninstall = button(key, s.uninstall, () => {
    if (!cancel) {
      uninstall.textContent = s.uninstallConfirm;
      uninstall.classList.add('confirm');
      cancel = ctx.env.setTimer(reset, UNINSTALL_CONFIRM_MS);
      return;
    }
    cancel();
    reset();
    const pending = ctx.bridge.uninstallModule(m.id);
    ctx.save(key, pending);
    pending.then(() => ctx.go({ page: 'modules' }), () => {});
  });
  ctx.onCleanup(() => cancel?.());

  const foot = el('div', 'foot');
  foot.append(el('span', 'size', fill(s.versionSize, { version: m.version, size: formatBytes(m.size, ctx.lang) })), uninstall);
  page.append(back(ctx), top, note(s.noSettings), foot, el('p', 'note small', s.uninstallNote));
  return page;
};

export const addPage: PageRender = ctx => {
  const s = ctx.strings.modules;
  const missing = ctx.state.modules.filter(m => !m.installed);
  const page = el('div');
  page.append(back(ctx), head({ title: s.addTitle, sub: s.addSub }));
  if (missing.length === 0) {
    page.append(note(s.addNone));
    return page;
  }
  page.append(group(...missing.map(m => {
    const key = `add.${m.id}`;
    return moduleRow(ctx, m, button(key, s.addOne, () => {
      const pending = ctx.bridge.reinstallModule(m.id);
      ctx.save(key, pending);
      pending.then(() => ctx.go({ page: 'modules' }), () => {});
    }));
  })));
  return page;
};
