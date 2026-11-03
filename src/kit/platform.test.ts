import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasMod, hasOtherMod, isMac, modKeyLabel, platform, schemeUrl } from './platform';

const stub = (userAgent: string, plat = '') => vi.stubGlobal('navigator', { userAgent, platform: plat });
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120.0';
const LIN = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15';

afterEach(() => vi.unstubAllGlobals());

describe('platform', () => {
  it('detects each OS', () => {
    stub(MAC);
    expect(platform()).toBe('macos');
    stub(WIN);
    expect(platform()).toBe('windows');
    stub(LIN);
    expect(platform()).toBe('linux');
  });
  it('labels the command key', () => {
    stub(MAC);
    expect([isMac(), modKeyLabel()]).toEqual([true, '⌘']);
    stub(WIN);
    expect([isMac(), modKeyLabel()]).toEqual([false, 'Ctrl']);
  });
  it('picks the command modifier', () => {
    stub(MAC);
    expect(hasMod({ metaKey: true, ctrlKey: false })).toBe(true);
    expect(hasMod({ metaKey: false, ctrlKey: true })).toBe(false);
    expect(hasOtherMod({ metaKey: false, ctrlKey: true })).toBe(true);
    stub(LIN);
    expect(hasMod({ metaKey: false, ctrlKey: true })).toBe(true);
    expect(hasMod({ metaKey: true, ctrlKey: false })).toBe(false);
    expect(hasOtherMod({ metaKey: true, ctrlKey: false })).toBe(true);
  });
  it('builds scheme urls', () => {
    stub(MAC);
    expect(schemeUrl('notchmod', 'a/b.html')).toBe('notchmod://localhost/a/b.html');
    stub(LIN);
    expect(schemeUrl('notchmod', 'a/b.html')).toBe('notchmod://localhost/a/b.html');
    stub(WIN);
    expect(schemeUrl('notchmod', 'a/b.html')).toBe('http://notchmod.localhost/a/b.html');
    expect(schemeUrl('notchshot', 'x.png')).toBe('http://notchshot.localhost/x.png');
  });
});
