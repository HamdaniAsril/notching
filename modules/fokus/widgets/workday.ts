import type { Lang } from '../../../src/kit/protocol';
import { bar, lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';
import { checkWork, hm, timeText, validWork, workState, type WorkPrefs } from '../work';

export interface WorkdayStrings {
  workTitle: string; // "Jam kerja" / "Work"
  startsAt: string; // "Mulai {t}"
  worked: string; // "Sudah {t}"
  done: string;
  off: string;
  startField: string;
  endField: string;
  save: string;
  saveFailed: string;
  back: string;
  days: string[]; // seven letters, Monday first
  dayNames: string[];
}

export interface WorkdayActions {
  save(p: WorkPrefs): Promise<void>;
  expand(height: number): void; // asks the notch for the full view
  collapse(): void;
}

export interface WorkdayWidget {
  update(p: WorkPrefs, now: Date): void;
  setFull(full: boolean): void;
}

// The full view's height: a heading, two time fields, the days and Simpan.
const FULL_HEIGHT = 200;

// The day toggles, Monday first, as JS getDay() numbers.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

// "09–17", or "08:30–16:45" when a time has minutes.
function range(p: WorkPrefs): string {
  return p.start.endsWith(':00') && p.end.endsWith(':00') ? `${p.start.slice(0, 2)}–${p.end.slice(0, 2)}` : `${p.start}–${p.end}`;
}

// The row view for `now`: the name and hours on top, what is left big, and the day's bar with
// the time worked under it. Before, after and off, a word instead of the bar. Also what the
// editor's sample draws.
export function workdayView(s: WorkdayStrings, lang: Lang, p: WorkPrefs, now: Date): HTMLElement {
  const w = el('div', 'v-card wd-work');
  const head = el('div', 'wd-work-head');
  head.append(lab(s.workTitle, 'ink'), el('span', 'wd-work-range', range(p)));
  const st = workState(p, now);
  if (st.kind === 'working') {
    const foot = el('div', 'wd-work-gone');
    foot.append(bar(st.progress), el('span', 'wd-work-worked', s.worked.replace('{t}', hm(st.workedMs, lang))));
    // "6 j 42 m" is 28 px; with two-digit hours and minutes ("13 j 41 m") the 85 px asks for 22.
    const left = hm(st.leftMs, lang);
    w.append(head, num(left, left.length > 8 ? 22 : 28, 'wd-work-time'), foot);
    return w;
  }
  const text = st.kind === 'before' ? s.startsAt.replace('{t}', timeText(p.start, lang)) : st.kind === 'done' ? s.done : s.off;
  // "Mulai 09.00" fits the 85 px at 20 px; the longer "Starts 09:00" needs 18.
  w.append(head, num(text, text.length > 11 ? 18 : 20, 'wd-work-time'));
  return w;
}

// Jam kerja (1 column): what is left of today's work, big (owner, 2 Nov), and how long it has gone. A click asks for
// the full view, where the hours and days are set.
export function renderWorkday(root: HTMLElement, s: WorkdayStrings, lang: Lang, act: WorkdayActions): WorkdayWidget {
  let full = false;
  let prefs: WorkPrefs | null = null;
  let now = new Date();

  function renderRow(): void {
    if (!prefs) return;
    const w = workdayView(s, lang, prefs, now);
    w.setAttribute('role', 'button');
    w.tabIndex = 0;
    w.addEventListener('click', () => act.expand(FULL_HEIGHT));
    w.addEventListener('keydown', e => { if (e.key === 'Enter') act.expand(FULL_HEIGHT); });
    root.replaceChildren(w);
  }

  function field(label: string, value: string, cls: string, onInput: (v: string) => void): { box: HTMLElement; input: HTMLInputElement } {
    const box = el('label', 'wd-work-field');
    const input = el('input', `wd-work-${cls}`);
    input.type = 'time';
    input.value = value;
    input.addEventListener('input', () => onInput(input.value));
    box.append(lab(label), input);
    return { box, input };
  }

  function renderFull(): void {
    const form: WorkPrefs = { ...(prefs ?? checkWork(null)) };
    form.days = [...form.days];

    const head = el('div', 'wd-work-fhead');
    const back = el('button', 'wd-work-back', `‹ ${s.back}`);
    back.type = 'button';
    back.addEventListener('click', () => act.collapse());
    // As on a module page: back first, the name on the right.
    head.append(back, lab(s.workTitle, 'ink'));

    const submit = el('button', 'wd-work-save', s.save);
    submit.type = 'button';
    const err = lab('', 'wd-work-err');
    const refresh = (): void => { submit.disabled = !validWork(form); };

    const times = el('div', 'wd-work-times');
    const start = field(s.startField, form.start, 'start', v => { form.start = v; refresh(); });
    const end = field(s.endField, form.end, 'end', v => { form.end = v; refresh(); });
    times.append(start.box, end.box);

    const days = el('div', 'wd-work-days');
    WEEK.forEach((n, i) => {
      const b = el('button', 'wd-work-day', s.days[i]);
      b.type = 'button';
      b.setAttribute('aria-label', s.dayNames[i]);
      const show = (): void => b.setAttribute('aria-pressed', String(form.days.includes(n)));
      show();
      b.addEventListener('click', () => {
        form.days = form.days.includes(n) ? form.days.filter(d => d !== n) : [...form.days, n];
        show();
        refresh();
      });
      days.append(b);
    });

    submit.addEventListener('click', () => {
      if (!validWork(form)) return;
      err.textContent = '';
      // Days in week order, so the stored list reads the same however they were toggled.
      const value = checkWork({ ...form, days: WEEK.filter(d => form.days.includes(d)) });
      act.save(value).then(() => act.collapse(), () => { err.textContent = s.saveFailed; });
    });

    const foot = el('div', 'wd-work-foot');
    foot.append(err, submit);
    const wrap = el('div', 'v-card wd-work-full');
    wrap.append(head, times, days, foot);
    refresh();
    root.replaceChildren(wrap);
    start.input.focus();
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
