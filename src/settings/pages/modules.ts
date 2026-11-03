import type { ShotKeys } from '../../bridge';
import { fill, hostStrings } from '../../i18n';
import { formatBytes } from '../../kit/format';
import { isModule, type ModuleInfo } from '../../modules/types';
import { DEFAULT_LABELS } from '../../shot/keys';
import { button, el, group, head, note, row, toggle } from '../controls';
import { icon } from '../icons';
import type { PageContext, PageRender } from '../types';

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

  function onDown(e: MouseEvent): void {
    if (!(e.target instanceof Element) || !e.target.closest('.keycap.recording')) stopAndDraw();
  }

  function onKey(e: KeyboardEvent): void {
    const which = recording;
    if (!which) return;
    e.preventDefault();
    e.stopPropagation();
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    if (e.key === 'Escape' && plain) {
      stopAndDraw();
      return;
    }
    if (MODIFIER.test(e.code)) return;
    ctx.bridge.shotSetKey(which, { code: e.code, cmd: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey }).then(next => {
      if (gone || recording !== which) return;
      keys = next;
      stopAndDraw();
    }, reason => {
      if (gone || recording !== which) return;
      error = reason === 'duplicate' ? fill(s.duplicate, { row: names[which === 'screen' ? 'pick' : 'screen'] }) : s.invalid;
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

// Each module's own settings, shown on its page; the rest say they have none.
export const MODULE_SETTINGS: Record<string, (ctx: PageContext) => HTMLElement> = {
  screenshot: screenshotKeys,
  cleaner: cleanerSettings,
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

function back(ctx: PageContext): HTMLElement {
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
    side: button('modules.add', s.add, () => ctx.go({ page: 'add' }), true),
  }));
  if (installed.length === 0) {
    page.append(note(s.none));
    return page;
  }
  page.append(group(...installed.map(m => {
    const r = moduleRow(ctx, m, onSwitch(ctx, m), icon('chev'));
    // The row opens the module's page; the switch stops its own clicks.
    r.dataset.key = `module.${m.id}`;
    r.setAttribute('role', 'button');
    r.tabIndex = 0;
    const open = () => ctx.go({ page: 'module', id: m.id });
    r.addEventListener('click', open);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === r) open(); });
    return r;
  })));
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

export const addPage: PageRender = ctx => {
  const s = ctx.strings.modules;
  const missing = ctx.state.modules.filter(m => !m.installed && isModule(m));
  const page = el('div');
  page.append(back(ctx), head({ title: s.addTitle, sub: s.addSub }));
  if (missing.length === 0) {
    page.append(note(s.addNone));
    return page;
  }
  page.append(group(...missing.map(m => {
    const key = `add.${m.id}`;
    return moduleRow(ctx, m, button(key, s.addOne, () => {
      const pending = ctx.bridge.reinstallModule(m.id);
      ctx.save(key, pending);
      pending.then(() => ctx.go({ page: 'modules' }), () => {});
    }));
  })));
  return page;
};
