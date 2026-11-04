import type { ShotKeys } from '../../bridge';
import { fill, hostStrings } from '../../i18n';
import { formatBytes } from '../../kit/format';
import { isModule, isTool, type ModuleInfo } from '../../modules/types';
import { DEFAULT_LABELS } from '../../shot/keys';
import { button, el, group, head, note, row, toggle } from '../controls';
import { icon } from '../icons';
import type { PageContext, PageRender, SettingsInfo, WindowKey } from '../types';

export const UNINSTALL_CONFIRM_MS = 4000;

type Which = 'screen' | 'pick';

// Keys that only modify: pressed alone while recording, they wait for the rest.
const MODIFIER = /^(Shift|Control|Alt|Meta|CapsLock|Fn)/;

// Screenshot's page (design 1 Nov §4, §10; design 3 Nov tombol §6): its two keys,
// each recorded by clicking it and pressing new ones. Under a key, who holds it
// when it does not reach Notching; the Mac's own shortcuts can be changed in
// System Settings, so they get a button there. While a key is recorded,
// Notching's keys let go, so ⌘⇧4 does not open the picker here.
function screenshotKeys(ctx: PageContext): HTMLElement {
  const box = el('div', 'shot-keys');
  const s = ctx.strings.shotKeys;
  const names: Record<Which, string> = { screen: s.screen, pick: s.pick };
  let keys: ShotKeys = { screen: 'off', pick: 'off', labels: { ...DEFAULT_LABELS }, custom: false };
  let recording: Which | null = null;
  let pending: Which | null = null; // a key on its way to the core
  let error = '';
  let gone = false;

  function stop(): void {
    if (!recording) return;
    recording = null;
    error = '';
    doc().removeEventListener('keydown', onKey, true);
    doc().removeEventListener('mousedown', onDown, true);
    window.removeEventListener('blur', stopAndDraw);
    void ctx.bridge.shotKeysHold(false).catch(() => {});
  }

  function stopAndDraw(): void {
    stop();
    draw();
  }

  function start(which: Which): void {
    stop();
    recording = which;
    doc().addEventListener('keydown', onKey, true);
    doc().addEventListener('mousedown', onDown, true);
    window.addEventListener('blur', stopAndDraw);
    void ctx.bridge.shotKeysHold(true).catch(() => {});
    draw();
  }

  // A press elsewhere ends the recording, but the page is redrawn only after the
  // button under the pointer got its click: replaced at mousedown, it would get none.
  function onDown(e: MouseEvent): void {
    if (e.target instanceof Element && e.target.closest('.keycap.recording')) return;
    stop();
    doc().addEventListener('mouseup', () => setTimeout(draw, 0), { once: true });
  }

  function onKey(e: KeyboardEvent): void {
    const which = recording;
    if (!which) return;
    e.preventDefault();
    e.stopPropagation();
    // One key at a time: what was pressed is being saved, so the row shows that.
    if (pending) return;
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    if (e.key === 'Escape' && plain) {
      stopAndDraw();
      return;
    }
    if (MODIFIER.test(e.code)) return;
    pending = which;
    ctx.bridge.shotSetKey(which, { code: e.code, cmd: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey }).then(next => {
      pending = null;
      if (gone) return;
      keys = next;
      if (recording === which) {
        stopAndDraw();
        return;
      }
      // The core put the keys back for the new key; the other row still records.
      if (recording) void ctx.bridge.shotKeysHold(true).catch(() => {});
      draw();
    }, reason => {
      pending = null;
      if (gone || recording !== which) return;
      error = reason === 'duplicate' ? fill(s.duplicate, { row: names[which === 'screen' ? 'pick' : 'screen'] })
        : reason === 'tool' ? s.tool : s.invalid;
      draw();
    });
  }

  function held(which: Which): string {
    const state = keys[which];
    if (state === 'mac' || state === 'shortcut' || state === 'other') return s[state];
    return '';
  }

  function keyRow(which: Which): HTMLElement {
    const key = `module.screenshot.key.${which}`;
    const on = recording === which;
    const cap = button(key, on ? s.recording : keys.labels[which], () => (on ? undefined : start(which)));
    cap.classList.add('keycap');
    cap.classList.toggle('recording', on);
    const r = row({ key, label: names[which], hint: (on && error) || held(which) || undefined, control: cap });
    if (on && error) r.querySelector('small')?.classList.add('err');
    return r;
  }

  function draw(): void {
    if (gone) return;
    const parts: HTMLElement[] = [el('div', 'grp-label', s.title), group(keyRow('screen'), keyRow('pick'))];
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
    const focused = box.contains(doc().activeElement) ? (doc().activeElement as HTMLElement).dataset.key : undefined;
    box.replaceChildren(...parts);
    if (focused) box.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
  }

  function doc(): Document {
    return box.ownerDocument;
  }

  ctx.onCleanup(() => {
    gone = true;
    stop();
  });
  draw();
  ctx.bridge.shotKeys().then(next => {
    keys = next;
    draw();
  }, () => {});
  return box;
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
  return wrap('perms tool-access', el('div', 'grp-label', s.access),
    group(row({ key: `tool.${m.id}.access`, label: s.accessibility, hint: s.accessibilityHint, control: ctl })));
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

// Atur jendela's page: its permission and its nine keys drawn as the 3×3 grid
// they make on the keyboard. A key someone else holds is marked and named below.
function windowSettings(ctx: PageContext): HTMLElement {
  const s = ctx.strings.tools;
  const m = ctx.state.modules.find(x => x.id === 'window-keys')!;
  const box = el('div', 'tool-keys');
  let gone = false;
  const draw = (keys: WindowKey[]) => {
    if (gone) return;
    const grid = el('div', 'win-grid');
    grid.append(...keys.map(k => {
      const cap = keycap(k.label.replace('⌃⌥', ''), `${k.label} · ${s.cells[k.cell]}`);
      cap.dataset.cell = k.cell;
      cap.classList.toggle('taken', k.state === 'other' || k.state === 'shortcut' || k.state === 'mac');
      return cap;
    }));
    const lead = wrap('win-lead', keycap('⌃'), keycap('⌥'), el('span', 'win-plus', '+'));
    const taken = (state: WindowKey['state']) => keys.filter(k => k.state === state).map(k => k.label).join(', ');
    const notes = [
      taken('other') && fill(s.other, { keys: taken('other') }),
      [taken('shortcut'), taken('mac')].filter(Boolean).join(', ') && fill(s.shortcut, { keys: [taken('shortcut'), taken('mac')].filter(Boolean).join(', ') }),
    ].filter(Boolean).map(t => {
      const p = note(t);
      p.classList.add('err');
      return p;
    });
    box.replaceChildren(el('div', 'grp-label', s.keys), group(wrap('win-keys', lead, grid)), note(s.windowNote), ...notes);
  };
  ctx.onCleanup(() => { gone = true; });
  ctx.bridge.windowKeys().then(draw, () => {});
  return wrap(undefined, toolAccess(ctx, m), box);
}

// Each module's own settings, shown on its page; the rest say they have none.
export const MODULE_SETTINGS: Record<string, (ctx: PageContext) => HTMLElement> = {
  screenshot: screenshotKeys,
  cleaner: cleanerSettings,
  'cut-files': cutSettings,
  'window-keys': windowSettings,
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

export function back(ctx: PageContext): HTMLElement {
  const b = el('button', 'back');
  b.type = 'button';
  b.dataset.key = 'module.back';
  b.append(icon('back'), el('span', undefined, ctx.strings.sections.modules));
  b.addEventListener('click', () => ctx.go({ page: 'modules' }));
  return b;
}

export const modulesPage: PageRender = ctx => {
  const s = ctx.strings.modules;
  const installed = ctx.state.modules.filter(m => m.installed && isModule(m));
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
  const opening = (m: ModuleInfo) => {
    const r = moduleRow(ctx, m, onSwitch(ctx, m), icon('chev'));
    // The row opens the module's page; the switch stops its own clicks.
    r.dataset.key = `module.${m.id}`;
    r.setAttribute('role', 'button');
    r.tabIndex = 0;
    const open = () => ctx.go({ page: 'module', id: m.id });
    r.addEventListener('click', open);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === r) open(); });
    return r;
  };
  const modules = installed.filter(m => !isTool(m));
  const tools = installed.filter(isTool);
  if (modules.length) page.append(group(...modules.map(opening)));
  // Background tools under their own label (design 4 Nov, alat latar §7).
  if (tools.length) page.append(el('div', 'grp-label tools', s.tools), group(...tools.map(opening)));
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
  page.append(back(ctx), top);
  if (status) page.append(status);
  if (own) page.append(own(ctx));
  else if (!status) page.append(note(s.noSettings));
  page.append(foot, el('p', 'note small', s.uninstallNote));
  return page;
};
