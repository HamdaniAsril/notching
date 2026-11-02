import { expect, test } from 'vitest';
import { breathAt, CYCLES, PHASE_S } from './breath';

test('a breath is four phases of four seconds, five times over', () => {
  expect(PHASE_S).toBe(4);
  expect(CYCLES).toBe(5);
});

test('it starts breathing in with the full four seconds left', () => {
  expect(breathAt(0)).toEqual({ phase: 'in', left: 4, cycle: 1, scale: 0 });
});

test('breathing in rises, left counts down by whole seconds', () => {
  expect(breathAt(1000)).toEqual({ phase: 'in', left: 3, cycle: 1, scale: 0.25 });
  expect(breathAt(3999)).toMatchObject({ phase: 'in', left: 1 });
  expect(breathAt(3999)!.scale).toBeCloseTo(0.99975, 5);
});

test('after breathing in it holds full, then breathes out, then holds empty', () => {
  expect(breathAt(4000)).toEqual({ phase: 'hold', left: 4, cycle: 1, scale: 1 });
  expect(breathAt(7999)).toMatchObject({ phase: 'hold', left: 1, scale: 1 });
  expect(breathAt(8000)).toEqual({ phase: 'out', left: 4, cycle: 1, scale: 1 });
  expect(breathAt(9000)).toEqual({ phase: 'out', left: 3, cycle: 1, scale: 0.75 });
  expect(breathAt(12000)).toEqual({ phase: 'hold', left: 4, cycle: 1, scale: 0 });
  expect(breathAt(15999)).toMatchObject({ phase: 'hold', left: 1, scale: 0 });
});

test('every 16 seconds is a new cycle', () => {
  expect(breathAt(16000)).toEqual({ phase: 'in', left: 4, cycle: 2, scale: 0 });
  expect(breathAt(79999)).toMatchObject({ cycle: 5, phase: 'hold', left: 1 });
});

test('after 80 seconds there is nothing left', () => {
  expect(breathAt(80000)).toBeNull();
  expect(breathAt(200000)).toBeNull();
});
