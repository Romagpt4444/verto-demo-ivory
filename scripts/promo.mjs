// Promo capture: screenshots and a vertical 1080x1920 scroll video of the built site.
// Time inside the page is virtual (rAF, timers, performance.now, CSS animations),
// so every frame is evenly spaced no matter how long the GPU takes to render it.
//
// Usage: npm run build && npm run preview  (in another terminal)
//        node scripts/promo.mjs screens|video [url]
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const mode = process.argv[2] ?? 'screens';
const url = process.argv[3] ?? 'http://localhost:4173/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 30;
const FRAME = 1000 / FPS;

const virtualClock = () => {
  let vt = 0;
  const base = Date.now();
  let rafQ = [];
  let rafId = 1;
  const timers = new Map();
  let timerId = 1;
  const animStart = new WeakMap();
  performance.now = () => vt;
  Date.now = () => base + vt;
  window.requestAnimationFrame = (cb) => {
    const id = rafId++;
    rafQ.push({ id, cb });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    rafQ = rafQ.filter((r) => r.id !== id);
  };
  const addTimer = (cb, ms, repeat, args) => {
    const id = timerId++;
    timers.set(id, { cb, at: vt + Math.max(0, ms || 0), ms: Math.max(1, ms || 0), repeat, args });
    return id;
  };
  window.setTimeout = (cb, ms, ...args) => addTimer(cb, ms, false, args);
  window.setInterval = (cb, ms, ...args) => addTimer(cb, ms, true, args);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  window.__advance = (ms) => {
    const target = vt + ms;
    // timers due within this frame
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      vt = Math.max(vt, t.at);
      if (t.repeat) t.at += t.ms;
      else timers.delete(id);
      try {
        typeof t.cb === 'function' ? t.cb(...t.args) : 0;
      } catch (e) {
        console.error(e);
      }
    }
    vt = target;
    for (const a of document.getAnimations()) {
      if (!(a instanceof CSSAnimation || a instanceof CSSTransition)) continue;
      if (!animStart.has(a)) animStart.set(a, vt - ms);
      a.pause();
      a.currentTime = vt - animStart.get(a);
    }
    const q = rafQ;
    rafQ = [];
    for (const r of q) {
      try {
        r.cb(vt);
      } catch (e) {
        console.error(e);
      }
    }
  };
};

async function open(width, height, dpr) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars', '--mute-audio'],
    defaultViewport: { width, height, deviceScaleFactor: dpr },
  });
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('[page]', m.text()));
  await page.evaluateOnNewDocument(virtualClock);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  return { browser, page };
}

const advance = (page, ms) => page.evaluate((m) => window.__advance(m), ms);

async function settle(page, ms) {
  for (let t = 0; t < ms; t += FRAME) await advance(page, FRAME);
}

/** Scroll first so the 3D chunk starts loading, then wait (in real time) for the model. */
async function loadModel(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 60);
    window.dispatchEvent(new Event('touchstart'));
  });
  for (let i = 0; i < 300; i++) {
    await advance(page, FRAME);
    const done = await page.evaluate(() => document.querySelector('[data-tooth-loader]')?.classList.contains('is-done'));
    if (done) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, 600);
}

/** Scroll positions of the pinned stage centres (must match animations.ts). */
async function layout(page) {
  return page.evaluate(() => {
    const vh = innerHeight;
    const mobile = matchMedia('(max-width: 860px), (pointer: coarse)').matches;
    const pinStart = document.querySelector('[data-tooth]').getBoundingClientRect().top + scrollY;
    const pinLen = vh * (mobile ? 5 : 6);
    const centers = [1.5, 3.2, 4.9, 6.6, 8.3].map((c) => pinStart + (c / 10) * pinLen);
    return { vh, pinStart, pinEnd: pinStart + pinLen, centers, end: document.documentElement.scrollHeight - vh };
  });
}

async function scrollTo(page, y, ms = 2600) {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await settle(page, ms);
}

async function screens() {
  mkdirSync('promo/screens', { recursive: true });
  const shots = [
    { name: 'desktop', w: 1440, h: 900, dpr: 1, at: (l) => l.centers[1] },
    { name: 'desktop-hero', w: 1440, h: 900, dpr: 1, at: () => 0 },
    { name: 'desktop-xray', w: 1440, h: 900, dpr: 1, at: (l) => l.centers[4] },
    { name: 'desktop-implant', w: 1440, h: 900, dpr: 1, at: (l) => l.centers[3] },
    { name: 'tablet', w: 768, h: 1024, dpr: 2, at: (l) => l.centers[2] },
    { name: 'mobile', w: 390, h: 844, dpr: 3, at: (l) => l.centers[0] },
    { name: 'mobile-hero', w: 390, h: 844, dpr: 3, at: () => 0 },
    { name: 'mobile-xray', w: 390, h: 844, dpr: 3, at: (l) => l.centers[4] },
  ];
  for (const s of shots) {
    const { browser, page } = await open(s.w, s.h, s.dpr);
    await loadModel(page);
    await settle(page, 1800);
    const l = await layout(page);
    await scrollTo(page, s.at(l));
    await page.screenshot({ path: `promo/screens/${s.name}.png` });
    console.log('saved', s.name);
    await browser.close();
  }
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function video() {
  // 540x960 CSS px at DPR 2 = 1080x1920 frames
  const { browser, page } = await open(540, 960, 2);
  await loadModel(page);
  const l = await layout(page);

  // keyframes: [seconds, scrollY]
  const keys = [[0, 0], [2.4, 0], [4.6, l.pinStart]];
  let t = 4.6;
  for (const c of l.centers) {
    t += 2.1;
    keys.push([t, c]);
    t += 1.1;
    keys.push([t, c]);
  }
  t += 2.2;
  keys.push([t, l.pinEnd + l.vh * 0.9]);
  t += 1.0;
  keys.push([t, l.pinEnd + l.vh * 0.9]);
  t += (l.end - l.pinEnd) / 520;
  keys.push([t, l.end]);
  t += 1.8;
  keys.push([t, l.end]);

  const yAt = (s) => {
    for (let i = 1; i < keys.length; i++) {
      const [t1, y1] = keys[i];
      const [t0, y0] = keys[i - 1];
      if (s <= t1) return y0 + (y1 - y0) * ease((s - t0) / Math.max(1e-6, t1 - t0));
    }
    return keys[keys.length - 1][1];
  };

  mkdirSync('promo', { recursive: true });
  const ff = spawn(ffmpegPath, [
    '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-movflags', '+faststart',
    'promo/scroll.mp4',
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const total = Math.ceil(t * FPS);
  for (let f = 0; f < total; f++) {
    const y = Math.round(yAt(f / FPS));
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await advance(page, FRAME);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 60 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  console.log('saved promo/scroll.mp4', (total / FPS).toFixed(1), 's');
}

await (mode === 'video' ? video() : screens());
