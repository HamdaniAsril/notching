// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { ART, host, NOTHING, NOW, TRACK } from './fixtures';
import { renderStrip } from './strip';

afterEach(() => { document.body.innerHTML = ''; });

function mount(state = TRACK, strings = id, lang: 'id' | 'en' = 'id') {
  const root = host();
  const clock = { t: NOW };
  const act = { command: vi.fn() };
  const w = renderStrip(root, strings, lang, act, () => clock.t);
  w.update(state);
  const text = (sel: string) => root.querySelector(sel)?.textContent;
  const btn = (cmd: string) => root.querySelector<HTMLButtonElement>(`[data-cmd="${cmd}"]`)!;
  return { root, w, act, clock, text, btn };
}

test('the cover, title and artist, then position, line and duration, then the controls', () => {
  const m = mount();
  expect(m.root.querySelector('.v-card.wd-mu-strip')).not.toBeNull();
  expect(m.text('.wd-mu-title')).toBe('Jalan Braga');
  expect(m.text('.wd-mu-artist')).toBe('Kolektif Senja');
  expect([...m.root.querySelector('.wd-mu-prog')!.children].map(c => c.className)).toEqual(['wd-mu-cur', 'wd-mu-line', 'wd-mu-dur']);
  expect(m.text('.wd-mu-cur')).toBe('2.14');
  expect(m.text('.wd-mu-dur')).toBe('3.48');
  expect(m.root.querySelector<HTMLElement>('.wd-mu-fill')!.style.width).toBe('58.77%');
  expect([...m.root.querySelectorAll('.wd-mu-ctrl [data-cmd]')].map(b => (b as HTMLElement).dataset.cmd)).toEqual(['prev', 'toggle', 'next']);
  expect(m.btn('toggle').classList.contains('acc')).toBe(true);
});

test('English times and button names', () => {
  const m = mount(TRACK, en, 'en');
  expect(m.text('.wd-mu-cur')).toBe('2:14');
  expect(m.btn('prev').getAttribute('aria-label')).toBe('Previous');
  expect(m.btn('next').getAttribute('aria-label')).toBe('Next');
});

test('the cover is the artwork, or the accent tile with the first word', () => {
  expect(mount().root.querySelector('.wd-mu-cover.tile')!.textContent).toBe('Jalan');
  expect(mount({ ...TRACK, art: ART }).root.querySelector('.wd-mu-cover.art img')!.getAttribute('src')).toBe(ART);
});

test('empty: the message, a dim cover and dim buttons that do nothing', () => {
  const m = mount(NOTHING);
  expect(m.text('.wd-mu-title')).toBe('Tidak ada yang diputar');
  expect(m.root.querySelector('.wd-mu-cover.none .ic svg')).not.toBeNull();
  for (const cmd of ['prev', 'toggle', 'next']) {
    expect(m.btn(cmd).disabled).toBe(true);
    m.btn(cmd).click();
  }
  expect(m.act.command).not.toHaveBeenCalled();
});

test('the controls send the commands and the toggle flips at once', () => {
  const m = mount();
  m.btn('prev').click();
  m.btn('toggle').click();
  m.btn('next').click();
  expect(m.act.command.mock.calls).toEqual([['prev'], ['toggle'], ['next']]);
  expect(m.btn('toggle').getAttribute('aria-label')).toBe('Putar');
  m.clock.t += 5000;
  m.w.update({ ...TRACK, at: m.clock.t });
  expect(m.btn('toggle').getAttribute('aria-label')).toBe('Jeda');
});

test('title and artist ellipsize on one line', async () => {
  // @ts-expect-error no @types/node in this project
  const { readFileSync } = await import('node:fs');
  const css: string = readFileSync('modules/musik/style.css', 'utf8');
  // The shared rule keeps both on one line with an ellipsis; this widget does not override it.
  expect(/\.wd-mu-title,\s*\.wd-mu-artist\s*\{[^}]*overflow: hidden[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/.test(css)).toBe(true);
  expect(new RegExp('\\.wd-mu-strip \\.wd-mu-(title|artist)\\s*\\{[^}]*white-space').test(css)).toBe(false);
});
