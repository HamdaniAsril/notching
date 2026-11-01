// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { CleanerNode } from '../bridge';
import { hostStrings } from '../i18n';
import { mountDisk } from './disk';

const node = (name: string, bytes: number, over: Partial<CleanerNode> = {}): CleanerNode =>
  ({ name, bytes, dir: true, readable: true, rest: 0, children: [], ...over });
const TREE = node('~', 160e9, { children: [
  node('Library', 70e9, { children: [node('Developer', 30e9), node('', 2e9, { dir: false, rest: 412 })] }),
  node('App', 51e9, { children: [node('Xcode.app', 12e9)] }),
  node('Movies', 0, { readable: false }),
  node('big.mov', 8e9, { dir: false }),
] });

function setup() {
  const box = document.createElement('div');
  document.body.replaceChildren(box);
  const deps = {
    bridge: { cleanerBreakdown: vi.fn(async () => TREE), cleanerRevealPath: vi.fn(async (_n: string[]) => {}) },
    lang: 'id' as const,
    strings: hostStrings('id').cleaner,
    back: vi.fn(),
  };
  const view = mountDisk(box, deps);
  view.refresh();
  return { box, deps };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const rows = (box: HTMLElement) => [...box.querySelectorAll('.cl-node .cl-name')].map(n => n.textContent);
const row = (box: HTMLElement, name: string) => [...box.querySelectorAll<HTMLElement>('.cl-node')].find(r => r.querySelector('.cl-name')!.textContent === name)!;

test('rows come biggest first, measuring until they land', async () => {
  const { box } = setup();
  expect(box.textContent).toContain('Menghitung…');
  await tick();
  expect(rows(box)).toEqual(['Library', 'App', 'big.mov', 'Movies']);
});

test('a folder opens, and back goes up a level, then to the start', async () => {
  const { box, deps } = setup();
  await tick();
  row(box, 'Library').click();
  expect(rows(box)).toEqual(['Developer', '412 item lain']);
  box.querySelector<HTMLElement>('.cl-back')!.click();
  expect(rows(box)).toContain('Library');
  box.querySelector<HTMLElement>('.cl-back')!.click();
  expect(deps.back).toHaveBeenCalled();
});

test('Tampilkan di Finder passes the names from home', async () => {
  const { box, deps } = setup();
  await tick();
  row(box, 'Library').click();
  row(box, 'Developer').querySelector<HTMLElement>('.cl-reveal')!.click();
  expect(deps.bridge.cleanerRevealPath).toHaveBeenCalledWith(['Library', 'Developer']);
  box.querySelector<HTMLElement>('.cl-back')!.click();
  row(box, 'App').click();
  row(box, 'Xcode.app').querySelector<HTMLElement>('.cl-reveal')!.click();
  expect(deps.bridge.cleanerRevealPath).toHaveBeenLastCalledWith(['App', 'Xcode.app']);
});

test('an unreadable folder says so and does not open', async () => {
  const { box } = setup();
  await tick();
  expect(row(box, 'Movies').textContent).toContain('tidak bisa dibaca');
  row(box, 'Movies').click();
  expect(rows(box)).toContain('Library');
});

test('the rest row cannot be opened or shown', async () => {
  const { box } = setup();
  await tick();
  row(box, 'Library').click();
  const rest = row(box, '412 item lain');
  expect(rest.querySelector('.cl-reveal')).toBeNull();
  rest.click();
  expect(rows(box)).toEqual(['Developer', '412 item lain']);
});

test('nothing here removes anything: only back and reveal buttons', async () => {
  const { box } = setup();
  await tick();
  const labels = new Set([...box.querySelectorAll('button')].map(b => b.className.split(' ').find(c => c.startsWith('cl-'))));
  expect([...labels].sort()).toEqual(['cl-back', 'cl-reveal']);
});
