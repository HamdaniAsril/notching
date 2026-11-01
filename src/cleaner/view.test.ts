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
  const view = mountCleaner(box, { bridge, lang: 'id', now: () => now, resize });
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
  expect(s.resize).toHaveBeenLastCalledWith('list', false);
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
