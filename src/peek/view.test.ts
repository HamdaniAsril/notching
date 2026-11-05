// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { renderPeek, type PeekCalls, type PeekView } from './view';

const calls = (): PeekCalls & { [K in keyof PeekCalls]: ReturnType<typeof vi.fn> } => ({
  size: vi.fn(), pointer: vi.fn(), open: vi.fn(), act: vi.fn(), hover: vi.fn(),
  picture: vi.fn(async () => null),
}) as never;

const VIEW: PeekView = {
  app: 'Word', icon: null, card: 'dark', material: 'solid', accent: '#c8f04a', lang: 'id',
  windows: [
    { id: 1, title: 'Laporan Q3.docx', minimized: false, front: true },
    { id: 2, title: 'Proposal Klien.docx', minimized: false, front: false },
    { id: 3, title: 'Surat Undangan.docx', minimized: true, front: false },
  ],
};

const mount = (v: PeekView = VIEW, c = calls()) => {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  renderPeek(root, v, c);
  return { root, c };
};
const card = (root: HTMLElement, id: number) => root.querySelector<HTMLElement>(`.th[data-id="${id}"]`)!;

test('each window is a card with its marks, and a minimized one offers Pulihkan', () => {
  const { root } = mount();
  expect(root.querySelector('.ph .nm')!.textContent).toBe('Word');
  expect(root.querySelector('.ph .ct')!.textContent).toBe('3 jendela');
  expect(card(root, 1).querySelector('.chip')!.textContent).toBe('Di depan');
  expect(card(root, 2).querySelector('.chip')).toBeNull();
  expect(card(root, 3).querySelector('.chip')!.textContent).toBe('Diminimize');
  const first = card(root, 3).querySelector<HTMLElement>('.ab')!;
  expect([first.dataset.act, first.getAttribute('aria-label')]).toEqual(['restore', 'Pulihkan']);
  expect(card(root, 1).querySelector<HTMLElement>('.ab')!.dataset.act).toBe('minimize');
  expect(card(root, 1).querySelector('.ab.quit')!.getAttribute('aria-label')).toBe('Keluar dari Word');
});

test('a window button acts without opening the window; the card opens it', () => {
  const { root, c } = mount();
  card(root, 2).querySelector<HTMLElement>('.ab.close')!.click();
  expect(c.act).toHaveBeenCalledWith(2, 'close');
  expect(c.open).not.toHaveBeenCalled();
  card(root, 2).click();
  expect(c.open).toHaveBeenCalledWith(2);
});

test('pointing at a card peeks at its window; leaving stops; the panel tells when the pointer is on it', () => {
  const { root, c } = mount();
  card(root, 1).dispatchEvent(new MouseEvent('mouseenter'));
  expect(c.hover).toHaveBeenLastCalledWith(1);
  card(root, 1).dispatchEvent(new MouseEvent('mouseleave'));
  expect(c.hover).toHaveBeenLastCalledWith(null);
  root.querySelector('#peek')!.dispatchEvent(new MouseEvent('mouseenter'));
  expect(c.pointer).toHaveBeenLastCalledWith(true);
  root.querySelector('#peek')!.dispatchEvent(new MouseEvent('mouseleave'));
  expect(c.pointer).toHaveBeenLastCalledWith(false);
});

test('a window without a title shows its app name', () => {
  const { root } = mount({ ...VIEW, windows: [{ id: 9, title: '', minimized: false, front: false }] });
  expect(card(root, 9).querySelector('.cap span')!.textContent).toBe('Word');
});

test('a new view drops a window that is gone, and no window at all says so', () => {
  const { root, c } = mount();
  renderPeek(root, { ...VIEW, windows: VIEW.windows.filter(w => w.id !== 2) }, c);
  expect(card(root, 2)).toBeNull();
  expect(root.querySelectorAll('.th')).toHaveLength(2);
  renderPeek(root, { ...VIEW, windows: [] }, c);
  expect(root.querySelector('.empty')!.textContent).toBe('Tidak ada jendela yang terbuka');
  expect(root.querySelector('.ph .ct')!.textContent).toBe('');
});

test('the size is sent once per drawing, also with 20 windows', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, title: `Dok ${i + 1}`, minimized: false, front: i === 0 }));
  const { root, c } = mount({ ...VIEW, windows: many });
  expect(root.querySelectorAll('.th')).toHaveLength(20);
  expect(c.size).toHaveBeenCalledTimes(1);
});

test('the card colour and material become classes', () => {
  const { root } = mount({ ...VIEW, card: 'light', material: 'glass' });
  expect(root.querySelector('#peek')!.className).toBe('card-light mat-glass');
});

test('a picture takes the place of the icon once it comes', async () => {
  const c = calls();
  c.picture.mockImplementation(async (id: number) => (id === 1 ? 'data:image/png;base64,AAAA' : null));
  const { root } = mount({ ...VIEW, icon: 'data:image/png;base64,ICON' }, c);
  expect(card(root, 1).querySelector<HTMLImageElement>('.box img')!.src).toContain('ICON');
  await Promise.resolve();
  await Promise.resolve();
  expect(card(root, 1).querySelector<HTMLImageElement>('.box img')!.src).toContain('AAAA');
  expect(card(root, 2).querySelector<HTMLImageElement>('.box img')!.src).toContain('ICON');
});

test('in English', () => {
  const { root } = mount({ ...VIEW, lang: 'en', windows: VIEW.windows.slice(0, 2) });
  expect(root.querySelector('.ph .ct')!.textContent).toBe('2 windows');
  expect(card(root, 1).querySelector('.chip')!.textContent).toBe('In front');
  expect(card(root, 1).querySelector('.ab.quit')!.getAttribute('aria-label')).toBe('Quit Word');
  const one = mount({ ...VIEW, lang: 'en', windows: VIEW.windows.slice(0, 1) });
  expect(one.root.querySelector('.ph .ct')!.textContent).toBe('1 window');
});

test('the cards wrap onto more rows instead of leaving the screen', async () => {
  // @ts-expect-error: the app has no Node types; vitest runs in Node.
  const { readFileSync } = await import('node:fs');
  const css: string = readFileSync('src/peek/peek.css', 'utf8');
  expect(css).toMatch(/\.thumbs\s*\{[^}]*flex-wrap:\s*wrap/);
});
