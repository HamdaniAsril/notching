import type { Bridge, CleanerOverview, CleanerParts } from '../bridge';
import { type CleanerStrings, fill, hostStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import { BROOM_ICON, button, el, TRASH_ICON } from './dom';
import { barParts, sizeText } from './format';

export interface HomeDeps {
  bridge: Pick<Bridge, 'cleanerOverview' | 'cleanerParts' | 'openFullDiskAccessSettings'>;
  lang: Lang;
  strings: CleanerStrings;
  onClean(): void;
  onUninstall(): void;
  onDisk(): void;
  onBack(): void; // "‹ Modul", as on the other module pages
  // Whether the Full Disk Access line shows, and the view's height as drawn: a
  // legend or a tile that wraps makes it taller, and the panel must fit it.
  onLayout(note: boolean, height: number): void;
}

export interface Home {
  refresh(): void; // measures again
  loaded(): boolean; // the parts landed
  destroy(): void;
}

// Cleaner's start view (design 1 Nov §4, Volt look): the disk's name, then a card
// with what is used as a big Barlow number, the free space, the bar per kind with
// its legend, and the two tiles. The overview comes first; the parts,
// which walk folders, fill in as they land.
export function mountHome(box: HTMLElement, deps: HomeDeps): Home {
  const doc = box.ownerDocument;
  const s = deps.strings;
  const size = (b: number) => sizeText(b, deps.lang);
  let overview: CleanerOverview | null = null;
  let parts: CleanerParts | null = null;
  let seq = 0;

  const head = el(doc, 'div', 'cl-head');
  const back = button(doc, 'cl-back', `‹ ${hostStrings(deps.lang).modules}`);
  back.addEventListener('click', () => deps.onBack());
  const vol = el(doc, 'span', 'cl-vol');
  head.append(back, vol);
  const usedRow = el(doc, 'div', 'cl-used');
  const big = el(doc, 'span', 'cl-big');
  const of = el(doc, 'span', 'cl-of');
  const free = el(doc, 'span', 'cl-free');
  usedRow.append(big, of, free);
  const bar = button(doc, 'cl-bar');
  bar.addEventListener('click', () => deps.onDisk());
  const legend = el(doc, 'div', 'cl-legend');
  const card = el(doc, 'div', 'cl-card');
  card.append(usedRow, bar, legend);
  const tiles = el(doc, 'div', 'cl-tiles');
  const clean = tile('clean', BROOM_ICON, s.cleanTitle, () => deps.onClean());
  const uninstall = tile('uninstall', TRASH_ICON, s.uninstallTitle, () => deps.onUninstall());
  tiles.append(clean.box, uninstall.box);
  const note = el(doc, 'div', 'cl-note');
  const wrap = el(doc, 'div', 'cl-home');
  wrap.append(head, card, tiles, note);
  box.replaceChildren(wrap);
  let showNote = false;
  // offsetHeight, not the bounding box: the panel's entrance scales it. A view
  // not on the page has no height yet and says nothing.
  const report = () => deps.onLayout(showNote, wrap.offsetHeight);
  // The panel's width can still settle after a draw, and a new width can wrap
  // the legend; WebKit tells. (jsdom has no ResizeObserver.)
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (overview && wrap.isConnected) report();
  });
  watch?.observe(wrap);

  function tile(key: string, icon: string, title: string, open: () => void) {
    const b = button(doc, 'cl-tile');
    b.dataset.tile = key;
    const glyph = el(doc, 'span', 'cl-ticon');
    glyph.innerHTML = icon;
    const sub = el(doc, 'span', 'cl-tsub');
    b.append(glyph, el(doc, 'span', 'cl-tname', title), sub);
    b.addEventListener('click', open);
    return { box: b, sub };
  }

  function draw(): void {
    if (!overview) return;
    const o = overview;
    vol.textContent = o.volume;
    free.textContent = fill(s.free, { size: size(o.free) });
    head.querySelector('.cl-test')?.remove();
    if (o.testMode) head.insertBefore(el(doc, 'span', 'cl-test', s.testMode), vol);
    big.textContent = String(Math.round(Math.max(0, o.total - o.free) / 1e9));
    of.textContent = fill(s.usedOf, { size: size(o.total) });
    const all = barParts(o, parts);
    const total = Math.max(1, o.total);
    bar.replaceChildren(...all.map(p => {
      const seg = el(doc, 'span', 'cl-seg');
      seg.dataset.key = p.key;
      seg.style.width = `${(p.bytes / total) * 100}%`;
      return seg;
    }));
    if (!parts) {
      legend.replaceChildren(el(doc, 'span', 'cl-measuring', s.measuring));
    } else {
      legend.replaceChildren(...all.filter(p => p.key !== 'free').map(p => {
        const leg = el(doc, 'span', 'cl-leg');
        const dot = el(doc, 'i', 'cl-dot');
        dot.dataset.key = p.key;
        leg.append(dot, `${s.parts[p.key]} ${p.known ? size(p.bytes) : s.unknown}`);
        return leg;
      }));
    }
    clean.sub.textContent = parts?.cleanable != null ? fill(s.cleanSub, { size: size(parts.cleanable) }) : s.measuring;
    uninstall.sub.textContent = parts ? fill(s.uninstallSub, { n: parts.appCount }) : s.measuring;
    showNote = !o.fda;
    note.replaceChildren();
    if (showNote) {
      const open = button(doc, 'cl-note-btn', s.allow);
      open.addEventListener('click', () => void deps.bridge.openFullDiskAccessSettings().catch(() => {}));
      note.append(el(doc, 'span', 'cl-note-text', s.noFda), open);
    }
    report();
  }

  return {
    refresh() {
      const mine = ++seq;
      parts = null;
      deps.bridge.cleanerOverview().then(o => {
        if (mine !== seq) return;
        overview = o;
        draw();
      }, () => {});
      deps.bridge.cleanerParts().then(p => {
        if (mine !== seq) return;
        parts = p;
        draw();
      }, () => {});
    },
    loaded: () => parts !== null,
    destroy() {
      seq++;
      watch?.disconnect();
    },
  };
}
