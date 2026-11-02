import type { Lang } from '../../../src/kit/protocol';
import { monthShort, shortDay, zoneLabel } from '../../../src/kit/dates';
import { bar, lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { clockText } from '../zones';

const T = { id, en };
const two = (n: number) => String(n).padStart(2, '0');
// "SAB" to "Sab".
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// The widget's content for `now`: the city and "Sab, 31 Okt" over the time with the seconds
// small in the accent, and a bar of the day gone. Also what the editor's sample draws.
export function clockDateView(_root: HTMLElement, lang: Lang, now: Date, city: string | null): HTMLElement {
  const w = el('div', 'v-card wd-clockdate');
  const top = el('div', 'wd-top');
  top.append(
    lab(city ?? zoneLabel(lang, now), 'ink wd-city'),
    el('span', 'wd-date', `${cap(shortDay(now, lang))}, ${now.getDate()} ${cap(monthShort(now, lang))}`),
  );

  const time = el('div', 'wd-time');
  time.append(num(clockText(now.getHours(), now.getMinutes(), lang), 52), num(two(now.getSeconds()), 17, 'v-acc wd-sec'));

  const gone = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
  const day = el('div', 'wd-day');
  day.append(bar(gone), el('span', 'wd-pct', T[lang].dayPct.replace('{n}', String(Math.round(gone * 100)))));

  w.append(top, time, day);
  return w;
}

// Jam + tanggal. The seconds show, so the page redraws each second.
export function renderClockDate(root: HTMLElement, lang: Lang): { update(now: Date, city: string | null): void } {
  return {
    update(now, city) {
      root.replaceChildren(clockDateView(root, lang, now, city));
    },
  };
}
