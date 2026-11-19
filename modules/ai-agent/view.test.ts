// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import iconSvg from './icon.svg?raw';
import id from './locales/id.json';
import { type AgentSession, type AgentsView, ago, renderPage } from './view';

const NOW = 1_800_000_000_000;

const session = (over: Partial<AgentSession>): AgentSession => ({
  agent: 'claude', name: 'Claude Code', id: 's1', project: 'notching', state: 'working',
  since: NOW - 5_000, detail: null, canOpen: true, ...over,
});

function page(v: AgentsView) {
  const root = document.createElement('div');
  document.body.append(root);
  const act = { open: vi.fn() };
  const view = renderPage(root, id, act);
  view.update(v);
  const rows = () => [...root.querySelectorAll<HTMLElement>('.ag-row')];
  return { root, act, rows, view };
}

test('the icon is a line drawing', () => {
  expect(iconSvg).toContain('viewBox="0 0 24 24"');
  expect(iconSvg).toContain('stroke=');
});

test('ago reads as just now, minutes, then hours', () => {
  expect(ago(30_000, id)).toBe('baru saja');
  expect(ago(59_999, id)).toBe('baru saja');
  expect(ago(60_000, id)).toBe('1 mnt');
  expect(ago(59 * 60_000, id)).toBe('59 mnt');
  expect(ago(2 * 3_600_000 + 10, id)).toBe('2 jam');
  expect(ago(-5, id)).toBe('baru saja');
});

test('one row per session: agent, project, state and how long ago', () => {
  const { rows } = page({ now: NOW, connected: 2, sessions: [
    session({ state: 'waiting', since: NOW - 3 * 60_000, detail: 'Claude needs your permission to use Bash' }),
    session({ agent: 'codex', name: 'Codex', id: 't1', project: 'api', state: 'done', since: NOW - 10_000, canOpen: false }),
  ] });
  expect(rows()).toHaveLength(2);
  const [a, b] = rows();
  expect(a.querySelector('.ag-project')!.textContent).toBe('notching');
  expect(a.querySelector('.ag-agent')!.textContent).toBe('Claude Code');
  expect(a.querySelector('.ag-state')!.textContent).toBe('Menunggu kamu');
  expect(a.querySelector('.ag-ago')!.textContent).toBe('3 mnt');
  expect(a.querySelector('.ag-detail')!.textContent).toBe('Claude needs your permission to use Bash');
  expect(a.dataset.state).toBe('waiting');
  expect(b.querySelector('.ag-state')!.textContent).toBe('Selesai');
  expect(b.querySelector('.ag-detail')).toBeNull();
});

test('the head counts the sessions working or waiting', () => {
  const { root } = page({ now: NOW, connected: 1, sessions: [
    session({ id: 'a' }), session({ id: 'b', state: 'waiting' }), session({ id: 'c', state: 'done' }),
  ] });
  expect(root.querySelector('.ag-title')!.textContent).toBe('Agent AI');
  expect(root.querySelector('.ag-count')!.textContent).toBe('2');
});

test('a click brings up the app only for a session that has one', () => {
  const { rows, act } = page({ now: NOW, connected: 1, sessions: [
    session({ id: 'a' }), session({ id: 'b', canOpen: false }),
  ] });
  rows()[0].click();
  expect(act.open).toHaveBeenCalledWith('claude', 'a');
  rows()[1].click();
  expect(act.open).toHaveBeenCalledTimes(1);
  expect(rows()[0].tagName).toBe('BUTTON');
  expect(rows()[1].tagName).toBe('DIV');
});

test('nothing connected points to Settings; connected but idle says so', () => {
  const none = page({ now: NOW, connected: 0, sessions: [] });
  expect(none.root.textContent).toContain('Belum ada agent terhubung');
  expect(none.root.textContent).toContain('Pengaturan → Modul → Agent AI');
  const idle = page({ now: NOW, connected: 1, sessions: [] });
  expect(idle.root.textContent).toContain('Tidak ada agent yang bekerja');
  expect(idle.root.textContent).not.toContain('Belum ada agent terhubung');
});

test('an update redraws the list in place', () => {
  const { rows, view } = page({ now: NOW, connected: 1, sessions: [session({})] });
  expect(rows()).toHaveLength(1);
  view.update({ now: NOW, connected: 1, sessions: [] });
  expect(rows()).toHaveLength(0);
});
