import { fill, systemNames } from '../../i18n';
import { button, el, group, head, note, row } from '../controls';
import type { PageContext, PageRender, UninstallPreview } from '../types';
import { UNINSTALL_CONFIRM_MS } from './modules';

// A danger button that asks once more: the first click turns it into "Sure?
// Click again" for a few seconds, the second runs `act`.
function confirmButton(ctx: PageContext, key: string, label: string, act: () => void): HTMLButtonElement {
  const sure = ctx.strings.modules.uninstallConfirm;
  let cancel: (() => void) | null = null;
  const reset = () => {
    cancel = null;
    b.textContent = label;
    b.classList.remove('confirm');
  };
  const b = button(key, label, () => {
    if (!cancel) {
      b.textContent = sure;
      b.classList.add('confirm');
      cancel = ctx.env.setTimer(reset, UNINSTALL_CONFIRM_MS);
      return;
    }
    cancel();
    reset();
    act();
  });
  b.classList.add('danger');
  ctx.onCleanup(() => cancel?.());
  return b;
}

// Copot Notching (owner, 4 Nov): let go of every permission, or take Notching
// off this Mac. Both ask twice; everything taken goes to the Trash.
export const uninstallPage: PageRender = ctx => {
  const s = ctx.strings.uninstall;
  const page = el('div');

  // Permissions: the hint says what happened.
  const permHint = (text: string, err = false) => {
    const small = permRow.querySelector('small')!;
    small.textContent = text;
    small.classList.toggle('err', err);
  };
  const release = confirmButton(ctx, 'uninstall.permissions', s.release, () => {
    release.disabled = true;
    ctx.bridge.releasePermissions().then(
      () => permHint(s.released),
      (e: unknown) => permHint(fill(s.releaseFailed, { reason: String(e) }), true),
    ).finally(() => { release.disabled = false; });
  });
  const hint = fill(s.permissionsHint, systemNames(ctx.lang, ctx.state.macos));
  const permRow = row({ key: 'uninstall.permissions', label: s.permissions, hint, control: release });

  // The app: off in a dev build; what goes to the Trash listed under it.
  const appHint = (text: string, err = false) => {
    const small = appRow.querySelector('small')!;
    small.textContent = text;
    small.classList.toggle('err', err);
  };
  const remove = confirmButton(ctx, 'uninstall.app', s.uninstall, () => {
    remove.disabled = true;
    ctx.bridge.uninstallNotching().then(
      () => appHint(s.done),
      (e: unknown) => {
        remove.disabled = false;
        appHint(fill(s.failed, { reason: String(e) }), true);
      },
    );
  });
  remove.disabled = true;
  const appRow = row({ key: 'uninstall.app', label: s.uninstall, hint: s.uninstallHint, control: remove });
  const list = el('div', 'uninstall-list');

  const show = (p: UninstallPreview) => {
    remove.disabled = p.app === null;
    if (p.app === null) appHint(s.devOnly);
    const items = [...(p.app ? [p.app] : []), ...p.files];
    list.replaceChildren(
      el('div', 'grp-label', s.goes),
      ...(items.length ? [group(...items.map((path, i) => row({ key: `uninstall.item.${i}`, label: path })))] : [note(s.nothing)]),
    );
  };
  ctx.bridge.uninstallPreview().then(show, () => {});

  page.append(
    head({ title: ctx.strings.sections.uninstall, sub: s.sub }),
    el('div', 'grp-label', s.permissionsGroup), group(permRow),
    el('div', 'grp-label', s.appGroup), group(appRow),
    list,
    note(s.trashNote),
  );
  return page;
};
