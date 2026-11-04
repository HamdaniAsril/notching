import { CHANGELOG } from '../changelog';
import { el, head } from '../controls';
import type { PageRender } from '../types';

const parts = (v: string) => v.split('.').map(Number);
// a is newer than b.
function newer(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

// Yang baru (owner, 4 Nov): each version's changes, newest first, from the list
// kept in the app. The running one says so; one not released yet says that.
export const whatsNewPage: PageRender = ctx => {
  const s = ctx.strings.whatsNew;
  const date = new Intl.DateTimeFormat(ctx.lang === 'en' ? 'en-GB' : 'id-ID', { dateStyle: 'long' });
  const page = el('div');
  page.append(head({ title: ctx.strings.sections.whatsnew, sub: s.sub }));
  for (const entry of CHANGELOG) {
    const card = el('section', 'news');
    card.dataset.row = `whatsnew.${entry.version}`;
    const top = el('div', 'news-head');
    top.append(el('span', 'news-version', entry.version));
    if (entry.version === ctx.info.version) top.append(el('span', 'news-tag on', s.thisVersion));
    else if (entry.date === null || newer(entry.version, ctx.info.version)) top.append(el('span', 'news-tag', s.coming));
    if (entry.date) top.append(el('span', 'news-date', date.format(new Date(`${entry.date}T12:00:00`))));
    const list = el('ul', 'news-list');
    list.append(...entry.items[ctx.lang].map(item => el('li', undefined, item)));
    card.append(top, list);
    page.append(card);
  }
  return page;
};
