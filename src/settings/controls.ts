// Building blocks of the settings pages. A row carries data-row (search
// highlights and error notes find it there); everything that takes focus carries
// a unique data-key, which is how focus survives a re-render.

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function row(o: { key: string; label: string; hint?: string; control?: HTMLElement }): HTMLElement {
  const r = el('div', 'row');
  r.dataset.row = o.key;
  const t = el('div', 't');
  t.append(el('span', 'label', o.label));
  if (o.hint) t.append(el('small', 'hint', o.hint));
  r.append(t);
  if (o.control) r.append(o.control);
  return r;
}

// The look follows the state that comes back from the native side, not the click.
export function toggle(key: string, label: string, on: boolean, onChange: (on: boolean) => void, disabled = false): HTMLElement {
  const b = el('button', on ? 'switch on' : 'switch');
  b.type = 'button';
  b.dataset.key = key;
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(on));
  b.setAttribute('aria-label', label);
  b.disabled = disabled;
  b.addEventListener('click', e => {
    e.stopPropagation();
    onChange(!on);
  });
  return b;
}

export function slider(o: {
  key: string; label: string; hint?: string; min: number; max: number; step: number; value: number;
  format: (v: number) => string; onInput: (v: number) => void; onChange: (v: number) => void;
}): HTMLElement {
  const wrap = el('div', 'range');
  const input = el('input');
  input.type = 'range';
  input.dataset.key = o.key;
  input.min = String(o.min);
  input.max = String(o.max);
  input.step = String(o.step);
  input.value = String(o.value);
  input.setAttribute('aria-label', o.label);
  const val = el('span', 'val', o.format(o.value));
  const fill = () => {
    const pct = ((Number(input.value) - o.min) / (o.max - o.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  };
  fill();
  input.addEventListener('input', () => {
    const v = Number(input.value);
    val.textContent = o.format(v);
    fill();
    o.onInput(v);
  });
  input.addEventListener('change', () => o.onChange(Number(input.value)));
  wrap.append(input, val);
  return row({ key: o.key, label: o.label, hint: o.hint, control: wrap });
}

export function choice<T extends string>(key: string, options: { value: T; label: string }[], value: T,
  onChange: (v: T) => void): HTMLElement {
  const group = el('div', 'choice');
  group.setAttribute('role', 'radiogroup');
  for (const option of options) {
    const b = el('button', option.value === value ? 'on' : undefined, option.label);
    b.type = 'button';
    b.dataset.key = `${key}.${option.value}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(option.value === value));
    b.addEventListener('click', () => onChange(option.value));
    group.append(b);
  }
  return group;
}

export function select(key: string, options: { value: string; label: string }[], value: string,
  onChange: (v: string) => void): HTMLElement {
  const s = el('select', 'select');
  s.dataset.key = key;
  for (const option of options) {
    const o = el('option', undefined, option.label);
    o.value = option.value;
    s.append(o);
  }
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

export function button(key: string, label: string, onClick: () => void, solid = false): HTMLButtonElement {
  const b = el('button', solid ? 'btn solid' : 'btn', label);
  b.type = 'button';
  b.dataset.key = key;
  b.addEventListener('click', e => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function head(o: { title: string; sub?: string; icon?: HTMLElement; side?: HTMLElement }): HTMLElement {
  const h = el('div', 'head');
  if (o.icon) {
    const box = el('div', 'ico');
    box.append(o.icon);
    h.append(box);
  }
  const text = el('div', 'titles');
  text.append(el('h1', undefined, o.title));
  if (o.sub) text.append(el('div', 'sub', o.sub));
  h.append(text);
  if (o.side) {
    o.side.classList.add('side-ctl');
    h.append(o.side);
  }
  return h;
}

export function note(text: string): HTMLElement {
  return el('p', 'note', text);
}

export function group(...children: HTMLElement[]): HTMLElement {
  const g = el('div', 'grp');
  g.append(...children);
  return g;
}

export { el };
