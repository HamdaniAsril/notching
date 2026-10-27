import type { Lang } from './protocol';

export function formatPercent(v: number): string {
  return `${Math.min(100, Math.max(0, Math.round(v)))}%`;
}

// One decimal below 10, whole numbers above; the unit steps up at 999.5 so it
// never reads "1.000 KB/s".
function scaled(value: number, base: number, units: readonly string[], lang: Lang): string {
  let i = 0;
  let v = Math.max(0, value);
  while (v >= 999.5 && i < units.length - 1) {
    v /= base;
    i++;
  }
  const digits = v < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(v)} ${units[i]}`;
}

export function formatRate(bytesPerSec: number, lang: Lang): string {
  return scaled(bytesPerSec, 1000, ['B/s', 'KB/s', 'MB/s', 'GB/s'], lang);
}

export function formatBytes(bytes: number, lang: Lang): string {
  return scaled(bytes, 1024, ['B', 'KB', 'MB', 'GB', 'TB'], lang);
}
