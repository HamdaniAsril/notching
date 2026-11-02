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
    onBack: vi.fn(),
    onLayout: vi.fn(),
  };
  const home = mountHome(box, deps);
  home.refresh();
  return { box, deps, home };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const text = (box: HTMLElement, sel: string) => box.querySelector(sel)?.textContent ?? '';

test('the bar has a segment per part plus free, sized by its bytes, coloured by CSS', async () => {
  const { box } = setup();
  await tick();
  const segs = [...box.querySelectorAll<HTMLElement>('.cl-seg')];
  expect(segs.map(s => s.dataset.key)).toEqual(['apps', 'documents', 'photos', 'cleanable', 'other', 'free']);
  expect(segs[0].style.width).toBe(`${(51 / 256) * 100}%`);
  expect(segs.every(s => s.style.background === '')).toBe(true);
  const dots = [...box.querySelectorAll<HTMLElement>('.cl-dot')];
  expect(dots.map(d => d.dataset.key)).toEqual(['apps', 'documents', 'photos', 'cleanable', 'other']);
});

test('the head, the big number and the legend', async () => {
  const { box } = setup();
  await tick();
  expect(text(box, '.cl-vol')).toBe('Macintosh HD');
  expect(text(box, '.cl-free')).toBe('Sisa 44 GB');
  expect(text(box, '.cl-of')).toBe('GB · terpakai dari 256 GB');
  expect(text(box, '.cl-big')).toBe('212');
  expect(box.querySelector('.cl-big svg')).toBeNull();
  expect(box.querySelector('.cl-card .cl-bar')).not.toBeNull();
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

test('once measured, the start view tells its drawn height, so the panel can fit it', async () => {
  // jsdom lays nothing out: the start view is 199 px tall here, as with a legend on two lines.
  const tall = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('cl-home') ? 199 : 0;
  });
  const { deps } = setup();
  await tick();
  expect(deps.onLayout).toHaveBeenLastCalledWith(false, 199);
  tall.mockRestore();
});

test('the head starts with ‹ Modul, which goes back', async () => {
  const { box, deps } = setup();
  await tick();
  const back = box.querySelector<HTMLButtonElement>('.cl-head .cl-back')!;
  expect(back.textContent).toBe('‹ Modul');
  expect(box.querySelector('.cl-head')!.firstElementChild).toBe(back);
  back.click();
  expect(deps.onBack).toHaveBeenCalledTimes(1);
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
  expect(deps.onLayout).toHaveBeenLastCalledWith(true, expect.any(Number));
  expect([...box.querySelectorAll('.cl-leg')].map(l => l.textContent)).toContain('Dokumen ?');
  box.querySelector<HTMLElement>('.cl-note button')!.click();
  expect(deps.bridge.openFullDiskAccessSettings).toHaveBeenCalled();
});

test('the test-mode pill only in test mode', async () => {
  const plain = setup();
  await tick();
  expect(plain.box.querySelector('.cl-test')).toBeNull();
  const test = setup({ testMode: true });
  await tick();
  expect(text(test.box, '.cl-test')).toBe('Mode coba');
});

test('no dot-matrix label class on the start view', async () => {
  const { box } = setup({ testMode: true, fda: false });
  await tick();
  expect(box.querySelector('.lab')).toBeNull();
});
