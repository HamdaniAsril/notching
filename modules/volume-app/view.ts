import type id from './locales/id.json';

// Same as AppDto and VolumeView in src-tauri/src/volume_service.rs.
export interface AppRow {
  app: string; // its bundle path, the key it is remembered under
  name: string;
  icon: string | null; // a data: URL
  level: number; // 0–1
  playing: boolean;
}

// Same as MainDto: the Mac's own volume on the current output.
export interface MainRow {
  name: string; // the output, "MacBook Air Speakers"
  level: number; // 0–1
  muted: boolean;
  settable: boolean; // false when the device sets its own volume (HDMI)
}

export interface VolumeView {
  access: 'granted' | 'denied' | 'unknown'; // System Audio Recording
  main: MainRow | null; // null with no output at all
  apps: AppRow[];
}

export interface Actions {
  set(app: string, level: number): void;
  request(): void;
  main(change: { level?: number; muted?: boolean }): void;
}

export type Strings = typeof id;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

const pct = (level: number) => Math.round(level * 100);

// Line speakers in the card's ink: with sound waves, and crossed out.
const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 6 6"/><path d="m22 9-6 6"/></svg>';

function slider(label: string): HTMLInputElement {
  const s = el('input', 'va-slider');
  s.type = 'range';
  s.min = '0';
  s.max = '100';
  s.step = '1';
  s.setAttribute('aria-label', label);
  return s;
}

// The Mac's own volume above the apps: a speaker that mutes, the output's
// name, a slider and the percentage. It needs no permission, and follows the
// volume keys on every read unless the slider is held.
function masterRow(s: Strings, act: Actions): { root: HTMLElement; update(m: MainRow | null): void } {
  const root = el('div', 'va-master');
  const mute = el('button', 'va-mute');
  mute.type = 'button';
  const main = el('div', 'va-main');
  const head = el('div', 'va-head');
  const output = el('span', 'va-output');
  const value = el('span', 'va-pct');
  head.append(el('span', 'va-name', s.mainTitle), output, value);
  const range = slider(s.mainTitle);
  main.append(head, range);
  root.append(mute, main);
  root.hidden = true;

  let held = false;
  let muted = false;
  range.addEventListener('pointerdown', () => { held = true; });
  range.addEventListener('pointerup', () => { held = false; });
  range.addEventListener('input', () => {
    value.textContent = `${range.value}%`;
    act.main({ level: Number(range.value) / 100 });
  });
  mute.addEventListener('click', () => act.main({ muted: !muted }));

  return {
    root,
    update(m) {
      root.hidden = m === null;
      if (!m) return;
      muted = m.muted;
      root.classList.toggle('muted', m.muted);
      mute.innerHTML = m.muted ? SPEAKER_OFF : SPEAKER;
      mute.setAttribute('aria-pressed', String(m.muted));
      mute.setAttribute('aria-label', m.muted ? s.unmute : s.mute);
      mute.disabled = !m.settable && !m.muted;
      output.textContent = m.settable ? m.name : `${m.name} · ${s.fixed}`;
      range.disabled = !m.settable;
      if (held || document.activeElement === range) return;
      range.value = String(pct(m.level));
      value.textContent = m.muted ? s.muted : `${pct(m.level)}%`;
    },
  };
}

// One black Volt card: the Mac's own volume on top, then a row per app playing
// or turned down, each with its icon, name, a slider and the percentage. Without the permission it asks for
// it instead. Rows are rebuilt only when the apps change; a held slider keeps
// what it shows.
export function renderPage(root: HTMLElement, s: Strings, act: Actions): { update(v: VolumeView): void } {
  const list = el('div', 'va-list');
  const card = el('div', 'va-card');
  const master = masterRow(s, act);
  card.append(el('span', 'v-lab ink va-title', s.title), master.root, list);
  list.append(el('div', 'va-empty', s.loading));
  root.replaceChildren(card);

  let shape = '';
  const rows = new Map<string, { slider: HTMLInputElement; value: HTMLElement; held: boolean }>();

  const ask = () => {
    const box = el('div', 'va-empty va-ask');
    const allow = el('button', 'va-allow', s.allow);
    allow.type = 'button';
    allow.addEventListener('click', () => act.request());
    box.append(el('span', 'va-ask-main', s.access), el('span', 'va-ask-hint', s.accessHint), allow);
    list.replaceChildren(box);
  };

  const build = (apps: AppRow[]) => {
    rows.clear();
    if (apps.length === 0) {
      list.replaceChildren(el('div', 'va-empty', s.empty));
      return;
    }
    list.replaceChildren(...apps.map(x => {
      const row = el('div', 'va-row');
      let icon: HTMLElement;
      if (x.icon) {
        const img = el('img', 'va-icon');
        img.src = x.icon;
        img.alt = '';
        icon = img;
      } else {
        icon = el('span', 'va-icon');
      }
      const main = el('div', 'va-main');
      const head = el('div', 'va-head');
      head.append(el('span', 'va-name', x.name));
      if (!x.playing) head.append(el('span', 'va-quiet', s.quiet));
      const value = el('span', 'va-pct', `${pct(x.level)}%`);
      head.append(value);
      const range = slider(x.name);
      range.value = String(pct(x.level));
      const entry = { slider: range, value, held: false };
      range.addEventListener('pointerdown', () => { entry.held = true; });
      range.addEventListener('pointerup', () => { entry.held = false; });
      range.addEventListener('input', () => {
        value.textContent = `${range.value}%`;
        act.set(x.app, Number(range.value) / 100);
      });
      rows.set(x.app, entry);
      main.append(head, range);
      row.append(icon, main);
      return row;
    }));
  };

  return {
    update(v) {
      master.update(v.main);
      if (v.access !== 'granted') {
        shape = 'ask';
        rows.clear();
        ask();
        return;
      }
      const next = v.apps.map(x => `${x.app}:${x.playing}`).join(',');
      if (next !== shape || rows.size === 0) {
        shape = next;
        build(v.apps);
        return;
      }
      for (const x of v.apps) {
        const r = rows.get(x.app);
        if (!r || r.held || document.activeElement === r.slider) continue;
        r.slider.value = String(pct(x.level));
        r.value.textContent = `${pct(x.level)}%`;
      }
    },
  };
}
