// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { DEFAULT_CONFIG } from '../notch/config';
import { fakeRaf, timers } from '../notch/test-helpers';
import { mountPreview } from './preview';

afterEach(() => { document.body.innerHTML = ''; });

function setup() {
  const box = document.createElement('div');
  document.body.append(box);
  const r = fakeRaf();
  const preview = mountPreview(box, DEFAULT_CONFIG, { raf: r.raf, caf: r.caf, setTimer: timers.setTimer }, 'Pratinjau');
  r.runAll(5);
  return { box, r, preview };
}

test('hovering the preview lens grows the droplet; a click opens the panel', () => {
  const { r, preview } = setup();
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: 480, clientY: 5 }));
  expect(preview.controller.phase).toBe('hover');
  r.runAll(5);
  document.dispatchEvent(new MouseEvent('click', { clientX: 480, clientY: 5 }));
  expect(preview.controller.phase).toBe('open');
  preview.destroy();
});

test('a new config reshapes the lens', () => {
  const { box, r, preview } = setup();
  const lens = () => box.querySelector('.notch-svg path')!.getAttribute('d');
  const before = lens();
  preview.setConfig({ ...DEFAULT_CONFIG, thickness: 14 });
  r.runAll(600);
  expect(lens()).not.toBe(before);
  expect(preview.controller.targets().H).toBe(14);
  preview.destroy();
});

test('destroy leaves nothing behind', () => {
  const { box, r, preview } = setup();
  preview.destroy();
  expect(box.children).toHaveLength(0);
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: 480, clientY: 5 }));
  expect(r.pending()).toBe(0);
});
