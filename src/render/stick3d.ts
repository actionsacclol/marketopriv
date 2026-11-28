import * as THREE from 'three';
import { perfNow } from '../lib/perf';
import { makeRenderer } from './char3d';

// The stickman's 2.5D world: the flat cartoon figures act inside real 3D places
// (a bedroom, a street, a forest...) built from simple shapes, toon-lit, every
// object with a thick ink outline so it matches the figures' lines, and always
// something moving in the background (curtains, steam, cars, birds, water,
// smoke, leaves). Every frame is a pure function of its input.
//
// Space: the figures stand on the plane z = 0, 1 world unit = PX stage pixels;
// stage x = W/2 is x = 0 and the stage ground line is y = 0. The camera looks at
// that plane from +z; the caller gets back how the plane lands on screen so it
// can draw the figures (and their props) on it.

export const PX = 360;
const FOV = 50;
const INK = '#1A1614';
const T = 0.028;

export type Stick3dLook = 'day' | 'dusk' | 'night';

export interface Stick3dCam {
  /** Where the camera is centred on the figures' plane, world units. */
  x: number;
  y: number;
  /** Zoom (1 = the stage's own framing). */
  zoom: number;
  /** Degrees around the plane (a slow orbit gives the parallax). */
  yaw: number;
  /** Degrees up / down. */
  pitch: number;
}

export interface Stick3dFrame {
  place: string;
  look: Stick3dLook;
  t: number;
  local: number;
  knock: boolean;
  cam: Stick3dCam;
}

export interface Stick3dOut {
  canvas: HTMLCanvasElement;
  /** Where the plane's origin (stage W/2, ground) lands on the output frame (1080 x 1920), and how many output px one stage px is there. */
  ox: number;
  oy: number;
  k: number;
  /** Interiors fill the frame; outside, the sky behind is the caller's (transparent). */
  interior: boolean;
}

export const STICK3D_INTERIOR = ['bedroom', 'kitchen', 'office', 'classroom', 'hospital', 'store'];

// ── Materials ─────────────────────────────────────────────────────────────
let ramp: THREE.DataTexture | null = null;
function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}
const mats = new Map<string, THREE.Material>();
function toon(color: string): THREE.Material {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() });
    mats.set(color, m);
  }
  return m;
}
/** Things that give light (screens, lamps, windows at night, fire) are not shaded. */
const glowMats: THREE.MeshBasicMaterial[] = [];
function glow(color: string): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color });
  glowMats.push(m);
  return m;
}
const OUTLINE = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A mesh with its ink outline: a black copy just bigger than it, seen from inside. */
function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, ink = true, t = T): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  if (ink) {
    geo.computeBoundingBox();
    const s = new THREE.Vector3();
    geo.boundingBox!.getSize(s);
    const ol = new THREE.Mesh(geo, OUTLINE);
    ol.scale.set(1 + (2 * t) / Math.max(0.03, s.x), 1 + (2 * t) / Math.max(0.03, s.y), 1 + (2 * t) / Math.max(0.03, s.z));
    o.add(ol);
  }
  return o;
}
const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 12): THREE.BufferGeometry => new THREE.CylinderGeometry(rt, rb, h, seg);
const ball = (r: number, seg = 12): THREE.BufferGeometry => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4));
const cone = (r: number, h: number, seg = 10): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, seg);

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, ink = true): THREE.Mesh {
  const o = part(geo, toon(color), x, y, z, ink);
  g.add(o);
  return o;
}
function addGlow(g: THREE.Object3D, geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, ink = true): THREE.Mesh {
  const o = part(geo, glow(color), x, y, z, ink);
  g.add(o);
  return o;
}
/** A flat thing on the floor or a wall (no outline, no depth fighting). */
function flat(g: THREE.Object3D, w: number, h: number, color: string, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toon(color));
  o.position.set(x, y, z);
  o.rotation.x = rx;
  g.add(o);
  return o;
}

type Tick = (t: number, f: Stick3dFrame) => void;
interface Built {
  group: THREE.Group;
  ticks: Tick[];
  /** Lights that only come on at night (lamps, street lights, fire is always on). */
  lamps: Array<{ light: THREE.PointLight; power: number; always: boolean }>;
  /** Windows: sky by day, lit at night. */
  windows: THREE.MeshBasicMaterial[];
}

// ── Pieces ────────────────────────────────────────────────────────────────
function room(b: Built, wall: string, floor: string, trim = '#F2ECE0'): void {
  const g = b.group;
  flat(g, 30, 14, floor, 0, 0, -1, -Math.PI / 2);
  // Floor boards: long thin strips.
  for (let i = 0; i < 9; i++) flat(g, 30, 0.02, shade(floor, -0.12), 0, 0.002, -2.3 + i * 0.6, -Math.PI / 2);
  add(g, box(16, 7, 0.3), wall, 0, 3.5, -2.6, false);
  add(g, box(16, 0.16, 0.1), trim, 0, 0.08, -2.42);
  add(g, box(16, 0.12, 0.1), trim, 0, 4.4, -2.42);
  for (const x of [-4.6, 4.6]) add(g, box(0.3, 7, 8), shade(wall, -0.08), x, 3.5, 1.2, false);
}

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 0) c.lerp(new THREE.Color('#000000'), -k);
  else c.lerp(new THREE.Color('#FFFFFF'), k);
  return `#${c.getHexString()}`;
}

function windowPane(b: Built, x: number, y: number, z: number, w: number, h: number, frameColor = '#F4EEE2', curtains?: string): void {
  const g = b.group;
  add(g, box(w + 0.2, h + 0.2, 0.08), frameColor, x, y, z);
  const pane = glow('#BFE3F2');
  b.windows.push(pane);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pane);
  p.position.set(x, y, z + 0.05);
  g.add(p);
  add(g, box(0.06, h, 0.06), frameColor, x, y, z + 0.07);
  add(g, box(w, 0.06, 0.06), frameColor, x, y, z + 0.07);
  if (curtains) {
    for (const side of [-1, 1]) {
      const c = add(g, box(w * 0.32, h + 0.5, 0.06), curtains, x + side * (w / 2 + 0.05), y - 0.1, z + 0.14);
      const k = side * 0.6 + x;
      b.ticks.push((t) => {
        c.rotation.z = 0.035 * Math.sin(t * 1.3 + k);
        c.scale.x = 1 + 0.05 * Math.sin(t * 0.9 + k);
      });
    }
    add(g, cyl(0.03, 0.03, w + 1.2, 6), '#7A5A3C', x, y + h / 2 + 0.25, z + 0.18).rotateZ(Math.PI / 2);
  }
}

function wallClock(b: Built, x: number, y: number, z: number, r = 0.32): void {
  const g = b.group;
  const face = add(g, cyl(r, r, 0.08, 20), '#FFFFFF', x, y, z);
  face.rotation.x = Math.PI / 2;
  const hand = new THREE.Group();
  hand.position.set(x, y, z + 0.06);
  g.add(hand);
  const h1 = new THREE.Mesh(box(0.03, r * 0.8, 0.02), toon(INK));
  h1.position.y = r * 0.38;
  hand.add(h1);
  const hand2 = new THREE.Group();
  hand2.position.set(x, y, z + 0.07);
  g.add(hand2);
  const h2 = new THREE.Mesh(box(0.04, r * 0.55, 0.02), toon(INK));
  h2.position.y = r * 0.26;
  hand2.add(h2);
  b.ticks.push((t) => {
    hand.rotation.z = -t * 1.4;
    hand2.rotation.z = -t * 0.12 - 1;
  });
}

function picture(g: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, color: string): void {
  add(g, box(w, h, 0.05), '#3A2C22', x, y, z);
  flat(g, w - 0.12, h - 0.12, color, x, y, z + 0.03);
}

function potPlant(b: Built, x: number, z: number, k = 1): void {
  const g = b.group;
  add(g, cyl(0.2 * k, 0.15 * k, 0.4 * k), '#C46A3C', x, 0.2 * k, z);
  const leaves = new THREE.Group();
  leaves.position.set(x, 0.4 * k, z);
  g.add(leaves);
  for (let i = 0; i < 5; i++) {
    const l = part(ball(0.18 * k, 8), toon('#4E9A4A'), Math.sin(i * 1.3) * 0.16 * k, (0.2 + i * 0.13) * k, Math.cos(i * 1.3) * 0.1 * k);
    l.scale.set(1, 1.5, 0.7);
    leaves.add(l);
  }
  b.ticks.push((t) => {
    leaves.rotation.z = 0.04 * Math.sin(t * 1.1 + x);
  });
}

function lamp(b: Built, x: number, y: number, z: number, color = '#FFD27A', power = 1.4, always = false): THREE.Mesh {
  const shadeM = addGlow(b.group, cyl(0.16, 0.26, 0.3, 12), color, x, y, z);
  const light = new THREE.PointLight(color, 0, 7, 1.5);
  light.position.set(x, y - 0.1, z + 0.3);
  b.group.add(light);
  b.lamps.push({ light, power, always });
  return shadeM;
}

function car(color: string): THREE.Group {
  const g = new THREE.Group();
  add(g, box(2.4, 0.5, 1.1), color, 0, 0.5, 0);
  add(g, box(1.3, 0.45, 1.0), color, -0.1, 0.95, 0);
  addGlow(g, box(1.2, 0.34, 1.02), '#BFE3F2', -0.1, 0.96, 0, false);
  for (const x of [-0.75, 0.75]) for (const z of [-0.5, 0.5]) {
    const w = add(g, cyl(0.24, 0.24, 0.16, 12), '#2A2A2E', x, 0.26, z);
    w.rotation.x = Math.PI / 2;
  }
  addGlow(g, box(0.05, 0.12, 0.25), '#FFF2B0', 1.21, 0.58, 0.3, false);
  return g;
}

function cloud(b: Built, x: number, y: number, z: number, s: number, speed: number): void {
  const c = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const r = (0.6 + 0.4 * hash(i + x)) * s;
    c.add(part(ball(r, 10), toon('#FFFFFF'), (i - 2) * 0.75 * s, (i % 2) * 0.25 * s, 0, true, T * 3));
  }
  c.position.set(x, y, z);
  b.group.add(c);
  b.ticks.push((t) => {
    c.position.x = ((x + t * speed + 40) % 80) - 40;
  });
}

function birds(b: Built, y: number, z: number, n = 3, seed = 0): void {
  for (let i = 0; i < n; i++) {
    const bird = new THREE.Group();
    const wingL = part(box(0.36, 0.04, 0.12), toon('#2A2A30'), -0.17, 0, 0, false);
    const wingR = part(box(0.36, 0.04, 0.12), toon('#2A2A30'), 0.17, 0, 0, false);
    bird.add(wingL, wingR);
    b.group.add(bird);
    const sp = 1.1 + hash(i + seed) * 0.8;
    b.ticks.push((t) => {
      const u = ((t * sp * 0.12 + hash(i * 7 + seed)) % 1) * 30 - 15;
      bird.position.set(u, y + 0.5 * Math.sin(t * 0.7 + i) + i * 0.4, z - i * 1.5);
      const f = Math.sin(t * 9 + i * 2) * 0.6;
      wingL.rotation.z = f;
      wingR.rotation.z = -f;
    });
  }
}

function pine(b: Built, x: number, z: number, h: number, color = '#2F7A4A', sway = true): void {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  add(tree, cyl(0.1 * h * 0.3, 0.14 * h * 0.3, 0.6, 7), '#6B4A30', 0, 0.3, 0);
  for (let i = 0; i < 3; i++) add(tree, cone((0.9 - i * 0.22) * h * 0.45, h * 0.42, 9), shade(color, i * 0.06), 0, 0.6 + h * (0.18 + i * 0.22), 0);
  b.group.add(tree);
  if (sway) b.ticks.push((t) => void (tree.rotation.z = 0.02 * Math.sin(t * 0.9 + x * 1.7)));
}

function roundTree(b: Built, x: number, z: number, h: number, color = '#5AA64F'): void {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  add(tree, cyl(0.12, 0.17, h * 0.55, 7), '#7A5236', 0, h * 0.27, 0);
  const crown = new THREE.Group();
  crown.position.y = h * 0.7;
  tree.add(crown);
  for (let i = 0; i < 4; i++) crown.add(part(ball(h * (0.26 + 0.06 * hash(i + x)), 10), toon(shade(color, i * 0.05)), Math.sin(i * 2.1) * h * 0.18, Math.cos(i * 1.7) * h * 0.1, Math.cos(i * 2.1) * h * 0.1));
  b.group.add(tree);
  b.ticks.push((t) => {
    crown.rotation.z = 0.03 * Math.sin(t * 1.0 + x);
    crown.position.x = 0.03 * Math.sin(t * 1.0 + x);
  });
}

/** Little particles rising and fading (steam, smoke): spheres that loop. */
function rising(b: Built, x: number, y: number, z: number, n: number, color: string, height: number, spread = 0.25, size = 0.1): void {
  for (let i = 0; i < n; i++) {
    // Soft and unshaded (smoke and steam glow a little in any light), fading as they rise.
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false });
    const p = new THREE.Mesh(ball(size, 10), m);
    b.group.add(p);
    const off = i / n;
    b.ticks.push((t) => {
      const u = (t * 0.45 + off) % 1;
      p.position.set(x + spread * Math.sin(t * 1.3 + i * 2) * u, y + u * height, z);
      p.scale.setScalar(Math.max(0.01, 0.5 + u * 1.1));
      m.opacity = 0.7 * (1 - u) * Math.min(1, u * 6);
    });
  }
}

function fallingLeaves(b: Built, n: number, colors: string[]): void {
  for (let i = 0; i < n; i++) {
    const leaf = part(box(0.12, 0.02, 0.08), toon(colors[i % colors.length]), 0, 0, 0, false);
    b.group.add(leaf);
    const x0 = -4 + hash(i) * 8;
    const z0 = -3 + hash(i + 9) * 4;
    b.ticks.push((t) => {
      const u = (t * 0.12 + hash(i + 3)) % 1;
      leaf.position.set(x0 + 0.5 * Math.sin(t * 1.4 + i), 4.5 - u * 4.6, z0);
      leaf.rotation.set(t * 2 + i, t * 1.3, t * 1.7);
    });
  }
}

function traffic(b: Built, z: number, colors: string[], speed = 4, dir = 1): void {
  colors.forEach((c, i) => {
    const k = car(c);
    k.rotation.y = dir > 0 ? 0 : Math.PI;
    b.group.add(k);
    b.ticks.push((t) => {
      const u = ((t * speed + i * 13) % 40) - 20;
      k.position.set(dir * u, 0, z);
    });
  });
}

function building(b: Built, x: number, z: number, w: number, h: number, d: number, color: string, seed: number): void {
  const g = b.group;
  add(g, box(w, h, d), color, x, h / 2, z);
  add(g, box(w + 0.15, 0.2, d + 0.15), shade(color, -0.25), x, h + 0.1, z);
  const cols = Math.max(1, Math.floor(w / 0.9));
  const rows = Math.max(1, Math.floor((h - 1.2) / 1.1));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const m = glow(hash(seed + r * 7 + c) > 0.5 ? '#BFE3F2' : '#A8D2E6');
      b.windows.push(m);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62), m);
      p.position.set(x - w / 2 + (c + 0.5) * (w / cols), 1.5 + r * 1.1, z + d / 2 + 0.01);
      g.add(p);
    }
}

// ── Places ────────────────────────────────────────────────────────────────
type Builder = (b: Built) => void;

const PLACES: Record<string, Builder> = {
  bedroom(b) {
    const g = b.group;
    room(b, '#9CC3DE', '#C9925E');
    windowPane(b, -1.2, 2.3, -2.42, 1.5, 1.3, '#F4EEE2', '#E56B5D');
    // The bed, to the right.
    add(g, box(2.2, 0.35, 1.5), '#8A5A3A', 2.0, 0.35, -1.6);
    add(g, box(2.1, 0.25, 1.4), '#FFFFFF', 2.0, 0.65, -1.6);
    add(g, box(1.5, 0.2, 1.44), '#F2C230', 2.3, 0.8, -1.6);
    add(g, box(0.5, 0.18, 0.9), '#FFFFFF', 1.15, 0.86, -1.6);
    add(g, box(0.15, 1.2, 1.5), '#8A5A3A', 0.9, 0.6, -1.6);
    // Nightstand and lamp.
    add(g, box(0.6, 0.6, 0.5), '#B07A4E', 0.2, 0.3, -2.1);
    add(g, cyl(0.04, 0.08, 0.4, 8), '#3A2C22', 0.2, 0.8, -2.1);
    lamp(b, 0.2, 1.1, -2.1, '#FFD27A', 1.2);
    picture(g, 1.6, 2.4, -2.42, 0.8, 0.6, '#F28C28');
    picture(g, 2.6, 2.6, -2.42, 0.6, 0.8, '#2F6FD6');
    wallClock(b, 0.2, 3.1, -2.4, 0.26);
    flat(g, 2.8, 1.8, '#D94A3A', -0.2, 0.004, -0.4, -Math.PI / 2);
    // A desk and chair on the left.
    add(g, box(1.4, 0.08, 0.7), '#B07A4E', -2.9, 0.78, -2.0);
    for (const dx of [-0.62, 0.62]) add(g, box(0.06, 0.78, 0.6), '#8A5A3A', -2.9 + dx, 0.39, -2.0);
    add(g, box(0.5, 0.32, 0.04), '#2A2A30', -2.9, 1.0, -2.15);
    addGlow(g, box(0.44, 0.26, 0.01), '#7FD0FF', -2.9, 1.0, -2.12, false);
    potPlant(b, -4.0, -2.0);
  },
  kitchen(b) {
    const g = b.group;
    room(b, '#F2E3B8', '#9AA4AE', '#FFFFFF');
    // Tiles above the counter.
    for (let i = 0; i < 12; i++) for (let r = 0; r < 3; r++) flat(g, 0.48, 0.28, (i + r) % 2 ? '#FFFFFF' : '#DDEFF2', -3 + i * 0.5, 1.15 + r * 0.3, -2.44);
    add(g, box(6.4, 0.9, 0.7), '#4F8F8A', 0, 0.45, -2.1);
    add(g, box(6.5, 0.08, 0.76), '#E8E2D6', 0, 0.94, -2.1);
    for (let i = 0; i < 6; i++) add(g, box(0.04, 0.2, 0.04), '#F2ECE0', -2.7 + i * 1.08, 0.7, -1.74);
    add(g, box(6.4, 0.8, 0.45), '#4F8F8A', 0, 2.7, -2.25);
    // Stove with a pot and its steam.
    add(g, box(0.9, 0.04, 0.6), '#2A2A30', 1.4, 0.97, -2.1);
    add(g, cyl(0.26, 0.24, 0.32, 14), '#D94A3A', 1.4, 1.15, -2.05);
    rising(b, 1.4, 1.35, -2.05, 6, '#FFFFFF', 1.2, 0.2, 0.09);
    // Fridge.
    add(g, box(1.0, 2.2, 0.8), '#F4F4F2', -3.4, 1.1, -2.0);
    add(g, box(0.06, 0.5, 0.06), '#9AA4AE', -3.0, 1.5, -1.58);
    windowPane(b, -0.6, 2.05, -2.42, 1.2, 0.7, '#FFFFFF');
    // A hanging lamp that swings a little.
    const hang = new THREE.Group();
    hang.position.set(0, 4.2, -1.0);
    g.add(hang);
    hang.add(part(cyl(0.01, 0.01, 1.4, 4), toon(INK), 0, -0.7, 0, false));
    const sh = part(cone(0.32, 0.3, 12), glow('#FFD27A'), 0, -1.5, 0);
    hang.add(sh);
    b.ticks.push((t) => void (hang.rotation.z = 0.05 * Math.sin(t * 1.2)));
    const kl = new THREE.PointLight('#FFD27A', 0, 6, 1.5);
    kl.position.set(0, 2.5, -0.8);
    g.add(kl);
    b.lamps.push({ light: kl, power: 1.2, always: false });
  },
  office(b) {
    const g = b.group;
    room(b, '#D9DEE4', '#5C6B7E');
    // A band of windows with the city outside.
    for (let i = -2; i <= 2; i++) windowPane(b, i * 1.6, 2.4, -2.42, 1.4, 1.5, '#C9CFD6');
    for (const [x, z] of [[-2.4, -1.7], [2.4, -1.9]] as const) {
      add(g, box(1.6, 0.07, 0.8), '#E8E2D6', x, 0.76, z);
      for (const dx of [-0.72, 0.72]) add(g, box(0.06, 0.76, 0.7), '#8A939E', x + dx, 0.38, z);
      add(g, box(0.7, 0.42, 0.05), '#2A2A30', x, 1.08, z - 0.2);
      const scr = addGlow(g, box(0.62, 0.34, 0.01), '#6FA8E8', x, 1.08, z - 0.17, false);
      // Bars moving on the screen.
      for (let k = 0; k < 3; k++) {
        const bar = part(box(0.1, 0.2, 0.01), glow('#FFFFFF'), x - 0.18 + k * 0.17, 1.0, z - 0.16, false);
        g.add(bar);
        b.ticks.push((t) => {
          const h = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + k * 1.7 + x));
          bar.scale.y = h;
          bar.position.y = 0.94 + 0.1 * h;
        });
      }
      void scr;
      add(g, box(0.5, 0.08, 0.5), '#2A2C34', x, 0.48, z + 0.65);
      add(g, box(0.5, 0.6, 0.08), '#2A2C34', x, 0.82, z + 0.9);
    }
    potPlant(b, 3.9, -2.0, 1.3);
    potPlant(b, -4.0, -2.1, 1.2);
    // A water cooler with bubbles.
    add(g, box(0.4, 0.9, 0.4), '#F4F4F2', 0.3, 0.45, -2.2);
    add(g, cyl(0.17, 0.17, 0.5, 12), '#8FD3F0', 0.3, 1.15, -2.2);
    rising(b, 0.3, 0.95, -2.0, 4, '#DFF4FF', 0.4, 0.05, 0.03);
    for (const x of [-2, 2]) addGlow(g, box(1.4, 0.05, 0.6), '#FFFFFF', x, 4.6, -1.2);
  },
  classroom(b) {
    const g = b.group;
    room(b, '#E8D7A8', '#B88A5A');
    add(g, box(3.6, 1.7, 0.08), '#2E5A44', 0, 2.3, -2.4);
    add(g, box(3.8, 0.1, 0.18), '#B07A4E', 0, 1.4, -2.34);
    // Chalk lines that write themselves.
    for (let r = 0; r < 4; r++) {
      const ln = part(box(1, 0.04, 0.01), glow('#F0F0E8'), 0, 0, 0, false);
      g.add(ln);
      const w = 1.4 + hash(r) * 1.4;
      b.ticks.push((t) => {
        const u = Math.min(1, ((t * 0.25 + r * 0.3) % 2.2) / 1.2);
        ln.scale.x = Math.max(0.01, w * u);
        ln.position.set(-1.5 + (w * u) / 2, 2.8 - r * 0.32, -2.35);
      });
    }
    wallClock(b, 2.6, 3.1, -2.4, 0.3);
    windowPane(b, -3.2, 2.4, -2.42, 1.0, 1.4, '#F4EEE2');
    windowPane(b, 3.5, 2.4, -2.42, 0.8, 1.4, '#F4EEE2');
    add(g, box(1.6, 0.8, 0.7), '#8A5A3A', -2.4, 0.4, -1.5);
    for (const [x, z] of [[2.6, -1.0], [3.8, -1.6], [-3.9, -0.6]] as const) {
      add(g, box(0.9, 0.06, 0.6), '#D9A066', x, 0.72, z);
      for (const dx of [-0.38, 0.38]) add(g, box(0.05, 0.72, 0.05), '#5A5A60', x + dx, 0.36, z);
    }
    add(g, cyl(0.25, 0.25, 0.4, 14), '#3F7FD0', -2.2, 1.0, -1.5);
  },
  hospital(b) {
    const g = b.group;
    room(b, '#CFE8DE', '#E6E8E6');
    windowPane(b, -2.6, 2.4, -2.42, 1.4, 1.3, '#FFFFFF');
    add(g, box(2.3, 0.3, 1.1), '#FFFFFF', 2.2, 0.75, -1.6);
    add(g, box(1.6, 0.18, 1.12), '#8FC0E6', 2.5, 0.98, -1.6);
    for (const x of [1.05, 3.35]) add(g, box(0.08, 0.9, 1.1), '#9AA4AE', x, 0.75, -1.6);
    add(g, box(0.5, 0.14, 0.8), '#FFFFFF', 1.4, 0.98, -1.6);
    // The heart monitor with a moving line.
    add(g, box(0.9, 0.65, 0.2), '#2A2A30', 0.4, 2.0, -2.35);
    addGlow(g, box(0.8, 0.55, 0.01), '#0E2A22', 0.4, 2.0, -2.24, false);
    const blip = part(box(0.08, 0.08, 0.01), glow('#3CFF8A'), 0, 0, 0, false);
    g.add(blip);
    b.ticks.push((t) => {
      const u = (t * 0.6) % 1;
      const y = u > 0.45 && u < 0.55 ? 0.18 * Math.sin((u - 0.45) * Math.PI * 20) : 0;
      blip.position.set(0.05 + u * 0.7, 2.0 + y, -2.22);
    });
    // IV stand.
    add(g, cyl(0.025, 0.025, 2.0, 6), '#9AA4AE', 0.9, 1.0, -1.9);
    add(g, box(0.22, 0.32, 0.1), '#DFF4FF', 0.9, 1.9, -1.9);
    // A curtain on a rail.
    add(g, cyl(0.02, 0.02, 3, 6), '#9AA4AE', -2.4, 4.0, -1.2).rotateZ(Math.PI / 2);
    const cur = add(g, box(1.4, 3.6, 0.05), '#8FC0E6', -3.6, 2.2, -1.2);
    b.ticks.push((t) => void (cur.rotation.z = 0.015 * Math.sin(t * 0.8)));
    potPlant(b, 3.9, -2.2);
  },
  store(b) {
    const g = b.group;
    room(b, '#F4D9D2', '#D8D4CC');
    const colors = ['#D94A3A', '#F2C230', '#2F6FD6', '#3F9B5A', '#F28C28', '#7B5AC9', '#FFFFFF'];
    for (const x of [-2.6, 0, 2.6]) {
      add(g, box(2.2, 2.6, 0.6), '#E8E2D6', x, 1.3, -2.1);
      for (let r = 0; r < 4; r++) {
        add(g, box(2.1, 0.05, 0.6), '#B8B2A6', x, 0.3 + r * 0.62, -1.95);
        for (let i = 0; i < 6; i++) {
          const h = 0.25 + 0.2 * hash(x * 3 + r * 7 + i);
          add(g, box(0.28, h, 0.3), colors[Math.floor(hash(x + r * 11 + i * 3) * colors.length)], x - 0.85 + i * 0.34, 0.33 + r * 0.62 + h / 2, -1.9);
        }
      }
    }
    // The counter and register.
    add(g, box(1.6, 1.0, 0.7), '#4F8F8A', 3.6, 0.5, -0.6);
    add(g, box(0.45, 0.3, 0.35), '#2A2A30', 3.4, 1.15, -0.6);
    addGlow(g, box(0.35, 0.16, 0.01), '#3CFF8A', 3.4, 1.2, -0.42, false);
    // A hanging sign that turns slowly.
    const sign = new THREE.Group();
    sign.position.set(-1.3, 3.8, -0.8);
    g.add(sign);
    sign.add(part(box(1.2, 0.5, 0.06), toon('#F2C230'), 0, 0, 0));
    sign.add(part(box(0.7, 0.12, 0.07), toon('#D94A3A'), 0, 0, 0, false));
    b.ticks.push((t) => void (sign.rotation.y = 0.35 * Math.sin(t * 0.5)));
    // A flickering tube light.
    const tube = addGlow(g, box(2.2, 0.06, 0.2), '#FFFFFF', 1.3, 4.6, -1.0);
    b.ticks.push((t) => void (tube.visible = !(Math.sin(t * 23) > 0.96 && Math.sin(t * 3.1) > 0.3)));
  },
  street(b) {
    const g = b.group;
    flat(g, 60, 30, '#4A4E56', 0, -0.02, -5, -Math.PI / 2);
    add(g, box(60, 0.18, 3.2), '#C9C2B4', 0, 0.09, -1.4, false);
    add(g, box(60, 0.2, 0.15), '#9A9488', 0, 0.1, 0.22, false);
    // Lane marks.
    for (let i = -12; i <= 12; i++) flat(g, 1.2, 0.12, '#F2ECE0', i * 2.6, 0.0, -6.0, -Math.PI / 2);
    const fronts = ['#E8B4A0', '#9CC3DE', '#F2D28C', '#B8D8B0', '#D9A6C9', '#F4EEE2'];
    for (let i = -4; i <= 4; i++) {
      const h = 4 + 3 * hash(i + 4);
      building(b, i * 3.3, -4.0, 3.1, h, 1.6, fronts[(i + 8) % fronts.length], i * 13);
      add(g, box(3.0, 0.5, 0.3), shade(fronts[(i + 8) % fronts.length], -0.3), i * 3.3, 2.6, -3.05);
    }
    for (const x of [-3.2, 3.4]) {
      add(g, cyl(0.05, 0.07, 3.6, 8), '#2A2C30', x, 1.8, -0.6);
      lamp(b, x, 3.7, -0.6, '#FFE0A0', 1.6);
    }
    roundTree(b, -5.6, -1.6, 3.4);
    roundTree(b, 6.2, -1.6, 3.0);
    const parked = car('#D94A3A');
    parked.position.set(1.6, 0, -2.4);
    g.add(parked);
    traffic(b, -7.5, ['#2F6FD6', '#F2C230', '#3F9B5A', '#F4F4F2'], 5);
    traffic(b, -9.0, ['#F28C28', '#7B5AC9'], 4, -1);
    cloud(b, -6, 9, -26, 2.2, 0.35);
    cloud(b, 10, 10.5, -30, 2.8, 0.3);
    birds(b, 6.5, -8, 3, 1);
    rising(b, 4.95, 7.6, -4.6, 5, '#F4F4F2', 2.0, 0.4, 0.14);
    add(g, box(0.35, 0.8, 0.35), '#8A5A3A', 4.95, 7.3, -4.6);
  },
  city(b) {
    const g = b.group;
    flat(g, 80, 40, '#4A4E56', 0, -0.02, -10, -Math.PI / 2);
    add(g, box(80, 0.18, 3.2), '#BEB8AC', 0, 0.09, -1.4, false);
    const cols = ['#8FA3C0', '#B8C4D4', '#6F86A8', '#D0D6DE', '#A0B4C8'];
    for (let i = -6; i <= 6; i++) {
      const h = 9 + 12 * hash(i + 20);
      building(b, i * 3.6, -12 - 3 * hash(i + 2), 3.2, h, 3, cols[(i + 12) % cols.length], i * 31);
    }
    for (let i = -3; i <= 3; i++) {
      const h = 5 + 4 * hash(i + 40);
      building(b, i * 4.2 + 1.5, -4.5, 3.6, h, 2, cols[(i + 9) % cols.length], i * 17 + 5);
    }
    // A billboard and blinking antenna lights.
    add(g, box(3.4, 1.6, 0.15), '#2A2A30', -2.5, 9.5, -4.3);
    addGlow(g, box(3.2, 1.4, 0.02), '#F28C28', -2.5, 9.5, -4.2, false);
    for (let i = 0; i < 4; i++) {
      const bl = addGlow(g, ball(0.12, 8), '#FF3B30', -7 + i * 5, 18 + 3 * hash(i), -12.5, false);
      b.ticks.push((t) => void (bl.visible = (t + i * 0.4) % 1.6 < 0.8));
    }
    traffic(b, -7.0, ['#F2C230', '#2F6FD6', '#D94A3A', '#F4F4F2', '#2A2A30'], 7);
    traffic(b, -8.4, ['#3F9B5A', '#F28C28', '#F4F4F2'], 6, -1);
    for (const x of [-3.4, 3.6]) {
      add(g, cyl(0.05, 0.07, 3.8, 8), '#2A2C30', x, 1.9, -0.7);
      lamp(b, x, 3.9, -0.7, '#FFE0A0', 1.6);
    }
    cloud(b, 0, 16, -40, 3.5, 0.4);
    birds(b, 10, -10, 4, 2);
  },
  door(b) {
    const g = b.group;
    flat(g, 40, 20, '#6FB05A', 0, -0.01, -4, -Math.PI / 2);
    add(g, box(2.2, 0.2, 2.6), '#C9C2B4', 0, 0.1, -1.0);
    add(g, box(2.6, 0.22, 0.9), '#B8B2A6', 0, 0.22, -2.0);
    // The house front.
    add(g, box(12, 5.5, 0.4), '#F2D28C', 0, 2.75, -2.6);
    for (let i = 0; i < 10; i++) flat(g, 12, 0.03, '#D8B670', 0, 0.5 + i * 0.5, -2.39);
    const roof = add(g, box(13, 0.4, 2.6), '#B8503C', 0, 5.8, -1.9);
    roof.rotation.x = 0.35;
    // The door: it shakes when someone knocks.
    const door = new THREE.Group();
    door.position.set(0, 1.15, -2.36);
    g.add(door);
    door.add(part(box(1.1, 2.3, 0.1), toon('#8A3A2E'), 0, 0, 0));
    for (const y of [0.5, -0.4]) door.add(part(box(0.8, 0.6, 0.04), toon('#A04A3A'), 0, y, 0.06, false));
    door.add(part(ball(0.06, 8), toon('#F2C230'), 0.4, -0.05, 0.1, false));
    b.ticks.push((_t, f) => {
      const hit = f.knock ? [0.25, 0.5, 0.75].some((k) => f.local > k && f.local < k + 0.09) : false;
      door.position.x = hit ? 0.02 * Math.sin(f.local * 200) : 0;
    });
    add(g, box(1.4, 2.6, 0.12), '#F4EEE2', 0, 1.2, -2.42);
    for (const x of [-2.6, 2.6]) windowPane(b, x, 2.6, -2.36, 1.3, 1.2, '#FFFFFF', '#F4EEE2');
    lamp(b, 1.0, 2.6, -2.3, '#FFE0A0', 1.3);
    // A mailbox, bushes, a fence.
    add(g, cyl(0.04, 0.04, 1.0, 6), '#5A4A3A', -1.8, 0.5, 0.2);
    add(g, box(0.4, 0.3, 0.6), '#2F6FD6', -1.8, 1.1, 0.2);
    for (const x of [-3.6, -2.4, 2.4, 3.6]) {
      const bush = add(g, ball(0.55, 10), '#4E9A4A', x, 0.4, -2.0);
      bush.scale.set(1.2, 0.8, 0.8);
      b.ticks.push((t) => void (bush.scale.x = 1.2 + 0.03 * Math.sin(t * 1.3 + x)));
    }
    cloud(b, 6, 9, -26, 2.4, 0.3);
    birds(b, 7.2, -9, 3, 4);
  },
  forest(b) {
    const g = b.group;
    flat(g, 60, 40, '#5E9A4A', 0, -0.01, -10, -Math.PI / 2);
    for (let i = 0; i < 26; i++) {
      const x = -12 + hash(i) * 24;
      const z = -2 - hash(i + 40) * 14;
      if (Math.abs(x) < 1.6 && z > -3) continue;
      pine(b, x, z, 2.6 + 2.4 * hash(i + 7), ['#2F7A4A', '#3B8A52', '#276B40'][i % 3]);
    }
    for (const [x, z] of [[-2.4, -1.2], [2.8, -1.6]] as const) {
      const r = add(g, ball(0.45, 7), '#9A9AA2', x, 0.25, z);
      r.scale.set(1.3, 0.7, 1);
    }
    const log = add(g, cyl(0.22, 0.22, 1.8, 10), '#7A5236', 1.6, 0.22, -0.9);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = 0.4;
    for (let i = 0; i < 6; i++) {
      const m = add(g, cone(0.08, 0.14, 8), '#D94A3A', -3 + i * 1.1, 0.12, -0.5 - hash(i) * 1.5);
      m.scale.y = 0.7;
    }
    fallingLeaves(b, 14, ['#E8A33A', '#D9683A', '#C9B040']);
    birds(b, 6, -12, 2, 6);
  },
  park(b) {
    const g = b.group;
    flat(g, 60, 40, '#7CC266', 0, -0.01, -10, -Math.PI / 2);
    flat(g, 60, 1.6, '#E3D2A8', 0, 0.002, -1.2, -Math.PI / 2);
    // A pond with ducks on it.
    const pond = flat(g, 6, 2.4, '#5DB4E0', 3.4, 0.004, -5.2, -Math.PI / 2);
    pond.scale.set(1, 1, 1);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 20), glow('#BFE6F6'));
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      b.ticks.push((t) => {
        const u = (t * 0.35 + i * 0.25) % 1;
        ring.position.set(2.2 + i * 0.9, 0.01, -5.0 - (i % 2) * 0.5);
        ring.scale.setScalar(0.4 + u * 3);
        ring.visible = u < 0.9;
      });
    }
    for (let i = 0; i < 2; i++) {
      const duck = new THREE.Group();
      duck.add(part(ball(0.18, 10), toon('#F4F4F2'), 0, 0.12, 0));
      duck.add(part(ball(0.1, 8), toon('#3F9B5A'), 0.15, 0.3, 0));
      duck.add(part(cone(0.04, 0.1, 6), toon('#F28C28'), 0.27, 0.3, 0, false).rotateZ(-Math.PI / 2));
      g.add(duck);
      b.ticks.push((t) => {
        const a = t * 0.25 + i * Math.PI;
        duck.position.set(3.4 + 2.0 * Math.cos(a), 0, -5.2 + 0.7 * Math.sin(a));
        duck.rotation.y = -a - Math.PI / 2;
      });
    }
    // A bench, trees, a lamp, a fence.
    add(g, box(1.8, 0.08, 0.5), '#B07A4E', -2.3, 0.5, -2.2);
    add(g, box(1.8, 0.4, 0.06), '#B07A4E', -2.3, 0.85, -2.45);
    for (const dx of [-0.8, 0.8]) add(g, box(0.06, 0.5, 0.5), '#2A2C30', -2.3 + dx, 0.25, -2.2);
    roundTree(b, -4.6, -3.6, 4);
    roundTree(b, 0.6, -6.5, 4.6);
    roundTree(b, 6.5, -3.0, 3.6);
    roundTree(b, -8, -8, 5);
    add(g, cyl(0.05, 0.07, 3.4, 8), '#2A2C30', 2.2, 1.7, -2.4);
    lamp(b, 2.2, 3.5, -2.4, '#FFE0A0', 1.4);
    for (let i = -10; i <= 10; i++) add(g, box(0.08, 0.7, 0.08), '#F4EEE2', i * 0.8, 0.35, -8.5);
    add(g, box(17, 0.06, 0.06), '#F4EEE2', 0, 0.55, -8.5, false);
    cloud(b, -5, 9, -28, 2.5, 0.3);
    cloud(b, 12, 11, -32, 3.0, 0.25);
    birds(b, 6, -9, 4, 3);
  },
  camp(b) {
    const g = b.group;
    flat(g, 60, 40, '#4E7A3E', 0, -0.01, -10, -Math.PI / 2);
    // The tent: a triangular prism.
    const tent = new THREE.CylinderGeometry(1.15, 1.15, 2.4, 3, 1);
    tent.rotateX(-Math.PI / 2);
    add(g, tent, '#F28C28', -1.9, 0.575, -3.0);
    const doorway = new THREE.CylinderGeometry(0.55, 0.55, 0.02, 3, 1);
    doorway.rotateX(-Math.PI / 2);
    add(g, doorway, '#6A2E12', -1.9, 0.275, -1.79, false);
    // The fire: logs, flames that flicker, smoke, a warm light.
    for (let i = 0; i < 3; i++) {
      const lg = add(g, cyl(0.07, 0.07, 0.8, 8), '#7A5236', 1.2, 0.08, -1.6);
      lg.rotation.set(Math.PI / 2, i * 1.05, 0.2);
    }
    const flames: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const fl = addGlow(g, cone(0.17 - i * 0.04, 0.5 - i * 0.1, 8), ['#F28C28', '#F2C230', '#FFF2B0'][i], 1.2, 0.4, -1.6, i === 0);
      flames.push(fl);
    }
    b.ticks.push((t) => {
      flames.forEach((fl, i) => {
        fl.scale.set(1 + 0.15 * Math.sin(t * 11 + i), 1 + 0.25 * Math.sin(t * 13 + i * 2), 1);
        fl.position.y = 0.4 + 0.04 * Math.sin(t * 9 + i);
      });
    });
    rising(b, 1.2, 1.0, -1.65, 7, '#E4E0DC', 2.2, 0.35, 0.12);
    const fire = new THREE.PointLight('#FFB060', 0, 7, 1.4);
    fire.position.set(1.2, 0.9, -1.0);
    g.add(fire);
    b.lamps.push({ light: fire, power: 2.0, always: true });
    b.ticks.push((t) => void (fire.intensity *= 1 + 0.12 * Math.sin(t * 17)));
    const seat = add(g, cyl(0.2, 0.2, 1.3, 10), '#7A5236', 2.4, 0.2, -2.2);
    seat.rotation.z = Math.PI / 2;
    for (let i = 0; i < 14; i++) pine(b, -12 + hash(i + 2) * 24, -4 - hash(i + 30) * 10, 3 + 2.5 * hash(i), '#2F6B44');
    // The moon (seen at night and dusk).
    addGlow(g, ball(1.2, 16), '#FFF4D0', 6, 13, -40, false);
  },
};

// ── Stage ─────────────────────────────────────────────────────────────────
interface Stage {
  key: string;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  places: Map<string, Built>;
  w: number;
  h: number;
}
let stage: Stage | null = null;

function placeOf(st: Stage, name: string): Built {
  let b = st.places.get(name);
  if (!b) {
    b = { group: new THREE.Group(), ticks: [], lamps: [], windows: [] };
    (PLACES[name] ?? PLACES.park)(b);
    st.scene.add(b.group);
    st.places.set(name, b);
  }
  return b;
}

const LOOKS: Record<Stick3dLook, { sky: string; ground: string; hemi: number; sun: string; power: number; at: [number, number, number]; win: string; lamp: number }> = {
  day: { sky: '#EAF2F8', ground: '#8A7A66', hemi: 1.15, sun: '#FFF4E0', power: 1.5, at: [4, 9, 6], win: '#BFE3F2', lamp: 0 },
  dusk: { sky: '#E6A0B0', ground: '#3A2A3A', hemi: 0.8, sun: '#FFA060', power: 1.4, at: [-7, 3, 4], win: '#F0A070', lamp: 0.7 },
  night: { sky: '#6070A8', ground: '#141420', hemi: 0.55, sun: '#9AB0F0', power: 0.45, at: [-4, 8, 3], win: '#FFD27A', lamp: 1 },
};

export function renderStick3d(f: Stick3dFrame): Stick3dOut {
  const fast = perfNow().fast3d;
  const key = `${fast}`;
  if (stage && stage.key !== key) {
    stage.renderer.dispose();
    stage.renderer.forceContextLoss();
    stage = null;
  }
  if (!stage) {
    const w = fast ? 540 : 720;
    const h = fast ? 960 : 1280;
    const renderer = makeRenderer(w, h, true);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 0.1, 120);
    const hemi = new THREE.HemisphereLight('#FFFFFF', '#888888', 1);
    const sun = new THREE.DirectionalLight('#FFFFFF', 1);
    scene.add(hemi, sun, sun.target);
    stage = { key, renderer, scene, camera, hemi, sun, places: new Map(), w, h };
  }
  const st = stage;
  const L = LOOKS[f.look];
  const here = placeOf(st, f.place);
  const interior = STICK3D_INTERIOR.includes(f.place);
  for (const [name, b] of st.places) b.group.visible = name === f.place;
  st.hemi.color.set(interior && f.look !== 'night' ? '#FFF6EA' : L.sky);
  st.hemi.groundColor.set(L.ground);
  st.hemi.intensity = interior ? Math.max(0.8, L.hemi) : L.hemi;
  st.sun.color.set(interior ? '#FFF0DC' : L.sun);
  st.sun.intensity = interior ? (f.look === 'night' ? 0.5 : 1.0) : L.power;
  st.sun.position.set(L.at[0], L.at[1], L.at[2]);
  for (const l of here.lamps) l.light.intensity = l.always ? l.power : l.power * L.lamp;
  for (const m of here.windows) m.color.set(L.win);
  for (const tk of here.ticks) tk(f.t, f);

  // The camera orbits the point it looks at on the figures' plane; at yaw 0 the plane is framed like the flat stage.
  const c = f.cam;
  const halfH = H_STAGE / 2 / PX;
  const dist = halfH / Math.tan((FOV * Math.PI) / 360) / Math.max(0.3, c.zoom);
  const yaw = (c.yaw * Math.PI) / 180;
  const pitch = (c.pitch * Math.PI) / 180;
  st.camera.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * dist, c.y + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  st.camera.lookAt(c.x, c.y, 0);
  st.camera.updateProjectionMatrix();
  st.camera.updateMatrixWorld();
  st.renderer.render(st.scene, st.camera);

  // How the plane lands on the 1080 x 1920 frame.
  const p0 = new THREE.Vector3(0, 0, 0).project(st.camera);
  const p1 = new THREE.Vector3(1, 0, 0).project(st.camera);
  const ox = ((p0.x + 1) / 2) * W_STAGE;
  const oy = ((1 - p0.y) / 2) * H_STAGE;
  const k = (((p1.x - p0.x) / 2) * W_STAGE) / PX;
  return { canvas: st.renderer.domElement, ox, oy, k, interior };
}

const W_STAGE = 1080;
const H_STAGE = 1920;
