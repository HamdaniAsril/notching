import { CONFIG_RANGES, DEFAULT_CONFIG, type NotchConfig } from '../../notch/config';
import { ACCENT_PRESETS, accentPalette, applyAccent, DEFAULT_ACCENT } from '../../kit/accent';
import { button, el, group, head, slider, swatches } from '../controls';
import { mountPreview } from '../preview';
import type { PageRender } from '../types';

// The four sliders (spec 4.3): the preview follows every move, the real notch
// follows on release, when the value is saved.
const CUSTOM_SAVE_MS = 300;

export const lookPage: PageRender = ctx => {
  const s = ctx.strings.look;
  let local: NotchConfig = { ...ctx.state.notch };

  const box = el('div');
  const preview = mountPreview(box, local, ctx.env, s.preview);
  ctx.onCleanup(() => preview.destroy());

  const plain = (v: number) => String(v);
  const px = (v: number) => `${v} px`;
  const rows = ([
    ['bounce', s.bounce, plain, undefined],
    ['speed', s.speed, plain, undefined],
    ['dropDepth', s.dropDepth, px, undefined],
    ['thickness', s.thickness, px, s.thicknessHint],
  ] as const).map(([name, label, format, hint]) => {
    const key = `look.${name}`;
    const [min, max] = CONFIG_RANGES[name];
    return slider({
      key, label, hint, min, max, step: 1, value: local[name], format,
      onInput: v => {
        local = { ...local, [name]: v };
        preview.setConfig(local);
      },
      onChange: v => {
        local = { ...local, [name]: v };
        ctx.save(key, ctx.bridge.setNotchConfig(local));
      },
    });
  });

  // Warna aksen (design 3 Nov): a dot saves at once; the custom colour repaints
  // this window while the picker moves and is saved on release.
  const root = box.ownerDocument.documentElement;
  const saved = ctx.state.accentCustom;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const cancelSave = () => clearTimeout(pending);
  ctx.onCleanup(cancelSave);
  const saveCustom = (hex: string) => ctx.save('look.accent', ctx.bridge.setAccent(hex, hex));
  const accent = swatches({
    key: 'look.accent',
    label: s.accent,
    options: ACCENT_PRESETS.map(p => ({ value: p.hex, name: p.name, color: p.hex })),
    value: ctx.state.accent,
    custom: {
      name: s.accentCustom,
      color: saved,
      shown: hex => accentPalette(hex).acc,
      // Saved soon after the picker stops too: WebKit may fire change only when
      // the colour panel closes, which can be after Pengaturan is gone.
      onInput: hex => {
        applyAccent(root, hex);
        cancelSave();
        pending = setTimeout(() => saveCustom(hex), CUSTOM_SAVE_MS);
      },
      onChange: hex => {
        cancelSave();
        applyAccent(root, hex);
        saveCustom(hex);
      },
    },
    onPick: hex => {
      applyAccent(root, hex);
      ctx.save('look.accent', ctx.bridge.setAccent(hex, null));
    },
  });

  const reset = button('look.reset', s.reset, () => {
    local = { ...DEFAULT_CONFIG };
    preview.setConfig(local);
    ctx.save('look.reset', ctx.bridge.setNotchConfig(local));
    accent.mark(DEFAULT_ACCENT);
    applyAccent(root, DEFAULT_ACCENT);
    ctx.save('look.reset', ctx.bridge.setAccent(DEFAULT_ACCENT, null));
  });
  const foot = el('div', 'foot');
  foot.append(el('span'), reset);

  const page = el('div');
  page.append(head({ title: ctx.strings.sections.look }), box, el('small', 'preview-hint', s.previewHint),
    group(accent), group(...rows), foot);
  return page;
};
