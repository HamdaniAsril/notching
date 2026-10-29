// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { renderDate } from './date';
import { host, NOW } from './fixtures';

afterEach(() => { document.body.innerHTML = ''; });

test('the date shows the day, the big date and the month', () => {
  const root = host();
  renderDate(root, 'id').update(NOW);
  const labs = [...root.querySelectorAll('.lab')].map(l => l.textContent);
  expect(labs).toEqual(['Selasa', 'Oktober 2026']);
  expect(root.querySelector('.lab .rd')).not.toBeNull();
  expect(root.querySelector('svg.dm')!.getAttribute('height')).toBe('42');
});

test('English names', () => {
  const root = host();
  renderDate(root, 'en').update(NOW);
  expect(root.textContent).toContain('Tuesday');
  expect(root.textContent).toContain('October 2026');
});
