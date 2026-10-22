import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { STAGE_ANGLES, STAGE_TILTS, TAU, toothState } from './state';

gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(s));

/** Hero: letters of IVORY rise in, the rest follows; on scroll the hero lifts away. */
export function heroIntro(reduced: boolean) {
  // the letter and fade-in intro is pure CSS (index.html + main.css) so the first
  // paint never waits for JavaScript; GSAP only handles the scroll-out.
  if (reduced) return;
  gsap.to('[data-hero]', {
    yPercent: -18,
    opacity: 0,
    scale: 0.96,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 20%', scrub: true },
  });
  gsap.to('.hero__glow', {
    yPercent: 30,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
}

export interface ToothTimelineHooks {
  onActive?: (active: boolean) => void;
  onStageChange?: (stage: number) => void;
}

/**
 * The pinned 3D chapter. One scrubbed timeline drives toothState; each service stage
 * gets a rotation, an effect on the model, a marker and a text panel, all in sync.
 */
export function toothTimeline(mobile: boolean, hooks: ToothTimelineHooks = {}) {
  const section = $('[data-tooth]');
  const stage = $('[data-tooth-stage]');
  const panels = $$('[data-panel]', stage);
  const intro = panels.shift()!;
  const steps = $$('[data-step]', stage);
  const bar = $('[data-hud-bar]', stage);
  const angle = $('[data-hud-angle]', stage);
  const bg = $('[data-tooth-bg]', stage);
  const halo = $('[data-tooth-halo]', stage);
  const nav = $('[data-nav]');
  const s = toothState;

  // entering: the tooth floats up from below while the hero leaves
  gsap.to(s, {
    enter: 1,
    ease: 'none',
    scrollTrigger: { trigger: section, start: 'top bottom', end: 'top top', scrub: true },
  });
  gsap.fromTo(
    halo,
    { scale: 0.6, opacity: 0 },
    { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: section, start: 'top 80%', end: 'top top', scrub: true } },
  );

  let visible = false;

  const centers = [1.5, 3.2, 4.9, 6.6, 8.3];
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => `+=${window.innerHeight * (mobile ? 5 : 6)}`,
      pin: stage,
      scrub: 0.9,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        bar.style.transform = `scaleX(${self.progress.toFixed(4)})`;
      },
    },
  });

  // visibility window for the WebGL loop (render only when the stage can be seen)
  ScrollTrigger.create({
    trigger: section,
    start: 'top bottom-=1',
    end: 'bottom top',
    onToggle: (self) => {
      visible = self.isActive;
      hooks.onActive?.(self.isActive);
    },
  });


  tl.to(intro, { autoAlpha: 0, y: -40, duration: 0.4 }, 0.55);
  tl.to(s, { rotY: 0, rotX: 0.14, duration: 0.6 }, 0);

  centers.forEach((c, i) => {
    const panel = panels[i];
    tl.to(s, { rotY: STAGE_ANGLES[i], rotX: STAGE_TILTS[i], duration: 1.05 }, c - 0.8);
    tl.fromTo(panel, { autoAlpha: 0, y: 46 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power3.out' }, c - 0.45);
    if (i < centers.length - 1) tl.to(panel, { autoAlpha: 0, y: -46, duration: 0.35, ease: 'power2.in' }, c + 0.55);
    tl.to(s.markers, { [i]: 1, duration: 0.25, ease: 'none' }, c - 0.25);
    tl.to(s.markers, { [i]: 0, duration: 0.2, ease: 'none' }, c + 0.55);
  });

  // therapy: filling glows in the fissure
  tl.to(s, { hlFill: 1, duration: 0.4 }, centers[0] - 0.35).to(s, { hlFill: 0, duration: 0.35 }, centers[0] + 0.6);
  // aesthetics: veneer on the facing surface
  tl.to(s, { hlVeneer: 1, duration: 0.4 }, centers[1] - 0.35).to(s, { hlVeneer: 0, duration: 0.35 }, centers[1] + 0.6);
  // prosthetics: the crown drops and seats
  tl.to(s, { crown: 1, duration: 0.75, ease: 'none' }, centers[2] - 0.6).to(s, { crown: 0, duration: 0.35 }, centers[2] + 0.62);
  // implantology: roots dissolve, implant screws in, then the natural tooth returns
  tl.to(s, { rootCut: 1, duration: 0.5 }, centers[3] - 0.7)
    .to(s, { implant: 1, duration: 0.65, ease: 'none' }, centers[3] - 0.45)
    .to(s, { implant: 0, duration: 0.35, ease: 'power2.in' }, centers[3] + 0.6)
    .to(s, { rootCut: 0, duration: 0.45 }, centers[3] + 0.75);
  // endodontics: x-ray. The one deliberate theme switch on the page.
  tl.to(s, { xray: 1, duration: 0.6 }, centers[4] - 0.6);
  tl.to(s, { rotY: TAU, rotX: 0.1, duration: 1.2 }, centers[4] + 0.3);
  tl.to(panels[4], { autoAlpha: 0, y: -46, duration: 0.35, ease: 'power2.in' }, 9.3);
  tl.to(s, { xray: 0, duration: 0.5 }, 9.4);
  tl.set({}, {}, 10);

  // HUD + theme switch follow the state every frame while the stage is pinned
  let deep = false;
  let activeStep = -1;
  gsap.ticker.add(() => {
    if (!visible) return;
    bg.style.setProperty('--deep-o', s.xray.toFixed(3));
    halo.style.opacity = (1 - s.xray).toFixed(3);
    const isDeep = s.xray > 0.5;
    if (isDeep !== deep) {
      deep = isDeep;
      stage.classList.toggle('is-deep', deep);
      nav.classList.toggle('is-dark', deep);
    }
    const deg = Math.round((((s.rotY % TAU) + TAU) % TAU) * (180 / Math.PI));
    angle.textContent = String(s.rotY >= TAU - 0.01 ? 360 : deg);
    const t = tl.time();
    let step = -1;
    centers.forEach((c, i) => {
      if (t > c - 0.8) step = i;
    });
    if (step !== activeStep) {
      steps.forEach((el, i) => el.classList.toggle('is-active', i === step));
      activeStep = step;
      hooks.onStageChange?.(step);
    }
  });

  // exit: "about" slides over the stage while the tooth shrinks away
  gsap.to(s, {
    exit: 1,
    ease: 'none',
    scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'top 25%', scrub: true },
  });

  return tl;
}

/** Headings split into lines that rise out of a mask; body copy fades up in staggered batches. */
export function reveals(reduced: boolean) {
  if (reduced) return;
  $$('[data-split]').forEach((el) => {
    SplitText.create(el, {
      type: 'lines',
      linesClass: 'line',
      mask: 'lines',
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, {
          yPercent: 105,
          duration: 1.3,
          ease: 'expo.out',
          stagger: 0.1,
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        }),
    });
  });

  gsap.set('[data-reveal]', { opacity: 0, y: 36 });
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.12, overwrite: true }),
  });

  // quote: words light up as you read down the page
  const quote = $('[data-split-words]');
  if (quote) {
    const split = SplitText.create(quote, { type: 'words', wordsClass: 'word', aria: 'none' });
    gsap.fromTo(
      split.words,
      { opacity: 0.16 },
      {
        opacity: 1,
        stagger: 0.08,
        ease: 'none',
        scrollTrigger: { trigger: quote, start: 'top 80%', end: 'bottom 45%', scrub: true },
      },
    );
  }

  // the about section rises slightly as it covers the 3D stage
  gsap.from('.about .container', {
    y: 80,
    ease: 'none',
    scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'top 30%', scrub: true },
  });
}

/** Count-up for the clinic numbers, once, when they enter the viewport. */
export function counters() {
  const fmt = new Intl.NumberFormat('ru-RU');
  $$('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const format = el.hasAttribute('data-format');
    const obj = { v: 0 };
    const render = () => {
      el.textContent = format ? fmt.format(Math.round(obj.v)) : String(Math.round(obj.v));
    };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => gsap.to(obj, { v: target, duration: 2.2, ease: 'power3.out', onUpdate: render }),
    });
  });
}

/** Doctors: pointer position feeds a CSS parallax inside the placeholder portrait. */
export function doctorTilt() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  $$('[data-tilt]').forEach((card) => {
    const setX = gsap.quickTo(card, '--mx', { duration: 0.6, ease: 'power3.out' });
    const setY = gsap.quickTo(card, '--my', { duration: 0.6, ease: 'power3.out' });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      setX(((e.clientX - r.left) / r.width) * 2 - 1);
      setY(((e.clientY - r.top) / r.height) * 2 - 1);
    });
    card.addEventListener('pointerleave', () => {
      setX(0);
      setY(0);
    });
  });
}
