import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { MARKER_ANCHORS, STAGE_ANGLES, toothState } from './state';

const ACCENT = new THREE.Color('#7ec8b0');
const DENTIN = new THREE.Color('#e8d6b4');

interface SceneOptions {
  canvas: HTMLCanvasElement;
  markers: HTMLElement[];
  mobile: boolean;
  reducedMotion: boolean;
  onReady?: () => void;
}

type Uniforms = Record<string, THREE.IUniform>;

/** Injects the IVORY effects (highlights, root dissolve, x-ray, iridescence) into the enamel material. */
function patchEnamel(material: THREE.MeshPhysicalMaterial, uniforms: Uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nvarying vec3 vWorldNormal;\nuniform float uStump;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLocal = position;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        // crown preparation: the enamel crown is ground down to a slimmer stump
        float prep = uStump * smoothstep(0.12, 0.5, position.y);
        transformed.xz *= 1.0 - 0.22 * prep;
        transformed.y -= 0.16 * prep * smoothstep(0.55, 1.25, position.y);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLocal;
        varying vec3 vWorldNormal;
        uniform float uTime, uHl1, uHl2, uCut, uXray, uStump;
        uniform vec3 uHl1Pos, uHl2Pos, uAccent, uDentin;

        // thin-film iridescence: pearlescent rainbow tint on grazing angles
        vec3 thinFilmIridescence(float cosTheta, float thickness) {
          float d = thickness * 2.0 * max(cosTheta, 0.01);
          vec3 color;
          color.r = cos(d * 12.5664) * 0.5 + 0.5;
          color.g = cos(d * 12.5664 + 2.0944) * 0.5 + 0.5;
          color.b = cos(d * 12.5664 + 4.1888) * 0.5 + 0.5;
          return color;
        }

        // micro-sparkle: tiny bright spots that catch directional light
        float sparkle(vec3 p, float t) {
          vec3 q = fract(p * 28.0) - 0.5;
          float d = length(q);
          float phase = dot(floor(p * 28.0), vec3(17.3, 7.7, 13.1));
          float flicker = sin(phase + t * 3.2) * sin(phase * 1.7 + t * 1.8);
          return smoothstep(0.14, 0.04, d) * max(flicker, 0.0);
        }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float cutEdge = vLocal.y - uCut + 0.035 * sin(vLocal.x * 23.0) * sin(vLocal.z * 19.0);
        if (cutEdge < 0.0) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (!gl_FrontFacing) diffuseColor.rgb = uDentin;

        // enamel gradient: warmer / translucent near the gum line, pearly white at crown
        float yNorm = smoothstep(-2.0, 1.4, vLocal.y);
        vec3 enamelGrad = mix(vec3(0.95, 0.89, 0.82), vec3(0.96, 0.95, 0.93), yNorm);
        diffuseColor.rgb = mix(diffuseColor.rgb, enamelGrad, 0.35);

        // prepared stump under the crown: enamel above the margin turns to dentin
        float stump = uStump * smoothstep(0.1, 0.3, vLocal.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, uDentin * 0.92, stump);
        float d1 = distance(vLocal, uHl1Pos);
        float fill1 = 1.0 - smoothstep(0.2, 0.36, d1);
        float d2 = distance(vLocal, uHl2Pos);
        float shell2 = 1.0 - smoothstep(0.66, 0.72, d2);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uAccent * exp(-cutEdge * 28.0) * step(-4.0, uCut) * 2.2;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        // iridescence: pearlescent rainbow at grazing angles
        float cosT = abs(dot(normalize(normal), normalize(vViewPosition)));
        vec3 irid = thinFilmIridescence(cosT, 0.42 + 0.08 * sin(uTime * 0.3));
        float iridMask = pow(1.0 - cosT, 3.2) * (1.0 - uXray);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * (0.7 + 0.3 * irid), iridMask * 0.45);

        // micro-sparkle on the surface
        float sp = sparkle(vLocal, uTime) * (1.0 - uXray) * smoothstep(0.3, 0.6, cosT);
        gl_FragColor.rgb += vec3(1.0, 0.98, 0.94) * sp * 0.35;

        // therapy: composite filling with a scanning ring
        float ring1 = exp(-pow((d1 - 0.36) / 0.03, 2.0));
        float scan1 = 0.5 + 0.5 * sin(d1 * 60.0 - uTime * 5.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.78, 0.93, 0.88), fill1 * uHl1 * (0.55 + 0.45 * scan1));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.12, 0.42, 0.34), ring1 * uHl1 * 0.95);
        // aesthetics: veneer shell, outlined and swept by a scan line
        float edge2 = exp(-pow((d2 - 0.7) / 0.028, 2.0));
        float sweep2 = exp(-pow((fract(vLocal.y * 0.7 - uTime * 0.35) - 0.5) / 0.035, 2.0));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.86, 0.97, 0.93), shell2 * uHl2 * 0.7);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.3, 0.72, 0.6), shell2 * sweep2 * uHl2 * 0.6);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.12, 0.42, 0.34), edge2 * uHl2 * 0.95);
        float fr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);
        vec3 xcol = mix(vec3(0.06, 0.12, 0.11), uAccent * 1.7, fr);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, xcol, uXray * 0.9);
        gl_FragColor.a = mix(gl_FragColor.a, 0.05 + fr * 0.75, uXray);`,
      );
  };
  material.customProgramCacheKey = () => 'ivory-enamel-v2';
}

/** Soft fresnel rim for the ceramic crown so it reads as glass-like zirconia. */
function patchRim(material: THREE.MeshPhysicalMaterial, strength: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAccent = { value: ACCENT };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uAccent;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float rim = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.5);
        gl_FragColor.rgb += uAccent * rim * ${strength.toFixed(2)};
        gl_FragColor.a = clamp(gl_FragColor.a + rim * 0.5 * gl_FragColor.a, 0.0, 1.0);`,
      );
  };
  material.customProgramCacheKey = () => `ivory-rim-${strength}`;
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(40,52,48,0.3)');
  grd.addColorStop(0.45, 'rgba(40,52,48,0.1)');
  grd.addColorStop(1, 'rgba(40,52,48,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ToothScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  private root = new THREE.Group(); // screen placement, enter/exit
  private spin = new THREE.Group(); // rotation from scroll + pointer
  private model = new THREE.Group(); // centred tooth
  private uniforms: Uniforms = {
    uTime: { value: 0 },
    uHl1: { value: 0 },
    uHl2: { value: 0 },
    uCut: { value: -10 },
    uXray: { value: 0 },
    uStump: { value: 0 },
    uHl1Pos: { value: new THREE.Vector3(...MARKER_ANCHORS[0]) },
    uHl2Pos: { value: new THREE.Vector3(...MARKER_ANCHORS[1]) },
    uAccent: { value: ACCENT },
    uDentin: { value: DENTIN },
  };
  private enamel!: THREE.MeshPhysicalMaterial;
  private pulpMat!: THREE.MeshStandardMaterial;
  private crownMat!: THREE.MeshPhysicalMaterial;
  private parts: Record<string, THREE.Mesh> = {};
  private shadow!: THREE.Mesh;
  private anchors = MARKER_ANCHORS.map((a) => new THREE.Vector3(...a));
  private tmp = new THREE.Vector3();
  private pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  private size = { w: 1, h: 1 };
  private markerState: number[] = [-1, -1, -1, -1, -1];
  private smooth = { rotY: toothState.rotY, rotX: toothState.rotX };
  private active = true;
  private ready = false;
  private resizeObserver: ResizeObserver;
  private time = 0;

  constructor(private opts: SceneOptions) {
    const { canvas, mobile } = opts;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const key = new THREE.DirectionalLight('#fff1de', 1.7);
    key.position.set(4, 6, 6);
    const rim = new THREE.DirectionalLight('#d4f1e7', 2.2);
    rim.position.set(-6, 2.5, -5);
    const fill = new THREE.HemisphereLight('#ffffff', '#cdbca4', 0.35);
    const glow = new THREE.PointLight('#bfe8da', 4, 9, 1.6);
    glow.position.set(-2.5, -2, 3);
    this.scene.add(key, rim, fill, glow);

    this.camera.position.set(0, 0.9, 12.5);
    this.camera.lookAt(0, 0, 0);

    this.root.add(this.spin);
    this.spin.add(this.model);
    this.scene.add(this.root);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -2.1;
    this.root.add(this.shadow);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement!);
    this.resize();

    if (!mobile && !opts.reducedMotion) {
      window.addEventListener('pointermove', this.onPointer, { passive: true });
    }
    window.addEventListener('pagehide', this.dispose, { once: true });
    gsap.ticker.add(this.tick);
  }

  async load(url: string) {
    const draco = new DRACOLoader();
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const gltf = await loader.loadAsync(url);
    draco.dispose();

    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.parts[o.name] = o as THREE.Mesh;
    });

    this.enamel = new THREE.MeshPhysicalMaterial({
      color: '#f7f2eb',
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      sheen: 0.6,
      sheenColor: new THREE.Color('#ffe8c8'),
      sheenRoughness: 0.35,
      iridescence: 0.3,
      iridescenceIOR: 1.8,
      side: THREE.DoubleSide,
      transparent: true,
    });
    patchEnamel(this.enamel, this.uniforms);

    this.pulpMat = new THREE.MeshStandardMaterial({
      color: '#244a41',
      emissive: ACCENT,
      emissiveIntensity: 1.2,
      roughness: 0.4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.crownMat = new THREE.MeshPhysicalMaterial({
      color: '#f8fbfa',
      roughness: 0.06,
      metalness: 0.01,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      sheen: 0.4,
      sheenColor: new THREE.Color('#e0f0ea'),
      sheenRoughness: 0.25,
      iridescence: 0.15,
      iridescenceIOR: 1.6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    patchRim(this.crownMat, 2.0);

    const implantMat = new THREE.MeshPhysicalMaterial({
      color: '#d0d5d9',
      metalness: 1,
      roughness: 0.18,
      clearcoat: 0.6,
      clearcoatRoughness: 0.12,
      reflectivity: 0.9,
    });

    const { tooth, pulp, crown, implant } = this.parts;
    tooth.material = this.enamel;
    pulp.material = this.pulpMat;
    crown.material = this.crownMat;
    implant.material = implantMat;
    pulp.renderOrder = 1;
    tooth.renderOrder = 2;
    crown.renderOrder = 3;
    pulp.visible = crown.visible = implant.visible = false;

    // centre the model on its own bounding box so it spins in place
    tooth.geometry.computeBoundingBox();
    const box = tooth.geometry.boundingBox!;
    const centre = box.getCenter(new THREE.Vector3());
    this.model.position.copy(centre).multiplyScalar(-1);
    this.model.add(gltf.scene);

    // compile shaders before the first visible frame to avoid a hitch
    pulp.visible = crown.visible = implant.visible = true;
    await this.renderer.compileAsync(this.scene, this.camera);
    pulp.visible = crown.visible = implant.visible = false;

    this.ready = true;
    this.opts.onReady?.();
  }

  setActive(active: boolean) {
    this.active = active;
    if (!active) this.renderer.renderLists.dispose();
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };

  private resize() {
    const parent = this.opts.canvas.parentElement!;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Visible frustum size at the model's depth. */
  private viewSize() {
    const dist = this.camera.position.length();
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist;
    return { h, w: h * this.camera.aspect };
  }

  private tick = (_t: number, deltaMs: number) => {
    if (!this.ready || !this.active || document.hidden) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.time += dt;
    const s = toothState;
    const { mobile, reducedMotion } = this.opts;

    // --- placement: enter from below, sit right of the copy on desktop, exit up + small
    const view = this.viewSize();
    const portrait = this.size.w < 861;
    const baseX = portrait ? 0 : view.w * 0.08;
    const baseY = portrait ? view.h * 0.19 : -view.h * 0.02;
    const baseScale = portrait ? Math.min(0.64, (view.w / 3.4) * 0.86) : 1;
    const enter = gsap.parseEase('power3.out')(s.enter);
    const exit = gsap.parseEase('power2.in')(s.exit);
    const float = reducedMotion ? 0 : Math.sin(this.time * 0.9) * 0.05;
    this.root.position.set(baseX, baseY + (1 - enter) * -view.h * 0.85 + exit * view.h * 0.35 + float, 0);
    this.root.scale.setScalar(baseScale * (0.82 + 0.18 * enter) * (1 - exit * 0.55));

    // --- rotation: scroll-driven, smoothed, plus a little pointer parallax
    const k = 1 - Math.pow(0.0015, dt);
    this.smooth.rotY += (s.rotY - this.smooth.rotY) * k;
    this.smooth.rotX += (s.rotX - this.smooth.rotX) * k;
    this.pointer.sx += (this.pointer.x - this.pointer.sx) * k * 0.5;
    this.pointer.sy += (this.pointer.y - this.pointer.sy) * k * 0.5;
    this.spin.rotation.set(
      this.smooth.rotX + this.pointer.sy * 0.1,
      this.smooth.rotY + this.pointer.sx * 0.16 + (1 - enter) * -0.6,
      Math.sin(this.time * 0.6) * 0.02 * (reducedMotion ? 0 : 1),
    );

    // --- service effects
    const u = this.uniforms;
    u.uTime.value = this.time;
    u.uHl1.value = s.hlFill;
    u.uHl2.value = s.hlVeneer;
    u.uCut.value = s.rootCut > 0.001 ? THREE.MathUtils.lerp(-2.3, 0.18, s.rootCut) : -10;
    u.uXray.value = s.xray;
    this.enamel.depthWrite = s.xray < 0.05;

    const { pulp, crown, implant } = this.parts;
    pulp.visible = s.xray > 0.01;
    this.pulpMat.opacity = s.xray;
    this.pulpMat.emissiveIntensity = 0.8 + 0.5 * Math.sin(this.time * 2.4) * s.xray;

    crown.visible = s.crown > 0.01;
    this.crownMat.opacity = Math.min(1, s.crown * 3) * 0.9;
    u.uStump.value = Math.min(1, s.crown * 4);
    crown.position.y = (1 - gsap.parseEase('power2.inOut')(gsap.utils.clamp(0, 1, s.crown * 1.25 - 0.2))) * 1.9;

    implant.visible = s.implant > 0.01;
    const ie = gsap.parseEase('power2.out')(s.implant);
    implant.position.set(0, THREE.MathUtils.lerp(-4.6, -0.78, ie), 0);
    implant.rotation.y = (1 - ie) * Math.PI * 5;

    (this.shadow.material as THREE.MeshBasicMaterial).opacity = (1 - s.xray * 0.8) * enter * (1 - exit) * (portrait ? 0.45 : 1);

    this.renderer.render(this.scene, this.camera);
    this.updateMarkers();
  };

  private updateMarkers() {
    const { w, h } = this.size;
    this.model.updateMatrixWorld();
    this.opts.markers.forEach((el, i) => {
      const o = toothState.markers[i];
      if (o <= 0.001) {
        if (this.markerState[i] !== 0) {
          el.style.opacity = '0';
          el.classList.remove('is-on');
          this.markerState[i] = 0;
        }
        return;
      }
      // the implant anchor lives on the implant, which moves with its own animation
      const target = i === 3 && this.parts.implant ? this.parts.implant : this.model;
      this.tmp.copy(this.anchors[i]);
      if (i === 3) this.tmp.set(this.anchors[i].x, 0.05, this.anchors[i].z);
      this.tmp.applyMatrix4(target.matrixWorld).project(this.camera);
      const x = (this.tmp.x * 0.5 + 0.5) * w;
      const y = (-this.tmp.y * 0.5 + 0.5) * h;
      // flip the label to the left when it would run off the right edge
      const flip = x > w - (w < 861 ? 190 : 280);
      el.classList.toggle('is-left', flip);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${flip ? ' translateX(-100%)' : ''}`;
      el.style.opacity = o.toFixed(3);
      if (o > 0.6 && this.markerState[i] !== 2) {
        el.classList.add('is-on');
        this.markerState[i] = 2;
      } else if (o <= 0.6 && this.markerState[i] === 2) {
        el.classList.remove('is-on');
        this.markerState[i] = 1;
      } else if (this.markerState[i] === 0) this.markerState[i] = 1;
    });
  }

  dispose = () => {
    gsap.ticker.remove(this.tick);
    window.removeEventListener('pointermove', this.onPointer);
    this.resizeObserver.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => {
          (mat as THREE.MeshBasicMaterial).map?.dispose();
          mat.dispose();
        });
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
  };
}

export async function createToothScene(opts: SceneOptions) {
  const scene = new ToothScene(opts);
  await scene.load(opts.mobile ? '/models/tooth-lo.glb' : '/models/tooth-hi.glb');
  return scene;
}

export { STAGE_ANGLES };
