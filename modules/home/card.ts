import { dotBar, dotText } from '../../src/kit/dots';
import type { Lang } from '../../src/kit/protocol';
import { clock, dayKey, degrees, dueAt, nearest, parseTime, progress, reminderLabel, remaining, weatherKey } from './format';
import type id from './locales/id.json';
import type { HomeSnapshot, Reminder } from './types';

export type HomeStrings = typeof id;

export interface HomeActions {
  add(title: string, day: string, at: number | null): Promise<void>;
  setDone(id: number, done: boolean): Promise<void>;
}

export interface HomeCard {
  readonly view: 'main' | 'list';
  update(s: HomeSnapshot, now: Date): void;
}

const PITCH = 8;
const BAR_DOTS = 18;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function svgBox(cls: string, svg: string): HTMLDivElement {
  const d = el('div', cls);
  d.innerHTML = svg;
  return d;
}

// Beranda N2 (beranda-nothing.html): today, weather and what comes next, split
// by dotted lines, over a row of running modules and a small clock. The next
// column opens the full reminder list.
export function renderHome(root: HTMLElement, strings: HomeStrings, lang: Lang, actions: HomeActions): HomeCard {
  let view: 'main' | 'list' = 'main';
  let snap: HomeSnapshot | null = null;
  let now = new Date();
  // The list's inputs live across updates, so typing and focus survive them.
  let list: { head: HTMLElement; items: HTMLElement } | null = null;

  function reminderRow(r: Reminder, withButton: boolean): HTMLElement {
    const row = el('div', r.done ? 'rm done' : 'rm');
    const ck = withButton ? el('button', 'ck') : el('span', 'ck');
    if (ck instanceof HTMLButtonElement) {
      ck.type = 'button';
      ck.setAttribute('aria-pressed', String(r.done));
      ck.setAttribute('aria-label', r.done ? strings.markOpen : strings.markDone);
      ck.addEventListener('click', () => void actions.setDone(r.id, !r.done).catch(() => {}));
    }
    row.append(ck, el('span', 't', r.title), el('span', 'm', reminderLabel(r, now, lang, strings)));
    return row;
  }

  function todayColumn(): HTMLElement {
    const col = el('div', 'col');
    col.dataset.k = 'today';
    const top = el('div', 'lab');
    top.append(el('i', 'rd'), new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(now));
    col.append(top, svgBox('big', dotText(String(now.getDate()), PITCH)),
      el('div', 'lab', new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(now)));
    return col;
  }

  function weatherColumn(s: HomeSnapshot): HTMLElement {
    const col = el('div', 'col');
    col.dataset.k = 'weather';
    const w = s.weather;
    const sub = !s.place ? strings.noPlace
      : w ? `${strings.weatherKinds[weatherKey(w.code)]} · ${degrees(w.min)}/${degrees(w.max)}` : '—';
    col.append(el('div', 'lab', s.place?.name ?? strings.weather),
      w ? svgBox('big', dotText(degrees(w.temp), PITCH)) : el('div', 'big'), el('div', 'lab', sub));
    return col;
  }

  function nextColumn(s: HomeSnapshot): HTMLElement {
    const col = el('div', 'col');
    col.dataset.k = 'next';
    col.setAttribute('role', 'button');
    col.tabIndex = 0;
    col.append(el('div', 'lab', strings.next));
    if (s.prayer) {
      const { prev, next } = s.prayer;
      const bar = svgBox('bar', dotBar(BAR_DOTS, progress(prev.at, next.at, now.getTime(), BAR_DOTS)));
      bar.append(el('span', 'lab', remaining(next.at - now.getTime(), lang)));
      col.append(el('div', 'next', `${strings.prayers[next.name]} ${clock(next.at, lang)}`), bar);
    }
    const rms = el('div', 'rms');
    const two = nearest(s.reminders, 2);
    if (two.length === 0) rms.append(el('div', 'rm empty', strings.noReminders));
    else rms.append(...two.map(r => reminderRow(r, false)));
    col.append(rms);
    col.addEventListener('click', openList);
    col.addEventListener('keydown', e => { if (e.key === 'Enter') openList(); });
    return col;
  }

  function foot(s: HomeSnapshot): HTMLElement {
    const f = el('div', 'foot');
    for (const st of s.statuses) {
      const span = el('span', '', `${st.label} `);
      span.append(el('b', '', st.value));
      f.append(span);
    }
    if (s.showClock) f.append(el('span', 'clk', clock(now.getTime(), lang)));
    return f;
  }

  function renderMain(): void {
    if (!snap) return;
    const home = el('div', 'home');
    const cols = el('div', 'cols');
    cols.append(todayColumn(), el('div', 'vdots'), weatherColumn(snap), el('div', 'vdots'), nextColumn(snap));
    home.append(cols, el('div', 'hdots'), foot(snap));
    root.replaceChildren(home);
  }

  function fillList(): void {
    if (!snap || !list) return;
    const open = nearest(snap.reminders, Infinity);
    const done = snap.reminders.filter(r => r.done).sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id);
    list.head.textContent = `${strings.reminders} · ${open.length}`;
    list.items.replaceChildren(...[...open, ...done].map(r => reminderRow(r, true)));
  }

  function openList(): void {
    view = 'list';
    const wrap = el('div', 'list');
    const head = el('div', 'head');
    const count = el('span', 'lab');
    const back = el('button', 'back', strings.back);
    back.type = 'button';
    back.addEventListener('click', () => {
      view = 'main';
      list = null;
      renderMain();
    });
    head.append(count, back);

    const add = el('div', 'add');
    const title = el('input', 'title');
    title.placeholder = strings.newReminder;
    title.maxLength = 80;
    const time = el('input', 'time');
    time.placeholder = strings.time;
    time.maxLength = 5;
    const err = el('span', 'lab err');
    const submit = (): void => {
      const text = title.value.trim();
      if (!text) return;
      let day = dayKey(now);
      let at: number | null = null;
      if (time.value.trim()) {
        const t = parseTime(time.value);
        if (!t) {
          err.textContent = strings.badTime;
          return;
        }
        ({ day, at } = dueAt(t, now));
      }
      err.textContent = '';
      actions.add(text, day, at).then(() => {
        title.value = '';
        time.value = '';
      }, () => { err.textContent = strings.addFailed; });
    };
    for (const input of [title, time]) {
      input.type = 'text';
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });
    }
    add.append(title, time, err);

    const items = el('div', 'items');
    wrap.append(head, add, items);
    list = { head: count, items };
    root.replaceChildren(wrap);
    fillList();
    title.focus();
  }

  return {
    get view() { return view; },
    update(s, at) {
      snap = s;
      now = at;
      if (view === 'main') renderMain();
      else fillList();
    },
  };
}
