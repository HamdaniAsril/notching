import { formatBytes, formatPercent, formatRate } from '../../src/kit/format';
import type { Lang } from '../../src/kit/protocol';
import { lab, num, segs } from '../../src/kit/volt';

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

// The segments under the CPU number.
const SEGS = 12;
const BIG_PX = 28;

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

// Three black cards: CPU, memory, network. Numbers stay empty until the first reading.
export function renderCard(root: HTMLElement, strings: StatStrings): { update(s: Stats, lang: Lang): void } {
  const card = (key: string, label: string, ...rest: HTMLElement[]) => {
    const c = el('sys-card');
    c.dataset.k = key;
    c.append(lab(label), ...rest);
    return c;
  };
  const cpuBig = num('', BIG_PX);
  const cpuSegs = el('sys-segs');
  cpuSegs.append(segs(SEGS, 0));
  const memBig = num('', BIG_PX);
  const memSub = lab('', 'sys-sub');
  const rx = el('sys-rate');
  const tx = el('sys-rate');

  const row = el('sys-row');
  row.append(
    card('cpu', strings.cpu, cpuBig, cpuSegs),
    card('mem', strings.memory, memBig, memSub),
    card('net', strings.network, rx, tx),
  );
  root.replaceChildren(row);

  return {
    update(s, lang) {
      cpuBig.textContent = formatPercent(s.cpu);
      cpuSegs.replaceChildren(segs(SEGS, Math.round((Math.min(100, Math.max(0, s.cpu)) / 100) * SEGS)));
      const mem = s.memTotal > 0 ? (s.memUsed / s.memTotal) * 100 : 0;
      memBig.textContent = formatPercent(mem);
      memSub.textContent = usedOfTotal(formatBytes(s.memUsed, lang), formatBytes(s.memTotal, lang));
      rx.textContent = `↓ ${formatRate(s.rx, lang)}`;
      tx.textContent = `↑ ${formatRate(s.tx, lang)}`;
    },
  };
}
