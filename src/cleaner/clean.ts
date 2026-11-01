import type { Bridge, CleanerCategory, CleanerItem } from '../bridge';
import { type CleanerStrings, fill } from '../i18n';
import type { Lang } from '../kit/protocol';
import { button, el } from './dom';
import { sizeText } from './format';

export const CATEGORY_ORDER: CleanerCategory[] = [
  'appCache', 'browserCache', 'devCache', 'log', 'orphan', 'trash', 'build', 'installer', 'backup',
];

// macOS keeps these from Notching without Full Disk Access (§4).
const NEEDS_FDA: CleanerCategory[] = ['trash', 'installer', 'backup'];

export interface Group { category: CleanerCategory; items: CleanerItem[]; bytes: number }
export interface Plan { permanent: number; trash: number; count: number }

export function groupItems(items: CleanerItem[]): Group[] {
  return CATEGORY_ORDER
    .map(category => {
      const inside = items.filter(i => i.category === category);
      return { category, items: inside, bytes: inside.reduce((s, i) => s + i.bytes, 0) };
    })
    .filter(g => g.items.length > 0);
}

export function selection(items: CleanerItem[], ticked: Set<number>): Plan {
  const chosen = items.filter(i => ticked.has(i.id));
  const sum = (m: CleanerItem['method']) => chosen.filter(i => i.method === m).reduce((s, i) => s + i.bytes, 0);
  return { permanent: sum('permanent'), trash: sum('trash'), count: chosen.length };
}

export interface CleanDeps {
  bridge: Pick<Bridge, 'cleanerDeepScan' | 'cleanerExclude'>;
  lang: Lang;
  strings: CleanerStrings;
  fda: boolean;
  back(): void;
  clean(scanId: number, ids: number[], plan: Plan): void;
}

export interface CleanList {
  refresh(): void; // scans again
  loaded(): boolean; // the scan landed (a cancelled one never does)
  scan(): number; // the scan the list shows
  label(id: number): string;
  inUse(ids: number[]): void; // what runs now (the panel showed again); only ever adds marks
  destroy(): void;
}

// Deep clean's list (design 1 Nov §5.1, cleaner-tempat.html A, moment 2): a
// category per row with its tick and size; a click opens its items, each with
// its own tick and, on hover, "Jangan pernah bersihkan". What is in use cannot
// be ticked. The footer holds the total and Bersihkan.
export function mountClean(box: HTMLElement, deps: CleanDeps): CleanList {
  const doc = box.ownerDocument;
  const s = deps.strings;
  const size = (b: number) => sizeText(b, deps.lang);
  let scanId = 0;
  let items: CleanerItem[] = [];
  let ticked = new Set<number>();
  const open = new Set<CleanerCategory>();
  let seq = 0;
  let loaded = false;

  const head = el(doc, 'div', 'cl-lhead');
  const back = button(doc, 'lab cl-back', `‹ ${s.cleanTitle}`);
  back.addEventListener('click', () => deps.back());
  const sel = el(doc, 'span', 'lab cl-sel');
  head.append(back, sel);
  const body = el(doc, 'div', 'cl-lbody');
  const foot = el(doc, 'div', 'cl-lfoot');
  const go = button(doc, 'cl-go');
  go.addEventListener('click', () => {
    const ids = items.filter(i => ticked.has(i.id)).map(i => i.id);
    if (ids.length > 0) deps.clean(scanId, ids, selection(items, ticked));
  });
  foot.append(go);
  const wrap = el(doc, 'div', 'cl-list');
  wrap.append(head, body, foot);
  box.replaceChildren(wrap);

  function tickBox(checked: boolean, disabled: boolean, onChange: () => void): HTMLInputElement {
    const t = el(doc, 'input', 'cl-tick');
    t.type = 'checkbox';
    t.checked = checked;
    t.disabled = disabled;
    t.addEventListener('click', e => e.stopPropagation());
    t.addEventListener('change', onChange);
    return t;
  }

  function totals(): void {
    const plan = selection(items, ticked);
    const bytes = plan.permanent + plan.trash;
    sel.textContent = fill(s.selected, { size: size(bytes) });
    go.textContent = fill(s.clean, { size: size(bytes) });
    go.disabled = plan.count === 0;
  }

  function draw(): void {
    const groups = groupItems(items);
    const rows: HTMLElement[] = groups.map(g => {
      const cat = el(doc, 'div', 'cl-cat');
      cat.dataset.category = g.category;
      const choosable = g.items.filter(i => !i.inUse);
      const all = choosable.length > 0 && choosable.every(i => ticked.has(i.id));
      const row = el(doc, 'div', 'cl-row');
      row.append(
        tickBox(all, choosable.length === 0, () => {
          choosable.forEach(i => (all ? ticked.delete(i.id) : ticked.add(i.id)));
          draw();
        }),
        el(doc, 'span', 'cl-name', s.categories[g.category]),
        el(doc, 'span', 'cl-size', size(g.bytes)),
      );
      row.addEventListener('click', () => {
        if (open.has(g.category)) open.delete(g.category);
        else open.add(g.category);
        draw();
      });
      cat.classList.toggle('open', open.has(g.category));
      cat.append(row, ...g.items.map(itemRow));
      return cat;
    });
    if (!deps.fda) {
      for (const category of NEEDS_FDA) {
        if (groups.some(g => g.category === category)) continue;
        const cat = el(doc, 'div', 'cl-cat muted');
        cat.dataset.category = category;
        const row = el(doc, 'div', 'cl-row');
        row.append(el(doc, 'span', 'cl-name', s.categories[category]), el(doc, 'span', 'cl-size', s.needsFda));
        cat.append(row);
        rows.push(cat);
      }
    }
    body.replaceChildren(...rows);
    totals();
  }

  function itemRow(i: CleanerItem): HTMLElement {
    const row = el(doc, 'div', 'cl-item');
    row.dataset.id = String(i.id);
    const name = el(doc, 'span', 'cl-name', i.label);
    if (i.detail) name.append(el(doc, 'span', 'cl-detail', ` · ${i.detail}`));
    if (i.inUse) name.append(el(doc, 'span', 'cl-tag', s.inUse));
    const never = button(doc, 'lab cl-never', s.never);
    never.addEventListener('click', e => {
      e.stopPropagation();
      deps.bridge.cleanerExclude(i.id).then(() => {
        items = items.filter(x => x.id !== i.id);
        ticked.delete(i.id);
        draw();
      }, () => {});
    });
    row.append(
      tickBox(ticked.has(i.id), i.inUse, () => {
        if (ticked.has(i.id)) ticked.delete(i.id);
        else ticked.add(i.id);
        draw();
      }),
      name,
      never,
      el(doc, 'span', 'cl-size', size(i.bytes)),
    );
    return row;
  }

  return {
    refresh() {
      const mine = ++seq;
      loaded = false;
      items = [];
      ticked = new Set();
      body.replaceChildren(el(doc, 'span', 'lab cl-measuring', s.measuring));
      totals();
      deps.bridge.cleanerDeepScan().then(scan => {
        if (mine !== seq) return;
        scanId = scan.scanId;
        loaded = true;
        items = scan.items;
        ticked = new Set(items.filter(i => i.ticked && !i.inUse).map(i => i.id));
        if (items.length === 0) body.replaceChildren(el(doc, 'span', 'lab cl-measuring', s.empty));
        else draw();
      }, () => {});
    },
    loaded: () => loaded,
    scan: () => scanId,
    label: id => items.find(i => i.id === id)?.label ?? '',
    inUse(ids) {
      // A mark set by the scan stays: the core's answer may not know a busy tool.
      const busy = new Set(ids);
      items = items.map(i => (busy.has(i.id) ? { ...i, inUse: true } : i));
      busy.forEach(id => ticked.delete(id));
      if (items.length > 0) draw();
    },
    destroy() {
      seq++;
    },
  };
}
