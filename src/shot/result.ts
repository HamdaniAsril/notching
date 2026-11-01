import type { Shot } from '../bridge';
import { fill, hostStrings } from '../i18n';
import { presses } from '../notch/presses';
import { button, COPY_ICON, DELETE_ICON, el, image, openEditor, SAVE_ICON, SAVED_ICON, saves, type ShotDeps } from './common';

export interface ShotResult {
  // `shot` is undefined while the history has not brought it yet.
  render(id: number, shot: Shot | undefined): void;
  destroy(): void;
}

// The notch after a capture (design 1 Nov §5, notch-hasil.html): the picture,
// "copied" and its size, and Salin, Simpan and Hapus. Salin and Cmd+C copy again
// and close; Hapus deletes and closes; Simpan stays. The picture opens the editor
// or drags out. It closes when its screenshot leaves the history.
export function mountShotResult(box: HTMLElement, deps: ShotDeps): ShotResult {
  const doc = box.ownerDocument;
  const s = hostStrings(deps.lang).shot;
  let id: number | null = null;
  let current: Shot | undefined;
  let built = '';
  const save = saves(deps.shotSave, () => { if (current) show(current); });
  const press = presses(doc, i => void deps.shotStartDrag(i).catch(() => {}));

  function copy(): void {
    if (id === null) return;
    deps.shotCopy(id).catch(() => {});
    void deps.close();
  }

  // The panel is key while open, so Cmd+C comes here, and only while this page is.
  function onKey(e: KeyboardEvent): void {
    if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copy();
    }
  }
  doc.addEventListener('keydown', onKey);
  // Should the Edit menu take Cmd+C first, it arrives as a copy instead.
  function onCopy(e: ClipboardEvent): void {
    e.preventDefault();
    copy();
  }
  doc.addEventListener('copy', onCopy);

  const offShot = deps.onShot(e => {
    if (e.phase === 'gone' && e.id === id) void deps.close();
  });

  function action(icon: string, text: string, onClick: () => void): HTMLButtonElement {
    const b = button(doc, 'shot-btn');
    b.innerHTML = icon;
    b.append(text);
    b.addEventListener('click', onClick);
    return b;
  }

  function build(shot: Shot): void {
    const saving = save.state(shot);
    const wrap = el(doc, 'div', 'shot-res');
    const row = el(doc, 'div', 'shot-row');
    const pic = el(doc, 'div', 'shot-pic');
    pic.title = s.edit;
    pic.append(image(doc, shot.image), el(doc, 'span', 'shot-hint', s.edit));
    press.watch(pic, shot.id, () => openEditor(deps, shot.id));
    const info = el(doc, 'div');
    info.append(el(doc, 'div', 'shot-done', s.copied), el(doc, 'div', 'shot-size', `${shot.width} × ${shot.height}`));
    const saveBtn = action(saving === 'saved' ? SAVED_ICON : SAVE_ICON, s[saving === 'failed' ? 'saveFailed' : saving], () => save.save(shot));
    saveBtn.classList.toggle('failed', saving === 'failed');
    const btns = el(doc, 'div', 'shot-btns');
    btns.append(action(COPY_ICON, s.copy, copy), saveBtn, action(DELETE_ICON, s.delete, () => {
      deps.shotDelete(shot.id).catch(() => {});
      void deps.close();
    }));
    const side = el(doc, 'div', 'shot-side');
    side.append(info, btns);
    row.append(pic, side);
    wrap.append(el(doc, 'div', 'lab shot-lab', fill(s.label, { kind: s.kinds[shot.kind] })), row);
    box.replaceChildren(wrap);
  }

  function show(shot: Shot): void {
    const sig = JSON.stringify([shot, save.state(shot)]);
    if (sig === built) return;
    built = sig;
    build(shot);
  }

  return {
    render(next, shot) {
      id = next;
      current = shot;
      if (shot) {
        show(shot);
      } else {
        built = '';
        box.replaceChildren();
      }
    },
    destroy() {
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('copy', onCopy);
      offShot();
      press.destroy();
      save.destroy();
      box.replaceChildren();
    },
  };
}
