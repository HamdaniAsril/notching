import { el, group, head, note, row } from '../controls';
import type { PageRender } from '../types';

// Notifications and permissions have no features yet; their pages say so plainly.
export const notificationsPage: PageRender = ctx => {
  const page = el('div');
  page.append(head({ title: ctx.strings.sections.notifications, sub: ctx.strings.notifications.sub }),
    note(ctx.strings.notifications.note));
  return page;
};

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
