import { dotBar, dotText } from '../../src/kit/dots';
import { formatBytes, formatPercent, formatRate } from '../../src/kit/format';
import type { Lang } from '../../src/kit/protocol';

// Same as Stats in src-tauri/src/system_stats.rs.
export interface Stats {
  cpu: number;
  memUsed: number;
  memTotal: number;
  rx: number;
  tx: number;
}

export interface StatStrings {
  cpu: string;
  memory: string;
  network: string;
}

export const DOT_PITCH = 5;
const BAR_DOTS = 18;

function el(cls: string, text = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}

// "9,8 / 16 GB": the unit once when both sides share it.
function usedOfTotal(used: string, total: string): string {
  const unit = total.slice(total.lastIndexOf(' '));
  return `${used.endsWith(unit) ? used.slice(0, -unit.length) : used} / ${total}`;
}

// Three columns split by dotted lines: CPU, memory, network. Numbers stay empty
// until the first reading.
export function renderCard(root: HTMLElement, strings: StatStrings): { update(s: Stats, lang: Lang): void } {
  const col = (key: string, label: string, ...rest: HTMLElement[]) => {
    const c = el('col');
    c.dataset.k = key;
    c.append(el('lab', label), ...rest);
    return c;
  };
  const cpuBig = el('big');
  const cpuBar = el('bar');
  const memBig = el('big');
  const memSub = el('lab sub');
  const rx = el('rate');
  const tx = el('rate');

  const row = el('row');
  row.append(
    col('cpu', strings.cpu, cpuBig, cpuBar),
    el('vdots'),
    col('mem', strings.memory, memBig, memSub),
    el('vdots'),
    col('net', strings.network, rx, tx),
  );
  root.replaceChildren(row);

  return {
    update(s, lang) {
      cpuBig.innerHTML = dotText(formatPercent(s.cpu), DOT_PITCH);
      cpuBar.innerHTML = dotBar(BAR_DOTS, Math.round((Math.min(100, Math.max(0, s.cpu)) / 100) * BAR_DOTS));
      const mem = s.memTotal > 0 ? (s.memUsed / s.memTotal) * 100 : 0;
      memBig.innerHTML = dotText(formatPercent(mem), DOT_PITCH);
      memSub.textContent = usedOfTotal(formatBytes(s.memUsed, lang), formatBytes(s.memTotal, lang));
      rx.textContent = `↓ ${formatRate(s.rx, lang)}`;
      tx.textContent = `↑ ${formatRate(s.tx, lang)}`;
    },
  };
}
