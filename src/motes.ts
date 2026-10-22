/**
 * Hero background: a few dozen soft motes drifting upward, like dust in a sunlit
 * clinic. Plain 2D canvas, so the first screen never waits for WebGL.
 */
export function initMotes(canvas: HTMLCanvasElement, reduced: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const colors = ['21,26,25', '44,116,98', '201,169,110', '126,200,176'];
  let w = 0;
  let h = 0;
  let raf = 0;
  let running = false;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };

  type Mote = { x: number; y: number; r: number; z: number; c: string; a: number; vx: number; vy: number; p: number };
  let motes: Mote[] = [];

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(70, (w * h) / 16000));
    motes = Array.from({ length: count }, () => {
      const z = Math.random();
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        z,
        r: 0.6 + z * 2.4,
        c: colors[Math.floor(Math.random() * colors.length)],
        a: 0.12 + z * 0.35,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -(0.05 + z * 0.22),
        p: Math.random() * Math.PI * 2,
      };
    });
    draw(0);
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;
    for (const m of motes) {
      if (!reduced) {
        m.x += m.vx + Math.sin(t * 0.0004 + m.p) * 0.06;
        m.y += m.vy;
        if (m.y < -10) {
          m.y = h + 10;
          m.x = Math.random() * w;
        }
      }
      const x = m.x + pointer.sx * m.z * 18;
      const y = m.y + pointer.sy * m.z * 12;
      const twinkle = 0.75 + 0.25 * Math.sin(t * 0.0012 + m.p);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${m.c},${(m.a * twinkle).toFixed(3)})`;
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const loop = (t: number) => {
    draw(t);
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || reduced) return;
    running = true;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop())).observe(canvas);
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = e.clientX / window.innerWidth - 0.5;
      pointer.y = e.clientY / window.innerHeight - 0.5;
    },
    { passive: true },
  );
}
