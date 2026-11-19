import type id from './locales/id.json';

// Same as ScreenDto in src-tauri/src/brightness_service.rs.
export interface Screen {
  id: number;
  name: string;
  level: number; // 0–1
  way: 'system' | 'ddc' | 'soft'; // soft: dimmed by its colours, not its backlight
}

export interface Actions {
  set(id: number, level: number): void;
}

export type Strings = typeof id;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

const pct = (level: number) => Math.round(level * 100);

// One black Volt card: a row per screen, the built-in one first, each with
// its name, a slider and the percentage. Rows are rebuilt only when the
// screens change; a slider held by the pointer keeps what it shows.
export function renderPage(root: HTMLElement, s: Strings, act: Actions): { update(screens: Screen[]): void } {
  const list = el('div', 'kc-list');
  const card = el('div', 'kc-card');
  card.append(el('span', 'v-lab ink kc-title', s.title), list);
  list.append(el('div', 'kc-empty', s.loading));
  root.replaceChildren(card);

  let ids = '';
  const rows = new Map<number, { slider: HTMLInputElement; value: HTMLElement; held: boolean }>();

  const name = (x: Screen, i: number) => x.name || (x.way === 'system' && i === 0 ? s.builtIn : `${s.screen} ${i + 1}`);

  const build = (screens: Screen[]) => {
    rows.clear();
    if (screens.length === 0) {
      list.replaceChildren(el('div', 'kc-empty', s.empty));
      return;
    }
    list.replaceChildren(...screens.map((x, i) => {
      const row = el('div', 'kc-row');
      const head = el('div', 'kc-head');
      head.append(el('span', 'kc-name', name(x, i)));
      if (x.way === 'soft') {
        const tag = el('span', 'kc-tag', s.software);
        tag.title = s.softwareHint;
        head.append(tag);
      }
      const value = el('span', 'kc-pct', `${pct(x.level)}%`);
      head.append(value);
      const slider = el('input', 'kc-slider');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';
      slider.value = String(pct(x.level));
      slider.setAttribute('aria-label', name(x, i));
      const entry = { slider, value, held: false };
      slider.addEventListener('pointerdown', () => { entry.held = true; });
      slider.addEventListener('pointerup', () => { entry.held = false; });
      slider.addEventListener('input', () => {
        value.textContent = `${slider.value}%`;
        act.set(x.id, Number(slider.value) / 100);
      });
      rows.set(x.id, entry);
      row.append(head, slider);
      return row;
    }));
  };

  return {
    update(screens) {
      const next = screens.map(x => `${x.id}:${x.way}`).join(',');
      if (next !== ids || rows.size === 0) {
        ids = next;
        build(screens);
        return;
      }
      for (const x of screens) {
        const r = rows.get(x.id);
        if (!r || r.held || document.activeElement === r.slider) continue;
        r.slider.value = String(pct(x.level));
        r.value.textContent = `${pct(x.level)}%`;
      }
    },
  };
}
