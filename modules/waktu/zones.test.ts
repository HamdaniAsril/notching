import { expect, test } from 'vitest';
import { checkZones, CITIES, clockText, DEFAULT_ZONES, diffLabel, zoneTime } from './zones';

const SAT = Date.UTC(2026, 9, 31, 2, 41);

test('zoneTime reads the clock of the zone, whatever the machine zone is', () => {
  expect(zoneTime('Asia/Tokyo', new Date(SAT))).toEqual({ h: 11, m: 41, offsetMin: 540 });
  expect(zoneTime('Europe/London', new Date(SAT))).toEqual({ h: 2, m: 41, offsetMin: 0 });
  expect(zoneTime('Asia/Kolkata', new Date(SAT))).toEqual({ h: 8, m: 11, offsetMin: 330 });
  expect(zoneTime('America/New_York', new Date(SAT))).toEqual({ h: 22, m: 41, offsetMin: -240 });
});

test('midnight is hour 0, not 24', () => {
  expect(zoneTime('Asia/Jakarta', new Date(Date.UTC(2026, 9, 30, 17, 5)))).toEqual({ h: 0, m: 5, offsetMin: 420 });
});

test('no zone means the machine zone', () => {
  const now = new Date(SAT);
  const z = zoneTime(undefined, now);
  expect(z.h).toBe(now.getHours());
  expect(z.m).toBe(now.getMinutes());
  expect(z.offsetMin).toBe(0 - now.getTimezoneOffset());
});

test('diffLabel counts hours from the first offset to the second, with a Unicode minus', () => {
  expect(diffLabel(420, 0, 'id')).toBe('−7');
  expect(diffLabel(420, 540, 'id')).toBe('+2');
  expect(diffLabel(420, 420, 'id')).toBe('0');
});

test('half hours take a comma in Indonesian and a dot in English', () => {
  expect(diffLabel(420, 330, 'id')).toBe('−1,5');
  expect(diffLabel(420, 330, 'en')).toBe('−1.5');
  expect(diffLabel(0, 330, 'id')).toBe('+5,5');
  expect(diffLabel(0, 330, 'en')).toBe('+5.5');
  expect(diffLabel(420, 345, 'en')).toBe('−1.25');
});

test('checkZones keeps a known code and falls back per slot', () => {
  expect(checkZones({ cities: ['XXX', 'NYC'] }).cities).toEqual(['TYO', 'NYC']);
  expect(checkZones({ cities: ['SYD', 'nope'] }).cities).toEqual(['SYD', 'LON']);
  expect(checkZones({ cities: ['SYD', 'NYC'] }).cities).toEqual(['SYD', 'NYC']);
  for (const bad of [null, undefined, 3, 'x', {}, { cities: 'TYO' }, { cities: [1, 2] }, { cities: ['SYD'] }]) {
    expect(checkZones(bad).cities.length).toBe(2);
  }
  expect(checkZones(null)).toEqual(DEFAULT_ZONES);
  expect(DEFAULT_ZONES.cities).toEqual(['TYO', 'LON']);
});

test('the cities are unique, named in both languages and every zone is a real one', () => {
  const codes = CITIES.map(c => c.code);
  expect(new Set(codes).size).toBe(codes.length);
  expect(CITIES.length).toBeGreaterThanOrEqual(38);
  for (const c of CITIES) {
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: c.tz })).not.toThrow();
    expect(c.id).not.toBe('');
    expect(c.en).not.toBe('');
  }
  for (const code of ['JKT', 'MKS', 'JYP', 'SIN', 'KUL', 'BKK', 'HKG', 'TYO', 'SEL', 'SYD', 'DXB', 'RUH', 'MKK', 'IST', 'CAI', 'LON', 'PAR', 'BER', 'AMS', 'NYC', 'CHI', 'LAX', 'SFO', 'TOR', 'SAO', 'DEL', 'KHI', 'MNL', 'TPE', 'SHA']) {
    expect(codes).toContain(code);
  }
  expect(CITIES.find(c => c.code === 'MKK')).toMatchObject({ tz: 'Asia/Riyadh', id: 'Mekkah' });
});

test('the clock text: a dot in Indonesian, a colon otherwise, two digits each', () => {
  expect(clockText(9, 41, 'id')).toBe('09.41');
  expect(clockText(0, 5, 'id')).toBe('00.05');
  expect(clockText(9, 41, 'en')).toBe('09:41');
  expect(clockText(23, 59, 'en')).toBe('23:59');
});
