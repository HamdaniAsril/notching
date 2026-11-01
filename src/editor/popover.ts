import type { hostStrings } from '../i18n';
import { button, el } from '../shot/common';
import { GRADIENTS, PADDING_RANGE, SOLIDS, type Background, type Style } from './model';

type Strings = ReturnType<typeof hostStrings>['editor'];

export interface PopoverDeps {
  doc: Document;
  s: Strings;
  wallpaper: boolean; // the Mac's wallpaper is a picture the editor can use
  style(): Style;
  // A colour or a slider that is still moving, and the same once it has stopped.
  preview(style: Style): void;
  commit(style: Style): void;
  pickWallpaper(): void;
  pickFile(file: File): void;
}

export interface Popover {
  readonly el: HTMLElement;
  sync(): void; // shows the style the board has now
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isPreset = (bg: Background) =>
  (bg.kind === 'solid' && SOLIDS.some(c => same(c, bg.color))) ||
  (bg.kind === 'gradient' && GRADIENTS.some(([from, to]) => same(from, bg.from) && same(to, bg.to)));

// The Background box (design 1 Nov §7, editor.html): Warna solid, Gradient,
// Gambar and Jarak. A chip's colours come from the stylesheet (ed-s0.., ed-g0..,
// in the order of SOLIDS and GRADIENTS); only the custom pickers hold a value.
export function createPopover(deps: PopoverDeps): Popover {
  const { doc, s } = deps;
  const root = el(doc, 'div', 'ed-pop');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', s.background);
  root.hidden = true;

  const set = (background: Background, live: boolean) => {
    const next = { ...deps.style(), background };
    if (live) deps.preview(next);
    else deps.commit(next);
  };
  // A picker, live while the colour panel moves and final when it settles.
  const picker = (label: string, cls: string, value: string, make: (v: string) => Background): HTMLLabelElement => {
    const wrap = el(doc, 'label', `ed-chip ed-rainbow ${cls}`);
    const input = el(doc, 'input');
    input.type = 'color';
    input.value = value;
    input.title = label;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => set(make(input.value), true));
    input.addEventListener('change', () => set(make(input.value), false));
    wrap.append(input);
    return wrap;
  };
  const chip = (cls: string, label: string, pick: () => void): HTMLButtonElement => {
    const b = button(doc, `ed-chip ${cls}`);
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', pick);
    return b;
  };
  const row = (...kids: HTMLElement[]) => {
    const r = el(doc, 'div', 'ed-row');
    r.append(...kids);
    return r;
  };
  const head = (text: string) => el(doc, 'div', 'ed-plab', text);

  // Warna solid: no background first, as in the mockup, then the presets and a wheel.
  const none = chip('ed-none', s.bg.none, () => set({ kind: 'none' }, false));
  none.dataset.none = '';
  const solids = SOLIDS.map((color, i) => {
    const b = chip(`ed-s${i}`, color, () => set({ kind: 'solid', color }, false));
    b.dataset.solid = color;
    return b;
  });
  const customSolid = picker(s.bg.customColor, 'ed-custom', SOLIDS[SOLIDS.length - 1], color => ({ kind: 'solid', color }));
  const solidInput = customSolid.querySelector('input')!;
  solidInput.dataset.custom = 'solid';

  // Gradient: the presets, then a pair of wheels for one of your own.
  const grads = GRADIENTS.map(([from, to], i) => {
    const b = chip(`ed-g${i}`, `${from} → ${to}`, () => set({ kind: 'gradient', from, to }, false));
    b.dataset.gradient = String(i);
    return b;
  });
  const make = (): Background => ({ kind: 'gradient', from: fromInput.value, to: toInput.value });
  const fromWrap = picker(s.bg.gradientFrom, 'ed-custom', GRADIENTS[0][0], () => make());
  const toWrap = picker(s.bg.gradientTo, 'ed-custom', GRADIENTS[0][1], () => make());
  const fromInput = fromWrap.querySelector('input')!;
  const toInput = toWrap.querySelector('input')!;
  fromInput.dataset.custom = 'from';
  toInput.dataset.custom = 'to';

  // Gambar: the wallpaper (only when the Mac gave one a canvas can read) or a file.
  const wallpaper = button(doc, 'ed-pickb', s.bg.wallpaper);
  wallpaper.dataset.image = 'wallpaper';
  wallpaper.addEventListener('click', () => deps.pickWallpaper());
  const file = button(doc, 'ed-pickb', s.bg.file);
  file.dataset.image = 'file';
  const fileInput = el(doc, 'input', 'ed-file');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.tabIndex = -1;
  file.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    fileInput.value = ''; // so the same file can be chosen again
    if (f) deps.pickFile(f);
  });
  const pick = el(doc, 'div', 'ed-pick');
  if (deps.wallpaper) pick.append(wallpaper);
  pick.append(file, fileInput);

  // Jarak
  const padding = el(doc, 'input', 'ed-range');
  padding.type = 'range';
  padding.min = String(PADDING_RANGE.min);
  padding.max = String(PADDING_RANGE.max);
  padding.step = '1';
  padding.dataset.padding = '';
  padding.setAttribute('aria-label', s.bg.padding);
  const moved = (live: boolean) => {
    const next = { ...deps.style(), padding: Number(padding.value) };
    if (live) deps.preview(next);
    else deps.commit(next);
  };
  padding.addEventListener('input', () => moved(true));
  padding.addEventListener('change', () => moved(false));

  root.append(
    head(s.bg.solid),
    row(none, ...solids, customSolid),
    head(s.bg.gradient),
    row(...grads, fromWrap, toWrap),
    head(s.bg.image),
    pick,
    head(s.bg.padding),
    padding,
  );

  const mark = (node: Element, on: boolean) => {
    node.classList.toggle('ed-sel', on);
    node.setAttribute('aria-pressed', String(on));
  };
  const show = (input: HTMLInputElement, value: string) => {
    if (!same(input.value, value)) input.value = value;
  };

  return {
    el: root,
    sync() {
      const { background: bg, padding: pad } = deps.style();
      mark(none, bg.kind === 'none');
      solids.forEach((b, i) => mark(b, bg.kind === 'solid' && same(bg.color, SOLIDS[i])));
      customSolid.classList.toggle('ed-sel', bg.kind === 'solid' && !isPreset(bg));
      if (bg.kind === 'solid') show(solidInput, bg.color);
      grads.forEach((b, i) => mark(b, bg.kind === 'gradient' && same(bg.from, GRADIENTS[i][0]) && same(bg.to, GRADIENTS[i][1])));
      for (const w of [fromWrap, toWrap]) w.classList.toggle('ed-sel', bg.kind === 'gradient' && !isPreset(bg));
      if (bg.kind === 'gradient') {
        show(fromInput, bg.from);
        show(toInput, bg.to);
      }
      mark(wallpaper, bg.kind === 'image' && bg.from === 'wallpaper');
      mark(file, bg.kind === 'image' && bg.from === 'file');
      if (Number(padding.value) !== pad) padding.value = String(pad);
    },
  };
}
