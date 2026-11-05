import { applyAccent } from '../kit/accent';
import type { Lang } from '../kit/protocol';
import { peekStrings } from '../i18n';

// Same shape as StageViewDto in src-tauri/src/peek_service.rs; `frame` is in
// this panel's points (origin top-left of its screen).
export interface StageView {
  frame: { x: number; y: number; w: number; h: number };
  minimized: boolean;
  picture: string | null;
  accent: string;
  lang: Lang;
}

// Peeking at a window (design 5 Nov §6): the screen dims and the window's
// picture sits in its place with the accent ring; a minimized one is marked.
// Null clears the layer. The panel never takes a click.
export function renderStage(root: HTMLElement, v: StageView | null): void {
  if (!v) {
    root.replaceChildren();
    return;
  }
  applyAccent(document.documentElement, v.accent);
  const shade = document.createElement('div');
  shade.className = 'shade';
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  Object.assign(ghost.style, { left: `${v.frame.x}px`, top: `${v.frame.y}px`, width: `${v.frame.w}px`, height: `${v.frame.h}px` });
  if (v.picture) {
    const img = document.createElement('img');
    img.src = v.picture;
    img.alt = '';
    ghost.append(img);
  }
  if (v.minimized) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = peekStrings(v.lang).stageMinimized;
    ghost.append(tag);
  }
  root.replaceChildren(shade, ghost);
}
