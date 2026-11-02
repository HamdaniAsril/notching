import type { Bridge, CleanerNode } from '../bridge';
import { type CleanerStrings, fill } from '../i18n';
import type { Lang } from '../kit/protocol';
import { button, el } from './dom';
import { sizeText } from './format';

export interface DiskDeps {
  bridge: Pick<Bridge, 'cleanerBreakdown' | 'cleanerRevealPath'>;
  lang: Lang;
  strings: CleanerStrings;
  back(): void; // to Cleaner's start view
}

export interface Disk {
  refresh(): void; // measures again, from home
  loaded(): boolean;
  destroy(): void;
}

// What takes the space (design 1 Nov §6): the biggest folders and files, biggest
// first, each with a thin bar; a folder opens, "‹" goes up. Every row can be
// shown in Finder. Nothing here removes anything.
export function mountDisk(box: HTMLElement, deps: DiskDeps): Disk {
  const doc = box.ownerDocument;
  const s = deps.strings;
  const size = (b: number) => sizeText(b, deps.lang);
  let root: CleanerNode | null = null;
  let path: string[] = [];
  let seq = 0;

  function at(): CleanerNode | null {
    let n = root;
    for (const name of path) n = n?.children.find(c => c.name === name && c.rest === 0) ?? null;
    return n;
  }

  function frame(title: string, ...children: HTMLElement[]): void {
    const head = el(doc, 'div', 'cl-lhead');
    const back = button(doc, 'cl-back', `‹ ${title}`);
    back.addEventListener('click', () => {
      if (path.length === 0) deps.back();
      else {
        path = path.slice(0, -1);
        draw();
      }
    });
    head.append(back);
    const wrap = el(doc, 'div', 'cl-list');
    wrap.append(head, ...children);
    box.replaceChildren(wrap);
  }

  function nodeRow(n: CleanerNode, parent: CleanerNode): HTMLElement {
    const row = el(doc, 'div', 'cl-node cl-row');
    const rest = n.rest > 0;
    const name = el(doc, 'span', 'cl-name', rest ? fill(s.rest, { n: n.rest }) : n.name);
    const meter = el(doc, 'span', 'cl-nbar');
    const fillBar = el(doc, 'i');
    fillBar.style.width = `${parent.bytes > 0 ? Math.min(100, (n.bytes / parent.bytes) * 100) : 0}%`;
    meter.append(fillBar);
    row.append(name);
    if (!n.readable) {
      row.append(el(doc, 'span', 'cl-tag', s.unreadable));
    } else {
      row.append(meter, el(doc, 'span', 'cl-size', size(n.bytes)));
    }
    const isAppRoot = path.length === 0 && n.name === 'App';
    if (!rest && n.readable && !isAppRoot) {
      const reveal = button(doc, 'cl-reveal', s.showInFinder);
      reveal.addEventListener('click', e => {
        e.stopPropagation();
        void deps.bridge.cleanerRevealPath([...path, n.name]).catch(() => {});
      });
      row.append(reveal);
    }
    if (n.dir && n.readable && !rest) {
      row.classList.add('open-able');
      row.addEventListener('click', () => {
        path = [...path, n.name];
        draw();
      });
    }
    return row;
  }

  function draw(): void {
    const here = at();
    if (!here) {
      path = [];
      if (root) draw();
      return;
    }
    const kids = [...here.children].sort((a, b) => (a.rest > 0 ? 1 : 0) - (b.rest > 0 ? 1 : 0) || b.bytes - a.bytes);
    const body = el(doc, 'div', 'cl-lbody');
    body.append(...kids.map(k => nodeRow(k, here)));
    frame(path.length === 0 ? s.diskTitle : path[path.length - 1], body);
  }

  return {
    refresh() {
      const mine = ++seq;
      root = null;
      path = [];
      frame(s.diskTitle, el(doc, 'span', 'cl-measuring', s.measuring));
      deps.bridge.cleanerBreakdown().then(tree => {
        if (mine !== seq) return;
        root = tree;
        draw();
      }, () => {});
    },
    loaded: () => root !== null,
    destroy() {
      seq++;
    },
  };
}
