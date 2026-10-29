import type { Lang } from '../../../src/kit/protocol';
import { dayKey, dueAt, nearest, parseTime, reminderLabel } from '../format';
import type { HomeSnapshot, Reminder } from '../types';
import { el, type HomeStrings } from './shared';

export interface ReminderActions {
  add(title: string, day: string, at: number | null): Promise<void>;
  setDone(id: number, done: boolean): Promise<void>;
  expand(): void; // asks the notch for the full view
  collapse(): void;
}

export interface RemindersWidget {
  readonly full: boolean;
  setFull(full: boolean): void;
  update(s: HomeSnapshot, now: Date): void;
}

// Reminder (2 columns): the two nearest reminders. A click asks for the full
// view, which lists them all with a field to add one and circles to mark them done.
export function renderReminders(root: HTMLElement, strings: HomeStrings, lang: Lang, actions: ReminderActions):
  RemindersWidget {
  let full = false;
  let snap: HomeSnapshot | null = null;
  let now = new Date();
  // The list's inputs live across updates, so typing and focus survive them.
  let list: { head: HTMLElement; items: HTMLElement } | null = null;

  const count = () => `${strings.reminders} · ${snap ? nearest(snap.reminders, Infinity).length : 0}`;

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

  function renderSmall(): void {
    if (!snap) return;
    const w = el('div', 'wd wd-reminders');
    w.setAttribute('role', 'button');
    w.tabIndex = 0;
    const rms = el('div', 'rms');
    const two = nearest(snap.reminders, 2);
    if (two.length === 0) rms.append(el('div', 'rm empty', strings.noReminders));
    else rms.append(...two.map(r => reminderRow(r, false)));
    w.append(el('div', 'lab', count()), rms);
    w.addEventListener('click', () => actions.expand());
    w.addEventListener('keydown', e => { if (e.key === 'Enter') actions.expand(); });
    root.replaceChildren(w);
  }

  function fillList(): void {
    if (!snap || !list) return;
    const open = nearest(snap.reminders, Infinity);
    const done = snap.reminders.filter(r => r.done).sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id);
    list.head.textContent = count();
    list.items.replaceChildren(...[...open, ...done].map(r => reminderRow(r, true)));
  }

  function renderFull(): void {
    const wrap = el('div', 'list');
    const head = el('div', 'head');
    const heading = el('span', 'lab');
    const back = el('button', 'back', strings.back);
    back.type = 'button';
    back.addEventListener('click', () => actions.collapse());
    head.append(heading, back);

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
