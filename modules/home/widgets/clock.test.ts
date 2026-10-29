// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { dotWidth } from '../../../src/kit/dots';
import { renderClock } from './clock';
import { host } from './fixtures';

afterEach(() => { document.body.innerHTML = ''; });

test('the clock stacks hours over minutes', () => {
  const root = host();
  renderClock(root).update(new Date(2026, 9, 27, 9, 5));
  const rows = [...root.querySelectorAll('svg.dm')];
  expect(rows).toHaveLength(2);
  expect(rows.map(r => r.getAttribute('width'))).toEqual([String(dotWidth('09', 6)), String(dotWidth('05', 6))]);
  expect(rows[0].querySelectorAll('circle').length).not.toBe(rows[1].querySelectorAll('circle').length);
});
