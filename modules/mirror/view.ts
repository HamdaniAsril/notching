import type id from './locales/id.json';
import {
  DRAG_PX, dragTick, glowColor, kelvin, LIGHT, LIGHT_START, type Scale, ZOOM, zoomScale, zoomText,
} from './ruler';
import { QUIET, type Sound, SPEAKER } from '../timer/tik';

export type Strings = typeof id;

export interface Actions {
  lamp(on: boolean, kelvin: number): void; // also each time the light's color changes while on
  nextCamera(): void;
}

export interface MirrorView {
  setStream(stream: MediaStream | null): void; // null: the camera could not be opened
  setCameras(names: string[], current: number): void; // the chip shows only with two or more
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

function chip(text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'cm-chip', text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

interface RulerOptions {
  label: string;
  every: number; // a number under every this many ticks
  number: (tick: number) => string;
  color?: (tick: number) => string; // each tick its own color; otherwise ink up to the mark
  onChange: (tick: number) => void;
  sound: Sound; // Timer's tik: a tick passed, fuller at each long one
}

// Timer's ruler: ticks on a tape slid under a fixed accent mark; longer every 5.
function ruler(s: Scale, start: number, o: RulerOptions): { box: HTMLElement; draw(): void } {
  const box = el('div', o.color ? 'cm-ruler cm-colored' : 'cm-ruler');
  box.setAttribute('role', 'slider');
  box.setAttribute('aria-label', o.label);
  box.setAttribute('aria-valuemin', String(s.min));
  box.setAttribute('aria-valuemax', String(s.max));
  const tape = el('div', 'cm-tape');
  const ticks: HTMLElement[] = [];
  for (let t = s.min; t <= s.max; t++) {
    const tick = el('i', t % 5 === 0 ? 'cm-tick cm-long' : 'cm-tick');
    tick.style.left = `${(t - s.min) * s.px}px`;
    if (o.color) tick.style.background = o.color(t);
    ticks.push(tick);
    tape.append(tick);
    if (t % o.every === 0) {
      const n = el('span', 'cm-num', o.number(t));
      n.style.left = `${(t - s.min) * s.px}px`;
      tape.append(n);
    }
  }
  box.append(tape, el('i', 'cm-mark'));

  let value = start;
  const draw = () => {
    tape.style.transform = `translateX(${box.clientWidth / 2 - (value - s.min) * s.px}px)`;
    if (!o.color) ticks.forEach((t, i) => t.classList.toggle('cm-on', s.min + i <= value));
    box.setAttribute('aria-valuenow', String(value));
  };

  let drag: { x: number; from: number; moved: boolean } | null = null;
  box.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, from: value, moved: false };
    box.setPointerCapture?.(e.pointerId);
    o.sound.prime();
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < DRAG_PX) return;
    drag.moved = true;
    const next = dragTick(s, drag.from, dx);
    if (next === value) return;
    o.sound.step(value, next);
    value = next;
    draw();
    o.onChange(value);
  });
  const end = () => { drag = null; };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('lostpointercapture', end);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(draw).observe(box);
  return { box, draw };
}

// The Cermin page (design 31 Oct, Cermin §3–4; cermin-v6.html) as two black Volt
// cards: the camera, mirrored unless flipped, and under it the zoom ruler, the
// light's ruler while the lamp is on, and the camera, Flip and Lampu. The lamp
// turns the notch panel white; the text sits on the black cards, so it stays light.
export function renderMirror(root: HTMLElement, t: Strings, actions: Actions, sound: Sound = QUIET): MirrorView {
  let mirrored = true;
  let zoom = ZOOM.min;
  let lit = false;
  let light = LIGHT_START;

  const view = el('div', 'cm-view');
  const video = el('video', 'cm-video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  const msg = el('div', 'cm-msg v-lab', '');
  const tag = el('span', 'cm-tag', t.mirror);
  view.append(video, msg, tag);

  const place = () => {
    const z = zoomScale(zoom);
    video.style.transform = `scale(${mirrored ? -z : z}, ${z})`;
    tag.textContent = mirrored ? t.mirror : t.flip;
  };

  const zoomVal = el('div', 'cm-val', zoomText(zoom));
  const zoomRuler = ruler(ZOOM, zoom, {
    label: t.zoom, every: 10, number: zoomText, sound,
    onChange: v => { zoom = v; zoomVal.textContent = zoomText(v); place(); },
  });
  const zoomRow = el('div', 'cm-row');
  zoomRow.append(zoomRuler.box, zoomVal);

  const lightVal = el('div', 'cm-val cm-k', `${kelvin(light)}K`);
  const lightRuler = ruler(LIGHT, light, {
    label: t.light, every: 10, number: v => `${kelvin(v)}K`, color: v => glowColor(kelvin(v)), sound,
    onChange: v => { light = v; lightVal.textContent = `${kelvin(v)}K`; actions.lamp(true, kelvin(v)); },
  });
  const lightRow = el('div', 'cm-row cm-light');
  lightRow.append(lightRuler.box, lightVal);

  const camera = chip('', () => actions.nextCamera());
  camera.hidden = true;
  const flip = chip(t.flip, () => {
    mirrored = !mirrored;
    flip.classList.toggle('cm-sel', !mirrored);
    flip.setAttribute('aria-pressed', String(!mirrored));
    place();
  });
  flip.setAttribute('aria-pressed', 'false');
  const lamp = chip(t.lamp, () => {
    lit = !lit;
    lamp.classList.toggle('cm-sel', lit);
    lamp.setAttribute('aria-pressed', String(lit));
    root.classList.toggle('cm-lit', lit);
    actions.lamp(lit, kelvin(light));
  });
  lamp.setAttribute('aria-pressed', 'false');
  // Timer's speaker, at the end of the chips: the rulers' tik on or off.
  const speaker = el('button', 'cm-sound');
  speaker.type = 'button';
  speaker.innerHTML = SPEAKER;
  speaker.setAttribute('aria-label', t.sound);
  speaker.title = t.sound;
  const showSound = (on: boolean) => {
    speaker.setAttribute('aria-pressed', String(on));
    speaker.classList.toggle('cm-off', !on);
  };
  showSound(sound.on?.() ?? true);
  speaker.addEventListener('click', () => {
    const on = !(sound.on?.() ?? true);
    sound.set?.(on);
    showSound(on);
  });
  const on = el('span', 'v-lab cm-on');
  on.append(el('i', 'cm-dot'), document.createTextNode(t.cameraOn));
  on.hidden = true;
  const chips = el('div', 'cm-chips');
  chips.append(camera, flip, lamp, speaker);
  const bar = el('div', 'cm-bar');
  bar.append(on, chips);

  const controls = el('div', 'cm-card');
  controls.append(zoomRow, lightRow, bar);
  root.append(view, controls);
  place();

  return {
    setStream(stream) {
      video.srcObject = stream;
      msg.textContent = stream ? '' : t.noCamera;
      on.hidden = !stream;
    },
    setCameras(names, current) {
      camera.hidden = names.length < 2;
      camera.textContent = names[current] ?? '';
    },
  };
}
