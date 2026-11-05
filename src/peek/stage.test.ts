// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { renderStage } from './stage';

test('the window peeked at sits in its place over the dimmed screen', () => {
  const root = document.createElement('div');
  renderStage(root, { frame: { x: 120, y: 80, w: 600, h: 400 }, minimized: false, picture: 'data:image/png;base64,AA', accent: '#c8f04a', lang: 'id' });
  expect(root.querySelector('.shade')).not.toBeNull();
  const ghost = root.querySelector<HTMLElement>('.ghost')!;
  expect([ghost.style.left, ghost.style.top, ghost.style.width, ghost.style.height]).toEqual(['120px', '80px', '600px', '400px']);
  expect(ghost.querySelector('img')!.src).toContain('AA');
  expect(ghost.querySelector('.tag')).toBeNull();
});

test('a minimized window is marked; nothing to peek at clears the layer', () => {
  const root = document.createElement('div');
  renderStage(root, { frame: { x: 0, y: 0, w: 10, h: 10 }, minimized: true, picture: null, accent: '#c8f04a', lang: 'en' });
  expect(root.querySelector('.ghost .tag')!.textContent).toBe('MINIMIZED');
  renderStage(root, null);
  expect(root.childElementCount).toBe(0);
});
