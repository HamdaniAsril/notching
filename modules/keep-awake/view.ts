import type { Lang } from '../../src/kit/protocol';
import type id from './locales/id.json';

// Same as AwakeDto in src-tauri/src/awake.rs.
export interface AwakeView {
  on: boolean;
  until: number | null; // wall-clock ms, only for a timed run
  forever: boolean;
  text: string | null; // the status text while on: "1:42", "42m" or "∞"
}

export interface Actions {
  start(minutes: number | null): void; // null: no limit
  add(minutes: number): void;
  stop(): void;
}

export type Strings = typeof id;

const MAX_MINUTES = 1440;
// The coffee cup of icon.svg, in the text colour.
const CUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M4 10h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/>'
  + '<path d="M8 3c0 1.2 1 1.6 1 3M12 3c0 1.2 1 1.6 1 3"/><path d="M3 21.5h15"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

// "15.20" in Indonesian, "15:20" in English: the end in local time.
export function endClock(until: number, lang: Lang): string {
  const d = new Date(until);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}${lang === 'id' ? '.' : ':'}${two(d.getMinutes())}`;
}

type Mode = 'off' | 'timed' | 'forever';
const modeOf = (v: AwakeView): Mode => (!v.on ? 'off' : v.forever ? 'forever' : 'timed');

// Mockup B (design 31 Oct §3): the big box turns it on with no limit (the
// owner's default, 31 Oct) or off; the
// column beside it starts, or adds time. The column is rebuilt only when the
// mode changes, so a reading every second keeps what is being typed.
export function renderPage(root: HTMLElement, s: Strings, lang: Lang, act: Actions): { update(v: AwakeView): void } {
  let view: AwakeView = { on: false, until: null, forever: false, text: null };
  let mode: Mode | null = null;

  const box = el('button', 'ka-box');
  box.type = 'button';
  box.innerHTML = CUP;
  const boxText = el('span', 'ka-box-text');
  box.append(boxText);
  box.addEventListener('click', () => (view.on ? act.stop() : act.start(null)));

  const head = el('span', 'lab ka-head');
  const chips = el('div', 'ka-chips');
  const hint = el('span', 'lab ka-hint');
  const side = el('div', 'ka-side');
  side.append(head, chips, hint);
  const row = el('div', 'ka-row');
  row.append(box, side);
  root.replaceChildren(row);

  const chip = (text: string, onClick: () => void) => {
    const b = el('button', 'ka-chip', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  // Minutes typed by hand start on Enter, 1–1440 only.
  const minutesField = () => {
    const wrap = el('label', 'ka-field');
    const input = el('input', 'ka-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 4;
    input.setAttribute('aria-label', s.minutes);
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const n = /^\d+$/.test(input.value.trim()) ? Number(input.value.trim()) : 0;
      if (n < 1 || n > MAX_MINUTES) return;
      input.value = '';
      act.start(n);
    });
    wrap.append(input, el('span', 'ka-unit', s.minutes));
    return wrap;
  };

  const build = (m: Mode) => {
    if (m === 'off') {
      chips.replaceChildren(
        chip(s.hour1, () => act.start(60)),
        chip(s.hour2, () => act.start(120)),
        chip('∞', () => act.start(null)),
        minutesField(),
      );
      hint.textContent = s.boxHint;
    } else if (m === 'timed') {
      chips.replaceChildren(chip(s.add15, () => act.add(15)), chip(s.add30, () => act.add(30)), chip(s.add60, () => act.add(60)));
      hint.textContent = s.stopHint;
    } else {
      chips.replaceChildren();
      hint.textContent = s.stopHint;
    }
  };

  return {
    update(v) {
      view = v;
      const m = modeOf(v);
      if (m !== mode) {
        mode = m;
        build(m);
      }
      box.classList.toggle('on', v.on);
      box.setAttribute('aria-pressed', String(v.on));
      boxText.textContent = v.on ? (v.text ?? '') : s.off;
      head.textContent = m === 'off' ? s.startFor
        : m === 'forever' ? s.forever
        : s.until.replace('{time}', endClock(v.until ?? Date.now(), lang));
    },
  };
}
