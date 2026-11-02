import type { Lang } from '../../../src/kit/protocol';
import { shortDay, zoneLabel } from '../../../src/kit/dates';
import { big, dotRow, el } from '../../../src/kit/widget';

const pad = (n: number) => String(n).padStart(2, '0');

// The widget's content for `now`: "<CITY> · <zone>" and "<day> <dd>.<mm>" over the time in
// dots and a row of 24 for the hours. Also what the editor's sample draws.
export function clockDateView(root: HTMLElement, lang: Lang, now: Date, city: string | null): HTMLElement {
  const zone = zoneLabel(lang, now);
  const w = el('div', 'wd wd-clockdate');
  const top = el('div', 'wd-top');
  top.append(
    el('div', 'lab', city ? `${city.toUpperCase()} · ${zone}` : zone),
    el('div', 'lab', `${shortDay(now, lang)} ${pad(now.getDate())}.${pad(now.getMonth() + 1)}`),
  );
  const hour = now.getHours();
  w.append(top, big(root, `${pad(hour)}:${pad(now.getMinutes())}`), dotRow(24, hour, hour));
  return w;
}

// Jam + tanggal.
export function renderClockDate(root: HTMLElement, lang: Lang): { update(now: Date, city: string | null): void } {
  return {
    update(now, city) {
      root.replaceChildren(clockDateView(root, lang, now, city));
    },
  };
}
