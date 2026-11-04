import { sizeText } from '../../src/cleaner/format';
import { formatBytes, formatRate } from '../../src/kit/format';
import type { Lang } from '../../src/kit/protocol';
import { el } from '../../src/kit/widget';
import { areaPath, linePath, segments, WINDOW_S, type Pt } from './chart';
import type id from './locales/id.json';

// Same as Stats in src-tauri/src/system_stats.rs.
export interface Stats {
  cpu: number;
  memUsed: number;
  memTotal: number;
  rx: number;
  tx: number;
  pressure: number | null;
  history: { ago: number; cpu: number; pressure: number | null }[];
  apps: { name: string; cpu: number; mem: number }[];
  temps: { chip: number | null; other: number | null; otherKind: 'battery' | 'ssd' | null; state: string };
  disk: { total: number; free: number; parts: Parts | null } | null;
}

interface Parts {
  apps: number | null;
  documents: number | null;
  photos: number | null;
  cleanable: number | null;
}

export type StatStrings = typeof id;

// The chart is the column less its 20 px padding each side (style.css).
const CHART_W = 170;
const CHART_H = 56;
const APPS = 4;
const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// A label on the left, a quieter note on the right.
function head(label: string, meta = ''): { row: HTMLDivElement; meta: HTMLSpanElement } {
  const row = el('div', 'ss-head');
  const m = el('span', 'ss-meta', meta);
  row.append(el('span', 'ss-lab', label), m);
  return { row, meta: m };
}

// A big Barlow number with its unit beside it, small.
function value(): { box: HTMLDivElement; set(num: string, unit: string): void } {
  const box = el('div', 'ss-val');
  const n = el('span', 'ss-num');
  const u = el('span', 'ss-unit');
  box.append(n, u);
  return { box, set: (num, unit) => { n.textContent = num; u.textContent = unit; } };
}

// "2,4 MB/s" → ["2,4", "MB/s"].
function split(text: string): [string, string] {
  const at = text.lastIndexOf(' ');
  return [text.slice(0, at), text.slice(at + 1)];
}

function chart(lit: boolean): { box: SVGSVGElement; draw(points: Pt[]): void } {
  const box = svg('svg', { class: lit ? 'ss-chart acc' : 'ss-chart', viewBox: `0 0 ${CHART_W} ${CHART_H}`, width: `${CHART_W}`, height: `${CHART_H}` });
  for (const y of [0.5, CHART_H / 2, CHART_H - 0.5]) {
    box.append(svg('line', { class: 'ss-grid', x1: '0', x2: `${CHART_W}`, y1: `${y}`, y2: `${y}` }));
  }
  const area = svg('path', { class: 'ss-area' });
  const line = svg('path', { class: 'ss-line' });
  const dot = svg('circle', { class: 'ss-dot', r: '3' });
  box.append(area, line, dot);
  return {
    box,
    draw(points) {
      const segs = segments(points);
      area.setAttribute('d', segs.map(s => areaPath(s, CHART_W, CHART_H)).join(''));
      line.setAttribute('d', segs.map(s => linePath(s, CHART_W, CHART_H)).join(''));
      const now = points[points.length - 1];
      dot.style.display = now && now.v !== null && now.ago < WINDOW_S ? '' : 'none';
      if (now && now.v !== null) {
        const [, x, y] = linePath([now], CHART_W, CHART_H).match(/^M(\S+) (\S+)$/)!;
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
      }
    },
  };
}

function graph(key: string, label: string, strings: StatStrings, lit: boolean) {
  const col = el('div', 'ss-col ss-graph');
  col.dataset.k = key;
  const v = value();
  const c = chart(lit);
  const top = el('div', 'ss-top');
  top.append(head(label, strings.minute).row, v.box);
  col.append(top, c.box);
  return { col, v, c };
}

const rule = (cls: string) => el('div', cls);

// Two readings side by side under one head, split by a thin rule.
function pair(key: string, label: string, subs: [string, string]) {
  const col = el('div', 'ss-col ss-pair');
  col.dataset.k = key;
  const h = head(label);
  const cells = el('div', 'ss-cells');
  const out = subs.map(sub => {
    const cell = el('div', 'ss-cell');
    const s = el('span', 'ss-sub', sub);
    const v = value();
    cell.append(s, v.box);
    return { cell, sub: s, v };
  });
  cells.append(out[0].cell, rule('ss-vrule'), out[1].cell);
  col.append(h.row, cells);
  return { col, meta: h.meta, cells: out };
}

function appsList(strings: StatStrings) {
  const col = el('div', 'ss-col ss-apps');
  col.dataset.k = 'apps';
  const h = el('div', 'ss-head');
  h.append(el('span', 'ss-lab ss-grow', strings.apps), el('span', 'ss-meta ss-c', strings.appCpu), el('span', 'ss-meta ss-m', strings.appMem));
  const list = el('div', 'ss-list');
  const rows = Array.from({ length: APPS }, (_, i) => {
    const row = el('div', i === 0 ? 'ss-app top empty' : 'ss-app empty');
    const name = el('span', 'ss-name');
    const cpu = el('span', 'ss-cpu');
    const mem = el('span', 'ss-mem');
    row.append(el('span', 'ss-mark'), name, cpu, mem);
    list.append(row);
    return { row, name, cpu, mem };
  });
  col.append(h, list);
  return { col, rows };
}

type Seg = { key: string; bytes: number; known: boolean };

// Cleaner's parts in its order; what it kept from us and what it could clean go
// into Other, as in Cleaner's own bar.
function diskSegs(disk: NonNullable<Stats['disk']>): Seg[] {
  const used = Math.max(0, disk.total - disk.free);
  const p = disk.parts;
  if (!p) return [{ key: 'used', bytes: used, known: true }, { key: 'free', bytes: disk.free, known: true }];
  const measured: Seg[] = (['apps', 'documents', 'photos'] as const).map(key => ({ key, bytes: p[key] ?? 0, known: p[key] !== null }));
  const known = measured.reduce((sum, s) => sum + s.bytes, 0);
  return [...measured, { key: 'other', bytes: Math.max(0, used - known), known: true }, { key: 'free', bytes: disk.free, known: true }];
}

function storage(strings: StatStrings) {
  const row = el('div', 'ss-row ss-disk');
  row.dataset.k = 'disk';
  const left = el('div', 'ss-used');
  const v = value();
  left.append(el('span', 'ss-lab', strings.storage), v.box);
  const right = el('div', 'ss-detail');
  const bar = el('div', 'ss-bar');
  const legend = el('div', 'ss-legend');
  right.append(bar, legend);
  row.append(left, right);
  return { row, v, bar, legend };
}

// System stat's card (design 4 Nov): charts and top apps, heat and network, then
// storage. Built once; each reading only changes text and paths.
export function renderCard(root: HTMLElement, strings: StatStrings): { update(s: Stats, lang: Lang): void } {
  const cpu = graph('cpu', strings.cpu, strings, true);
  const pressure = graph('pressure', strings.pressure, strings, false);
  const apps = appsList(strings);
  const temps = pair('temps', strings.temps, [strings.chip, strings.battery]);
  const net = pair('net', strings.network, [strings.up, strings.down]);
  const disk = storage(strings);

  const top = el('div', 'ss-row ss-row-top');
  top.append(cpu.col, rule('ss-vrule tall'), pressure.col, rule('ss-vrule tall'), apps.col);
  const mid = el('div', 'ss-row ss-row-mid');
  mid.append(temps.col, rule('ss-vrule mid'), net.col);
  const card = el('div', 'ss-card');
  card.append(top, rule('ss-hrule'), mid, rule('ss-hrule'), disk.row);
  root.replaceChildren(card);

  return {
    update(s, lang) {
      cpu.v.set(String(Math.round(s.cpu)), '%');
      cpu.c.draw(s.history.map(p => ({ ago: p.ago, v: p.cpu })));
      pressure.v.set(s.pressure === null ? '—' : String(Math.round(s.pressure)), s.pressure === null ? '' : '%');
      pressure.c.draw(s.history.map(p => ({ ago: p.ago, v: p.pressure })));

      apps.rows.forEach((r, i) => {
        const a = s.apps[i];
        r.row.classList.toggle('empty', !a);
        r.name.textContent = a?.name ?? '';
        r.cpu.textContent = a ? `${Math.round(a.cpu)}%` : '';
        r.mem.textContent = a ? formatBytes(a.mem, lang) : '';
      });

      const t = s.temps;
      const deg = (c: number | null): [string, string] => (c === null ? ['—', ''] : [String(Math.round(c)), '°C']);
      temps.cells[0].v.set(...deg(t.chip));
      temps.cells[1].v.set(...deg(t.other));
      temps.cells[1].sub.textContent = t.otherKind === 'ssd' ? strings.ssd : strings.battery;
      temps.meta.textContent = strings.state[t.state as keyof StatStrings['state']] ?? strings.state.nominal;

      net.cells[0].v.set(...split(formatRate(s.tx, lang)));
      net.cells[1].v.set(...split(formatRate(s.rx, lang)));

      if (s.disk) drawDisk(disk, s.disk, strings, lang);
    },
  };
}

function drawDisk(d: ReturnType<typeof storage>, disk: NonNullable<Stats['disk']>, strings: StatStrings, lang: Lang): void {
  const used = Math.max(0, disk.total - disk.free);
  const [usedNum, usedUnit] = split(sizeText(used, lang));
  const total = sizeText(disk.total, lang);
  const of = strings.of.replace('{total}', total);
  d.v.set(usedNum, usedUnit === split(total)[1] ? of : `${usedUnit} ${of}`);

  const segs = diskSegs(disk);
  d.bar.replaceChildren(...segs.map(s => {
    const seg = el('span', 'ss-seg');
    seg.dataset.key = s.key;
    seg.style.flexGrow = String(Math.round(s.bytes / 1e9));
    return seg;
  }));
  const names = strings.parts as Record<string, string>;
  const legend = segs.filter(s => s.key !== 'free' || !disk.parts).map(s => {
    const item = el('span', 'ss-leg');
    item.dataset.key = s.key;
    item.append(el('span', 'ss-swatch'), `${names[s.key]} ${s.known ? sizeText(s.bytes, lang) : '?'}`);
    return item;
  });
  if (!disk.parts) legend.push(el('span', 'ss-hint', strings.openCleaner));
  d.legend.replaceChildren(...legend);
}
