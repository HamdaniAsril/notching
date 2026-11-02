import { zoneLabel } from '../../../src/kit/dates';
import type { Lang } from '../../../src/kit/protocol';
import { lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';
import { checkZones, cityByCode, CITIES, clockText, diffLabel, isNight, zoneTime, type ZonePrefs } from '../zones';

export interface ZonesStrings {
  zonesTitle: string; // "Zona waktu" / "World clock"
  zonesCount: string; // "{n} kota" / "{n} cities"
  zoneField: string; // "Kota {n}" / "City {n}"
  save: string;
  saveFailed: string;
  back: string;
  here: string; // "Di sini" / "Here"
  hours: string; // "jam" / "hr"
  night: string; // "malam" / "night"
}

export interface ZonesActions {
  save(p: ZonePrefs): Promise<void>;
  expand(height: number): void; // asks the notch for the full view
  collapse(): void;
}

export interface ZonesWidget {
  update(p: ZonePrefs, now: Date): void;
  setHome(city: string | null): void; // the home city's name, as clockdate has it
  setFull(full: boolean): void;
}

// The full view's height: a heading, two city lists and Simpan.
const FULL_HEIGHT = 220;

// One column: the city, its clock, and the line under it (`sub`).
function column(name: string, text: string, night: boolean, sub: string, home: boolean): HTMLElement {
  const col = el('div', `wd-zone-col${night ? ' night' : ''}`);
  col.dataset.time = text;
  col.append(el('span', home ? 'wd-zone-city v-acc' : 'wd-zone-city', name), num(text, 25), el('span', 'wd-zone-sub', sub));
  return col;
}

// The row view for `now`: the title and count over the home city and the two chosen cities
// with their hours from home. `home` is the home city's name, or null for the zone's.
// Also what the editor's sample draws.
export function zonesView(s: ZonesStrings, lang: Lang, p: ZonePrefs, now: Date, home: string | null = null): HTMLElement {
  const w = el('div', 'v-card wd-zones');
  const head = el('div', 'wd-zone-head');
  head.append(lab(s.zonesTitle, 'ink'), lab(s.zonesCount.replace('{n}', '3')));

  const here = zoneTime(undefined, now);
  const cols = el('div', 'wd-zone-cols');
  cols.append(column(home ?? zoneLabel(lang, now), clockText(here.h, here.m, lang), isNight(here.h), s.here, true));
  cols.append(el('i', 'wd-zone-line'));
  p.cities.forEach((code, i) => {
    const city = cityByCode(code);
    const z = zoneTime(city.tz, now);
    const night = isNight(z.h);
    const diff = `${diffLabel(here.offsetMin, z.offsetMin, lang)} ${s.hours}`;
    cols.append(column(city[lang], clockText(z.h, z.m, lang), night, night ? `${diff} · ${s.night}` : diff, false));
    if (i === 0) cols.append(el('i', 'wd-zone-line'));
  });
  w.append(head, cols);
  return w;
}

// Zona waktu (2 columns): the home city and two chosen cities. A click asks for the full view,
// where the cities are picked.
export function renderZones(root: HTMLElement, s: ZonesStrings, lang: Lang, act: ZonesActions): ZonesWidget {
  let full = false;
  let prefs: ZonePrefs | null = null;
  let now = new Date();
  let home: string | null = null;

  function renderRow(): void {
    if (!prefs) return;
    const w = zonesView(s, lang, prefs, now, home);
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
    box.append(lab(s.zoneField.replace('{n}', String(n))), list);
    return { box, list };
  }

  function renderFull(): void {
    const form = checkZones(prefs);

    const head = el('div', 'wd-zone-fhead');
    const back = el('button', 'wd-zone-back', `‹ ${s.back}`);
    back.type = 'button';
    back.addEventListener('click', () => act.collapse());
    // As on a module page: back first, the name on the right.
    head.append(back, lab(s.zonesTitle, 'ink'));

    const first = field(1, form.cities[0], code => { form.cities[0] = code; });
    const second = field(2, form.cities[1], code => { form.cities[1] = code; });
    const fields = el('div', 'wd-zone-fields');
    fields.append(first.box, second.box);

    const submit = el('button', 'wd-zone-save', s.save);
    submit.type = 'button';
    const err = lab('', 'wd-zone-err');
    submit.addEventListener('click', () => {
      err.textContent = '';
      act.save(checkZones(form)).then(() => act.collapse(), () => { err.textContent = s.saveFailed; });
    });

    const foot = el('div', 'wd-zone-foot');
    foot.append(err, submit);
    const wrap = el('div', 'v-card wd-zone-full');
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
    setHome(city) {
      home = city;
      if (!full) renderRow();
    },
  };
}
