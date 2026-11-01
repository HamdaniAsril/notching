// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { CleanerItem } from '../bridge';
import { fakeBridge } from '../notch/test-helpers';
import { mountCleaner } from './view';

const ITEMS: CleanerItem[] = [
  { id: 1, category: 'appCache', label: 'com.a.b', detail: null, bytes: 2e9, method: 'permanent', ticked: true, inUse: false, confidence: null },
  { id: 2, category: 'log', label: 'com.c.d', detail: null, bytes: 1e8, method: 'permanent', ticked: true, inUse: false, confidence: null },
];

const tick = () => new Promise(r => setTimeout(r, 0));

async function setup() {
  const box = document.createElement('div');
  document.body.replaceChildren(box);
  const bridge = fakeBridge();
  bridge.cleanerDeepScan.mockResolvedValue({ scanId: 9, items: ITEMS });
  let now = 0;
  const resize = vi.fn();
  const view = mountCleaner(box, { bridge, lang: 'id', now: () => now, resize, back: vi.fn() });
  view.shown();
  await tick();
  const toList = async () => {
    box.querySelector<HTMLElement>('[data-tile="clean"]')!.click();
    await tick();
  };
  return { box, bridge, view, resize, toList, setNow: (n: number) => { now = n; } };
}

test('Deep clean opens its list, as tall as a list', async () => {
  const s = await setup();
  await s.toList();
  expect(s.box.querySelector('.cl-list')).not.toBeNull();
  expect(s.resize).toHaveBeenLastCalledWith('list', false, expect.any(Number));
});

test('Bersihkan asks first; yes runs the scan ids, and the result shows when it is done', async () => {
  const s = await setup();
  await s.toList();
  s.box.querySelector<HTMLElement>('.cl-go')!.click();
  expect(s.bridge.cleanerRun).not.toHaveBeenCalled();
  s.box.querySelector<HTMLElement>('.cl-yes')!.click();
  await tick();
  expect(s.bridge.cleanerRun).toHaveBeenCalledWith(9, [1, 2], null);
  s.bridge.emitCleaner({ phase: 'progress', done: 1, total: 2 });
  expect(s.box.textContent).toContain('1 dari 2');
  s.bridge.emitCleaner({ phase: 'done', freed: 2e9, outcomes: [
    { id: 1, freed: 2e9, skip: null, detail: null }, { id: 2, freed: 0, skip: 'changed', detail: null },
  ] });
  expect(s.box.textContent).toContain('+2 GB');
  expect(s.box.textContent).toContain('com.c.d · berubah sejak dipindai');
  s.box.querySelector<HTMLElement>('.cl-done')!.click();
  expect(s.box.querySelector('.cl-home')).not.toBeNull();
});

test('Batal goes back to the list without running', async () => {
  const s = await setup();
  await s.toList();
  s.box.querySelector<HTMLElement>('.cl-go')!.click();
  s.box.querySelector<HTMLElement>('.cl-no')!.click();
  await tick();
  expect(s.bridge.cleanerRun).not.toHaveBeenCalled();
  expect(s.box.querySelector('.cl-list')).not.toBeNull();
});

test('a stale scan is scanned again', async () => {
  const s = await setup();
  await s.toList();
  s.bridge.cleanerRun.mockRejectedValueOnce('stale');
  s.box.querySelector<HTMLElement>('.cl-go')!.click();
  s.box.querySelector<HTMLElement>('.cl-yes')!.click();
  await tick();
  await tick();
  expect(s.bridge.cleanerDeepScan).toHaveBeenCalledTimes(2);
  expect(s.box.querySelector('.cl-list')).not.toBeNull();
});

test('an unreadable never-clean list says so and cleans nothing', async () => {
  const s = await setup();
  await s.toList();
  s.bridge.cleanerRun.mockRejectedValueOnce('exclusions');
  s.box.querySelector<HTMLElement>('.cl-go')!.click();
  s.box.querySelector<HTMLElement>('.cl-yes')!.click();
  await tick();
  await tick();
  expect(s.box.textContent).toContain('Daftar pengecualian tidak bisa dibaca');
});

test('back within 10 minutes keeps the list and asks what runs now; later it starts over', async () => {
  const s = await setup();
  await s.toList();
  s.view.hidden();
  expect(s.bridge.cleanerCancelScans).toHaveBeenCalled();
  s.bridge.cleanerRunning.mockResolvedValueOnce([1]);
  s.setNow(9 * 60_000);
  s.view.shown();
  await tick();
  expect(s.box.querySelector('.cl-list')).not.toBeNull();
  expect(s.bridge.cleanerRunning).toHaveBeenCalledWith(9);
  expect(s.box.querySelector<HTMLInputElement>('.cl-item[data-id="1"] input')!.disabled).toBe(true);
  s.view.hidden();
  s.setNow(30 * 60_000);
  s.view.shown();
  expect(s.box.querySelector('.cl-home')).not.toBeNull();
});

test('closing the panel at the question is a no', async () => {
  const s = await setup();
  await s.toList();
  s.box.querySelector<HTMLElement>('.cl-go')!.click();
  s.view.hidden();
  await tick();
  expect(s.bridge.cleanerRun).not.toHaveBeenCalled();
});

test('Clean uninstall: an app removed goes through the question with its app id', async () => {
  const s = await setup();
  s.bridge.cleanerApps.mockResolvedValue({ scanId: 3, items: [{ id: 50, name: 'Coba', bundleId: 'id.coba', bytes: 1e6, refused: false, running: false }] });
  s.bridge.cleanerAppDetail.mockResolvedValue({ scanId: 4, items: [
    { id: 60, category: 'app', label: 'Coba', detail: null, bytes: 1e6, method: 'trash', ticked: true, inUse: false, confidence: 'sure' },
  ] });
  s.box.querySelector<HTMLElement>('[data-tile="uninstall"]')!.click();
  await tick();
  s.box.querySelector<HTMLElement>('.cl-app')!.click();
  await tick();
  s.box.querySelector<HTMLElement>('.cl-go')!.click();
  expect(s.box.querySelector('.cl-yes')!.textContent).toBe('Ya, hapus');
  s.box.querySelector<HTMLElement>('.cl-yes')!.click();
  await tick();
  expect(s.bridge.cleanerRun).toHaveBeenCalledWith(4, [60], 50);
  s.bridge.emitCleaner({ phase: 'done', freed: 0, outcomes: [{ id: 60, freed: 0, skip: 'failed', detail: 'admin' }] });
  expect(s.box.textContent).toContain('Coba · gagal');
  s.box.querySelector<HTMLElement>('.cl-skip .cl-note-btn')!.click();
  expect(s.bridge.cleanerReveal).toHaveBeenCalledWith(60);
});

test('the bar opens the breakdown, and it stays after Finder takes the panel away', async () => {
  const s = await setup();
  s.bridge.cleanerBreakdown.mockResolvedValue({ name: '~', bytes: 10, dir: true, readable: true, rest: 0, children: [
    { name: 'dev', bytes: 10, dir: true, readable: true, rest: 0, children: [{ name: 'a', bytes: 9, dir: false, readable: true, rest: 0, children: [] }] },
  ] });
  s.box.querySelector<HTMLElement>('.cl-bar')!.click();
  await tick();
  expect(s.resize).toHaveBeenLastCalledWith('list', false, expect.any(Number));
  s.box.querySelector<HTMLElement>('.cl-node')!.click();
  s.box.querySelector<HTMLElement>('.cl-reveal')!.click();
  expect(s.bridge.cleanerRevealPath).toHaveBeenCalledWith(['dev', 'a']);
  s.view.hidden();
  s.setNow(60_000);
  s.view.shown();
  expect(s.box.querySelector('.cl-node .cl-name')!.textContent).toBe('a');
});

test('a scan cut short by closing the panel is measured again when it shows', async () => {
  const s = await setup();
  s.bridge.cleanerDeepScan.mockRejectedValueOnce('cancelled');
  await s.toList();
  expect(s.box.querySelector('.cl-item')).toBeNull();
  s.view.hidden();
  s.setNow(60_000);
  s.view.shown();
  await tick();
  expect(s.bridge.cleanerDeepScan).toHaveBeenCalledTimes(2);
  expect(s.box.querySelector('.cl-item[data-id="1"]')).not.toBeNull();
});

test('a stale uninstall opens the app again instead of asking with the old scan', async () => {
  const s = await setup();
  s.bridge.cleanerApps.mockResolvedValue({ scanId: 3, items: [{ id: 50, name: 'Coba', bundleId: 'id.coba', bytes: 1e6, refused: false, running: false }] });
  s.bridge.cleanerAppDetail.mockResolvedValue({ scanId: 4, items: [
    { id: 60, category: 'app', label: 'Coba', detail: null, bytes: 1e6, method: 'trash', ticked: true, inUse: false, confidence: 'sure' },
  ] });
  s.box.querySelector<HTMLElement>('[data-tile="uninstall"]')!.click();
  await tick();
  s.box.querySelector<HTMLElement>('.cl-app')!.click();
  await tick();
  s.bridge.cleanerRun.mockRejectedValueOnce('stale');
  s.box.querySelector<HTMLElement>('.cl-go')!.click();
  s.box.querySelector<HTMLElement>('.cl-yes')!.click();
  await tick();
  await tick();
  expect(s.bridge.cleanerAppDetail).toHaveBeenCalledTimes(2);
  expect(s.box.querySelector('.cl-go')).not.toBeNull();
});
