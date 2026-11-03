// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { ART, host, NOTHING, NOW, TRACK } from './fixtures';
import { miniView, renderMini } from './mini';

afterEach(() => { document.body.innerHTML = ''; });

function mount(state = TRACK, strings = id, lang: 'id' | 'en' = 'id') {
  const root = host();
  const clock = { t: NOW };
  const act = { command: vi.fn() };
  const w = renderMini(root, strings, lang, act, () => clock.t);
  w.update(state);
  const text = (sel: string) => root.querySelector(sel)?.textContent;
  const btn = (cmd: string) => root.querySelector<HTMLButtonElement>(`[data-cmd="${cmd}"]`)!;
  return { root, w, act, clock, text, btn };
}

test('a disc with the controls in it, then the title, the artist and a short progress line', () => {
  const m = mount();
  expect(m.root.querySelector('.v-card.wd-mu-mini')).not.toBeNull();
  expect(m.root.querySelectorAll('.wd-mu-disc .wd-mu-groove')).toHaveLength(2);
  expect(m.root.querySelector('.wd-mu-disc .wd-mu-hub.tile')).not.toBeNull();
  expect([...m.root.querySelectorAll('.wd-mu-disc [data-cmd]')].map(b => (b as HTMLElement).dataset.cmd)).toEqual(['prev', 'toggle', 'next']);
  expect(m.text('.wd-mu-title')).toBe('Jalan Braga');
  expect(m.text('.wd-mu-artist')).toBe('Kolektif Senja');
  expect(m.root.querySelector<HTMLElement>('.wd-mu-fill')!.style.width).toBe('58.77%');
  // No times in the small one.
  expect(m.root.querySelector('.wd-mu-cur')).toBeNull();
});

test('English button names', () => {
  const m = mount(TRACK, en, 'en');
  expect(m.btn('toggle').getAttribute('aria-label')).toBe('Pause');
  expect(m.btn('prev').getAttribute('aria-label')).toBe('Previous');
});

test('the label of the disc is the artwork when there is one, the accent gradient when not', () => {
  expect(mount({ ...TRACK, art: ART }).root.querySelector('.wd-mu-hub.art img')!.getAttribute('src')).toBe(ART);
  expect(mount().root.querySelector('.wd-mu-hub.tile img')).toBeNull();
});

test('empty: the message, a note over the disc, dim buttons that do nothing', () => {
  const m = mount(NOTHING, en, 'en');
  expect(m.text('.wd-mu-title')).toBe('Nothing playing');
  expect(m.root.querySelector('.wd-mu-mini.empty')).not.toBeNull();
  for (const cmd of ['prev', 'toggle', 'next']) {
    expect(m.btn(cmd).disabled).toBe(true);
    m.btn(cmd).click();
  }
  expect(m.act.command).not.toHaveBeenCalled();
  expect(m.root.querySelector<HTMLElement>('.wd-mu-fill')!.style.width).toBe('0%');
});

test('the controls send the commands, and the toggle flips at once and is put right by a later read', () => {
  const m = mount();
  m.btn('next').click();
  m.btn('prev').click();
  m.btn('toggle').click();
  expect(m.act.command.mock.calls).toEqual([['next'], ['prev'], ['toggle']]);
  expect(m.btn('toggle').getAttribute('aria-label')).toBe('Putar');
  m.clock.t += 3000;
  m.w.update({ ...TRACK, at: m.clock.t });
  expect(m.btn('toggle').getAttribute('aria-label')).toBe('Jeda');
});

test('the progress line moves on a tick', () => {
  const m = mount();
  m.clock.t += 20_000;
  m.w.tick();
  expect(m.root.querySelector<HTMLElement>('.wd-mu-fill')!.style.width).toBe('67.54%');
});

test('the editor sample is the same view', () => {
  const v = miniView(id, 'id', { empty: false, playing: true, title: 'Jalan Braga', artist: 'Kolektif Senja', art: null, position: 134, duration: 228 });
  expect(v.querySelector('.wd-mu-title')!.textContent).toBe('Jalan Braga');
  expect(v.querySelector('.wd-mu-disc')).not.toBeNull();
  expect(v.querySelector<HTMLElement>('.wd-mu-fill')!.style.width).toBe('58.77%');
});

test('title and artist ellipsize on one line', async () => {
  // @ts-expect-error no @types/node in this project
  const { readFileSync } = await import('node:fs');
  const css: string = readFileSync('modules/musik/style.css', 'utf8');
  // The shared rule keeps both on one line with an ellipsis; this widget does not override it.
  expect(/\.wd-mu-title,\s*\.wd-mu-artist\s*\{[^}]*overflow: hidden[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/.test(css)).toBe(true);
  expect(new RegExp('\\.wd-mu-mini \\.wd-mu-(title|artist)\\s*\\{[^}]*white-space').test(css)).toBe(false);
});
