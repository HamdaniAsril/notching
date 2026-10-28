import { CONFIG_RANGES, DEFAULT_CONFIG, type NotchConfig } from '../../notch/config';
import { button, el, group, head, slider } from '../controls';
import { mountPreview } from '../preview';
import type { PageRender } from '../types';

// The four sliders (spec 4.3): the preview follows every move, the real notch
// follows on release, when the value is saved.
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

  const reset = button('look.reset', s.reset, () => {
    local = { ...DEFAULT_CONFIG };
    preview.setConfig(local);
    ctx.save('look.reset', ctx.bridge.setNotchConfig(local));
  });
  const foot = el('div', 'foot');
  foot.append(el('span'), reset);

  const page = el('div');
  page.append(head({ title: ctx.strings.sections.look }), box, el('small', 'preview-hint', s.previewHint),
    group(...rows), foot);
  return page;
};
