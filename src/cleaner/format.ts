import type { CleanerOverview, CleanerParts } from '../bridge';
import type { Lang } from '../kit/protocol';

// The bar's parts, in order. Their colours are in pages.css (`.cl-seg[data-key]`),
// from the accent and the greys.
export type PartKey = 'apps' | 'documents' | 'photos' | 'cleanable' | 'other' | 'free';

// `known` false: macOS kept it from us (no Full Disk Access); its bytes are in Lainnya.
export interface BarPart { key: PartKey; bytes: number; known: boolean }

// Decimal units, as Finder: "25,9 GB" (id) or "25.9 GB" (en); the same rule as
// size_text in cleaner_rules.rs. `spaced` false for the status beside the notch.
export function sizeText(bytes: number, lang: Lang, spaced = true): string {
  const [value, unit, decimals] =
    bytes >= 1e12 ? [bytes / 1e12, 'TB', 1]
      : bytes >= 1e9 ? [bytes / 1e9, 'GB', bytes >= 1e11 ? 0 : 1]
        : bytes >= 1e6 ? [bytes / 1e6, 'MB', 0]
          : bytes >= 1e3 ? [bytes / 1e3, 'KB', 0]
            : [bytes, 'B', 0];
  let number = value.toFixed(decimals as number);
  if (number.endsWith('.0')) number = number.slice(0, -2);
  if (lang === 'id') number = number.replace('.', ',');
  return `${number}${spaced ? ' ' : ''}${unit}`;
}

// The bar, in its order (§4): what Cleaner measured, the rest of what is used as
// Lainnya (never below 0), then the free space.
export function barParts(o: CleanerOverview, p: CleanerParts | null): BarPart[] {
  const used = Math.max(0, o.total - o.free);
  const measured: [PartKey, number | null][] = [
    ['apps', p?.apps ?? null],
    ['documents', p?.documents ?? null],
    ['photos', p?.photos ?? null],
    ['cleanable', p?.cleanable ?? null],
  ];
  const parts: BarPart[] = measured.map(([key, bytes]) => ({ key, bytes: bytes ?? 0, known: bytes !== null }));
  const known = parts.reduce((sum, x) => sum + x.bytes, 0);
  parts.push({ key: 'other', bytes: Math.max(0, used - known), known: true });
  parts.push({ key: 'free', bytes: o.free, known: true });
  return parts;
}

// Scan results, and the page's place, last this long (§4); the same as the core's.
export const SCAN_TTL_MS = 600_000;
