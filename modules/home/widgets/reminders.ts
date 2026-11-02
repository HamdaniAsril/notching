import type { Lang } from '../../../src/kit/protocol';
import { lab } from '../../../src/kit/volt';
import { dayKey, dueAt, nearest, parseTime, reminderLabel } from '../format';
import type { HomeSnapshot, Reminder } from '../types';
import { el, type HomeStrings } from './shared';

export interface ReminderActions {
  add(title: string, day: string, at: number | null): Promise<void>;
  setDone(id: number, done: boolean): Promise<void>;
  expand(height: number): void; // asks the notch for the full view
  collapse(): void;
}

export interface RemindersWidget {
  readonly full: boolean;
  setFull(full: boolean): void;
  update(s: HomeSnapshot, now: Date): void;
}

// The full view's height: the card's 12 px above and below, the heading and the field (46 px)
// and six rows 18 px tall with 3 px between them; more rows scroll.
const FULL_HEIGHT = 24 + 46 + 6 * 18 + 5 * 3;

// One reminder row; the next one to come is in the accent. `onDone`: the circle is a button
// that marks it done (the full view); without it the circle is only a mark.
function rowOf(r: Reminder, now: Date, lang: Lang, strings: HomeStrings, next: boolean,
  onDone: ((r: Reminder) => void) | null): HTMLElement {
  const row = el('div', `rm${r.done ? ' done' : ''}${next ? ' next' : ''}`);
  const ck = onDone ? el('button', 'ck') : el('span', 'ck');
  if (ck instanceof HTMLButtonElement && onDone) {
    ck.type = 'button';
    ck.setAttribute('aria-pressed', String(r.done));
    ck.setAttribute('aria-label', r.done ? strings.markOpen : strings.markDone);
    ck.addEventListener('click', () => onDone(r));
  }
  row.append(ck, el('span', 't', r.title), el('span', next ? 'm v-acc' : 'm', reminderLabel(r, now, lang, strings)));
  return row;
}

// The widget's content: "Hari ini" with how many of today's reminders are done, and the nearest
// open ones, the first in the accent. Also what the editor's sample draws.
export function remindersView(strings: HomeStrings, lang: Lang, reminders: Reminder[], now: Date): HTMLElement {
  const w = el('div', 'v-card wd-reminders');
  const head = el('div', 'hm-rem-head');
  const today = reminders.filter(r => r.day === dayKey(now));
  head.append(lab(strings.today, 'ink'), el('span', 'hm-rem-done',
    today.length === 0 ? '' : strings.doneOf.replace('{done}', String(today.filter(r => r.done).length)).replace('{total}', String(today.length))));
  const rms = el('div', 'rms');
  const near = nearest(reminders, 3);
  if (near.length === 0) rms.append(el('div', 'rm empty', strings.noReminders));
  else rms.append(...near.map((r, i) => rowOf(r, now, lang, strings, i === 0, null)));
  w.append(head, rms);
  return w;
}

// Reminder (2 columns): the three nearest reminders. A click asks for the full
// view, which lists them all with a field to add one and circles to mark them done.
export function renderReminders(root: HTMLElement, strings: HomeStrings, lang: Lang, actions: ReminderActions):
  RemindersWidget {
  let full = false;
  let snap: HomeSnapshot | null = null;
  let now = new Date();
  // The list's inputs live across updates, so typing and focus survive them.
  let list: { head: HTMLElement; items: HTMLElement } | null = null;

  const count = () => `${strings.reminders} · ${snap ? nearest(snap.reminders, Infinity).length : 0}`;

  function renderSmall(): void {
    if (!snap) return;
    const w = remindersView(strings, lang, snap.reminders, now);
    w.setAttribute('role', 'button');
    w.tabIndex = 0;
    w.addEventListener('click', () => actions.expand(FULL_HEIGHT));
    w.addEventListener('keydown', e => { if (e.key === 'Enter') actions.expand(FULL_HEIGHT); });
    root.replaceChildren(w);
  }

  const markDone = (r: Reminder): void => void actions.setDone(r.id, !r.done).catch(() => {});

  function fillList(): void {
    if (!snap || !list) return;
    const open = nearest(snap.reminders, Infinity);
    const done = snap.reminders.filter(r => r.done).sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id);
    list.head.textContent = count();
    list.items.replaceChildren(...[...open, ...done].map(r => rowOf(r, now, lang, strings, false, markDone)));
  }

  function renderFull(): void {
    const wrap = el('div', 'v-card list');
    const head = el('div', 'head');
    const heading = lab('', 'ink');
    const back = el('button', 'back', `‹ ${strings.back}`);
    back.type = 'button';
    back.addEventListener('click', () => actions.collapse());
    // As on a module page: back first, the name on the right.
    head.append(back, heading);

    const add = el('div', 'add');
    const title = el('input', 'title');
    title.placeholder = strings.newReminder;
    title.maxLength = 80;
    const time = el('input', 'time');
    time.placeholder = strings.time;
    time.maxLength = 5;
    const err = lab('', 'err');
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
    list = { head: heading, items };
    root.replaceChildren(wrap);
    fillList();
    title.focus();
  }

  return {
    get full() { return full; },
    setFull(next) {
      if (next === full) return;
      full = next;
      list = null;
      if (full) renderFull();
      else renderSmall();
    },
    update(s, at) {
      snap = s;
      now = at;
      if (full) fillList();
      else renderSmall();
    },
  };
}
