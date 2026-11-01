import { button, el, group, row, select, toggle } from '../controls';
import type { PageContext, Place, PrayerMethod } from '../types';

// Same order as the method table in plan 4; Kemenag RI is the default.
export const PRAYER_METHODS: PrayerMethod[] = [
  'kemenag', 'singapore', 'muslimWorldLeague', 'egyptian', 'karachi', 'ummAlQura', 'northAmerica',
];

// "Bandung, Jawa Barat, Indonesia"; empty or repeated parts are left out.
export function placeLabel(p: Place): string {
  const parts: string[] = [];
  for (const part of [p.name, p.region, p.country]) {
    if (part && !parts.includes(part)) parts.push(part);
  }
  return parts.join(', ');
}

type Status = 'idle' | 'searching' | 'none' | 'failed';

// The city search outlives page rebuilds (every broadcast rebuilds the page), so
// it sits here rather than in the page. `seq` drops answers to older searches.
const draft = { open: false, query: '', status: 'idle' as Status, results: [] as Place[], seq: 0 };

function closeDraft(): void {
  Object.assign(draft, { open: false, query: '', status: 'idle', results: [], seq: draft.seq + 1 });
}

// The page the city and prayer rows sit on (Umum, owner 1 Nov).
const HOME_ROUTE = { page: 'general' } as const;

function placeRow(ctx: PageContext): HTMLElement {
  const s = ctx.strings.home;
  const place = ctx.info.home.place;
  const ctl = el('div', 'ctl');
  ctl.append(
    el('span', place ? 'place' : 'place none', place ? placeLabel(place) : s.placeNone),
    button('home.placeChange', place ? s.placeChange : s.placeSet, () => {
      draft.open = true;
      ctx.go(HOME_ROUTE);
      // go() has rebuilt the page by now.
      document.querySelector<HTMLElement>('[data-key="home.placeSearch"]')?.focus();
    }),
  );
  const r = row({ key: 'home.place', label: s.place, hint: s.placeHint, control: ctl });
  if (draft.open) r.append(finder(ctx));
  return r;
}

// Searches only on Enter or the Search button: nothing is sent while typing (spec 3).
function finder(ctx: PageContext): HTMLElement {
  const s = ctx.strings.home;
  const box = el('div', 'place-find');
  const input = el('input', 'field');
  input.type = 'text';
  input.dataset.key = 'home.placeSearch';
  input.placeholder = s.placeSearch;
  input.setAttribute('aria-label', s.place);
  input.value = draft.query;
  input.addEventListener('input', () => { draft.query = input.value; });

  const find = (): void => {
    const query = draft.query.trim();
    if (!query) return;
    const seq = ++draft.seq;
    draft.status = 'searching';
    draft.results = [];
    ctx.go(HOME_ROUTE);
    ctx.bridge.searchPlaces(query).then(results => {
      if (seq !== draft.seq) return;
      Object.assign(draft, { results, status: results.length ? 'idle' : 'none' });
      ctx.go(HOME_ROUTE);
    }, () => {
      if (seq !== draft.seq) return;
      draft.status = 'failed';
      ctx.go(HOME_ROUTE);
    });
  };
  const cancel = (): void => {
    closeDraft();
    ctx.go(HOME_ROUTE);
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      find();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cancel();
    }
  });

  const line = el('div', 'find-line');
  line.append(input, button('home.placeFind', s.placeFind, find, true), button('home.placeCancel', s.placeCancel, cancel));
  box.append(line);

  const messages: Record<Status, string> = { idle: '', searching: s.placeSearching, none: s.placeNotFound, failed: s.placeFailed };
  if (messages[draft.status]) box.append(el('small', 'find-note', messages[draft.status]));
  if (draft.results.length) {
    const list = el('div', 'places');
    draft.results.forEach((p, i) => {
      const b = el('button', 'place-pick', placeLabel(p));
      b.type = 'button';
      b.dataset.key = `home.place.${i}`;
      b.addEventListener('click', () => {
        const pending = ctx.bridge.setPlace(p);
        ctx.save('home.place', pending);
        pending.then(() => { closeDraft(); ctx.go(HOME_ROUTE); }, () => {});
      });
      list.append(b);
    });
    box.append(list);
  }
  return box;
}

// Data the built-in widgets share (design 30 Oct §9): the city, the prayer
// method and the prayer notice, which runs whether or not a widget shows it.
// Shown on Umum.
export function sharedData(ctx: PageContext): HTMLElement {
  const s = ctx.strings.home;
  const home = ctx.info.home;
  const method = select('home.prayerMethod', PRAYER_METHODS.map(m => ({ value: m, label: s.methods[m] })), home.prayerMethod,
    v => ctx.save('home.prayerMethod', ctx.bridge.setPrayerMethod(v as PrayerMethod)));
  // The same switch as "Waktu sholat · Tampil" on the Notifikasi page.
  const prayer = ctx.state.modules.find(m => m.id === 'home')?.channels.find(c => c.id === 'prayer')
    ?? { on: false, sound: false };
  const prayerNotice = toggle('home.prayerNotice', s.prayerNotice, prayer.on,
    on => ctx.save('home.prayerNotice', ctx.bridge.setChannel('home', 'prayer', { on, sound: prayer.sound })));
  return group(
    placeRow(ctx),
    row({ key: 'home.prayerMethod', label: s.prayerMethod, hint: s.prayerMethodHint, control: method }),
    row({ key: 'home.prayerNotice', label: s.prayerNotice, hint: s.prayerNoticeHint, control: prayerNotice }),
  );
}
