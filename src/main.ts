import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource-variable/manrope/index.css';
import './styles/main.css';

import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initScroll, scrollToTarget } from './scroll';
import { counters, doctorTilt, heroIntro, reveals, toothTimeline } from './animations';
import { initMotes } from './motes';
import type { ToothScene } from './scene';
import { initSparkles } from './sparkles';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobileQuery = matchMedia('(max-width: 860px), (pointer: coarse)');
const mobile = mobileQuery.matches;

const lenis = initScroll(reduced);

// ---------- hero ----------
initMotes(document.querySelector<HTMLCanvasElement>('[data-motes]')!, reduced);
heroIntro(reduced);

// ---------- 3D tooth (lazy) ----------
let toothScene: ToothScene | null = null;
let toothVisible = false;
let sceneRequested = false;
const sparkles = reduced ? null : initSparkles(document.querySelector('[data-tooth-stage]')!);
let lastStage = -1;
toothTimeline(mobile, {
  onActive: (active) => {
    toothVisible = active;
    toothScene?.setActive(active);
  },
  onStageChange: (stage) => {
    if (stage !== lastStage && stage >= 0 && sparkles) {
      // burst sparkles near the marker position for this stage
      const fx = mobile ? 0.5 : 0.62;
      const fy = 0.45 + Math.random() * 0.1;
      sparkles.burst(fx, fy, mobile ? 12 : 22);
    }
    lastStage = stage;
  },
});

function startScene() {
  if (sceneRequested) return;
  sceneRequested = true;
  const canvas = document.querySelector<HTMLCanvasElement>('[data-tooth-canvas]')!;
  const loader = document.querySelector<HTMLElement>('[data-tooth-loader]')!;
  const markers = Array.from(document.querySelectorAll<HTMLElement>('[data-marker]'));
  import('./scene')
    .then(({ createToothScene }) =>
      createToothScene({
        canvas,
        markers,
        mobile,
        reducedMotion: reduced,
        onReady: () => loader.classList.add('is-done'),
      }),
    )
    .then((scene) => {
      toothScene = scene;
      scene.setActive(toothVisible);
    })
    .catch((err) => {
      console.warn('3D scene unavailable, showing the text version', err);
      loader.classList.add('is-done');
    });
}

// The model loads after the hero: on the first sign of intent to scroll, when the
// section approaches, or after a pause on desktop (fast connections, fine pointer).
const intent = (e: Event) => {
  if (e.type === 'scroll' && window.scrollY < 40) return; // ignore scroll restoration at load
  startScene();
  ['wheel', 'touchstart', 'keydown', 'scroll'].forEach((e) => window.removeEventListener(e, intent));
};
['wheel', 'touchstart', 'keydown', 'scroll'].forEach((e) => window.addEventListener(e, intent, { passive: true }));
new IntersectionObserver(
  ([e], obs) => {
    if (e.isIntersecting) {
      startScene();
      obs.disconnect();
    }
  },
  { rootMargin: '0px' },
).observe(document.querySelector('[data-tooth]')!);

// ---------- reveals ----------
reveals(reduced);
counters();
doctorTilt();

// ---------- nav ----------
const nav = document.querySelector<HTMLElement>('[data-nav]')!;
const burger = document.querySelector<HTMLButtonElement>('[data-burger]')!;
const menu = document.querySelector<HTMLElement>('[data-menu]')!;
let lastY = 0;
ScrollTrigger.create({
  start: 0,
  end: 'max',
  onUpdate: (self) => {
    const y = self.scroll();
    nav.classList.toggle('is-scrolled', y > 40);
    const menuOpen = burger.getAttribute('aria-expanded') === 'true';
    nav.classList.toggle('is-hidden', !menuOpen && y > 400 && y > lastY);
    lastY = y;
  },
});

const setMenu = (open: boolean) => {
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  menu.hidden = !open;
  document.documentElement.style.overflow = open ? 'hidden' : '';
  if (open) lenis?.stop();
  else lenis?.start();
};
burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) setMenu(false);
});

// in-page links go through Lenis so the pinned timeline scrubs smoothly
document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
  if (a.hasAttribute('data-book')) return;
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')!;
    if (id.length < 2) return;
    e.preventDefault();
    if (!menu.hidden) setMenu(false);
    scrollToTarget(lenis, id === '#top' ? document.body : id);
  });
});

// ---------- booking dialog ----------
const dialog = document.querySelector<HTMLDialogElement>('[data-dialog]')!;
const form = dialog.querySelector<HTMLFormElement>('[data-form]')!;
const done = dialog.querySelector<HTMLElement>('[data-done]')!;

document.querySelectorAll<HTMLElement>('[data-book]').forEach((el) =>
  el.addEventListener('click', (e) => {
    e.preventDefault();
    if (!menu.hidden) setMenu(false);
    done.hidden = true;
    form.reset();
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('is-invalid'));
    dialog.showModal();
    lenis?.stop();
  }),
);
dialog.addEventListener('close', () => lenis?.start());
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));

const phoneInput = form.querySelector<HTMLInputElement>('#f-phone')!;
phoneInput.addEventListener('input', () => {
  const digits = phoneInput.value.replace(/\D/g, '').replace(/^[78]/, '').slice(0, 10);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
  let out = '+7';
  if (parts[0]) out += ' ' + parts[0];
  if (parts[1]) out += ' ' + parts[1];
  if (parts[2]) out += '-' + parts[2];
  if (parts[3]) out += '-' + parts[3];
  phoneInput.value = digits ? out : '';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = form.querySelector<HTMLInputElement>('#f-name')!;
  const nameOk = name.value.trim().length >= 2;
  const phoneOk = phoneInput.value.replace(/\D/g, '').length === 11;
  name.closest('.field')!.classList.toggle('is-invalid', !nameOk);
  phoneInput.closest('.field')!.classList.toggle('is-invalid', !phoneOk);
  if (!nameOk) return name.focus();
  if (!phoneOk) return phoneInput.focus();
  done.hidden = false;
  done.querySelector<HTMLButtonElement>('[data-close]')!.focus();
});

// fonts change line breaks; re-measure pinned sections once they are in
document.fonts?.ready.then(() => ScrollTrigger.refresh());

