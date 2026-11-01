import type { Shot } from '../bridge';
import { fill, hostStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import { SAVE_FAILED_MS, button, el } from '../shot/common';
import { fileJpeg, wallpaperJpeg } from './background';
import { createBoard, type Board } from './board';
import { COLORS, CORNER_RANGE, TOOLS, TOOL_KEYS, WIDTHS, scaleFor, type Tool } from './model';
import { createPopover, type Popover } from './popover';
import { outputSize } from './render';

// Same shape as EditorDoc in src-tauri/src/editor_window.rs. `width` × `height`
// is the original's size; `original` and `wallpaper` are notchshot: URLs.
export interface EditorDoc {
  id: number;
  width: number;
  height: number;
  original: string;
  edits: string | null;
  wallpaper: string | null;
}

export type EditorAction = 'copy' | 'save' | 'keep';
export type Unlisten = () => void;

export interface EditorBridge {
  doc(): Promise<EditorDoc | null>;
  // `png` null: no shapes and no background, the screenshot goes back to its
  // original. Resolves to the Desktop path for `save`.
  commit(id: number, edits: string, png: Blob | null, action: EditorAction): Promise<string | null>;
  close(): Promise<void>; // after the last commit: the window goes
  // The close request arrived and the page is committing: the core then waits
  // up to 60 s for `close` instead of 5 s.
  closing(): Promise<void>;
  onClose(cb: () => void): Unlisten; // the red button, the module switched off, the app quitting
  onShots(cb: (list: Shot[]) => void): Unlisten;
}

export interface EditorDeps {
  bridge: EditorBridge;
  lang: Lang;
}

export interface EditorView {
  destroy(): void;
}

const UNDO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';
const CORNER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10a6 6 0 0 1 6-6h10"/></svg>';
const BG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>';
const REDO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>';

// Drawn in currentColor, as in editor.html.
const TOOL_ICONS: Record<Tool, string> = {
  select: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 8-6 2-3 6z"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 17c3-6 6 2 9-4s5-4 9-7"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19L19 5M10 5h9v9"/></svg>',
  rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>',
  ellipse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="8" ry="6.5"/></svg>',
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19L19 5"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 6h14M12 6v13"/></svg>',
  sensor: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="5" height="5"/><rect x="14" y="4" width="5" height="5" opacity=".5"/><rect x="9" y="9" width="5" height="5" opacity=".7"/><rect x="4" y="14" width="5" height="5" opacity=".4"/><rect x="14" y="14" width="5" height="5"/></svg>',
};

const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset', 'file', 'image']);

// Cmd+C belongs to a text box while one has the focus.
function typing(doc: Document): boolean {
  const a = doc.activeElement;
  if (!a || a === doc.body) return false;
  if (a.tagName === 'TEXTAREA') return true;
  if (a.tagName === 'INPUT') return !NOT_TEXT.has((a as HTMLInputElement).type);
  return a.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

// The editor window (design 1 Nov §7, editor.html v2): the size label, undo and
// redo, Simpan and Salin over the screenshot, the tools on the left and the
// colours, widths, Sudut and Background below. Salin and Cmd+C copy, then
// close; Simpan saves to
// the Desktop and stays; a close from outside commits `keep` first. The
// drawing itself is the board's. Classes start with ed-.
export async function mountEditor(root: HTMLElement, deps: EditorDeps): Promise<EditorView> {
  const { bridge } = deps;
  const doc = root.ownerDocument;
  const s = hostStrings(deps.lang);
  let shown: EditorDoc | null = null;
  let ended = false;
  let queue: Promise<unknown> = Promise.resolve();
  let failTimer: ReturnType<typeof setTimeout> | null = null;

  let board: Board | null = null;
  let colorIndex = 0;
  let widthIndex = 1;
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const colorButtons: HTMLButtonElement[] = [];
  const widthButtons: HTMLButtonElement[] = [];
  let popover: Popover | null = null;
  const cornerRange = el(doc, 'input', 'ed-range ed-corner-range');
  const cornerValue = el(doc, 'span', 'ed-cval');
  const bgBtn = button(doc, 'ed-bgbtn');
  const bgWrap = el(doc, 'div', 'ed-bgwrap');
  const undoBtn = button(doc, 'ed-ib');
  const redoBtn = button(doc, 'ed-ib');

  // What goes back: the edits to continue from later, and the finished picture
  // (null when nothing was changed). Should the picture fail, a close still keeps
  // the edits, and the screenshot stays as it was; Salin and Simpan say it failed.
  const result = async (action: EditorAction): Promise<{ edits: string; png: Blob | null }> => {
    if (!board) return { edits: '', png: null };
    const edits = board.edits();
    try {
      return { edits, png: await board.png() };
    } catch (e) {
      console.error('notching: the picture was not exported', e);
      if (action === 'keep') return { edits, png: null };
      throw e;
    }
  };

  // One commit at a time, so a close waits for a Simpan under way.
  const commit = (action: EditorAction): Promise<string | null> => {
    const id = shown!.id;
    const run = queue.then(async () => {
      const r = await result(action);
      return bridge.commit(id, r.edits, r.png, action);
    });
    queue = run.catch(() => {});
    return run;
  };

  // The page's last act: commit (not when the screenshot is gone), then close.
  // Even a failed commit closes, so the window never stays stuck.
  const end = async (action: 'copy' | 'keep' | null) => {
    if (ended) return;
    ended = true;
    if (shown && action) {
      try {
        await commit(action);
      } catch (e) {
        console.error('notching: editor commit failed', e);
      }
    }
    await bridge.close();
  };

  const saveBtn = button(doc, 'ed-btn');
  const showSave = (state: 'save' | 'saved' | 'failed') => {
    saveBtn.textContent = state === 'saved' ? s.shot.saved : state === 'failed' ? s.shot.saveFailed : s.shot.save;
    saveBtn.classList.toggle('ed-failed', state === 'failed');
  };
  const save = async () => {
    if (ended || !shown) return;
    if (failTimer) clearTimeout(failTimer);
    failTimer = null;
    try {
      await commit('save');
      showSave('saved');
    } catch (e) {
      console.error('notching: screenshot not saved', e);
      showSave('failed');
      failTimer = setTimeout(() => {
        failTimer = null;
        showSave('save');
      }, SAVE_FAILED_MS);
    }
  };

  // The bars show the board's state.
  const sync = () => {
    if (!board) return;
    undoBtn.disabled = !board.canUndo;
    redoBtn.disabled = !board.canRedo;
    for (const [tool, b] of toolButtons) {
      b.classList.toggle('ed-on', tool === board.tool);
      b.setAttribute('aria-pressed', String(tool === board.tool));
    }
    for (const [list, at] of [[colorButtons, colorIndex], [widthButtons, widthIndex]] as const) {
      list.forEach((b, i) => {
        b.classList.toggle('ed-sel', i === at);
        b.setAttribute('aria-pressed', String(i === at));
      });
    }
    const { corner } = board.style;
    if (Number(cornerRange.value) !== corner) cornerRange.value = String(corner);
    cornerValue.textContent = String(corner);
    popover?.sync();
  };
  const popOpen = () => popover !== null && !popover.el.hidden;
  const showPop = (open: boolean) => {
    if (!popover) return;
    popover.el.hidden = !open;
    bgBtn.classList.toggle('ed-on', open);
    bgBtn.setAttribute('aria-expanded', String(open));
  };
  // A picture for the background, shrunk to at most twice the output's longest
  // side; it is kept in the doc, so a re-open needs no wallpaper.
  const useImage = async (from: 'wallpaper' | 'file', make: (max: number) => Promise<string>) => {
    if (!board || !shown) return;
    const probe = { ...board.style, background: { kind: 'image', src: '', from } as const };
    const out = outputSize(shown.width, shown.height, probe, scaleFor(shown.width, shown.height));
    try {
      const src = await make(2 * Math.max(out.w, out.h));
      if (ended || !board) return;
      board.setStyle({ ...board.style, background: { kind: 'image', src, from } });
    } catch (e) {
      console.error('notching: background picture not used', e);
    }
  };
  const pick = (tool: Tool) => {
    board?.setTool(tool);
    sync();
  };

  const copy = () => {
    if (shown) void end('copy');
  };
  // The tools, Delete, Escape and Cmd+Z belong to the picture; while a text box
  // has the focus every key belongs to the box, but for Cmd+C at the page's end.
  const onKey = (e: KeyboardEvent) => {
    if (typing(doc)) return;
    if (e.metaKey && !e.altKey && !e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === 'c' && !e.shiftKey) {
        e.preventDefault();
        copy();
      } else if (key === 'z' && board) {
        e.preventDefault();
        if (e.shiftKey) board.redo();
        else board.undo();
      }
      return;
    }
    if (!board || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && popOpen()) {
      e.preventDefault(); // the box first, then the selection
      showPop(false);
      return;
    }
    const tool = TOOL_KEYS[e.key.toLowerCase()];
    if (tool) {
      pick(tool);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      board.removeSelected();
    } else if (e.key === 'Escape') {
      e.preventDefault(); // takes the selection away, never the window
      board.deselect();
    }
  };
  // Should the Edit menu take Cmd+C first, it arrives as a copy instead.
  const onCopy = (e: Event) => {
    if (typing(doc)) return;
    e.preventDefault();
    copy();
  };
  // A press outside the Background box puts it away.
  const onPress = (e: Event) => {
    if (popOpen() && !bgWrap.contains(e.target as Node)) showPop(false);
  };
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('copy', onCopy);
  doc.addEventListener('pointerdown', onPress);
  const unlisten = [
    bridge.onClose(() => {
      bridge.closing().catch(e => console.error('notching: editor close not acknowledged', e));
      void end('keep');
    }),
    bridge.onShots(list => {
      if (shown && !list.some(x => x.id === shown!.id)) void end(null);
    }),
  ];

  const render = (d: EditorDoc) => {
    const title = fill(s.editor.title, { w: d.width, h: d.height });
    doc.title = title;
    const head = el(doc, 'header', 'ed-head');
    const label = el(doc, 'span', 'ed-lab', title);
    // The bar moves the window, as a title bar does.
    head.setAttribute('data-tauri-drag-region', '');
    label.setAttribute('data-tauri-drag-region', '');
    const icon = (b: HTMLButtonElement, svg: string, name: string, act: () => void) => {
      b.innerHTML = svg;
      b.setAttribute('aria-label', name);
      b.title = name;
      b.disabled = true; // until there is something to undo or redo
      b.addEventListener('click', act);
      return b;
    };
    showSave('save');
    saveBtn.addEventListener('click', () => void save());
    const copyBtn = button(doc, 'ed-btn ed-pri', s.shot.copy);
    copyBtn.addEventListener('click', copy);
    const right = el(doc, 'div', 'ed-right');
    right.append(
      icon(undoBtn, UNDO_ICON, s.editor.undo, () => board?.undo()),
      icon(redoBtn, REDO_ICON, s.editor.redo, () => board?.redo()),
      saveBtn,
      copyBtn,
    );
    head.append(label, right);

    const stage = el(doc, 'main', 'ed-stage');
    // The original, loaded once: the board draws it, and a sensor samples it.
    const img = el(doc, 'img', 'ed-src');
    img.crossOrigin = 'anonymous';
    img.alt = '';
    img.draggable = false;
    img.src = d.original;
    stage.append(img);
    board?.destroy();
    board = createBoard(doc, stage, d, img, () => sync());
    board.setTool('pen');

    const tools = el(doc, 'nav', 'ed-tools');
    for (const tool of TOOLS) {
      const key = Object.keys(TOOL_KEYS).find(k => TOOL_KEYS[k] === tool)!;
      const name = s.editor.tools[tool];
      const b = button(doc, 'ed-tool');
      b.innerHTML = TOOL_ICONS[tool];
      b.dataset.tool = tool;
      b.setAttribute('aria-label', name);
      b.title = `${name} (${key.toUpperCase()})`;
      b.addEventListener('click', () => pick(tool));
      toolButtons.set(tool, b);
      tools.append(b);
    }

    // ed-c0.. and ed-w0.. are drawn by the stylesheet, in the order of COLORS and WIDTHS.
    const bar = el(doc, 'div', 'ed-bar');
    const colors = el(doc, 'div', 'ed-group');
    COLORS.forEach((_, i) => {
      const b = button(doc, `ed-sw ed-c${i}`);
      b.setAttribute('aria-label', s.editor.colors[i]);
      b.title = s.editor.colors[i];
      b.addEventListener('click', () => {
        colorIndex = i;
        board?.setColor(i);
        sync();
      });
      colorButtons.push(b);
      colors.append(b);
    });
    const widths = el(doc, 'div', 'ed-group');
    WIDTHS.forEach((_, i) => {
      const b = button(doc, 'ed-wd');
      b.append(el(doc, 'span', `ed-w ed-w${i}`));
      b.setAttribute('aria-label', s.editor.widths[i]);
      b.title = s.editor.widths[i];
      b.addEventListener('click', () => {
        widthIndex = i;
        board?.setWidth(i);
        sync();
      });
      widthButtons.push(b);
      widths.append(b);
    });

    // Sudut: a slider with its number, one history step per drag.
    const corner = el(doc, 'div', 'ed-group ed-corner');
    cornerRange.type = 'range';
    cornerRange.min = String(CORNER_RANGE.min);
    cornerRange.max = String(CORNER_RANGE.max);
    cornerRange.step = '1';
    cornerRange.value = '0';
    cornerRange.setAttribute('aria-label', s.editor.corner);
    const withCorner = () => ({ ...board!.style, corner: Number(cornerRange.value) });
    cornerRange.addEventListener('input', () => board?.previewStyle(withCorner()));
    cornerRange.addEventListener('change', () => board?.setStyle(withCorner()));
    const cornerIcon = el(doc, 'span', 'ed-cicon');
    cornerIcon.innerHTML = CORNER_ICON;
    corner.append(cornerIcon, el(doc, 'span', 'ed-clab', s.editor.corner), cornerRange, cornerValue);

    // Background: the button and its box, which opens upward.
    bgBtn.innerHTML = BG_ICON;
    bgBtn.append(s.editor.background);
    bgBtn.setAttribute('aria-haspopup', 'dialog');
    bgBtn.addEventListener('click', () => showPop(!popOpen()));
    popover = createPopover({
      doc,
      s: s.editor,
      wallpaper: d.wallpaper !== null,
      style: () => board!.style,
      preview: next => board?.previewStyle(next),
      commit: next => board?.setStyle(next),
      pickWallpaper: () => void useImage('wallpaper', max => wallpaperJpeg(d.wallpaper!, max)),
      pickFile: file => void useImage('file', max => fileJpeg(file, max)),
    });
    bgWrap.replaceChildren(popover.el, bgBtn);
    showPop(false);

    bar.append(colors, el(doc, 'span', 'ed-sep'), widths, el(doc, 'span', 'ed-sep'), corner, el(doc, 'span', 'ed-sep'), bgWrap);

    root.replaceChildren(head, tools, stage, bar);
    sync();
  };

  const loaded = await bridge.doc();
  if (!ended) {
    if (loaded) {
      shown = loaded;
      render(loaded);
    } else {
      await end(null);
    }
  }

  return {
    destroy() {
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('copy', onCopy);
      doc.removeEventListener('pointerdown', onPress);
      for (const off of unlisten) off();
      if (failTimer) clearTimeout(failTimer);
      board?.destroy();
    },
  };
}
