import { fill } from '../../i18n';
import type { Page } from '../../modules/types';
import { MODULES_ICON, pageIconSvg } from '../../pages/icons';
import { el, group, head } from '../controls';
import type { PageContext, PageRender } from '../types';
import { sharedData } from './home';

// A page's fixed line icon. The SVG is one of src/pages/icons.ts, never the
// person's text, so it may go in as markup.
function pageIcon(svg: string): HTMLElement {
  const span = el('span', 'icon pg-icon');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svg;
  return span;
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

// Halaman (design 30 Oct §9): the data the widgets share, then the pages in pill order.
export const pagesPage: PageRender = ctx => {
  const s = ctx.strings.pages;
  const page = el('div');
  page.append(
    head({ title: ctx.strings.sections.pages, sub: s.sub }),
    el('div', 'grp-label', s.data),
    sharedData(ctx),
    el('div', 'grp-label', s.order),
    group(...ctx.state.pages.map(p => pageRow(ctx, p)), pageRow(ctx, 'modules')),
  );
  return page;
};
