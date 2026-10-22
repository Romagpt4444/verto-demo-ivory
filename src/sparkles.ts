/**
 * Micro-sparkle bursts: tiny particles that appear during stage transitions.
 * Uses a 2D canvas overlaid on the tooth stage for zero GPU overhead.
 */

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  hue: number;
}

export function initSparkles(container: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'tooth__sparkles';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  // style the canvas
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '2',
  });

  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let w = 0, h = 0;
  const sparks: Spark[] = [];
  let raf = 0;
  let running = false;

  const resize = () => {
    w = container.clientWidth;
    h = container.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function burst(cx: number, cy: number, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2.5;
      const life = 40 + Math.random() * 50;
      sparks.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        r: 1 + Math.random() * 2.2,
        life,
        maxLife: life,
        hue: 150 + Math.random() * 30, // green-teal range
      });
    }
    if (!running) start();
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.02; // gravity
      s.vx *= 0.99;
      s.life--;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      const alpha = (s.life / s.maxLife) * 0.7;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${s.hue}, 55%, 72%, ${alpha})`;
      ctx.arc(s.x, s.y, s.r * (s.life / s.maxLife), 0, Math.PI * 2);
      ctx.fill();
      // glow
      ctx.beginPath();
      ctx.fillStyle = `hsla(${s.hue}, 55%, 82%, ${alpha * 0.3})`;
      ctx.arc(s.x, s.y, s.r * 2.5 * (s.life / s.maxLife), 0, Math.PI * 2);
      ctx.fill();
    }
    if (sparks.length > 0) {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(tick);
  }

  return {
    /** Fire a burst at a fractional position (0..1) on the container */
    burst: (fx: number, fy: number, count?: number) => burst(fx * w, fy * h, count),
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.remove();
    },
  };
}
