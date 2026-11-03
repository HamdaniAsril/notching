// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { hostStrings } from '../i18n';
import type { ModuleState, Page } from '../modules/types';
import { mountFrameHost } from '../pages/frames';
import { pickPage, resolvePage, viewSize } from '../pages/route';
import { fakeShotDeps, shot } from '../shot/test-helpers';
import { mountPageView } from './page-view';
import { BERANDA, fakeBridge, moduleInfo, TEST_STATE, timerInfo, timers } from './test-helpers';

const STR = hostStrings('id');

afterEach(() => { document.body.innerHTML = ''; });

// A notch like the browser preview's; `null`: a screen without one.
const NOTCH = { width: 164, height: 32 };

function mount(notch: { width: number; height: number } | null = NOTCH) {
  const content = document.createElement('div');
  document.body.append(content);
  const bridge = fakeBridge();
  const frames = mountFrameHost({ bridge, setTimer: timers.setTimer, onKey: vi.fn(), onExpand: vi.fn(), onCollapse: vi.fn(), onLamp: vi.fn() }, document);
  const deps = {
    frames, notch, moduleUrl: bridge.moduleUrl, onOpenModule: vi.fn(), onAction: vi.fn(), onBack: vi.fn(),
    shelf: { startDrag: vi.fn(), remove: vi.fn(), clear: vi.fn() },
    shot: fakeShotDeps(),
    cleaner: { bridge, now: () => 0, resize: vi.fn() },
  };
  const pv = mountPageView(content, deps);
  const show = (s: ModuleState, key: string | null = null) => pv.show(key ? resolvePage(s, key)! : pickPage(s, null, false), s, STR);
  return { content, pv, deps, show };
}

const shelfItem = (id: number) => ({ id, name: `f${id}.txt`, folder: false, state: 'ready' as const, thumb: null });

test('the shelf page keeps its view, and its selection, between renders', () => {
  const { content, pv, deps } = mount();
  const view = (n: number, dropping = false) => ({ kind: 'shelf' as const, key: 'shelf' as const, shelf: { items: Array.from({ length: n }, (_, i) => shelfItem(i + 1)) }, dropping });
  pv.show(view(2), TEST_STATE, STR);
  const box = content.querySelector('.sh')!;
  content.querySelector<HTMLElement>('.sh-tile[data-id="2"]')!.click();
  pv.show(view(3), TEST_STATE, STR);
  expect(content.querySelector('.sh')).toBe(box);
  expect(content.querySelectorAll('.sh-tile')).toHaveLength(3);
  expect(content.querySelector('.sh-tile.sel')!.getAttribute('data-id')).toBe('2');
  content.querySelector<HTMLElement>('.sh-x')!.click();
  expect(deps.shelf.remove).toHaveBeenCalledWith([1]);
  pv.show(view(3, true), TEST_STATE, STR);
  expect(content.querySelector('.sh-drop')).not.toBeNull();
  pv.show(pickPage(TEST_STATE, null, false), TEST_STATE, STR);
  expect(content.querySelector('.sh')).toBeNull();
});

const slots = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.pg-slot')];

test('a custom page lays its widgets in four columns', () => {
  const { content, show } = mount();
  show(TEST_STATE);
  expect(slots(content).map(s => [s.dataset.col, s.dataset.width])).toEqual([['0', '1'], ['1', '1'], ['2', '2']]);
  expect(content.querySelectorAll('.pg-slot iframe')).toHaveLength(3);
  expect(content.querySelector('.pg-row')).not.toBeNull();
});

test('a widget whose source is gone leaves its columns empty', () => {
  const { content, show } = mount();
  const page: Page = { ...BERANDA, widgets: [...BERANDA.widgets.slice(0, 2), { widget: 'timer/timer', col: 3, width: 1 }] };
  show({ ...TEST_STATE, pages: [page] });
  expect(slots(content).map(s => s.dataset.col)).toEqual(['0', '1']);
});

test('a 52 px strip sits right under the row, with no dotted line, and a full view hides it', () => {
  const { content, pv, show } = mount();
  const s = { ...TEST_STATE, pages: [{ ...BERANDA, strip: 'timer/strip' }], modules: [...TEST_STATE.modules, timerInfo()] };
  show(s);
  expect(content.querySelector('.pg-strip-line')).toBeNull();
  const strip = content.querySelector<HTMLElement>('.pg-page > .pg-row + .pg-strip')!;
  expect(strip.dataset.key).toBe('home/strip/timer/strip');
  expect(strip.style.height).toBe('52px');
  const frame = strip.querySelector('iframe')!;
  expect([frame.style.height, frame.getAttribute('src')]).toEqual(['52px', 'mod://timer/index.html']);
  pv.expand(slots(content)[2].dataset.key!);
  expect(content.querySelector('.pg-page')!.classList.contains('full')).toBe(true);
  pv.collapse();
  expect(content.querySelector('.pg-page')!.classList.contains('full')).toBe(false);
});

test('a strip whose source is off is hidden and the page is not taller', () => {
  const { content, show } = mount();
  show({ ...TEST_STATE, pages: [{ ...BERANDA, strip: 'timer/strip' }] });
  expect(content.querySelector('.pg-strip')).toBeNull();
  expect(content.querySelector('.pg-strip-line')).toBeNull();
});

test('a page with only a strip shows it under an empty row', () => {
  const { content, show } = mount();
  show({ ...TEST_STATE, pages: [{ ...BERANDA, widgets: [], strip: 'timer/strip' }], modules: [...TEST_STATE.modules, timerInfo()] });
  expect(content.querySelector('.pg-empty')).toBeNull();
  expect(content.querySelector('.pg-row')).not.toBeNull();
  expect(content.querySelector('.pg-strip iframe')).not.toBeNull();
});

test('an empty page says so', () => {
  const { content, show } = mount();
  show({ ...TEST_STATE, pages: [{ ...BERANDA, widgets: [] }] });
  expect(content.querySelector('.pg-empty')!.textContent).toBe(STR.pageEmpty);
});

test('expanding covers the row and collapsing brings the others back', () => {
  const { content, pv, show } = mount();
  show(TEST_STATE);
  const key = 'home/2/home/reminders';
  pv.expand(key);
  expect(pv.full).toBe(key);
  expect(content.querySelector('.pg-row')!.classList.contains('full')).toBe(true);
  expect(slots(content).filter(s => s.classList.contains('full')).map(s => s.dataset.key)).toEqual([key]);
  pv.collapse();
  expect(pv.full).toBeNull();
  expect(content.querySelector('.pg-row.full')).toBeNull();
  expect(content.querySelectorAll('.pg-slot.full')).toHaveLength(0);
});

test('a taller full view stretches its row and frame, and collapsing puts them back', () => {
  const { content, pv, show } = mount();
  show(TEST_STATE);
  const key = 'home/2/home/reminders';
  const row = () => content.querySelector<HTMLElement>('.pg-row')!;
  const frame = () => content.querySelector<HTMLElement>(`.pg-slot[data-key="${key}"] iframe`)!;
  pv.expand(key, 193);
  expect([row().style.height, frame().style.height]).toEqual(['193px', '193px']);
  pv.collapse();
  expect([row().style.height, frame().style.height]).toEqual(['104px', '104px']);
});

const head = (c: HTMLElement) => c.querySelector<HTMLElement>('.pg-head');
const headText = (c: HTMLElement) =>
  [head(c)!.querySelector('.pg-head-name')!.textContent, head(c)!.querySelector('.pg-head-count')!.textContent];
const UNNAMED: Page = { id: 'p2', name: null, icon: 'dot', widgets: [{ widget: 'home/clock', col: 0, width: 1 }] };
const KERJA: Page = { id: 'p3', name: 'Kerja', icon: 'briefcase', widgets: [] };

test('a widget page heads with its name and its place among the widget pages', () => {
  const { content, show } = mount();
  const s = { ...TEST_STATE, pages: [BERANDA, UNNAMED, KERJA] };
  show(s, 'p2');
  expect(headText(content)).toEqual(['Halaman 2', '2 / 3']);
  show(s, 'home');
  expect(headText(content)).toEqual(['Beranda', '1 / 3']);
  // An empty page has its head too.
  show(s, 'p3');
  expect(headText(content)).toEqual(['Kerja', '3 / 3']);
  expect(content.querySelector('.pg-empty')).not.toBeNull();
});

test('a page name is text, never markup', () => {
  const { content, show } = mount();
  show({ ...TEST_STATE, pages: [BERANDA, { ...KERJA, name: '<b>x</b>' }] }, 'p3');
  expect(content.querySelector('b')).toBeNull();
  expect(headText(content)[0]).toBe('<b>x</b>');
});

test('the head follows a page added elsewhere, and the frames stay', () => {
  const { content, show } = mount();
  show({ ...TEST_STATE, pages: [BERANDA] });
  const first = content.querySelector('iframe');
  expect(headText(content)).toEqual(['Beranda', '1 / 1']);
  show({ ...TEST_STATE, pages: [BERANDA, KERJA] });
  expect(content.querySelector('iframe')).toBe(first);
  expect(headText(content)).toEqual(['Beranda', '1 / 2']);
});

test('beside a notch the head sits in the camera row, as the notice ears do', () => {
  const { content, show } = mount();
  show(TEST_STATE);
  const h = head(content)!;
  expect(h.classList.contains('cam')).toBe(true);
  expect([h.style.height, h.style.lineHeight]).toEqual(['32px', '32px']);
  expect(h.style.getPropertyValue('--notch-w')).toBe('164px');
});

test('without a notch the head is a row above the widgets, and a full view leaves it room', () => {
  const { content, pv, show } = mount(null);
  show(TEST_STATE);
  const h = head(content)!;
  expect(h.classList.contains('cam')).toBe(false);
  expect(content.querySelector('.pg-page > .pg-head:first-child + .pg-row')).not.toBeNull();
  const key = 'home/2/home/reminders';
  const row = () => content.querySelector<HTMLElement>('.pg-row')!;
  // The page's height (route.ts viewSize) holds the head row: 26 px of it is not the widgets'.
  pv.expand(key, 219);
  expect(row().style.height).toBe('193px');
  pv.collapse();
  expect(row().style.height).toBe('104px');
});

test('only widget pages have a head', () => {
  const { content, pv, show } = mount();
  show(TEST_STATE, 'modules');
  expect(head(content)).toBeNull();
  show(TEST_STATE, 'module:system-stat');
  expect(head(content)).toBeNull();
  pv.show({ kind: 'shelf', key: 'shelf', shelf: { items: [shelfItem(1)] }, dropping: false }, TEST_STATE, STR);
  expect(head(content)).toBeNull();
  pv.show({ kind: 'shot', mode: 'list', key: 'screenshot', shots: [shot(1)] }, TEST_STATE, STR);
  expect(head(content)).toBeNull();
  pv.show({ kind: 'cleaner', key: 'cleaner', screen: 'home', note: false }, TEST_STATE, STR);
  expect(head(content)).toBeNull();
});

test('expanding a frame of another page does nothing', () => {
  const { pv, show } = mount();
  show(TEST_STATE);
  pv.expand('p9/0/home/date');
  expect(pv.full).toBeNull();
});

test('the Modul page shows a tile per module, white when on and a red dot when running', () => {
  const { content, deps, show } = mount();
  const s = { ...TEST_STATE, modules: [...TEST_STATE.modules,
    moduleInfo('awake', { shortName: 'Awake', activity: 'on' }), moduleInfo('timer', { shortName: 'Timer', activity: 'running' })] };
  show(s, 'modules');
  const tiles = [...content.querySelectorAll<HTMLButtonElement>('.mods-tile')];
  expect(tiles.map(t => t.querySelector('.mods-name')!.textContent)).toEqual(['system-stat', 'Awake', 'Timer']);
  expect(tiles.map(t => t.classList.contains('on'))).toEqual([false, true, false]);
  expect(tiles.map(t => !!t.querySelector('.mods-run'))).toEqual([false, false, true]);
  tiles[0].click();
  expect(deps.onOpenModule).toHaveBeenCalledWith('system-stat');
});

test('the Modul page lays its tiles in rows of 4, the last row centred', () => {
  const { content, show } = mount();
  const extra = Array.from({ length: 6 }, (_, i) => moduleInfo(`m${i}`));
  show({ ...TEST_STATE, modules: [...TEST_STATE.modules, ...extra] }, 'modules');
  const rows = [...content.querySelectorAll<HTMLElement>('.mods-grid > .mods-row')];
  expect(rows.map(r => r.querySelectorAll('.mods-tile').length)).toEqual([4, 3]);
  expect([...content.querySelectorAll('.mods-tile')].map(t => t.querySelector('.mods-name')!.textContent))
    .toEqual(['system-stat', 'm0', 'm1', 'm2', 'm3', 'm4', 'm5']);
});

test('an action tile runs its action and opens no page', () => {
  const { content, deps, show } = mount();
  const clean = moduleInfo('keyboard-clean', { shortName: 'Keyboard', entry: null, card: null,
    action: { capability: 'keyclean', method: 'toggle' }, activity: 'on' });
  show({ ...TEST_STATE, modules: [...TEST_STATE.modules, clean] }, 'modules');
  const tile = [...content.querySelectorAll<HTMLButtonElement>('.mods-tile')].find(t => t.textContent === 'Keyboard')!;
  expect(tile.classList.contains('on')).toBe(true);
  tile.click();
  expect(deps.onAction).toHaveBeenCalledWith(clean);
  expect(deps.onOpenModule).not.toHaveBeenCalled();
});

test('a Modul page without modules says so', () => {
  const { content, show } = mount();
  show({ ...TEST_STATE, modules: [TEST_STATE.modules[0]] }, 'modules');
  expect(content.querySelector('.pg-empty')!.textContent).toBe(STR.noModules);
  expect(content.querySelector('.lab')).toBeNull();
});

test('a module page has a back bar to the Modul page', () => {
  const { content, deps, show } = mount();
  show(TEST_STATE, 'module:system-stat');
  const back = content.querySelector<HTMLButtonElement>('.pg-back button')!;
  expect(back.textContent).toContain('Modul');
  expect(content.querySelector('.pg-back')!.textContent).toContain('system-stat');
  expect(content.querySelector('.pg-back .lab')).toBeNull();
  expect(content.querySelector('iframe')!.getAttribute('src')).toBe('mod://system-stat/index.html');
  back.click();
  expect(deps.onBack).toHaveBeenCalled();
});

test('a module name is text, never markup', () => {
  const { content, show } = mount();
  const s = { ...TEST_STATE, modules: [moduleInfo('x', { name: '<b>x</b>', shortName: '<b>x</b>' })] };
  show(s, 'modules');
  expect(content.querySelector('b')).toBeNull();
  expect(content.querySelector('.mods-name')!.textContent).toBe('<b>x</b>');
  show(s, 'module:x');
  expect(content.querySelector('b')).toBeNull();
});

test('frames survive showing the same page again', () => {
  const { content, show } = mount();
  show(TEST_STATE);
  const first = content.querySelector('iframe');
  show({ ...TEST_STATE, missed: ['home.reminder'] });
  expect(content.querySelector('iframe')).toBe(first);
});

test('a screenshot page keeps its view between renders and goes with the page', () => {
  const { content, pv, deps } = mount();
  const result = (id: number) => ({ kind: 'shot' as const, mode: 'result' as const, id, key: 'screenshot' as const, shots: [shot(1), shot(2)] });
  pv.show(result(1), TEST_STATE, STR);
  const box = content.querySelector('.shot')!;
  expect(content.querySelector('.shot-pic img')!.getAttribute('src')).toContain('/1/');
  pv.show(result(2), TEST_STATE, STR);
  expect(content.querySelector('.shot')).toBe(box);
  expect(content.querySelector('.shot-pic img')!.getAttribute('src')).toContain('/2/');
  // The list is another view.
  pv.show({ kind: 'shot', mode: 'list', key: 'screenshot', shots: [shot(1)] }, TEST_STATE, STR);
  expect(content.querySelector('.shot-res')).toBeNull();
  expect(content.querySelectorAll('.shot-tile')).toHaveLength(1);
  // Cmd+C copies only on the result page.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true }));
  expect(deps.shot.shotCopy).not.toHaveBeenCalled();
  pv.show(result(2), TEST_STATE, STR);
  pv.show(pickPage(TEST_STATE, null, false), TEST_STATE, STR);
  expect(content.querySelector('.shot')).toBeNull();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true }));
  expect(deps.shot.shotCopy).not.toHaveBeenCalled();
});

// The notch's card area has no height of its own, so Cleaner's lists are held to the
// panel by the page: without it the list of apps grew past the panel and never scrolled.
test("Cleaner's lists are as tall as the panel and scroll inside it; the start view keeps its own height", async () => {
  const { content, pv } = mount();
  const cleaner = (screen: 'home' | 'list') => ({ kind: 'cleaner' as const, key: 'cleaner' as const, screen, note: false });
  pv.show(cleaner('list'), TEST_STATE, STR);
  const box = content.querySelector<HTMLElement>('.cl')!;
  expect(box.style.height).toBe(`${viewSize(cleaner('list')).height}px`);
  pv.show(cleaner('home'), TEST_STATE, STR);
  expect(box.style.height).toBe('');
  pv.show(cleaner('list'), TEST_STATE, STR);
  expect(box.style.height).toBe(`${viewSize(cleaner('list')).height}px`);

  // Down the chain each box takes the height above it, and the list's card is the one that scrolls.
  // Read from disk: vitest blanks a stylesheet imported as text.
  // @ts-expect-error: the app has no Node types; vitest runs in Node.
  const { readFileSync } = await import('node:fs');
  const pagesCss: string = readFileSync('src/notch/pages.css', 'utf8');
  const rule = (sel: string) => pagesCss.match(new RegExp(`(?:^|\\n)${sel.replace('.', '\\.')}[^{]*\\{([^}]*)\\}`))?.[1] ?? '';
  expect(rule('.cl,')).toContain('height: 100%');
  expect(rule('.cl-list')).toMatch(/height: 100%[\s\S]*min-height: 0/);
  expect(rule('.cl-lbody')).toMatch(/min-height: 0[\s\S]*overflow-y: auto/);
});
