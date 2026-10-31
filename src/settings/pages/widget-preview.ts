import { dotBar, dotText, fitPitch } from '../../kit/dots';
import type { Lang } from '../../kit/protocol';
import type { CatalogWidget } from '../../pages/layout';
import { el } from '../controls';

// A picture of a widget for the page editor: sample content drawn the way the
// widget draws it, at its size in the notch, on black. Not live data. The list's
// cards shrink it by a fixed amount in CSS, so it never stretches with the window.

// One dot smaller when the column is too narrow, as the widget does.
const COLUMN_PX = 109;
const AT = new Date(2026, 9, 30, 9, 32);

const SAMPLE: Record<Lang, { city: string; sky: string; prayer: string; next: string; reminders: string; rows: string[] }> = {
  id: { city: 'Jakarta', sky: 'Berawan', prayer: 'Sholat', next: 'Asar 15.12', reminders: 'Reminder · 3',
    rows: ['Kirim invoice', 'Bayar listrik', 'Telepon ibu'] },
  en: { city: 'Jakarta', sky: 'Cloudy', prayer: 'Prayer', next: 'Asr 3:12', reminders: 'Reminders · 3',
    rows: ['Send invoice', 'Pay the bill', 'Call mum'] },
};

function dots(text: string): HTMLElement {
  const d = el('div', 'ed-dots');
  d.innerHTML = dotText(text, fitPitch(text, COLUMN_PX)); // digits only, drawn as circles
  return d;
}

const lab = (text: string) => el('div', 'lab', text);

// The sample content alone, for a column of the notch preview or a card.
export function widgetSample(w: CatalogWidget, lang: Lang): HTMLElement[] {
  const s = SAMPLE[lang];
  switch (w.ref) {
    case 'home/date': {
      const day = lab(new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(AT));
      day.prepend(el('i', 'rd'));
      return [day, dots('30'), lab(new Intl.DateTimeFormat(lang, { month: 'long' }).format(AT))];
    }
    case 'home/clock':
      return [dots('09'), dots('32')];
    case 'home/weather':
      return [lab(s.city), dots('31°'), lab(s.sky)];
    case 'home/prayer': {
      const bar = el('div', 'ed-dots');
      bar.innerHTML = dotBar(16, 10);
      return [lab(s.prayer), el('div', 'ed-line', s.next), bar];
    }
    case 'home/reminders':
      return [lab(s.reminders), ...s.rows.map(t => {
        const r = el('div', 'rm');
        r.append(el('i', 'ck'), el('span', 't', t));
        return r;
      })];
    default:
      return [el('div', 'ed-plain', w.name)];
  }
}

export function widgetPreview(w: CatalogWidget, lang: Lang): HTMLElement {
  const shot = el('div', 'ed-shot');
  shot.dataset.width = String(w.width);
  shot.setAttribute('aria-hidden', 'true');
  shot.append(...widgetSample(w, lang));
  return shot;
}
