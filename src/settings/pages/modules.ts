import type { ShotKeys } from '../../bridge';
import { fill, hostStrings } from '../../i18n';
import { formatBytes } from '../../kit/format';
import { isModule, isTool, MODULE_CATEGORIES, type ModuleCategory, type ModuleInfo } from '../../modules/types';
import { DEFAULT_LABELS } from '../../shot/keys';
import { button, el, group, head, note, row, toggle } from '../controls';
import { icon } from '../icons';
import type { PageContext, PageRender, SettingsInfo, ShotKeyPress, WindowCell, WindowKey, WindowKeyError } from '../types';

export const UNINSTALL_CONFIRM_MS = 4000;

type Which = 'screen' | 'pick';

// Keys that only modify: pressed alone while recording, they wait for the rest.
const MODIFIER = /^(Shift|Control|Alt|Meta|CapsLock|Fn)/;

// Records new keys for one of a page's keys at a time (design 3 Nov tombol §6):
// while it listens, Notching's keys let go, so pressing one of them here reaches
// the page; Esc, a press elsewhere or leaving the window cancels; a refused key
// keeps it listening, with the reason.
export interface Recorder<W> {
  at(): W | null; // the key listening
  error(): string;
  start(which: W): void;
  stop(): void;
}

export function recorder<W, R>(ctx: PageContext, box: HTMLElement, o: {
  save(which: W, key: ShotKeyPress): Promise<R>;
  saved(next: R): void;
  refused(which: W, reason: unknown): string;
  draw(): void;
  gone(): boolean;
}): Recorder<W> {
  let recording: W | null = null;
  let pending = false; // a key on its way to the core
  let error = '';
  const doc = () => box.ownerDocument;

  function stop(): void {
    if (recording === null) return;
    recording = null;
    error = '';
    doc().removeEventListener('keydown', onKey, true);
    doc().removeEventListener('mousedown', onDown, true);
    window.removeEventListener('blur', stopAndDraw);
    void ctx.bridge.shotKeysHold(false).catch(() => {});
  }

  function stopAndDraw(): void {
    stop();
    o.draw();
  }

  function start(which: W): void {
    stop();
    recording = which;
    doc().addEventListener('keydown', onKey, true);
    doc().addEventListener('mousedown', onDown, true);
    window.addEventListener('blur', stopAndDraw);
    void ctx.bridge.shotKeysHold(true).catch(() => {});
    o.draw();
  }

  // A press elsewhere ends the recording, but the page is redrawn only after the
  // button under the pointer got its click: replaced at mousedown, it would get none.
  function onDown(e: MouseEvent): void {
    if (e.target instanceof Element && box.contains(e.target) && e.target.closest('.keycap.recording')) return;
    stop();
    doc().addEventListener('mouseup', () => setTimeout(o.draw, 0), { once: true });
  }

  function onKey(e: KeyboardEvent): void {
    const which = recording;
    if (which === null) return;
    e.preventDefault();
    e.stopPropagation();
    // One key at a time: what was pressed is being saved, so the key shows that.
    if (pending) return;
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    if (e.key === 'Escape' && plain) {
      stopAndDraw();
      return;
    }
    if (MODIFIER.test(e.code)) return;
    pending = true;
    o.save(which, { code: e.code, cmd: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey }).then(next => {
      pending = false;
      if (o.gone()) return;
      o.saved(next);
      if (recording === which) {
        stopAndDraw();
        return;
      }
      // The core put the keys back for the new key; another key still records.
      if (recording !== null) void ctx.bridge.shotKeysHold(true).catch(() => {});
      o.draw();
    }, reason => {
      pending = false;
      if (o.gone() || recording !== which) return;
      error = o.refused(which, reason);
      o.draw();
    });
  }

  return { at: () => recording, error: () => error, start, stop };
}

// Screenshot's page (design 1 Nov §4, §10; design 3 Nov tombol §6): its two keys,
// each recorded by clicking it and pressing new ones. Under a key, who holds it
// when it does not reach Notching; the Mac's own shortcuts can be changed in
// System Settings, so they get a button there.
export function screenshotKeys(ctx: PageContext, title?: string): HTMLElement {
  const box = el('div', 'shot-keys');
  const s = ctx.strings.shotKeys;
  const names: Record<Which, string> = { screen: s.screen, pick: s.pick };
  let keys: ShotKeys = { screen: 'off', pick: 'off', labels: { ...DEFAULT_LABELS }, custom: false };
  let gone = false;
  const rec = recorder<Which, ShotKeys>(ctx, box, {
    save: (which, key) => ctx.bridge.shotSetKey(which, key),
    saved: next => { keys = next; },
    refused: (which, reason) => (reason === 'duplicate' ? fill(s.duplicate, { row: names[which === 'screen' ? 'pick' : 'screen'] })
      : reason === 'tool' ? s.tool : reason === 'app' ? s.app : s.invalid),
    draw: () => draw(),
    gone: () => gone,
  });

  function held(which: Which): string {
    const state = keys[which];
    if (state === 'mac' || state === 'shortcut' || state === 'other') return s[state];
    return '';
  }

  function keyRow(which: Which): HTMLElement {
    const key = `module.screenshot.key.${which}`;
    const on = rec.at() === which;
    const cap = button(key, on ? s.recording : keys.labels[which], () => (on ? undefined : rec.start(which)));
    cap.classList.add('keycap');
    cap.classList.toggle('recording', on);
    const r = row({ key, label: names[which], hint: (on && rec.error()) || held(which) || undefined, control: cap });
    if (on && rec.error()) r.querySelector('small')?.classList.add('err');
    return r;
  }

  function draw(): void {
    if (gone) return;
    const parts: HTMLElement[] = [el('div', 'grp-label', title ?? s.title), group(keyRow('screen'), keyRow('pick'))];
    const foot = el('div', 'shot-keys-foot');
    if ([keys.screen, keys.pick].some(k => k === 'mac' || k === 'shortcut')) {
      foot.append(button('module.screenshot.keys', s.open, () => void ctx.bridge.openKeyboardShortcuts()));
    }
    if (keys.custom) {
      foot.append(button('module.screenshot.reset', s.reset, () => {
        ctx.bridge.shotResetKeys().then(next => {
          keys = next;
          draw();
        }, () => {});
      }));
    }
    if (foot.childElementCount) parts.push(foot);
    redraw(box, parts);
  }

  ctx.onCleanup(() => {
    gone = true;
    rec.stop();
  });
  draw();
  ctx.bridge.shotKeys().then(next => {
    keys = next;
    draw();
  }, () => {});
  return box;
}

// `box` holding `parts` now, keeping the focus on the same key.
export function redraw(box: HTMLElement, parts: HTMLElement[]): void {
  const active = box.ownerDocument.activeElement;
  const focused = active instanceof HTMLElement && box.contains(active) ? active.dataset.key : undefined;
  box.replaceChildren(...parts);
  if (focused) box.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
}

// Cleaner's page (design 1 Nov §9): the never-clean list, each with a way off
// it, and the log in Finder. A list that can't be read says so; then Cleaner
// cleans nothing.
function cleanerSettings(ctx: PageContext): HTMLElement {
  const box = el('div', 'cl-ex');
  const s = hostStrings(ctx.lang).cleaner;
  const list = el('div', 'cl-ex-list');
  const show = () => {
    ctx.bridge.cleanerExclusions().then(({ home, paths }) => {
      if (paths.length === 0) {
        list.replaceChildren(note(s.exclusionsEmpty));
        return;
      }
      const tilde = (p: string) => (home && p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p);
      list.replaceChildren(group(...paths.map((p, i) => row({
        key: `module.cleaner.ex.${i}`,
        label: tilde(p),
        control: button(`module.cleaner.unexclude.${i}`, s.unexclude, () => void ctx.bridge.cleanerUnexclude(p).then(show, () => {})),
      }))));
    }, () => list.replaceChildren(note(s.exclusionsBroken)));
  };
  show();
  box.append(head({ title: s.exclusions }), list, button('module.cleaner.log', s.openLog, () => void ctx.bridge.cleanerOpenLog()));
  return box;
}

// A tool's permission row (design 4 Nov, alat latar §7): what macOS says now and
// the way to System Settings. Asked again as the window hears new settings.
function toolAccess(ctx: PageContext, m: ModuleInfo): HTMLElement {
  return wrap('perms tool-access', el('div', 'grp-label', ctx.strings.tools.access), group(accessRow(ctx, m)));
}

function accessRow(ctx: PageContext, m: ModuleInfo): HTMLElement {
  const s = ctx.strings.tools;
  const state = el('span', 'perm-state');
  state.append(el('i', 'perm-dot'), el('span'));
  const show = (info: SettingsInfo) => {
    state.lastChild!.textContent = info.accessibility ? s.granted : s.missing;
    state.classList.toggle('on', info.accessibility);
  };
  show(ctx.info);
  ctx.onCleanup(ctx.bridge.onSettings(show));
  const ctl = el('div', 'ctl');
  ctl.append(state, button(`tool.${m.id}.open`, s.open, () => void ctx.bridge.openAccessibility()));
  return row({ key: `tool.${m.id}.access`, label: s.accessibility, hint: s.accessibilityHint, control: ctl });
}

// A div holding `children`.
function wrap(className: string | undefined, ...children: HTMLElement[]): HTMLElement {
  const d = el('div', className);
  d.append(...children);
  return d;
}

function keycap(text: string, label?: string): HTMLElement {
  const cap = el('span', 'btn keycap', text);
  if (label) cap.setAttribute('aria-label', label);
  return cap;
}

// Potong file's page: its permission and its two fixed keys.
function cutSettings(ctx: PageContext): HTMLElement {
  const s = ctx.strings.tools;
  const m = ctx.state.modules.find(x => x.id === 'cut-files')!;
  const keys = wrap('tool-keys', el('div', 'grp-label', s.keys), group(
    row({ key: 'tool.cut-files.cut', label: s.cut, control: keycap('⌘X') }),
    row({ key: 'tool.cut-files.paste', label: s.paste, control: keycap('⌘V') }),
  ), note(s.cutNote));
  return wrap(undefined, toolAccess(ctx, m), keys);
}

// Shelf (owner, 5 Nov): open as soon as a file drag starts, or when it reaches the notch.
function shelfSettings(ctx: PageContext): HTMLElement {
  const s = ctx.strings.modules;
  return group(row({
    key: 'module.shelf.drag', label: s.shelfDrag, hint: s.shelfDragHint,
    control: toggle('module.shelf.drag', s.shelfDrag, ctx.state.shelfOpenOnDrag,
      on => ctx.save('module.shelf.drag', ctx.bridge.setShelfOpenOnDrag(on))),
  }));
}

// A background tool on Pintasan (owner, 4 Nov): its row folds open in place,
// showing its permission and its keys inside the same card, instead of a page.
export function toolFold(ctx: PageContext, m: ModuleInfo): HTMLElement[] {
  const s = ctx.strings.tools;
  const head = moduleRow(ctx, m, onSwitch(ctx, m), icon('chev'));
  head.classList.add('fold-head');
  head.dataset.key = `module.${m.id}`;
  head.setAttribute('role', 'button');
  head.setAttribute('aria-expanded', 'false');
  head.tabIndex = 0;
  const body = el('div', 'fold-body perms');
  body.hidden = true;
  const keys = m.id === 'window-keys'
    ? windowKeysBox(ctx, true)
    : row({ key: 'tool.cut-files.keys', label: s.keys, hint: s.cutNote, control: wrap('ctl', keycap('⌘X', s.cut), keycap('⌘V', s.paste)) });
  body.append(accessRow(ctx, m), keys);
  const toggle = () => {
    body.hidden = !body.hidden;
    head.setAttribute('aria-expanded', String(!body.hidden));
    head.classList.toggle('open', !body.hidden);
  };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === head) toggle(); });
  return [head, body];
}

// Atur jendela's page: its permission and its nine keys drawn as the 3×3 grid
// they make on the keyboard. A key someone else holds is marked and named below.
// Clicking a key records a new one for that cell (design 4 Nov tombol atur
// jendela §3); when all nine share their modifiers, those stand in front.
function windowSettings(ctx: PageContext): HTMLElement {
  const m = ctx.state.modules.find(x => x.id === 'window-keys')!;
  return wrap(undefined, toolAccess(ctx, m), windowKeysBox(ctx, false));
}

// The positions as listed, halves first, then corners, then the rest (owner, 4 Nov).
const WINDOW_ORDER: WindowCell[] = ['left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'center', 'fill'];

// The keys until changed (owner, 4 Nov).
const DEFAULT_WINDOW_LABELS: Record<WindowCell, string> = {
  left: '⌃⌥←', right: '⌃⌥→', top: '⌃⌥↑', bottom: '⌃⌥↓',
  topLeft: '⌃⌥;', topRight: "⌃⌥'", bottomLeft: '⌃⌥.', bottomRight: '⌃⌥/',
  center: '⌃⌥\\', fill: '⌃⌥↩',
};

// Where a position puts the window inside the screen's 19 × 11 area, in the
// icon's 26 × 18 box: [x, y, width, height].
const HALF_W = 9;
const HALF_H = 5;
const AREA = { x: 3.5, y: 3.5, w: 19, h: 11 };
function windowArea(cell: WindowCell): [number, number, number, number] {
  const { x, y, w, h } = AREA;
  const right = x + w - HALF_W;
  const low = y + h - HALF_H;
  switch (cell) {
    case 'left': return [x, y, HALF_W, h];
    case 'right': return [right, y, HALF_W, h];
    case 'top': return [x, y, w, HALF_H];
    case 'bottom': return [x, low, w, HALF_H];
    case 'topLeft': return [x, y, HALF_W, HALF_H];
    case 'topRight': return [right, y, HALF_W, HALF_H];
    case 'bottomLeft': return [x, low, HALF_W, HALF_H];
    case 'bottomRight': return [right, low, HALF_W, HALF_H];
    case 'center': return [x + (w - HALF_W) / 2, y + (h - HALF_H) / 2, HALF_W, HALF_H];
    case 'fill': return [x, y, w, h];
  }
}

// A small screen with the part a position fills in the accent. Fixed numbers,
// so it may go in as markup.
function windowIcon(cell: WindowCell): HTMLElement {
  const [x, y, w, h] = windowArea(cell);
  const i = el('span', 'win-pos');
  i.setAttribute('aria-hidden', 'true');
  i.innerHTML = `<svg viewBox="0 0 26 18"><rect class="screen" x="1" y="1" width="24" height="16" rx="3.5"/>`
    + `<rect class="area" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5"/></svg>`;
  return i;
}

// The keys, one row per position with its picture, name and key (owner, 4 Nov).
// Clicking a key records a new one; a key someone else holds says who.
// `folded` draws the rows straight into a card already open (Pintasan).
function windowKeysBox(ctx: PageContext, folded: boolean): HTMLElement {
  const s = ctx.strings.tools;
  const held = ctx.strings.shotKeys;
  const box = el('div', folded ? 'tool-keys fold-keys' : 'tool-keys');
  let keys: WindowKey[] | null = null;
  let gone = false;
  const rec = recorder<WindowCell, WindowKey[]>(ctx, box, {
    save: (cell, key) => ctx.bridge.windowSetKey(cell, key),
    saved: next => { keys = next; },
    refused: (_cell, reason) => {
      const r = reason as WindowKeyError | undefined;
      return r?.kind === 'duplicate' ? fill(s.duplicate, { cell: s.cells[r.cell] }) : r?.kind === 'shot' ? s.shot
        : r?.kind === 'app' ? s.app : s.invalid;
    },
    draw: () => draw(),
    gone: () => gone,
  });

  function keyRow(k: WindowKey): HTMLElement {
    const key = `tool.window-keys.${k.cell}`;
    const on = rec.at() === k.cell;
    const taken = !on && (k.state === 'other' || k.state === 'shortcut' || k.state === 'mac');
    const cap = button(key, on ? held.recording : k.label, () => (on ? undefined : rec.start(k.cell)));
    cap.classList.add('keycap');
    cap.classList.toggle('recording', on);
    cap.classList.toggle('taken', taken);
    const hint = on ? rec.error() || fill(s.record, { cell: s.cells[k.cell] }) : taken ? held[k.state as 'other' | 'shortcut' | 'mac'] : '';
    const r = row({ key, label: s.cells[k.cell], hint: hint || undefined, control: cap });
    r.classList.add('win-row');
    r.prepend(windowIcon(k.cell));
    if ((on && rec.error()) || taken) r.querySelector('small')?.classList.add('err');
    return r;
  }

  function draw(): void {
    if (gone || !keys) return;
    const byCell = new Map(keys.map(k => [k.cell, k]));
    const rows = WINDOW_ORDER.flatMap(c => (byCell.has(c) ? [keyRow(byCell.get(c)!)] : []));
    const parts: HTMLElement[] = folded ? rows : [el('div', 'grp-label', s.keys), group(...rows)];
    const foot: HTMLElement[] = [note(s.windowNote)];
    if (keys.some(k => k.label !== DEFAULT_WINDOW_LABELS[k.cell])) {
      const reset = el('div', 'shot-keys-foot');
      reset.append(button('tool.window-keys.reset', s.reset, () => {
        rec.stop();
        ctx.bridge.windowResetKeys().then(next => {
          keys = next;
          draw();
        }, () => {});
      }));
      foot.push(reset);
    }
    parts.push(folded ? wrap('win-foot', ...foot) : wrap(undefined, ...foot));
    redraw(box, parts);
  }

  ctx.onCleanup(() => {
    gone = true;
    rec.stop();
  });
  ctx.bridge.windowKeys().then(next => {
    keys = next;
    draw();
  }, () => {});
  return box;
}

// Each module's own settings, shown on its page; the rest say they have none.
export const MODULE_SETTINGS: Record<string, (ctx: PageContext) => HTMLElement> = {
  screenshot: screenshotKeys,
  cleaner: cleanerSettings,
  'cut-files': cutSettings,
  'window-keys': windowSettings,
  shelf: shelfSettings,
};

// The module's own SVG as a mask in the text colour, like the pill. The SVG never
// enters the DOM, so nothing in the file can run.
export function moduleIcon(svg: string): HTMLElement {
  if (!svg) return icon('grid');
  const glyph = el('i', 'glyph');
  glyph.style.setProperty('--icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  return glyph;
}

function onSwitch(ctx: PageContext, m: ModuleInfo): HTMLElement {
  const key = `module.${m.id}.on`;
  return toggle(key, m.name, m.enabled, on => ctx.save(key, ctx.bridge.setModuleEnabled(m.id, on)));
}

function moduleRow(ctx: PageContext, m: ModuleInfo, ...controls: HTMLElement[]): HTMLElement {
  const r = el('div', 'row module');
  r.dataset.row = `module.${m.id}`;
  const t = el('div', 't');
  t.append(el('span', 'label', m.name), el('small', undefined, m.description));
  r.append(moduleIcon(m.iconSvg), t, el('span', 'size', formatBytes(m.size, ctx.lang)), ...controls);
  return r;
}

// Back to where the page was listed: Pintasan for a background tool, else Modul.
export function back(ctx: PageContext, to: 'modules' | 'shortcuts' = 'modules'): HTMLElement {
  const b = el('button', 'back');
  b.type = 'button';
  b.dataset.key = 'module.back';
  b.append(icon('back'), el('span', undefined, ctx.strings.sections[to]));
  b.addEventListener('click', () => ctx.go({ page: to }));
  return b;
}

// A module's row that opens its page; its switch stops its own clicks.
export function moduleLink(ctx: PageContext, m: ModuleInfo): HTMLElement {
  const r = moduleRow(ctx, m, onSwitch(ctx, m), icon('chev'));
  r.dataset.key = `module.${m.id}`;
  r.setAttribute('role', 'button');
  r.tabIndex = 0;
  const open = () => ctx.go({ page: 'module', id: m.id });
  r.addEventListener('click', open);
  r.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === r) open(); });
  return r;
}

// The categories folded shut on the Modul page, kept for this Mac only.
const FOLDED_KEY = 'notching.modules.folded';

function foldedCategories(): Set<ModuleCategory> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter((c): c is ModuleCategory => MODULE_CATEGORIES.includes(c)) : []);
  } catch {
    return new Set();
  }
}

function saveFolded(closed: Set<ModuleCategory>): void {
  try {
    localStorage.setItem(FOLDED_KEY, JSON.stringify([...closed]));
  } catch {
    // Without storage the categories open again next time.
  }
}

export const modulesPage: PageRender = ctx => {
  const s = ctx.strings.modules;
  // Background tools are listed on Pintasan instead (owner, 4 Nov).
  const installed = ctx.state.modules.filter(m => m.installed && isModule(m) && !isTool(m));
  const total = installed.reduce((sum, m) => sum + m.size, 0);
  const page = el('div');
  page.append(head({
    title: ctx.strings.sections.modules,
    sub: fill(s.summary, { n: installed.length, size: formatBytes(total, ctx.lang) }),
    side: button('modules.catalog', s.catalog, () => ctx.go({ page: 'catalog' }), true),
  }));
  if (installed.length === 0) {
    page.append(note(s.none));
    return page;
  }
  const opening = (m: ModuleInfo) => moduleLink(ctx, m);
  // One group per category that folds open and shut (owner, 4 Nov); tools sit in
  // theirs with the modules. A category stays listed, empty, until a module joins it.
  const closed = foldedCategories();
  for (const cat of MODULE_CATEGORIES) {
    const members = installed.filter(m => m.category === cat);
    const fold = el('details', 'cat');
    fold.dataset.cat = cat;
    fold.open = members.length > 0 && !closed.has(cat);
    const summary = el('summary', 'cat-head');
    summary.dataset.key = `modules.cat.${cat}`;
    summary.append(icon('chev'), el('span', 'cat-name', s.categories[cat]), el('span', 'n', String(members.length)));
    fold.append(summary, members.length ? group(...members.map(opening)) : note(s.categoryEmpty));
    fold.addEventListener('toggle', () => {
      if (fold.open) closed.delete(cat);
      else closed.add(cat);
      saveFolded(closed);
    });
    page.append(fold);
  }
  return page;
};

export const modulePage: PageRender = (ctx, route) => {
  const s = ctx.strings.modules;
  const m = ctx.state.modules.find(x => route.page === 'module' && x.id === route.id)!;
  const page = el('div');
  const top = head({ title: m.name, sub: m.description, icon: moduleIcon(m.iconSvg), side: onSwitch(ctx, m) });
  top.dataset.row = `module.${m.id}`;

  // Uninstall takes a second click within a few seconds.
  const key = `module.${m.id}.uninstall`;
  let cancel: (() => void) | null = null;
  const reset = () => {
    cancel = null;
    uninstall.textContent = s.uninstall;
    uninstall.classList.remove('confirm');
  };
  const uninstall = button(key, s.uninstall, () => {
    if (!cancel) {
      uninstall.textContent = s.uninstallConfirm;
      uninstall.classList.add('confirm');
      cancel = ctx.env.setTimer(reset, UNINSTALL_CONFIRM_MS);
      return;
    }
    cancel();
    reset();
    const pending = ctx.bridge.uninstallModule(m.id);
    ctx.save(key, pending);
    pending.then(() => ctx.go({ page: 'modules' }), () => {});
  });
  uninstall.classList.add('danger');
  ctx.onCleanup(() => cancel?.());

  const foot = el('div', 'foot');
  foot.append(el('span', 'size', fill(s.versionSize, { version: m.version, size: formatBytes(m.size, ctx.lang) })), uninstall);
  const own = MODULE_SETTINGS[m.id];
  const statusKey = `module.${m.id}.status`;
  const status = m.status
    ? group(row({
      key: statusKey, label: s.status, hint: s.statusHint,
      control: toggle(statusKey, s.status, m.statusShown, on => ctx.save(statusKey, ctx.bridge.setStatusShown(m.id, on))),
    }))
    : null;
  // "No settings" only when there is not even the status switch.
  page.append(back(ctx, isTool(m) ? 'shortcuts' : 'modules'), top);
  if (status) page.append(status);
  if (own) page.append(own(ctx));
  else if (!status) page.append(note(s.noSettings));
  page.append(foot, el('p', 'note small', s.uninstallNote));
  return page;
};
