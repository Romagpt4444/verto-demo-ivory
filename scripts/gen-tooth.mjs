// Procedural generator for the IVORY tooth model.
// Builds a mandibular first molar (5 cusps, fissures, two curved roots), its pulp
// (chamber + canals), a ceramic crown shell and a titanium implant from signed
// distance fields, meshes them with Surface Nets, and writes Draco-compressed GLB.
// Output is original work (CC0), see CREDITS.md.
//
// Usage: node scripts/gen-tooth.mjs
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';

// ---------- math helpers ----------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
}
const smax = (a, b, k) => -smin(-a, -b, k);

function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx + r;
  const qy = Math.abs(y) - by + r;
  const qz = Math.abs(z) - bz + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}
const sdSphere = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r;
function sdCapsule(x, y, z, ax, ay, az, bx, by, bz, r) {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
// Tapered capsule (Inigo Quilez round cone)
function sdRoundCone(x, y, z, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = x - ax, pay = y - ay, paz = z - az;
  const yv = pax * bax + pay * bay + paz * baz;
  const zv = yv - l2;
  const cx = pax * l2 - bax * yv, cy = pay * l2 - bay * yv, cz = paz * l2 - baz * yv;
  const x2 = cx * cx + cy * cy + cz * cz;
  const y2 = yv * yv * l2;
  const z2 = zv * zv * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
}

// value noise
function hash(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const n = (a, b, c) => hash(i + a, j + b, k + c);
  return mix(
    mix(mix(n(0, 0, 0), n(1, 0, 0), u), mix(n(0, 1, 0), n(1, 1, 0), u), v),
    mix(mix(n(0, 0, 1), n(1, 0, 1), u), mix(n(0, 1, 1), n(1, 1, 1), u), v),
    w,
  ) * 2 - 1;
}
const fbm = (x, y, z) => noise(x, y, z) * 0.6 + noise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise(x * 4.3, y * 4.3, z * 4.3) * 0.1;

// ---------- anatomy ----------
// x = mesio-distal, y = occlusal (up), z = bucco-lingual (+z = buccal, faces camera)
const CUSPS = [
  [-0.48, 0.9, 0.34, 0.43], // mesio-buccal
  [0.12, 0.88, 0.38, 0.41], // disto-buccal
  [0.62, 0.82, 0.16, 0.34], // distal
  [-0.42, 0.94, -0.32, 0.43], // mesio-lingual
  [0.32, 0.93, -0.34, 0.41], // disto-lingual
];

function rootAxisX(rootIndex, y) {
  // two roots, both curving distally (+x) toward the apex
  const t = clamp((-y - 0.1) / 1.9, 0, 1);
  const base = rootIndex === 0 ? -0.4 : 0.44;
  const tip = rootIndex === 0 ? -0.34 : 0.6;
  return mix(base, tip, t) + 0.16 * t * t;
}

function crownSDF(x, y, z) {
  // tapered rounded box: wide at the height of contour, narrow at the neck
  const t = clamp((y - 0.1) / 1.0, 0, 1);
  let s = mix(0.76, 1.0, smoothstep(0.0, 0.5, t));
  s *= mix(1.0, 0.9, smoothstep(0.65, 1.0, t));
  let d = sdRoundBox(x / s, y - 0.58, z / s, 0.9, 0.38, 0.76, 0.38) * s;
  for (const [cx, cy, cz, r] of CUSPS) d = smin(d, sdSphere(x, y, z, cx, cy, cz, r), 0.32);
  // occlusal anatomy: central groove, buccal + lingual grooves, central pit
  // occlusal fissures: a 2D groove network pressed into the surface, fading out down the walls
  const seg = (ax, az, bx, bz) => {
    const px = x - ax, pz = z - az, vx = bx - ax, vz = bz - az;
    const h = clamp((px * vx + pz * vz) / (vx * vx + vz * vz), 0, 1);
    return Math.hypot(px - vx * h, pz - vz * h);
  };
  const g = Math.min(
    seg(-0.66, 0.02, 0.66, -0.04), // central groove
    seg(-0.14, 0.0, -0.2, 0.75), // mesio-buccal groove
    seg(0.42, -0.02, 0.5, 0.6), // disto-buccal groove
    seg(0.06, -0.02, 0.02, -0.75), // lingual groove
    seg(-0.66, 0.02, -0.9, 0.12),
    seg(0.66, -0.04, 0.88, 0.02),
  );
  const pit = Math.min(Math.hypot(x + 0.08, z), Math.hypot(x - 0.42, z + 0.02), Math.hypot(x + 0.62, z - 0.02));
  const occlusal = smoothstep(0.78, 1.02, y);
  d += occlusal * (0.085 * Math.exp(-((g / 0.055) ** 2)) + 0.05 * Math.exp(-((pit / 0.08) ** 2)));
  return d;
}

function rootsSDF(x, y, z) {
  // root trunk under the cemento-enamel junction
  let d = sdRoundBox(x - 0.04, y + 0.1, z, 0.66, 0.38, 0.56, 0.3);
  const roots = [
    [-0.2, -2.0, 0.5, 0.13],
    [-0.2, -1.84, 0.48, 0.14],
  ];
  for (let i = 0; i < 2; i++) {
    const [ay, by, r1, r2] = roots[i];
    const cx = rootAxisX(i, y);
    // roots are flattened mesio-distally and wide bucco-lingually
    const qx = cx + (x - cx) * 1.3;
    const r = sdRoundCone(qx, y, z, rootAxisX(i, ay), ay, 0, rootAxisX(i, by), by, 0, r1, r2) / 1.1;
    d = smin(d, r, 0.26);
  }
  return d;
}

function toothSDF(x, y, z) {
  let d = smin(crownSDF(x, y, z), rootsSDF(x, y, z), 0.34);
  // enamel micro relief + rougher cementum on the roots
  const rootMask = smoothstep(0.1, -0.4, y);
  d += 0.005 * fbm(x * 9, y * 9, z * 9) + rootMask * 0.012 * fbm(x * 3.5 + 7, y * 3.5, z * 3.5);
  return d;
}

function pulpSDF(x, y, z) {
  let d = sdRoundBox(x - 0.03, y - 0.4, z, 0.5, 0.17, 0.36, 0.15);
  for (const [cx, , cz] of CUSPS) d = smin(d, sdSphere(x, y, z, cx * 0.72, 0.62, cz * 0.7, 0.1), 0.14);
  const canals = [
    [0.3, -1.88, 0.15, 0.03],
    [0.3, -1.72, 0.15, 0.032],
  ];
  for (let i = 0; i < 2; i++) {
    const [ay, by, r1, r2] = canals[i];
    const cx = rootAxisX(i, y);
    const qx = cx + (x - cx) * 1.2;
    d = smin(d, sdRoundCone(qx, y, z, rootAxisX(i, ay), ay, 0, rootAxisX(i, by), by, 0, r1, r2), 0.12);
  }
  d += 0.006 * fbm(x * 6 + 3, y * 6, z * 6);
  return d;
}

function crownShellSDF(x, y, z) {
  // ceramic crown: the anatomical crown grown by 35 microns of "ceramic", cut at the margin
  const outer = crownSDF(x, y, z) - 0.035;
  return smax(outer, 0.2 - y, 0.06);
}

function implantSDF(x, y, z) {
  // local frame: fixture from y=-1.05 (apex) to y=0.75, abutment above
  const rxz = Math.hypot(x, z);
  const t = clamp((0.75 - y) / 1.8, 0, 1);
  const core = mix(0.3, 0.22, smoothstep(0.55, 1.0, t));
  const ang = Math.atan2(z, x) / (Math.PI * 2);
  const pitch = 0.15;
  const f = (((y / pitch + ang) % 1) + 1) % 1;
  const thread = 0.065 * (1 - Math.abs(f - 0.5) * 2) * smoothstep(0.72, 0.55, y) * smoothstep(-1.08, -0.85, y);
  let d = (rxz - core - thread) * 0.7;
  d = smax(d, -1.05 - y, 0.08); // rounded apex
  d = smax(d, y - 0.75, 0.02);
  // collar + hex abutment
  const collar = sdRoundBox(x, y - 0.8, z, 0.33, 0.07, 0.33, 0.06);
  const hexR = Math.max(Math.abs(x) * 0.866 + Math.abs(z) * 0.5, Math.abs(z));
  const abut = smax(hexR - 0.21 + (y - 0.87) * 0.18, Math.abs(y - 1.08) - 0.22, 0.03);
  d = Math.min(d, collar);
  d = smin(d, abut, 0.03);
  return d;
}

// ---------- surface nets ----------
function mesh(sdf, bounds, step, { project = 2 } = {}) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const ny = Math.ceil((y1 - y0) / step) + 1;
  const nz = Math.ceil((z1 - z0) / step) + 1;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) field[idx(i, j, k)] = sdf(x0 + i * step, y0 + j * step, z0 + k * step);

  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corners[c];
          v[c] = field[idx(i + a, j + b, k + d)];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [ea, eb] of edges) {
          if (v[ea] < 0 === v[eb] < 0) continue;
          const t = v[ea] / (v[ea] - v[eb]);
          const A = corners[ea], B = corners[eb];
          sx += A[0] + (B[0] - A[0]) * t;
          sy += A[1] + (B[1] - A[1]) * t;
          sz += A[2] + (B[2] - A[2]) * t;
          n++;
        }
        cellVert[cidx(i, j, k)] = pos.length / 3;
        pos.push(x0 + (i + sx / n) * step, y0 + (j + sy / n) * step, z0 + (k + sz / n) * step);
      }

  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c);
    else tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        // edges along x
        const a = field[idx(i, j, k)] < 0, b = field[idx(i + 1, j, k)] < 0;
        if (a !== b)
          quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], b);
      }
  for (let k = 1; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const a = field[idx(i, j, k)] < 0, b = field[idx(i, j + 1, k)] < 0;
        if (a !== b)
          quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], b);
      }
  for (let k = 0; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const a = field[idx(i, j, k)] < 0, b = field[idx(i, j, k + 1)] < 0;
        if (a !== b)
          quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], b);
      }

  // project vertices onto the zero level set and take normals from the SDF gradient
  const e = step * 0.25;
  const grad = (x, y, z) => {
    const gx = sdf(x + e, y, z) - sdf(x - e, y, z);
    const gy = sdf(x, y + e, z) - sdf(x, y - e, z);
    const gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  const P = new Float32Array(pos);
  const N = new Float32Array(pos.length);
  for (let p = 0; p < P.length; p += 3) {
    let x = P[p], y = P[p + 1], z = P[p + 2];
    for (let it = 0; it < project; it++) {
      const d = sdf(x, y, z);
      const [gx, gy, gz] = grad(x, y, z);
      const m = clamp(d, -step, step);
      x -= gx * m; y -= gy * m; z -= gz * m;
    }
    P[p] = x; P[p + 1] = y; P[p + 2] = z;
    const g = grad(x, y, z);
    N[p] = g[0]; N[p + 1] = g[1]; N[p + 2] = g[2];
  }

  // make winding agree with the gradient normal
  const I = new Uint32Array(tris);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * (N[a] + N[b] + N[c]) + fy * (N[a + 1] + N[b + 1] + N[c + 1]) + fz * (N[a + 2] + N[b + 2] + N[c + 2]) < 0) {
      const tmp = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = tmp;
    }
  }
  return { position: P, normal: N, index: I };
}

// ---------- export ----------
const PARTS = [
  { name: 'tooth', sdf: toothSDF, bounds: [-1.35, -2.3, -1.15, 1.45, 1.45, 1.15] },
  { name: 'pulp', sdf: pulpSDF, bounds: [-0.8, -2.1, -0.6, 0.95, 0.85, 0.6], scale: 1.0 },
  { name: 'crown', sdf: crownShellSDF, bounds: [-1.3, 0.05, -1.15, 1.35, 1.45, 1.15], scale: 1.4 },
  { name: 'implant', sdf: implantSDF, bounds: [-0.5, -1.25, -0.5, 0.5, 1.4, 0.5], scale: 1.0 },
];

async function build(file, step) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('ivory');
  let tris = 0;
  for (const part of PARTS) {
    const t0 = Date.now();
    const m = mesh(part.sdf, part.bounds, step * (part.scale ?? 1));
    tris += m.index.length / 3;
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.position).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normal).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.index).setBuffer(buffer))
      .setMaterial(doc.createMaterial(part.name).setBaseColorFactor([0.96, 0.94, 0.91, 1]).setRoughnessFactor(0.3).setMetallicFactor(0));
    const node = doc.createNode(part.name).setMesh(doc.createMesh(part.name).addPrimitive(prim));
    scene.addChild(node);
    console.log(`  ${part.name}: ${m.index.length / 3} tris, ${m.position.length / 3} verts (${Date.now() - t0} ms)`);
  }
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
    method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    encodeSpeed: 3,
    decodeSpeed: 5,
    quantizePosition: 14,
    quantizeNormal: 10,
  });
  const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  const glb = await io.writeBinary(doc);
  writeFileSync(file, glb);
  console.log(`${file}: ${tris} tris, ${(statSync(file).size / 1024).toFixed(0)} KB`);
}

mkdirSync('public/models', { recursive: true });
console.log('high detail');
await build('public/models/tooth-hi.glb', 0.02);
console.log('low detail (mobile)');
await build('public/models/tooth-lo.glb', 0.036);
