import type { Bridge, CleanerApp, CleanerItem } from '../bridge';
import { type CleanerStrings, fill } from '../i18n';
import type { Lang } from '../kit/protocol';
import { type Plan, selection } from './clean';
import { button, el } from './dom';
import { sizeText } from './format';

export interface UninstallDeps {
  bridge: Pick<Bridge, 'cleanerApps' | 'cleanerAppDetail' | 'cleanerRunning'>;
  lang: Lang;
  strings: CleanerStrings;
  back(): void; // to Cleaner's start view
  remove(scanId: number, ids: number[], plan: Plan, appId: number, name: string): void;
}

export interface Uninstall {
  refresh(): void; // lists the apps again
  reopen(): void; // the open app, scanned again (its scan was past its time)
  loaded(): boolean; // what shows has landed
  revisit(): void; // the panel showed again: what runs now
  label(id: number): string;
  destroy(): void;
}

// Clean uninstall (design 1 Nov §5.2): every app, biggest first, with a search;
// then one app with what it leaves, by folder: sure ones ticked, maybe ones not,
// personal data last and unticked. A running app waits until it has quit;
// Cleaner never quits it. An app with its own uninstaller is not removed here.
export function mountUninstall(box: HTMLElement, deps: UninstallDeps): Uninstall {
  const doc = box.ownerDocument;
  const s = deps.strings;
  const size = (b: number) => sizeText(b, deps.lang);
  let apps: CleanerApp[] = [];
  let appsScan = 0;
  let current: CleanerApp | null = null;
  let scanId = 0;
  let items: CleanerItem[] = [];
  let ticked = new Set<number>();
  let seq = 0;
  let loaded = false;

  const search = el(doc, 'input', 'cl-search');
  search.type = 'search';
  search.placeholder = s.search;
  search.addEventListener('input', () => drawList());

  function head(label: string, onBack: () => void, right?: HTMLElement): HTMLElement {
    const h = el(doc, 'div', 'cl-lhead');
    const b = button(doc, 'cl-back', `‹ ${label}`);
    b.addEventListener('click', onBack);
    h.append(b);
    if (right) h.append(right);
    return h;
  }

  function frame(...children: HTMLElement[]): HTMLElement {
    const wrap = el(doc, 'div', 'cl-list');
    wrap.append(...children);
    box.replaceChildren(wrap);
    return wrap;
  }

  function drawList(): void {
    const q = search.value.trim().toLowerCase();
    const shown = apps.filter(a => !q || a.name.toLowerCase().includes(q) || a.bundleId.toLowerCase().includes(q));
    const body = el(doc, 'div', 'cl-lbody');
    if (shown.length === 0) body.append(el(doc, 'span', 'cl-measuring', s.noApps));
    for (const a of shown) {
      const row = button(doc, 'cl-row cl-app');
      row.append(el(doc, 'span', 'cl-name', a.name), el(doc, 'span', 'cl-size', size(a.bytes)));
      row.addEventListener('click', () => openApp(a));
      body.append(row);
    }
    if (!box.contains(search)) {
      const bar = el(doc, 'div', 'cl-searchbar');
      bar.append(search);
      frame(head(s.uninstallTitle, () => deps.back()), bar, body);
      search.focus();
    } else {
      box.querySelector('.cl-lbody')?.replaceWith(body);
    }
  }

  function openApp(a: CleanerApp): void {
    current = a;
    items = [];
    ticked = new Set();
    const mine = ++seq;
    loaded = a.refused;
    if (a.refused) {
      drawDetail();
      return;
    }
    frame(head(s.uninstallTitle, () => drawList()), el(doc, 'span', 'cl-measuring', s.measuring));
    deps.bridge.cleanerAppDetail(a.id).then(scan => {
      if (mine !== seq) return;
      scanId = scan.scanId;
      loaded = true;
      items = scan.items;
      ticked = new Set(items.filter(i => i.ticked).map(i => i.id));
      drawDetail();
    }, () => {});
  }

  function tickBox(i: CleanerItem): HTMLInputElement {
    const t = el(doc, 'input', 'cl-tick');
    t.type = 'checkbox';
    t.checked = ticked.has(i.id);
    t.disabled = i.category === 'app';
    t.addEventListener('change', () => {
      if (ticked.has(i.id)) ticked.delete(i.id);
      else ticked.add(i.id);
      drawDetail();
    });
    return t;
  }

  function itemRow(i: CleanerItem): HTMLElement {
    const row = el(doc, 'div', 'cl-item');
    row.dataset.id = String(i.id);
    const name = el(doc, 'span', 'cl-name', i.label);
    if (i.confidence === 'maybe') name.append(el(doc, 'span', 'cl-tag', s.maybe));
    row.append(tickBox(i), name, el(doc, 'span', 'cl-size', size(i.bytes)));
    return row;
  }

  function group(title: string, rows: CleanerItem[], hint?: string): HTMLElement {
    const g = el(doc, 'div', 'cl-cat open');
    const h = el(doc, 'div', 'cl-group');
    h.append(el(doc, 'span', 'cl-group-name', title));
    if (hint) h.append(el(doc, 'span', 'cl-detail', ` · ${hint}`));
    g.append(h, ...rows.map(itemRow));
    return g;
  }

  function drawDetail(): void {
    const a = current;
    if (!a) return;
    const body = el(doc, 'div', 'cl-lbody');
    const foot = el(doc, 'div', 'cl-lfoot');
    if (a.refused) {
      foot.append(el(doc, 'span', 'cl-note-text', s.ownUninstaller));
      frame(head(s.uninstallTitle, () => drawList(), el(doc, 'span', 'cl-sel', a.name)), body, foot);
      return;
    }
    const appItem = items.find(i => i.category === 'app');
    const leftovers = items.filter(i => i.category === 'leftover');
    const personal = items.filter(i => i.category === 'personal');
    if (appItem) body.append(itemRow(appItem));
    const folders = [...new Set(leftovers.map(i => i.detail ?? ''))];
    for (const f of folders) {
      const title = (s.groups as Record<string, string>)[f] ?? f;
      body.append(group(title, leftovers.filter(i => (i.detail ?? '') === f)));
    }
    if (personal.length > 0) body.append(group(s.categories.personal, personal, s.personalHint));
    const running = appItem?.inUse ?? a.running;
    if (running) foot.append(el(doc, 'span', 'cl-note-text', fill(s.quitFirst, { app: a.name })));
    const plan = selection(items, ticked);
    const go = button(doc, 'cl-btn primary cl-go', fill(s.remove, { app: a.name, size: size(plan.permanent + plan.trash) }));
    go.disabled = running || plan.count === 0;
    go.addEventListener('click', () => {
      const ids = items.filter(i => ticked.has(i.id)).map(i => i.id);
      deps.remove(scanId, ids, plan, a.id, a.name);
    });
    foot.append(go);
    frame(head(s.uninstallTitle, () => drawList(), el(doc, 'span', 'cl-sel', a.name)), body, foot);
  }

  return {
    refresh() {
      const mine = ++seq;
      loaded = false;
      current = null;
      search.value = '';
      frame(head(s.uninstallTitle, () => deps.back()), el(doc, 'span', 'cl-measuring', s.measuring));
      deps.bridge.cleanerApps().then(scan => {
        if (mine !== seq) return;
        appsScan = scan.scanId;
        loaded = true;
        apps = [...scan.items].sort((x, y) => y.bytes - x.bytes);
        drawList();
      }, () => {});
    },
    revisit() {
      const scan = current && !current.refused ? scanId : appsScan;
      deps.bridge.cleanerRunning(scan).then(ids => {
        const busy = new Set(ids);
        if (current && !current.refused) {
          items = items.map(i => (i.category === 'app' ? { ...i, inUse: busy.has(i.id) } : i));
          current = { ...current, running: items.some(i => i.category === 'app' && i.inUse) };
          drawDetail();
        } else {
          apps = apps.map(x => ({ ...x, running: busy.has(x.id) }));
        }
      }, () => {});
    },
    reopen() {
      if (current) openApp(current);
    },
    loaded: () => loaded,
    label: id => items.find(i => i.id === id)?.label ?? '',
    destroy() {
      seq++;
    },
  };
}
