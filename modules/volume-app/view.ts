import type id from './locales/id.json';

// Same as AppDto and VolumeView in src-tauri/src/volume_service.rs.
export interface AppRow {
  app: string; // its bundle path, the key it is remembered under
  name: string;
  icon: string | null; // a data: URL
  level: number; // 0–1
  playing: boolean;
}

export interface VolumeView {
  access: 'granted' | 'denied' | 'unknown'; // System Audio Recording
  apps: AppRow[];
}

export interface Actions {
  set(app: string, level: number): void;
  request(): void;
}

export type Strings = typeof id;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

const pct = (level: number) => Math.round(level * 100);

// One black Volt card: a row per app playing or turned down, each with its
// icon, name, a slider and the percentage. Without the permission it asks for
// it instead. Rows are rebuilt only when the apps change; a held slider keeps
// what it shows.
export function renderPage(root: HTMLElement, s: Strings, act: Actions): { update(v: VolumeView): void } {
  const list = el('div', 'va-list');
  const card = el('div', 'va-card');
  card.append(el('span', 'v-lab ink va-title', s.title), list);
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
      const slider = el('input', 'va-slider');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';
      slider.value = String(pct(x.level));
      slider.setAttribute('aria-label', x.name);
      const entry = { slider, value, held: false };
      slider.addEventListener('pointerdown', () => { entry.held = true; });
      slider.addEventListener('pointerup', () => { entry.held = false; });
      slider.addEventListener('input', () => {
        value.textContent = `${slider.value}%`;
        act.set(x.app, Number(slider.value) / 100);
      });
      rows.set(x.app, entry);
      main.append(head, slider);
      row.append(icon, main);
      return row;
    }));
  };

  return {
    update(v) {
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
