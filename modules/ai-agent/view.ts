import type id from './locales/id.json';

// Same as SessionDto and AgentsView in src-tauri/src/agent_service.rs.
export interface AgentSession {
  agent: 'claude' | 'codex' | 'opencode';
  name: string; // "Claude Code"
  id: string;
  project: string; // the last part of its folder
  state: 'working' | 'waiting' | 'done';
  since: number; // wall-clock ms it took this state
  detail: string | null; // what it asked, or its last line
  canOpen: boolean; // the app it runs in is known
}

export interface AgentsView {
  now: number;
  sessions: AgentSession[]; // newest change first
  connected: number; // agents connected in Settings
}

export interface Actions {
  open(agent: string, id: string): void;
}

export type Strings = typeof id;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

// "baru saja", "3 mnt", "2 jam".
export function ago(ms: number, s: Strings): string {
  if (ms < MINUTE) return s.now;
  if (ms < HOUR) return s.minutes.replace('{n}', String(Math.floor(ms / MINUTE)));
  return s.hours.replace('{n}', String(Math.floor(ms / HOUR)));
}

// One black Volt card: a head with the count of sessions working or waiting,
// then one row per session. A row whose app is known brings it up on a click.
export function renderPage(root: HTMLElement, s: Strings, act: Actions): { update(v: AgentsView): void } {
  const title = el('span', 'v-lab ink ag-title', s.title);
  const count = el('span', 'ag-count');
  const head = el('div', 'ag-head');
  head.append(title, count);
  const list = el('div', 'ag-list');
  const card = el('div', 'ag-card');
  card.append(head, list);
  root.replaceChildren(card);

  const row = (x: AgentSession, now: number): HTMLElement => {
    const r = x.canOpen ? el('button', 'ag-row') : el('div', 'ag-row');
    if (r instanceof HTMLButtonElement) {
      r.type = 'button';
      r.addEventListener('click', () => act.open(x.agent, x.id));
    }
    r.dataset.state = x.state;
    const main = el('div', 'ag-main');
    const line = el('div', 'ag-line');
    line.append(el('span', 'ag-project', x.project), el('span', 'ag-agent', x.name));
    main.append(line);
    if (x.detail) main.append(el('div', 'ag-detail', x.detail));
    const side = el('div', 'ag-side');
    side.append(el('span', 'ag-state', s[x.state]), el('span', 'ag-ago', ago(now - x.since, s)));
    r.append(el('i', 'ag-dot'), main, side);
    return r;
  };

  return {
    update(v) {
      const busy = v.sessions.filter(x => x.state !== 'done').length;
      count.textContent = busy > 0 ? String(busy) : '';
      if (v.sessions.length > 0) {
        list.replaceChildren(...v.sessions.map(x => row(x, v.now)));
        return;
      }
      const empty = el('div', 'ag-empty');
      if (v.connected === 0) empty.append(el('span', 'ag-empty-main', s.notConnected), el('span', 'ag-empty-hint', s.connectHint));
      else empty.append(el('span', 'ag-empty-main', s.empty));
      list.replaceChildren(empty);
    },
  };
}
