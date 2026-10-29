import { el, group, head, note, row } from '../controls';
import type { PageRender } from '../types';

// Permissions have no features yet; the page says so plainly.
export const permissionsPage: PageRender = ctx => {
  const page = el('div');
  page.append(head({ title: ctx.strings.sections.permissions, sub: ctx.strings.permissions.sub }),
    note(ctx.strings.permissions.note));
  return page;
};

export const aboutPage: PageRender = ctx => {
  const s = ctx.strings.about;
  const page = el('div');
  page.append(
    head({ title: ctx.strings.sections.about }),
    el('div', 'app-name', s.name),
    group(row({ key: 'about.version', label: s.version, control: el('span', 'mono', ctx.info.version) })),
    note(s.trust),
    note(s.later),
  );
  return page;
};
