import { big, el } from './shared';

const pad = (n: number) => String(n).padStart(2, '0');

// Jam: hours over minutes, so the clock keeps the shared number size in one column.
export function renderClock(root: HTMLElement): { update(now: Date): void } {
  return {
    update(now) {
      const w = el('div', 'wd wd-clock');
      w.append(big(root, pad(now.getHours())), big(root, pad(now.getMinutes())));
      root.replaceChildren(w);
    },
  };
}
