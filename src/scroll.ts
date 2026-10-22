import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Lenis smooth scroll driven by the GSAP ticker, so Lenis, ScrollTrigger and the
 * Three.js render all advance in the same requestAnimationFrame callback.
 */
export function initScroll(reducedMotion: boolean): Lenis | null {
  if (reducedMotion) return null;
  const lenis = new Lenis({
    lerp: 0.09,
    wheelMultiplier: 0.9,
    smoothWheel: true,
    syncTouch: false,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function scrollToTarget(lenis: Lenis | null, target: string | HTMLElement) {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.6 });
  else el.scrollIntoView({ behavior: 'auto' });
}
