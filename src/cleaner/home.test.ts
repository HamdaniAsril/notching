// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import type { CleanerOverview, CleanerParts } from '../bridge';
import { hostStrings } from '../i18n';
import { mountHome } from './home';

const OVERVIEW: CleanerOverview = { testMode: false, fda: true, volume: 'Macintosh HD', total: 256e9, free: 44e9 };
const PARTS: CleanerParts = { apps: 51e9, documents: 36e9, photos: 26e9, cleanable: 31e9, appCount: 84 };

function setup(over: Partial<CleanerOverview> = {}, parts: Promise<CleanerParts> = Promise.resolve(PARTS)) {
  const box = document.createElement('div');
  document.body.replaceChildren(box);
  const deps = {
    bridge: {
      cleanerOverview: vi.fn(async () => ({ ...OVERVIEW, ...over })),
      cleanerParts: vi.fn(() => parts),
      openFullDiskAccessSettings: vi.fn(async () => {}),
    },
    lang: 'id' as const,
    strings: hostStrings('id').cleaner,
    onClean: vi.fn(),
    onUninstall: vi.fn(),
    onDisk: vi.fn(),
    onNote: vi.fn(),
  };
  const home = mountHome(box, deps);
  home.refresh();
  return { box, deps, home };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const text = (box: HTMLElement, sel: string) => box.querySelector(sel)?.textContent ?? '';

test('the bar has a segment per part plus free, in the bar colours', async () => {
  const { box } = setup();
  await tick();
  const segs = [...box.querySelectorAll<HTMLElement>('.cl-seg')];
  expect(segs.map(s => s.dataset.key)).toEqual(['apps', 'documents', 'photos', 'cleanable', 'other', 'free']);
  expect(segs[0].style.background).toBe('rgb(47, 124, 246)');
  expect(segs[3].style.background).toBe('rgb(232, 38, 46)');
});

test('the head, the big number and the legend', async () => {
  const { box } = setup();
  await tick();
  expect(text(box, '.cl-vol')).toBe('Macintosh HD');
  expect(text(box, '.cl-free')).toBe('Sisa 44 GB');
  expect(text(box, '.cl-of')).toBe('GB · terpakai dari 256 GB');
  expect(box.querySelector('.cl-big svg')).not.toBeNull();
  const legend = [...box.querySelectorAll('.cl-leg')].map(l => l.textContent);
  expect(legend).toEqual(['App 51 GB', 'Dokumen 36 GB', 'Foto 26 GB', 'Bisa dibersihkan 31 GB', 'Lainnya 68 GB']);
});

test('Menghitung… shows until the parts arrive', async () => {
  let done!: (p: CleanerParts) => void;
  const { box } = setup({}, new Promise(r => { done = r; }));
  await tick();
  expect(text(box, '.cl-measuring')).toBe('Menghitung…');
  done(PARTS);
  await tick();
  expect(box.querySelector('.cl-measuring')).toBeNull();
});

test('the two tiles show their summaries and open their lists', async () => {
  const { box, deps } = setup();
  await tick();
  expect(text(box, '[data-tile="clean"] .cl-tname')).toBe('Deep clean');
  expect(text(box, '[data-tile="clean"] .cl-tsub')).toBe('Cache, log, sisa app · 31 GB');
  expect(text(box, '[data-tile="uninstall"] .cl-tsub')).toBe('Hapus app beserta sisanya · 84 app');
  box.querySelector<HTMLElement>('[data-tile="clean"]')!.click();
  box.querySelector<HTMLElement>('[data-tile="uninstall"]')!.click();
  box.querySelector<HTMLElement>('.cl-bar')!.click();
  expect([deps.onClean.mock.calls.length, deps.onUninstall.mock.calls.length, deps.onDisk.mock.calls.length]).toEqual([1, 1, 1]);
});

test('without Full Disk Access: unknown parts show "?", and the note opens its settings', async () => {
  const { box, deps } = setup({ fda: false }, Promise.resolve({ ...PARTS, documents: null, photos: null }));
  await tick();
  expect(text(box, '.cl-note-text')).toBe('Sebagian folder dilewati. Beri izin Full Disk Access');
  expect(deps.onNote).toHaveBeenLastCalledWith(true);
  expect([...box.querySelectorAll('.cl-leg')].map(l => l.textContent)).toContain('Dokumen ?');
  box.querySelector<HTMLElement>('.cl-note button')!.click();
  expect(deps.bridge.openFullDiskAccessSettings).toHaveBeenCalled();
});

test('MODE COBA only in test mode', async () => {
  const plain = setup();
  await tick();
  expect(plain.box.querySelector('.cl-test')).toBeNull();
  const test = setup({ testMode: true });
  await tick();
  expect(text(test.box, '.cl-test')).toBe('MODE COBA');
});
