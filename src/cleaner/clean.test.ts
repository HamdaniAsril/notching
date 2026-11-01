// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { CleanerItem } from '../bridge';
import { hostStrings } from '../i18n';
import { CATEGORY_ORDER, groupItems, mountClean, selection } from './clean';

const item = (id: number, category: CleanerItem['category'], bytes: number, over: Partial<CleanerItem> = {}): CleanerItem => ({
  id, category, label: `i${id}`, detail: null, bytes, method: ['orphan', 'installer', 'backup'].includes(category) ? 'trash' : 'permanent',
  ticked: ['appCache', 'browserCache', 'devCache', 'log'].includes(category), inUse: false, confidence: null, ...over,
});

const ITEMS = [
  item(1, 'log', 100), item(2, 'appCache', 2e9), item(3, 'appCache', 1e9, { inUse: true, ticked: false }),
  item(4, 'browserCache', 5e8), item(5, 'installer', 3e8), item(6, 'build', 4e9),
];

function setup(items = ITEMS, fda = true) {
  const box = document.createElement('div');
  document.body.replaceChildren(box);
  const deps = {
    bridge: {
      cleanerDeepScan: vi.fn(async () => ({ scanId: 7, items })),
      cleanerExclude: vi.fn(async (_id: number) => {}),
    },
    lang: 'id' as const,
    strings: hostStrings('id').cleaner,
    fda,
    back: vi.fn(),
    clean: vi.fn(),
  };
  const view = mountClean(box, deps);
  view.refresh();
  return { box, deps, view };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const cats = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>('.cl-cat')].map(c => c.dataset.category);
const catTick = (box: HTMLElement, c: string) => box.querySelector<HTMLInputElement>(`.cl-cat[data-category="${c}"] > .cl-row input`)!;
const itemTick = (box: HTMLElement, id: number) => box.querySelector<HTMLInputElement>(`.cl-item[data-id="${id}"] input`)!;
const footer = (box: HTMLElement) => box.querySelector<HTMLButtonElement>('.cl-go')!;

test('groups follow the category order and drop empty ones', () => {
  expect(groupItems(ITEMS).map(g => g.category)).toEqual(['appCache', 'browserCache', 'log', 'build', 'installer']);
  expect(CATEGORY_ORDER[0]).toBe('appCache');
  expect(groupItems(ITEMS)[0].bytes).toBe(3e9);
});

test('selection sums what goes for good and what goes to the Trash', () => {
  expect(selection(ITEMS, new Set([1, 2, 5]))).toEqual({ permanent: 2e9 + 100, trash: 3e8, count: 3 });
});

test('the list shows its groups with the default ticks and the total', async () => {
  const { box } = setup();
  await tick();
  expect(cats(box)).toEqual(['appCache', 'browserCache', 'log', 'build', 'installer']);
  expect(itemTick(box, 2).checked).toBe(true);
  expect(itemTick(box, 6).checked).toBe(false);
  expect(box.querySelector('.cl-sel')!.textContent).toBe('Dipilih 2,5 GB');
  expect(footer(box).textContent).toBe('Bersihkan 2,5 GB');
});

test('an item in use says so and cannot be ticked; a category tick skips it', async () => {
  const { box } = setup();
  await tick();
  const busy = itemTick(box, 3);
  expect(busy.disabled).toBe(true);
  expect(box.querySelector('.cl-item[data-id="3"]')!.textContent).toContain('sedang dipakai');
  catTick(box, 'appCache').click();
  expect(itemTick(box, 2).checked).toBe(false);
  catTick(box, 'appCache').click();
  expect([itemTick(box, 2).checked, itemTick(box, 3).checked]).toEqual([true, false]);
});

test('ticking updates the total, and 0 disables the button', async () => {
  const { box } = setup();
  await tick();
  itemTick(box, 6).click();
  expect(footer(box).textContent).toBe('Bersihkan 6,5 GB');
  for (const id of [1, 2, 4, 6]) itemTick(box, id).click();
  expect(footer(box).disabled).toBe(true);
});

test('Never clean excludes the item and takes its row away', async () => {
  const { box, deps } = setup();
  await tick();
  box.querySelector<HTMLElement>('.cl-item[data-id="4"] .cl-never')!.click();
  await tick();
  expect(deps.bridge.cleanerExclude).toHaveBeenCalledWith(4);
  expect(box.querySelector('.cl-item[data-id="4"]')).toBeNull();
});

test('without Full Disk Access, its categories show muted', async () => {
  const { box } = setup(ITEMS.filter(i => i.category !== 'installer'), false);
  await tick();
  const muted = [...box.querySelectorAll<HTMLElement>('.cl-cat.muted')].map(c => c.dataset.category);
  expect(muted).toEqual(['trash', 'installer', 'backup']);
  expect(box.querySelector('.cl-cat.muted')!.textContent).toContain('butuh Full Disk Access');
});

test('Bersihkan hands the ticked ids and the plan to the view', async () => {
  const { box, deps } = setup();
  await tick();
  footer(box).click();
  expect(deps.clean).toHaveBeenCalledWith(7, [1, 2, 4], { permanent: 2e9 + 5e8 + 100, trash: 0, count: 3 });
});

test('the back bar goes back', async () => {
  const { box, deps } = setup();
  await tick();
  box.querySelector<HTMLElement>('.cl-back')!.click();
  expect(deps.back).toHaveBeenCalled();
});

test('what runs now only adds busy marks; one set by the scan stays', async () => {
  const { box, view } = setup();
  await tick();
  view.inUse([]);
  expect(itemTick(box, 3).disabled).toBe(true);
  view.inUse([2]);
  expect([itemTick(box, 2).disabled, itemTick(box, 2).checked]).toEqual([true, false]);
});
