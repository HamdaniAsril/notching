// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { ART, host, NOTHING, NOW, PAUSED, TRACK } from './fixtures';
import { playerView, renderPlayer } from './player';

afterEach(() => { document.body.innerHTML = ''; });

function mount(state = TRACK, strings = id, lang: 'id' | 'en' = 'id') {
  const root = host();
  const clock = { t: NOW };
  const act = { command: vi.fn() };
  const w = renderPlayer(root, strings, lang, act, () => clock.t);
  w.update(state);
  const text = (sel: string) => root.querySelector(sel)?.textContent;
  const btn = (cmd: string) => root.querySelector<HTMLButtonElement>(`[data-cmd="${cmd}"]`)!;
  return { root, w, act, clock, text, btn };
}

test('draws nothing until the first reading', () => {
  const root = host();
  renderPlayer(root, id, 'id', { command: vi.fn() }, () => NOW);
  expect(root.children).toHaveLength(0);
});

test('Indonesian: the label in accent, the title, the artist and the times', () => {
  const m = mount();
  expect(m.root.querySelector('.v-card.wd-mu-player')).not.toBeNull();
  expect(m.text('.wd-mu-label')).toBe('Sedang diputar');
  expect(m.root.querySelector('.wd-mu-label')!.classList.contains('v-acc')).toBe(true);
  expect(m.text('.wd-mu-title')).toBe('Jalan Braga');
  expect(m.text('.wd-mu-artist')).toBe('Kolektif Senja');
  expect(m.text('.wd-mu-cur')).toBe('2.14');
  expect(m.text('.wd-mu-dur')).toBe('3.48');
});

test('English: times with a colon and the English label', () => {
  const m = mount(TRACK, en, 'en');
  expect(m.text('.wd-mu-label')).toBe('Now playing');
  expect(m.text('.wd-mu-cur')).toBe('2:14');
  expect(m.text('.wd-mu-dur')).toBe('3:48');
  expect(m.btn('toggle').getAttribute('aria-label')).toBe('Pause');
});

test('the progress line is the position over the duration, and it moves with the clock', () => {
  const m = mount();
  const fill = () => m.root.querySelector<HTMLElement>('.wd-mu-fill')!.style.width;
  expect(fill()).toBe('58.77%');
  m.clock.t += 10_000;
  m.w.tick();
  expect(m.text('.wd-mu-cur')).toBe('2.24');
  expect(fill()).toBe('63.16%');
  m.clock.t += 60_000_000;
  m.w.tick();
  expect(fill()).toBe('100%');
  expect(m.text('.wd-mu-cur')).toBe('3.48');
});

test('a tick does not rebuild the card, so a click in progress is not lost', () => {
  const m = mount();
  const before = m.btn('toggle');
  m.clock.t += 3000;
  m.w.tick();
  expect(m.btn('toggle')).toBe(before);
});

test('with no artwork: the accent tile with the first word of the title', () => {
  const m = mount();
  const tile = m.root.querySelector('.wd-mu-cover.tile')!;
  expect(tile.textContent).toBe('Jalan');
  expect(m.root.querySelector('.wd-mu-cover img')).toBeNull();
});

test('with artwork: the picture fills the cover', () => {
  const m = mount({ ...TRACK, art: ART });
  const img = m.root.querySelector<HTMLImageElement>('.wd-mu-cover.art img')!;
  expect(img.getAttribute('src')).toBe(ART);
  expect(m.root.querySelector('.wd-mu-cover.tile')).toBeNull();
});

test('nothing playing: a dim note, the message, no label, dim buttons that cannot be clicked', () => {
  for (const [state, s] of [[NOTHING, id], [{ ...TRACK, on: false }, en]] as const) {
    const m = mount(state, s, s === en ? 'en' : 'id');
    expect(m.text('.wd-mu-title')).toBe(s === en ? 'Nothing playing' : 'Tidak ada yang diputar');
    expect(m.root.querySelector('.wd-mu-label')).toBeNull();
    expect(m.root.querySelector('.wd-mu-cover.none .ic svg')).not.toBeNull();
    expect(m.root.querySelector('.wd-mu-player.empty')).not.toBeNull();
    for (const cmd of ['prev', 'toggle', 'next']) {
      expect(m.btn(cmd).disabled).toBe(true);
      m.btn(cmd).click();
    }
    expect(m.act.command).not.toHaveBeenCalled();
    expect(m.root.querySelector<HTMLElement>('.wd-mu-fill')!.style.width).toBe('0%');
  }
});

test('the buttons send prev, toggle and next', () => {
  const m = mount();
  m.btn('prev').click();
  m.btn('toggle').click();
  m.btn('next').click();
  expect(m.act.command.mock.calls).toEqual([['prev'], ['toggle'], ['next']]);
});

test('toggle flips the button at once; a read after the grace puts it right', () => {
  const m = mount();
  const icon = () => m.btn('toggle').getAttribute('aria-label');
  expect(icon()).toBe('Jeda');
  m.btn('toggle').click();
  expect(icon()).toBe('Putar');
  expect(m.text('.wd-mu-cur')).toBe('2.14');
  // The helper has not caught up yet: the stale reading does not flip it back.
  m.clock.t += 400;
  m.w.update(TRACK);
  expect(icon()).toBe('Putar');
  // The source still plays after the grace: the next read wins.
  m.clock.t += 2000;
  m.w.update({ ...TRACK, at: m.clock.t, elapsed: 137 });
  expect(icon()).toBe('Jeda');
});

test('a paused track shows the play button and a frozen position', () => {
  const m = mount(PAUSED);
  expect(m.btn('toggle').getAttribute('aria-label')).toBe('Putar');
  m.clock.t += 30_000;
  m.w.tick();
  expect(m.text('.wd-mu-cur')).toBe('2.14');
});

test('a new track replaces the card; an unknown duration shows a dash', () => {
  const m = mount();
  m.w.update({ ...TRACK, title: 'Lain Kali', artist: 'Dua', duration: null, elapsed: 5, at: NOW });
  expect(m.text('.wd-mu-title')).toBe('Lain Kali');
  expect(m.root.querySelector('.wd-mu-cover.tile')!.textContent).toBe('Lain');
  expect(m.text('.wd-mu-dur')).toBe('–');
});

test('the editor sample is the same card', () => {
  const view = playerView(id, 'id', { empty: false, playing: true, title: 'Jalan Braga', artist: 'Kolektif Senja', art: null, position: 134, duration: 228 });
  expect(view.querySelector('.wd-mu-title')!.textContent).toBe('Jalan Braga');
  expect(view.querySelector('.wd-mu-cover.tile')!.textContent).toBe('Jalan');
  expect(view.querySelector('.wd-mu-cur')!.textContent).toBe('2.14');
  expect(view.querySelector('.wd-mu-dur')!.textContent).toBe('3.48');
});

test('a long title takes at most two lines and the artist one, with an ellipsis', async () => {
  // @ts-expect-error no @types/node in this project
  const { readFileSync } = await import('node:fs');
  const css: string = readFileSync('modules/musik/style.css', 'utf8');
  expect(/\.wd-mu-player \.wd-mu-title\s*\{[^}]*-webkit-line-clamp: 2/.test(css)).toBe(true);
  expect(/\.wd-mu-artist\s*\{[^}]*text-overflow: ellipsis/.test(css)).toBe(true);
});
