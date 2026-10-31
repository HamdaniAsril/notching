// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { hostStrings } from '../i18n';
import type { ModuleState, Page } from '../modules/types';
import { mountFrameHost } from '../pages/frames';
import { pickPage, resolvePage } from '../pages/route';
import { mountPageView } from './page-view';
import { BERANDA, fakeBridge, moduleInfo, TEST_STATE, timerInfo, timers } from './test-helpers';

const STR = hostStrings('id');

afterEach(() => { document.body.innerHTML = ''; });

function mount() {
  const content = document.createElement('div');
  document.body.append(content);
  const bridge = fakeBridge();
  const frames = mountFrameHost({ bridge, setTimer: timers.setTimer, onKey: vi.fn(), onExpand: vi.fn(), onCollapse: vi.fn(), onLamp: vi.fn() }, document);
  const deps = {
    frames, moduleUrl: bridge.moduleUrl, onOpenModule: vi.fn(), onAction: vi.fn(), onBack: vi.fn(),
    shelf: { startDrag: vi.fn(), remove: vi.fn(), clear: vi.fn() },
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

test('a custom page lays its widgets in four columns with dotted gaps', () => {
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

test('a strip sits under the row behind a dotted line, and a full view hides it', () => {
  const { content, pv, show } = mount();
  const s = { ...TEST_STATE, pages: [{ ...BERANDA, strip: 'timer/strip' }], modules: [...TEST_STATE.modules, timerInfo()] };
  show(s);
  expect(content.querySelector('.pg-page > .pg-strip-line')).not.toBeNull();
  const strip = content.querySelector<HTMLElement>('.pg-page > .pg-strip')!;
  expect(strip.dataset.key).toBe('home/strip/timer/strip');
  const frame = strip.querySelector('iframe')!;
  expect([frame.style.height, frame.getAttribute('src')]).toEqual(['40px', 'mod://timer/index.html']);
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
});

test('a module page has a back bar to the Modul page', () => {
  const { content, deps, show } = mount();
  show(TEST_STATE, 'module:system-stat');
  const back = content.querySelector<HTMLButtonElement>('.pg-back button')!;
  expect(back.textContent).toContain('Modul');
  expect(content.querySelector('.pg-back')!.textContent).toContain('system-stat');
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
