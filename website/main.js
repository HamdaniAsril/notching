// The phone menu: the ≡ button opens the section links under the bar.
const nav = document.getElementById('nav');
const button = nav.querySelector('.menu-btn');

function setMenu(open) {
  nav.toggleAttribute('data-open', open);
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

button.addEventListener('click', () => setMenu(!nav.hasAttribute('data-open')));
nav.querySelectorAll('.nav-links a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
matchMedia('(min-width: 1100px)').addEventListener('change', (e) => e.matches && setMenu(false));

// The hero notch, a small working copy of the app. Until the visitor clicks, a pointer
// plays it on a loop: open the notch, visit each page from the pill, close it again.
// The first real click (or key) stops the demo and leaves the visitor in charge.
const scene = document.getElementById('hero-scene');
const island = scene.querySelector('.island');
const pill = scene.querySelector('.pill');
const pages = [...scene.querySelectorAll('.page')];
const order = pages.map((p) => p.dataset.page);
const cursor = scene.querySelector('.demo-cursor');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function setPanel(open) {
  scene.toggleAttribute('data-open', open);
  island.setAttribute('aria-expanded', String(open));
  pill.inert = !open;
}

function showPage(name) {
  const at = order.indexOf(name);
  scene.dataset.page = name;
  pages.forEach((page, i) => { page.dataset.pos = i < at ? 'before' : i > at ? 'after' : 'on'; });
  pill.querySelectorAll('[data-go]').forEach((b) => {
    const on = b.dataset.go === name;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

setPanel(false);
showPage('home');

// ---- the demo ----
let demoOn = !reduceMotion;
let inView = false;
const STOP = Symbol('stop');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits ms of time while the hero is on screen; pauses while it is not.
async function hold(ms) {
  let left = ms;
  while (left > 0) {
    if (!demoOn) throw STOP;
    const step = Math.min(100, left);
    await sleep(step);
    if (inView && document.visibilityState === 'visible') left -= step;
  }
  if (!demoOn) throw STOP;
}

// Where an element shows inside the scene, using only its visible part (the
// closed notch starts above the scene's top edge).
function spot(el) {
  const s = scene.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = Math.max(r.top, s.top);
  return [r.left - s.left + r.width / 2, (top + r.bottom) / 2 - s.top];
}

async function moveTo([x, y]) {
  const size = cursor.getBoundingClientRect().width;
  cursor.style.left = `${x - size * 0.17}px`;
  cursor.style.top = `${y - size * 0.19}px`;
  await hold(850);
}

async function press() {
  scene.setAttribute('data-press', '');
  await hold(150);
  scene.removeAttribute('data-press');
}

async function playDemo() {
  try {
    await moveTo([scene.clientWidth * 0.66, scene.clientHeight * 0.8]);
    scene.setAttribute('data-cursor', '');
    await hold(500);
    for (;;) {
      await moveTo(spot(island));
      await press();
      setPanel(true);
      await hold(2600);
      for (const name of ['focus', 'time', 'modules', 'home']) {
        await moveTo(spot(pill.querySelector(`[data-go="${name}"]`)));
        await press();
        showPage(name);
        await hold(name === 'home' ? 1200 : 2400);
      }
      await moveTo([scene.clientWidth * 0.14, scene.clientHeight * 0.72]);
      await press();
      setPanel(false);
      await hold(2200);
    }
  } catch (e) {
    if (e !== STOP) throw e;
  }
}

function stopDemo() {
  if (!demoOn) return;
  demoOn = false;
  scene.removeAttribute('data-cursor');
  scene.removeAttribute('data-press');
}

// ---- the visitor ----
scene.addEventListener('pointerdown', stopDemo);
island.addEventListener('click', () => {
  stopDemo();
  setPanel(true);
});
island.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  stopDemo();
  setPanel(!scene.hasAttribute('data-open'));
});
pill.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  stopDemo();
  showPage(go.dataset.go);
});
pill.addEventListener('focusin', stopDemo);
scene.addEventListener('click', (e) => {
  if (e.target.closest('.island, .pill')) return;
  stopDemo();
  setPanel(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (nav.hasAttribute('data-open')) {
    setMenu(false);
    button.focus();
  } else if (scene.hasAttribute('data-open')) {
    stopDemo();
    setPanel(false);
  }
});

let started = false;
new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  if (!inView || started) return;
  started = true;
  if (reduceMotion) setPanel(true);
  else playDemo();
}, { threshold: 0.4 }).observe(scene);

// The Timer runs: the notch, the Timer strip and the Timer widget count down together.
const timerText = scene.querySelectorAll('[data-timer]');
const timerMinutes = scene.querySelectorAll('[data-timer-min]');
let secondsLeft = 17 * 60 + 30;
setInterval(() => {
  secondsLeft = secondsLeft > 0 ? secondsLeft - 1 : 25 * 60;
  const text = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  timerText.forEach((el) => { el.textContent = text; });
  timerMinutes.forEach((el) => { el.textContent = String(Math.ceil(secondsLeft / 60)); });
}, 1000);
