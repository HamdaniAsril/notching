import type { Shot } from '../bridge';
import { fill, hostStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import { SAVE_FAILED_MS, button, el } from '../shot/common';

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
const REDO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>';

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
// redo, Simpan and Salin over the screenshot. Salin and Cmd+C copy, then close;
// Simpan saves to the Desktop and stays; a close from outside commits `keep`
// first. Classes start with ed-.
export async function mountEditor(root: HTMLElement, deps: EditorDeps): Promise<EditorView> {
  const { bridge } = deps;
  const doc = root.ownerDocument;
  const s = hostStrings(deps.lang);
  let shown: EditorDoc | null = null;
  let ended = false;
  let queue: Promise<unknown> = Promise.resolve();
  let failTimer: ReturnType<typeof setTimeout> | null = null;

  // What goes back: the drawing tools (plan task 8) give the edits and the
  // export (task 9) the picture; until then the screenshot stays unedited.
  const result = (): { edits: string; png: Blob | null } => ({ edits: '', png: null });

  // One commit at a time, so a close waits for a Simpan under way.
  const commit = (action: EditorAction): Promise<string | null> => {
    const id = shown!.id;
    const run = queue.then(() => {
      const r = result();
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

  const copy = () => {
    if (shown) void end('copy');
  };
  const onKey = (e: KeyboardEvent) => {
    if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey || e.key.toLowerCase() !== 'c' || typing(doc)) return;
    e.preventDefault();
    copy();
  };
  // Should the Edit menu take Cmd+C first, it arrives as a copy instead.
  const onCopy = (e: Event) => {
    if (typing(doc)) return;
    e.preventDefault();
    copy();
  };
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('copy', onCopy);
  const unlisten = [
    bridge.onClose(() => void end('keep')),
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
    const icon = (svg: string, name: string) => {
      const b = button(doc, 'ed-ib');
      b.innerHTML = svg;
      b.setAttribute('aria-label', name);
      b.title = name;
      b.disabled = true; // until the drawing tools have something to undo
      return b;
    };
    showSave('save');
    saveBtn.addEventListener('click', () => void save());
    const copyBtn = button(doc, 'ed-btn ed-pri', s.shot.copy);
    copyBtn.addEventListener('click', copy);
    const right = el(doc, 'div', 'ed-right');
    right.append(icon(UNDO_ICON, s.editor.undo), icon(REDO_ICON, s.editor.redo), saveBtn, copyBtn);
    head.append(label, right);

    const stage = el(doc, 'main', 'ed-stage');
    const img = el(doc, 'img', 'ed-img');
    img.crossOrigin = 'anonymous';
    img.alt = '';
    img.draggable = false;
    img.src = d.original;
    stage.append(img);
    root.replaceChildren(head, stage);
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
      for (const off of unlisten) off();
      if (failTimer) clearTimeout(failTimer);
    },
  };
}
