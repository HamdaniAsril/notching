import { button, el, group, head, note, row } from '../controls';
import type { PageRender } from '../types';

// Modules that need Accessibility (Keyboard Cleaning Mode), with what macOS says
// now and a way to System Settings. macOS gives no event when it changes, so the
// page asks again every 2 s while it is open. Without such modules it says so.
export const ACCESS_POLL_MS = 2000;

export const permissionsPage: PageRender = ctx => {
  const s = ctx.strings.permissions;
  const page = el('div');
  const needing = ctx.state.modules.filter(m => m.installed && m.permissions.includes('accessibility'));
  if (needing.length === 0) {
    page.append(head({ title: ctx.strings.sections.permissions, sub: s.sub }), note(s.note));
    return page;
  }
  const states: HTMLElement[] = [];
  const show = (on: boolean) => states.forEach(e => {
    e.textContent = on ? s.granted : s.missing;
    e.classList.toggle('on', on);
  });
  const rows = needing.map(m => {
    const state = el('span', 'perm-state');
    states.push(state);
    return row({ key: `permission.${m.id}.accessibility`, label: `${m.name} · ${s.accessibility}`, hint: s.accessibilityHint, control: state });
  });
  show(ctx.info.accessibility);
  page.append(
    head({ title: ctx.strings.sections.permissions, sub: s.need }),
    group(...rows),
    button('permissions.open', s.open, () => void ctx.bridge.openAccessibility()),
  );
  let stop = () => {};
  const poll = () => {
    stop = ctx.env.setTimer(() => {
      ctx.bridge.settings().then(info => show(info.accessibility), () => {}).finally(poll);
    }, ACCESS_POLL_MS);
  };
  poll();
  ctx.onCleanup(() => stop());
  return page;
};

export const aboutPage: PageRender = ctx => {
  const s = ctx.strings.about;
  const page = el('div');
  page.append(
    head({ title: ctx.strings.sections.about }),
    el('div', 'app-name', s.name),
    group(row({ key: 'about.version', label: s.version, control: el('span', 'mono', ctx.info.version) })),
    note(s.trust),
    note(s.later),
  );
  return page;
};
