import { fill } from '../../i18n';
import type { Page } from '../../modules/types';
import { MODULES_ICON, pageIconSvg } from '../../pages/icons';
import { dragWith, dropIndex } from '../drag';
import { button, el, group, head, note } from '../controls';
import type { PageContext, PageRender } from '../types';
import { sharedData } from './home';

// A page just added whose state has not come back yet: its editor waits for it
// instead of going back to the list.
let added: string | null = null;
export const waitingFor = (id: string): boolean => id === added;
export function arrived(id: string): void {
  if (id === added) added = null;
}

// A page's fixed line icon. The SVG is one of src/pages/icons.ts, never the
// person's text, so it may go in as markup.
export function pageIcon(svg: string): HTMLElement {
  const span = el('span', 'icon pg-icon');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svg;
  return span;
}

// Opens on click or Enter, like a module row.
function opens(r: HTMLElement, key: string, open: () => void): void {
  r.dataset.key = key;
  r.setAttribute('role', 'button');
  r.tabIndex = 0;
  r.addEventListener('click', open);
  r.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === r) open(); });
}

// One line in the pill order: icon, name and how full the page is.
export function pageRow(ctx: PageContext, page: Page | 'modules'): HTMLElement {
  const s = ctx.strings.pages;
  const r = el('div', 'row page-row');
  const t = el('div', 't');
  if (page === 'modules') {
    r.dataset.row = 'page.modules';
    t.append(el('span', 'label', ctx.strings.sections.modules));
    r.append(pageIcon(MODULES_ICON), t, el('span', 'size', s.modulesRow));
  } else {
    r.dataset.row = `page.${page.id}`;
    t.append(el('span', 'label', page.name ?? ctx.strings.home.homeName));
    r.append(pageIcon(pageIconSvg(page.icon)), t, el('span', 'size', fill(s.widgets, { n: page.widgets.length })));
  }
  return r;
}

// Custom pages move by their grip or Alt+↑/↓; Beranda and Modul stay put.
function movable(ctx: PageContext, r: HTMLElement, list: () => HTMLElement[], id: string, at: number, count: number): void {
  const move = (to: number) => ctx.save(`page.${id}`, ctx.bridge.movePage(id, to));
  r.addEventListener('keydown', e => {
    if (!e.altKey || e.target !== r) return;
    if (e.key === 'ArrowUp' && at > 0) move(at - 1);
    else if (e.key === 'ArrowDown' && at < count - 1) move(at + 1);
    else return;
    e.preventDefault();
  });
  const grip = el('span', 'ed-grip', '⋮⋮');
  grip.setAttribute('aria-hidden', 'true');
  grip.title = ctx.strings.pages.move;
  grip.addEventListener('click', e => e.stopPropagation());
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    r.classList.add('ed-dragging');
    const others = () => list().filter(x => x !== r);
    const mark = (y: number) => {
      const rows = others();
      const i = dropIndex(rows.map(x => mid(x)), y);
      rows.forEach((x, j) => x.classList.toggle('ed-target', j === i || (i === rows.length && j === rows.length - 1)));
      return i;
    };
    const end = () => {
      r.classList.remove('ed-dragging');
      others().forEach(x => x.classList.remove('ed-target'));
    };
    dragWith(e, {
      onMove: (_x, y) => { mark(y); },
      onDrop: (_x, y) => {
        const to = mark(y);
        end();
        if (to !== at) move(to);
      },
      onCancel: end,
    });
  });
  r.prepend(grip);
}

const mid = (e: HTMLElement) => {
  const b = e.getBoundingClientRect();
  return b.top + b.height / 2;
};

// Halaman (design 30 Oct §9): the data the widgets share, then the pages in pill order.
export const pagesPage: PageRender = ctx => {
  const s = ctx.strings.pages;
  const page = el('div');
  const add = button('pages.add', s.add, () => {
    const pending = ctx.bridge.addPage(s.newName, 'star');
    ctx.save('pages.add', pending.then(() => {}));
    pending.then(id => {
      added = id;
      ctx.go({ page: 'pageEdit', id });
    }, () => {});
  }, true);

  const custom = ctx.state.pages.filter(p => p.id !== 'home');
  const customRows: HTMLElement[] = [];
  const rows = ctx.state.pages.map(p => {
    const r = pageRow(ctx, p);
    opens(r, `page.${p.id}`, () => ctx.go({ page: 'pageEdit', id: p.id }));
    if (p.id !== 'home') {
      movable(ctx, r, () => customRows, p.id, custom.indexOf(p), custom.length);
      customRows.push(r);
    }
    return r;
  });
  const modules = pageRow(ctx, 'modules');
  opens(modules, 'page.modules', () => ctx.go({ page: 'modules' }));

  page.append(
    head({ title: ctx.strings.sections.pages, sub: s.sub, side: add }),
    el('div', 'grp-label', s.data),
    sharedData(ctx),
    el('div', 'grp-label', s.order),
    group(...rows, modules),
    note(s.fixedHint),
  );
  return page;
};
