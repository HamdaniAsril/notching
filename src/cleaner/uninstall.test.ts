// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { CleanerApp, CleanerItem } from '../bridge';
import { hostStrings } from '../i18n';
import { mountUninstall } from './uninstall';

const app = (id: number, name: string, bytes: number, over: Partial<CleanerApp> = {}): CleanerApp =>
  ({ id, name, bundleId: `com.x.${name.toLowerCase()}`, bytes, refused: false, running: false, ...over });
const APPS = [app(1, 'Spotify', 1.2e9), app(2, 'Xcode', 12e9), app(3, 'GlobalProtect', 9e7, { refused: true })];
const item = (id: number, category: CleanerItem['category'], label: string, over: Partial<CleanerItem> = {}): CleanerItem => ({
  id, category, label, detail: null, bytes: 1e6, method: 'trash', ticked: category !== 'personal', inUse: false, confidence: 'sure', ...over,
});
const DETAIL = [
  item(10, 'app', 'Spotify', { bytes: 1.2e9 }),
  item(11, 'leftover', 'com.spotify.client.plist', { detail: 'Preferences' }),
  item(12, 'leftover', 'Spotify', { detail: 'Application Support', confidence: 'maybe', ticked: false }),
  item(13, 'personal', 'com.spotify.client', { detail: 'Containers', bytes: 2e9 }),
];

function setup(apps = APPS, detail = DETAIL) {
  const box = document.createElement('div');
  document.body.replaceChildren(box);
  const deps = {
    bridge: {
      cleanerApps: vi.fn(async () => ({ scanId: 5, items: apps })),
      cleanerAppDetail: vi.fn(async (_id: number) => ({ scanId: 6, items: detail })),
      cleanerRunning: vi.fn(async (_scan: number): Promise<number[]> => []),
    },
    lang: 'id' as const,
    strings: hostStrings('id').cleaner,
    back: vi.fn(),
    remove: vi.fn(),
  };
  const view = mountUninstall(box, deps);
  view.refresh();
  return { box, deps, view };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const names = (box: HTMLElement) => [...box.querySelectorAll('.cl-app .cl-name')].map(n => n.textContent);
const open = async (box: HTMLElement, name: string) => {
  [...box.querySelectorAll<HTMLElement>('.cl-app')].find(r => r.textContent!.includes(name))!.click();
  await tick();
};
const tickOf = (box: HTMLElement, id: number) => box.querySelector<HTMLInputElement>(`.cl-item[data-id="${id}"] input`)!;
const go = (box: HTMLElement) => box.querySelector<HTMLButtonElement>('.cl-go');

test('the list is biggest first, and the search filters by name or bundle id', async () => {
  const { box } = setup();
  await tick();
  expect(names(box)).toEqual(['Xcode', 'Spotify', 'GlobalProtect']);
  const search = box.querySelector<HTMLInputElement>('.cl-search')!;
  search.value = 'spot';
  search.dispatchEvent(new Event('input'));
  expect(names(box)).toEqual(['Spotify']);
  search.value = 'com.x.xc';
  search.dispatchEvent(new Event('input'));
  expect(names(box)).toEqual(['Xcode']);
});

test('an app opens with its leftovers: itself locked, maybe and personal unticked', async () => {
  const { box, deps } = setup();
  await tick();
  await open(box, 'Spotify');
  expect(deps.bridge.cleanerAppDetail).toHaveBeenCalledWith(1);
  expect([tickOf(box, 10).checked, tickOf(box, 10).disabled]).toEqual([true, true]);
  expect(tickOf(box, 11).checked).toBe(true);
  expect(tickOf(box, 12).checked).toBe(false);
  expect(box.querySelector('.cl-item[data-id="12"]')!.textContent).toContain('mungkin · nama mirip');
  expect(tickOf(box, 13).checked).toBe(false);
  const groups = [...box.querySelectorAll('.cl-group-name')].map(g => g.textContent);
  expect(groups[groups.length - 1]).toBe('Data pribadi');
  expect(box.textContent).toContain('riwayat, bookmark, kata sandi, data');
});

test('Hapus asks through the view with every ticked id', async () => {
  const { box, deps } = setup();
  await tick();
  await open(box, 'Spotify');
  expect(go(box)!.textContent).toBe('Hapus Spotify · 1,2 GB');
  go(box)!.click();
  expect(deps.remove).toHaveBeenCalledWith(6, [10, 11], { permanent: 0, trash: 1.2e9 + 1e6, count: 2 }, 1, 'Spotify');
});

test('a running app cannot be removed until it has quit', async () => {
  const { box, deps, view } = setup([app(1, 'Spotify', 1.2e9, { running: true })], [item(10, 'app', 'Spotify', { inUse: true })]);
  await tick();
  await open(box, 'Spotify');
  expect(box.textContent).toContain('Tutup Spotify dulu');
  expect(go(box)!.disabled).toBe(true);
  deps.bridge.cleanerRunning.mockResolvedValueOnce([]);
  view.revisit();
  await tick();
  expect(go(box)!.disabled).toBe(false);
  expect(box.textContent).not.toContain('Tutup Spotify dulu');
});

test('an app with its own uninstaller has no button', async () => {
  const { box, deps } = setup();
  await tick();
  await open(box, 'GlobalProtect');
  expect(box.textContent).toContain('Pakai uninstaller bawaan app ini');
  expect(go(box)).toBeNull();
  expect(deps.bridge.cleanerAppDetail).not.toHaveBeenCalled();
});

test('back from an app goes to the list, and from the list to the start', async () => {
  const { box, deps } = setup();
  await tick();
  await open(box, 'Spotify');
  box.querySelector<HTMLElement>('.cl-back')!.click();
  expect(box.querySelector('.cl-search')).not.toBeNull();
  box.querySelector<HTMLElement>('.cl-back')!.click();
  expect(deps.back).toHaveBeenCalled();
});
