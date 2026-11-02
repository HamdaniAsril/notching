import { expect, test, vi } from 'vitest';
import { readPrefs, writePrefs } from './prefs';

interface P { start: string; end: string }
const defaults: P = { start: '08:00', end: '17:00' };
const check = (raw: unknown): P => {
  const o = (raw ?? {}) as Partial<P>;
  return { start: typeof o.start === 'string' ? o.start : defaults.start, end: typeof o.end === 'string' ? o.end : defaults.end };
};

test('a failed read gives the defaults', async () => {
  const call = vi.fn().mockRejectedValue(new Error('nope'));
  expect(await readPrefs({ call }, defaults, check)).toEqual(defaults);
  expect(call).toHaveBeenCalledWith('prefs', 'read');
});

test('a partial read is filled in by check', async () => {
  const call = vi.fn().mockResolvedValue({ start: '09:30' });
  expect(await readPrefs({ call }, defaults, check)).toEqual({ start: '09:30', end: '17:00' });
});

test('a check that throws gives the defaults', async () => {
  const call = vi.fn().mockResolvedValue({});
  const bad = () => { throw new Error('x'); };
  expect(await readPrefs({ call }, defaults, bad)).toEqual(defaults);
});

test('write sends the value under prefs.write', async () => {
  const call = vi.fn().mockResolvedValue(null);
  await writePrefs({ call }, { start: '10:00' });
  expect(call).toHaveBeenCalledWith('prefs', 'write', { value: { start: '10:00' } });
});
