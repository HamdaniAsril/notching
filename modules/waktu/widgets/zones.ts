import { zoneLabel } from '../../../src/kit/dates';
import type { Lang } from '../../../src/kit/protocol';
import { el, small } from '../../../src/kit/widget';
import { checkZones, cityByCode, CITIES, diffLabel, isNight, zoneTime, type ZonePrefs } from '../zones';

export interface ZonesStrings {
  zonesTitle: string; // "Zona waktu" / "World clock"
  zonesCount: string; // "{n} kota" / "{n} cities"
  zoneField: string; // "Kota {n}" / "City {n}"
  save: string;
  saveFailed: string;
  back: string;
}

export interface ZonesActions {
  save(p: ZonePrefs): Promise<void>;
  expand(height: number): void; // asks the notch for the full view
  collapse(): void;
}

export interface ZonesWidget {
  update(p: ZonePrefs, now: Date): void;
  setFull(full: boolean): void;
}

// The full view's height: a heading, two city lists and Simpan.
const FULL_HEIGHT = 220;

const pad = (n: number) => String(n).padStart(2, '0');

// One column: the code and the hours from local over the time in dots and a marker.
function column(code: string, diff: string, h: number, m: number, local: boolean): HTMLElement {
  const text = `${pad(h)}:${pad(m)}`;
  const col = el('div', `wd-zone-col${isNight(h) ? ' night' : ''}`);
  col.dataset.time = text;
  const top = el('div', 'wd-zone-top');
  top.append(el('span', 'lab wd-zone-code', code), el('span', 'lab wd-zone-diff', diff));
  col.append(top, small(text, 2, 'wd-small wd-zone-time'), el('i', `wd-zone-mark${local ? ' local' : ''}`));
  return col;
}

// The row view for `now`: the title and count over the local time and the two chosen cities.
// Also what the editor's sample draws.
export function zonesView(s: ZonesStrings, lang: Lang, p: ZonePrefs, now: Date): HTMLElement {
  const w = el('div', 'wd wd-zones');
  const head = el('div', 'wd-zone-head');
  head.append(el('span', 'lab', s.zonesTitle.toUpperCase()), el('span', 'lab', s.zonesCount.replace('{n}', '3').toUpperCase()));

  const here = zoneTime(undefined, now);
  const cols = el('div', 'wd-zone-cols');
  cols.append(column(zoneLabel(lang, now).toUpperCase(), '', here.h, here.m, true));
  for (const code of p.cities) {
    const z = zoneTime(cityByCode(code).tz, now);
    cols.append(column(code, diffLabel(here.offsetMin, z.offsetMin, lang), z.h, z.m, false));
  }
  w.append(head, cols);
  return w;
}

// Zona waktu (2 columns): local time and two chosen cities. A click asks for the full view,
// where the cities are picked.
export function renderZones(root: HTMLElement, s: ZonesStrings, lang: Lang, act: ZonesActions): ZonesWidget {
  let full = false;
  let prefs: ZonePrefs | null = null;
  let now = new Date();

  function renderRow(): void {
    if (!prefs) return;
    const w = zonesView(s, lang, prefs, now);
    w.setAttribute('role', 'button');
    w.tabIndex = 0;
    w.addEventListener('click', () => act.expand(FULL_HEIGHT));
    w.addEventListener('keydown', e => { if (e.key === 'Enter') act.expand(FULL_HEIGHT); });
    root.replaceChildren(w);
  }

  // Cities by name in the person's language.
  const sorted = [...CITIES].sort((a, b) => a[lang].localeCompare(b[lang], lang));

  function field(n: 1 | 2, value: string, onChange: (code: string) => void): { box: HTMLElement; list: HTMLSelectElement } {
    const box = el('label', 'wd-zone-field');
    const list = el('select', 'wd-zone-select');
    for (const c of sorted) {
      const o = el('option', '', c[lang]);
      o.value = c.code;
      list.append(o);
    }
    list.value = value;
    list.addEventListener('change', () => onChange(list.value));
    box.append(el('span', 'lab', s.zoneField.replace('{n}', String(n)).toUpperCase()), list);
    return { box, list };
  }

  function renderFull(): void {
    const form = checkZones(prefs);

    const head = el('div', 'wd-zone-fhead');
    const back = el('button', 'wd-zone-back', `‹ ${s.back}`);
    back.type = 'button';
    back.addEventListener('click', () => act.collapse());
    // As on a module page: back first, the name on the right.
    head.append(back, el('span', 'lab', s.zonesTitle.toUpperCase()));

    const first = field(1, form.cities[0], code => { form.cities[0] = code; });
    const second = field(2, form.cities[1], code => { form.cities[1] = code; });
    const fields = el('div', 'wd-zone-fields');
    fields.append(first.box, second.box);

    const submit = el('button', 'wd-zone-save', s.save);
    submit.type = 'button';
    const err = el('span', 'lab wd-zone-err');
    submit.addEventListener('click', () => {
      err.textContent = '';
      act.save(checkZones(form)).then(() => act.collapse(), () => { err.textContent = s.saveFailed; });
    });

    const foot = el('div', 'wd-zone-foot');
    foot.append(err, submit);
    const wrap = el('div', 'wd-zone-full');
    wrap.append(head, fields, foot);
    root.replaceChildren(wrap);
    first.list.focus();
  }

  return {
    setFull(next) {
      if (next === full) return;
      full = next;
      if (full) renderFull();
      else renderRow();
    },
    update(p, at) {
      prefs = p;
      now = at;
      if (!full) renderRow();
    },
  };
}
