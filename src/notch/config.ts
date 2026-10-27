// The four "Tampilan notch" sliders (spec 4.3). Plan 1 always uses the defaults.
export interface NotchConfig {
  bounce: number;
  speed: number;
  dropDepth: number;
  thickness: number;
}

export const DEFAULT_CONFIG: NotchConfig = { bounce: 100, speed: 200, dropDepth: 9, thickness: 4 };

export const CONFIG_RANGES: Record<keyof NotchConfig, readonly [number, number]> = {
  bounce: [0, 100],
  speed: [40, 200],
  dropDepth: [2, 28],
  thickness: [2, 14],
};

export function clampConfig(c: Partial<NotchConfig>): NotchConfig {
  const out = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(CONFIG_RANGES) as (keyof NotchConfig)[]) {
    const [min, max] = CONFIG_RANGES[key];
    const v = c[key] ?? DEFAULT_CONFIG[key];
    out[key] = Math.min(max, Math.max(min, v));
  }
  return out;
}
