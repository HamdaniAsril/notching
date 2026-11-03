import type { Shot } from '../bridge';
import { fill, hostStrings, type HostStrings } from '../i18n';
import { SHOT } from '../pages/route';
import { presses } from '../notch/presses';
import { button, COPY_ICON, DELETE_ICON, el, image, openEditor, SAVE_ICON, SAVED_ICON, saves, type ShotDeps } from './common';
import { DEFAULT_LABELS, keyNotices } from './keys';

export interface ShotListDeps extends ShotDeps {
  back(): void; // "‹ Modul"
  onNotes(count: number): void; // the notice lines shown, for the panel's height
}

export interface ShotList {
  render(shots: Shot[]): void;
  destroy(): void;
}

const SCREEN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M9 21h6"/></svg>';
const WINDOW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16"/></svg>';
const AREA_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="3 2.5"><rect x="4" y="5" width="16" height="14" rx="1"/></svg>';

const pad = (n: number) => String(n).padStart(2, '0');

// Under a tile: "14.02" today, "Kemarin" yesterday, "30 Okt" before (§6).
export function timeLabel(takenMs: number, nowMs: number, s: HostStrings['shot']): string {
  const t = new Date(takenMs);
  const now = new Date(nowMs);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  if (day(t) === day(now)) return fill(s.time, { h: pad(t.getHours()), m: pad(t.getMinutes()) });
  if (day(t) === yesterday) return s.yesterday;
  return fill(s.date, { d: t.getDate(), month: s.months[t.getMonth()] });
}

// The Screenshot page (design 1 Nov §6, halaman-screenshot.html v2): "‹ Modul"
// with the count, notices about the keys and the permission, the last 15 in 5
// columns (newest first), and Layar, Window and Area. A tile's picture opens the
// editor or drags out; its hover buttons copy, save and delete. The take buttons
// close the panel first and capture once it is gone, so it is never in the picture.
export function mountShotList(box: HTMLElement, deps: ShotListDeps): ShotList {
  const doc = box.ownerDocument;
  const s = hostStrings(deps.lang).shot;
  const save = saves(deps.shotSave, () => show());
  const press = presses(doc, id => void deps.shotStartDrag(id).catch(() => {}));
  let shots: Shot[] = [];
  let built = '';
  let gone = false;
  // The keys' labels, ⌘⇧3 and ⌘⇧4 until the core says (design 3 Nov tombol §6).
  let labels = DEFAULT_LABELS;

  const count = el(doc, 'span', 'pg-title shot-count');
  const head = el(doc, 'div', 'pg-back shot-head');
  const back = button(doc, 'shot-back', `‹ ${hostStrings(deps.lang).modules}`);
  back.addEventListener('click', () => deps.back());
  head.append(back, count);
  const notes = el(doc, 'div', 'shot-notes');
  const body = el(doc, 'div', 'shot-body');
  const take = el(doc, 'div', 'shot-take');
  const hints = {
    screen: el(doc, 'span', 'shot-key'),
    window: el(doc, 'span', 'shot-key'),
    area: el(doc, 'span', 'shot-key'),
  };
  take.append(
    taker(SCREEN_ICON, s.kinds.screen, hints.screen, () => deps.shotTakeScreen()),
    taker(WINDOW_ICON, s.kinds.window, hints.window, () => deps.shotPick('window')),
    taker(AREA_ICON, s.kinds.area, hints.area, () => deps.shotPick('area')),
  );
  showHints();
  const wrap = el(doc, 'div', 'shot-list');
  wrap.append(head, notes, body, take);
  box.replaceChildren(wrap);

  function taker(icon: string, label: string, hint: HTMLElement, run: () => Promise<void>): HTMLButtonElement {
    const b = button(doc, 'shot-tbtn');
    b.innerHTML = icon;
    b.append(label, hint);
    b.addEventListener('click', () => void deps.close().then(run).catch(() => {}));
    return b;
  }

  function showHints(): void {
    hints.screen.textContent = fill(s.hints.screen, { key: labels.screen });
    hints.window.textContent = fill(s.hints.window, { key: labels.pick });
    hints.area.textContent = fill(s.hints.area, { key: labels.pick });
  }

  function note(text: string, open?: () => Promise<void>): HTMLElement {
    const line = el(doc, 'div', 'shot-note');
    line.append(el(doc, 'span', 'shot-note-text', text));
    if (open) {
      const b = button(doc, 'shot-note-btn', s.openSettings);
      b.addEventListener('click', () => void open().catch(() => {}));
      line.append(b);
    }
    return line;
  }

  // What may stop a capture: no permission, or keys the Mac or another app holds (§4, §8).
  void Promise.all([deps.shotPermission().catch(() => true), deps.shotKeys().catch(() => null)]).then(([allowed, keys]) => {
    if (gone) return;
    if (keys && JSON.stringify(keys.labels) !== JSON.stringify(labels)) {
      labels = keys.labels;
      showHints();
      built = '';
      show();
    }
    const lines: HTMLElement[] = [];
    if (!allowed) lines.push(note(s.permission, deps.openScreenRecordingSettings));
    const taken = keys ? keyNotices(keys, s) : { mac: null, shortcut: null, other: null };
    if (taken.mac) lines.push(note(taken.mac, deps.openKeyboardShortcuts));
    if (taken.shortcut) lines.push(note(taken.shortcut, deps.openKeyboardShortcuts));
    if (taken.other) lines.push(note(taken.other));
    notes.replaceChildren(...lines);
    deps.onNotes(lines.length);
  });

  function act(icon: string, label: string, run: () => void, tone: '' | 'failed' | 'danger' = ''): HTMLButtonElement {
    const b = button(doc, tone ? `shot-act ${tone}` : 'shot-act');
    b.innerHTML = icon;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('mousedown', e => e.stopPropagation());
    b.addEventListener('click', e => {
      e.stopPropagation();
      run();
    });
    return b;
  }

  function tile(shot: Shot): HTMLElement {
    const saving = save.state(shot);
    const t = el(doc, 'div', 'shot-tile');
    t.dataset.id = String(shot.id);
    const th = el(doc, 'div', 'shot-th');
    const acts = el(doc, 'div', 'shot-acts');
    acts.append(
      act(COPY_ICON, s.copy, () => {
        deps.shotCopy(shot.id).catch(() => {});
        void deps.close();
      }),
      act(saving === 'saved' ? SAVED_ICON : SAVE_ICON, s[saving === 'failed' ? 'saveFailed' : saving], () => save.save(shot), saving === 'failed' ? 'failed' : ''),
      act(DELETE_ICON, s.delete, () => void deps.shotDelete(shot.id).catch(() => {}), 'danger'),
    );
    th.append(image(doc, shot.thumb), acts);
    press.watch(th, shot.id, () => openEditor(deps, shot.id));
    t.append(th, el(doc, 'div', 'shot-time', timeLabel(shot.takenMs, deps.now(), s)));
    return t;
  }

  function show(): void {
    const sorted = [...shots].sort((a, b) => b.takenMs - a.takenMs || b.id - a.id).slice(0, SHOT.columns * 3);
    const sig = JSON.stringify([sorted, sorted.map(x => save.state(x))]);
    if (sig === built) return;
    built = sig;
    count.textContent = fill(s.title, { n: sorted.length });
    if (sorted.length === 0) {
      body.replaceChildren(el(doc, 'div', 'shot-empty', fill(s.empty, labels)));
      return;
    }
    const grid = el(doc, 'div', 'shot-grid');
    grid.append(...sorted.map(tile));
    body.replaceChildren(grid);
  }

  return {
    render(next) {
      shots = next;
      show();
    },
    destroy() {
      gone = true;
      press.destroy();
      save.destroy();
      box.replaceChildren();
    },
  };
}
