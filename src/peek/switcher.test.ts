// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { pointSwitcher, renderSwitcher, type SwitchCalls, type SwitchView } from './switcher';
import { setOwnGlass } from './view';

const calls = (): SwitchCalls & { [K in keyof SwitchCalls]: ReturnType<typeof vi.fn> } => ({
  size: vi.fn(), pointer: vi.fn(), pick: vi.fn(), open: vi.fn(), act: vi.fn(),
  picture: vi.fn(async () => null),
}) as never;

const VIEW: SwitchView = {
  layout: 'windows', place: 'center', card: 'dark', material: 'solid', accent: '#c8f04a', lang: 'id',
  sel: 1, win: 0, sticky: false,
  items: [
    { kind: 'window', pid: 1, id: 11, title: 'Laporan Q3.docx', appName: 'Word', minimized: false, icon: 'data:image/png;base64,W' },
    { kind: 'window', pid: 2, id: 21, title: 'notching.web.id', appName: 'Safari', minimized: false, icon: 'data:image/png;base64,S' },
    { kind: 'window', pid: 1, id: 12, title: 'Surat.docx', appName: 'Word', minimized: true, icon: 'data:image/png;base64,W' },
    { kind: 'app', pid: 3, id: null, title: 'Musik', appName: 'Musik', minimized: false, icon: 'data:image/png;base64,M' },
  ],
  apps: [
    { pid: 1, name: 'Word', icon: 'data:image/png;base64,W', count: 2 },
    { pid: 2, name: 'Safari', icon: 'data:image/png;base64,S', count: 1 },
    { pid: 3, name: 'Musik', icon: 'data:image/png;base64,M', count: 0 },
  ],
};

const mount = (v: SwitchView = VIEW, c = calls()) => {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  renderSwitcher(root, v, c);
  return { root, c };
};

test('per window: one card per item, the app card with its icon only, the selection lit', () => {
  const { root } = mount();
  const cards = [...root.querySelectorAll<HTMLElement>('.swgrid .sc')];
  expect(cards).toHaveLength(4);
  expect(cards[1].classList.contains('sel')).toBe(true);
  expect(cards[2].querySelector('.chip')!.textContent).toBe('Min');
  expect(cards[2].querySelector('.ab')!.classList.contains('restore')).toBe(true); // green, as macOS's
  expect(cards[0].querySelector('.ab')!.classList.contains('min')).toBe(true);
  expect(cards[3].classList.contains('app')).toBe(true);
  expect(cards[3].querySelector('.cap span')!.textContent).toBe('Musik');
  expect(root.querySelector('.swh .cond')!.textContent).toBe('4 jendela');
});

test('per app: the apps in a row with their counts, the chosen app\'s windows under them', () => {
  const { root } = mount({ ...VIEW, layout: 'apps', sel: 0, win: 1 });
  const apps = [...root.querySelectorAll<HTMLElement>('.apps .ap')];
  expect(apps.map(a => a.querySelector('.nm')!.textContent)).toEqual(['Word', 'Safari', 'Musik']);
  expect(apps[0].classList.contains('sel')).toBe(true);
  expect(apps[0].querySelector('.n')!.textContent).toBe('2');
  expect(apps[1].querySelector('.n')).toBeNull();
  const wins = [...root.querySelectorAll<HTMLElement>('.subwins .sc')];
  expect(wins.map(w => w.querySelector('.cap span')!.textContent)).toEqual(['Laporan Q3.docx', 'Surat.docx']);
  expect(wins[1].classList.contains('sel')).toBe(true);
  expect(root.querySelector('.swh .cond')!.textContent).toBe('3 app');
});

test('the pointer picks a card, a click opens it, a button acts without opening', () => {
  const { root, c } = mount();
  const cards = [...root.querySelectorAll<HTMLElement>('.swgrid .sc')];
  pointSwitcher(root, cards[2].querySelector('.cap'), c);
  expect(c.pick).toHaveBeenLastCalledWith(2, null);
  expect(c.pointer).toHaveBeenLastCalledWith(true);
  cards[0].click();
  expect(c.open).toHaveBeenLastCalledWith(0, null);
  cards[1].querySelector<HTMLElement>('.ab.close')!.click();
  expect(c.act).toHaveBeenLastCalledWith(1, null, 'close');
  expect(c.open).toHaveBeenCalledTimes(1);
  pointSwitcher(root, null, c);
  expect(c.pointer).toHaveBeenLastCalledWith(false);
});

test('per app: pointing at a window picks that app and window', () => {
  const { root, c } = mount({ ...VIEW, layout: 'apps', sel: 0, win: 0 });
  const second = root.querySelectorAll<HTMLElement>('.subwins .sc')[1];
  pointSwitcher(root, second, c);
  expect(c.pick).toHaveBeenLastCalledWith(0, 1);
  second.click();
  expect(c.open).toHaveBeenLastCalledWith(0, 1);
});

test('after a window button the head says how to finish', () => {
  const { root } = mount({ ...VIEW, sticky: true });
  expect(root.querySelector('.swh .keys')!.textContent).toBe('Enter buka · Esc tutup');
});

test('in English, and from the notch', () => {
  const { root } = mount({ ...VIEW, lang: 'en', place: 'notch', items: VIEW.items.slice(0, 3) });
  expect(root.querySelector('.swh .cond')!.textContent).toBe('3 windows');
  expect(root.querySelector('#sw')!.classList.contains('notch')).toBe(true);
});

test('a selection change keeps the cards and asks for no picture again', async () => {
  const { root, c } = mount();
  await Promise.resolve();
  const before = [...root.querySelectorAll<HTMLElement>('.swgrid .sc')];
  expect(c.picture).toHaveBeenCalledTimes(3);
  renderSwitcher(root, { ...VIEW, sel: 2 }, c);
  const after = [...root.querySelectorAll<HTMLElement>('.swgrid .sc')];
  expect(after[0]).toBe(before[0]);
  expect(after.map(a => a.classList.contains('sel'))).toEqual([false, false, true, false]);
  expect(c.picture).toHaveBeenCalledTimes(3);
  renderSwitcher(root, { ...VIEW, sel: 2, sticky: true }, c);
  expect(root.querySelector('.swh .keys')!.textContent).toBe('Enter buka · Esc tutup');
});

test('a new list keeps the pictures it has; a new opening asks again', async () => {
  const c = calls();
  c.picture.mockImplementation(async (id: number) => `data:image/png;base64,P${id}`);
  const { root } = mount(VIEW, c);
  await new Promise(r => setTimeout(r));
  renderSwitcher(root, { ...VIEW, items: VIEW.items.slice(1) }, c);
  expect(c.picture).toHaveBeenCalledTimes(3);
  // Shown at once, not after a wait.
  expect(root.querySelector<HTMLImageElement>('.swgrid .sc .box img')!.getAttribute('src')).toBe('data:image/png;base64,P21');
  root.replaceChildren();
  renderSwitcher(root, VIEW, c);
  expect(c.picture).toHaveBeenCalledTimes(6);
});

test('per app: another window of the same app keeps the row', () => {
  const { root, c } = mount({ ...VIEW, layout: 'apps', sel: 0, win: 0 });
  const row = root.querySelector('.apps');
  renderSwitcher(root, { ...VIEW, layout: 'apps', sel: 0, win: 1 }, c);
  expect(root.querySelector('.apps')).toBe(row);
  const wins = [...root.querySelectorAll<HTMLElement>('.subwins .sc')];
  expect(wins.map(w => w.classList.contains('sel'))).toEqual([false, true]);
});

test("Notching's own glass adds its class and tint to the switcher, also when only the selection moves", () => {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const c = calls();
  const glass: SwitchView = { ...VIEW, material: 'glass' };
  renderSwitcher(root, glass, c);
  setOwnGlass(root, true, 0.4);
  let sw = root.querySelector<HTMLElement>('#sw')!;
  expect(sw.classList.contains('own')).toBe(true);
  expect(sw.style.getPropertyValue('--own-tint')).toBe('0.4');
  renderSwitcher(root, { ...glass, sel: 2 }, c);
  renderSwitcher(root, { ...glass, layout: 'apps' }, c);
  sw = root.querySelector<HTMLElement>('#sw')!;
  expect(sw.classList.contains('own')).toBe(true);
  setOwnGlass(root, false, 0.4);
  expect(root.querySelector('#sw')!.classList.contains('own')).toBe(false);
});
