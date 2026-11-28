import * as THREE from 'three';
import type { Ps2Look, Ps2Move, Ps2Set } from '@shared/ps2';
import { perfNow } from '../lib/perf';
import { makeRenderer } from './char3d';

// PS2 cutscene: our own low-poly people (faceted heads, flat-shaded clothes, a
// handful of joints) in small sets, lit warm and rendered small, so the picture
// has that soft early-2000s console look once it is scaled up. Every frame is a
// pure function of its input.

const D = Math.PI / 180;
const s = Math.sin;

export type Ps2Time = 'day' | 'evening' | 'night';
export type Ps2Prop = '' | 'cup' | 'phone' | 'glass';

export interface Ps2Actor {
  look: Ps2Look;
  move: Ps2Move;
  from: Ps2Move | null;
  /** 0..1 into this move from the last one. */
  blend: number;
  local: number;
  talk: number;
  blink: boolean;
  x: number;
  z: number;
  /** Degrees; 0 = facing the camera side (+z). */
  yaw: number;
  prop: Ps2Prop;
  seed: number;
}

export interface Ps2Cam {
  pos: [number, number, number];
  at: [number, number, number];
  fov: number;
}

export interface Ps2Frame {
  set: Ps2Set;
  time: Ps2Time;
  t: number;
  actors: Ps2Actor[];
  cam: Ps2Cam;
  hd: boolean;
}

// ── Materials and shapes ──────────────────────────────────────────────────
const mats = new Map<string, THREE.Material>();
function mat(color: string, opts: { emissive?: string; basic?: boolean; opacity?: number } = {}): THREE.Material {
  const k = `${color}|${opts.emissive ?? ''}|${opts.basic ? 1 : 0}|${opts.opacity ?? 1}`;
  let m = mats.get(k);
  if (!m) {
    m = opts.basic
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: opts.emissive ?? '#000000', transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1 });
    mats.set(k, m);
  }
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

/** A limb hanging down from its joint (origin at the top). */
function limb(rt: number, rb: number, h: number, seg = 6): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(0, -h / 2, 0);
  return g;
}

const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
const ico = (r: number, detail = 0): THREE.BufferGeometry => new THREE.IcosahedronGeometry(r, detail);

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.magFilter = THREE.NearestFilter;
  return t;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── People ────────────────────────────────────────────────────────────────
interface Arm {
  sh: THREE.Group;
  el: THREE.Group;
  hand: THREE.Group;
}

interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: Arm;
  armR: Arm;
  eyes: THREE.Object3D[];
  browL: THREE.Object3D;
  browR: THREE.Object3D;
  mouth: THREE.Mesh;
  props: Record<'cup' | 'phone' | 'glass', THREE.Object3D>;
}

function buildRig(look: Ps2Look): Rig {
  const skin = mat(look.skin);
  const hair = mat(look.hairColor);
  const top = mat(look.topColor);
  const under = mat(look.under ?? look.topColor);
  const pants = mat(look.pants);
  const shoes = mat(look.shoes);
  const dark = mat('#1A1414');
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.98;
  root.add(hips);

  // Legs.
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, 0, 0);
    hips.add(hip);
    hip.add(mesh(limb(0.085, 0.07, 0.48), pants));
    const knee = new THREE.Group();
    knee.position.y = -0.48;
    hip.add(knee);
    knee.add(mesh(limb(0.068, 0.056, 0.44), pants));
    knee.add(mesh(box(0.12, 0.085, 0.28), shoes, 0, -0.47, 0.06));
  }

  // Body.
  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(mesh(new THREE.CylinderGeometry(0.17, 0.165, 0.16, 7), pants, 0, 0.02, 0));
  const chestG = new THREE.CylinderGeometry(0.21, 0.17, 0.58, 7);
  chestG.scale(1, 1, 0.68);
  const coatish = look.top === 'vest' || look.top === 'coat';
  torso.add(mesh(chestG, coatish ? under : top, 0, 0.34, 0));
  if (coatish) {
    const outer = new THREE.CylinderGeometry(0.222, 0.182, look.top === 'coat' ? 0.6 : 0.52, 7, 1, true, 0.35, Math.PI * 2 - 0.7);
    outer.scale(1, 1, 0.7);
    const o = mesh(outer, new THREE.MeshLambertMaterial({ color: look.topColor, flatShading: true, side: THREE.DoubleSide }), 0, 0.33, 0);
    torso.add(o);
    if (look.top === 'coat') {
      const skirt = new THREE.CylinderGeometry(0.19, 0.22, 0.34, 7, 1, true, 0.35, Math.PI * 2 - 0.7);
      skirt.scale(1, 1, 0.72);
      torso.add(mesh(skirt, new THREE.MeshLambertMaterial({ color: look.topColor, flatShading: true, side: THREE.DoubleSide }), 0, -0.13, 0));
    }
  }
  if (look.top === 'hoodie') {
    const hood = new THREE.TorusGeometry(0.11, 0.05, 4, 8);
    hood.rotateX(Math.PI / 2 - 0.5);
    torso.add(mesh(hood, top, 0, 0.62, -0.06));
    torso.add(mesh(box(0.2, 0.1, 0.03), top, 0, 0.16, 0.13));
  }
  if (look.top === 'shirt') torso.add(mesh(box(0.09, 0.05, 0.05), top, 0, 0.62, 0.1));
  // Neck and head.
  torso.add(mesh(new THREE.CylinderGeometry(0.056, 0.064, 0.12, 6), skin, 0, 0.66, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0);
  torso.add(head);
  const skull = ico(0.125, 1);
  skull.scale(0.88, 1.1, 0.98);
  head.add(mesh(skull, skin, 0, 0.13, 0));
  const chin = ico(0.07, 0);
  head.add(mesh(chin, skin, 0, 0.045, 0.045));
  const nose = new THREE.ConeGeometry(0.022, 0.06, 4);
  nose.rotateX(Math.PI / 2);
  head.add(mesh(nose, skin, 0, 0.12, 0.12));
  for (const side of [-1, 1]) head.add(mesh(box(0.03, 0.06, 0.04), skin, side * 0.108, 0.13, 0));
  const eyes: THREE.Object3D[] = [];
  let browL: THREE.Object3D = new THREE.Object3D();
  let browR: THREE.Object3D = new THREE.Object3D();
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.042, 0.152, 0.098);
    const white = ico(0.022, 0);
    white.scale(1.1, 0.8, 0.5);
    eye.add(mesh(white, mat('#F2EEE6'), 0, 0, 0, false));
    eye.add(mesh(ico(0.012, 0), dark, 0, 0, 0.011, false));
    head.add(eye);
    eyes.push(eye);
    const brow = mesh(box(0.052, 0.013, 0.016), hair, side * 0.042, 0.188, 0.108, false);
    head.add(brow);
    if (side < 0) browL = brow;
    else browR = brow;
  }
  const mouth = mesh(box(0.05, 0.011, 0.014), mat('#3A1614'), 0, 0.062, look.beard ? 0.128 : 0.112, false);
  head.add(mouth);

  // Hair.
  const cap = (sy = 0.55): THREE.Mesh => {
    const g = ico(0.132, 1);
    g.scale(0.95, sy, 0.98);
    return mesh(g, hair, 0, 0.236, -0.02);
  };
  if (look.hair === 'short' || look.hair === 'curly' || look.hair === 'bun' || look.hair === 'long') head.add(cap());
  if (look.hair === 'curly')
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const pol = 0.35 + 0.5 * hash(i + 3);
      const r = 0.135;
      const z = Math.cos(a) * Math.sin(pol) * r - 0.02;
      if (z > 0.06 && pol > 0.6) continue;
      head.add(mesh(ico(0.05 + 0.012 * hash(i), 0), hair, Math.sin(a) * Math.sin(pol) * r * 0.95, 0.15 + Math.cos(pol) * r * 1.05, z));
    }
  if (look.hair === 'slick') {
    head.add(cap(0.62));
    const q = ico(0.06, 0);
    q.scale(1.5, 0.7, 1);
    head.add(mesh(q, hair, 0.02, 0.29, 0.06));
  }
  if (look.hair === 'long') {
    head.add(mesh(box(0.24, 0.38, 0.07), hair, 0, 0.04, -0.09));
    for (const side of [-1, 1]) head.add(mesh(box(0.04, 0.3, 0.12), hair, side * 0.112, 0.06, -0.02));
  }
  if (look.hair === 'bun') head.add(mesh(ico(0.062, 1), hair, 0, 0.28, -0.09));
  if (look.beard) {
    const b = new THREE.SphereGeometry(0.13, 7, 5, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45);
    b.scale(0.9, 1.05, 0.98);
    head.add(mesh(b, hair, 0, 0.11, 0.0));
    head.add(mesh(box(0.075, 0.02, 0.02), hair, 0, 0.085, 0.12));
  }
  if (look.glasses) {
    for (const side of [-1, 1]) head.add(mesh(new THREE.TorusGeometry(0.03, 0.006, 3, 8), dark, side * 0.042, 0.152, 0.118, false));
    head.add(mesh(box(0.025, 0.006, 0.006), dark, 0, 0.155, 0.12, false));
  }
  if (look.cap) {
    head.add(mesh(new THREE.CylinderGeometry(0.132, 0.138, 0.085, 8), mat(look.cap), 0, 0.26, -0.005));
    head.add(mesh(box(0.2, 0.015, 0.12), mat(look.cap), 0, 0.225, 0.12));
  }

  // Arms (the right one holds props).
  const sleeve = look.top === 'tee' ? top : look.top === 'vest' ? under : top;
  const bare = look.top === 'tee';
  const arm = (side: number): Arm => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.235, 0.56, 0);
    torso.add(sh);
    sh.add(mesh(ico(0.075, 0), coatish && look.top === 'coat' ? top : sleeve));
    if (bare) {
      sh.add(mesh(limb(0.066, 0.06, 0.14), sleeve));
      sh.add(mesh(limb(0.048, 0.045, 0.3), skin));
    } else sh.add(mesh(limb(0.06, 0.052, 0.3), coatish && look.top === 'coat' ? top : sleeve));
    const el = new THREE.Group();
    el.position.y = -0.3;
    sh.add(el);
    el.add(mesh(limb(bare ? 0.045 : 0.052, 0.04, 0.27), bare ? skin : coatish && look.top === 'coat' ? top : sleeve));
    const hand = new THREE.Group();
    hand.position.y = -0.3;
    el.add(hand);
    const hg = ico(0.046, 0);
    hg.scale(0.8, 1.1, 0.9);
    hand.add(mesh(hg, skin));
    return { sh, el, hand };
  };
  const armL = arm(-1);
  const armR = arm(1);

  // Props in the right hand.
  const cup = new THREE.Group();
  cup.add(mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.1, 8), mat('#F0ECE4'), 0, 0, 0));
  cup.add(mesh(new THREE.CylinderGeometry(0.037, 0.034, 0.04, 8), mat('#8A5A34'), 0, -0.005, 0));
  cup.add(mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.012, 8), mat('#FFFFFF'), 0, 0.055, 0));
  cup.position.set(0, -0.02, 0.05);
  const phone = new THREE.Group();
  phone.add(mesh(box(0.075, 0.15, 0.012), mat('#16161A'), 0, 0, 0));
  phone.add(mesh(box(0.065, 0.13, 0.002), mat('#7FB8FF', { basic: true }), 0, 0, 0.007, false));
  phone.position.set(0, -0.03, 0.05);
  phone.rotation.x = -1.2;
  const glass = new THREE.Group();
  glass.add(mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.12, 8), mat('#C9862E', { opacity: 0.8 }), 0, 0, 0));
  glass.position.set(0, -0.02, 0.05);
  for (const o of [cup, phone, glass]) {
    o.visible = false;
    armR.hand.add(o);
  }
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { root, hips, torso, head, armL, armR, eyes, browL, browR, mouth, props: { cup, phone, glass } };
}

// ── Moves ─────────────────────────────────────────────────────────────────
interface Pose {
  lean: number;
  twist: number;
  hp: number;
  hy: number;
  hr: number;
  /** Arms: forward, out, elbow bend (deg). */
  l: [number, number, number];
  r: [number, number, number];
  bob: number;
  sway: number;
  /** Face: brows in (+ angry, - worried), brows up, eyes wide, mouth open, mouth tilt. */
  brow: number;
  browUp: number;
  wide: number;
  open: number;
  tilt: number;
}

const BASE: Pose = { lean: 0, twist: 0, hp: 0, hy: 0, hr: 0, l: [4, 7, 10], r: [4, 7, 10], bob: 0, sway: 0, brow: 0, browUp: 0, wide: 1, open: 0, tilt: 0 };

function poseOf(m: Ps2Move, u: number, t: number, seed: number): Pose {
  const p: Pose = { ...BASE, l: [...BASE.l], r: [...BASE.r] };
  const w = t + seed;
  p.sway = 0.012 * s(w * 0.7);
  p.lean = 1.2 * s(w * 1.6);
  p.hy = 3 * s(w * 0.45);
  switch (m) {
    case 'talk':
      p.r = [38 + 9 * s(w * 3.1), 14, 72 + 20 * s(w * 4.7)];
      p.l = [22 + 7 * s(w * 2.3 + 1), 10, 52 + 10 * s(w * 3.3)];
      p.hp = 3 * s(w * 3.7);
      break;
    case 'laugh':
      p.l = [32, 14, 100];
      p.r = [32, 14, 100];
      p.hp = -16 + 6 * s(w * 14);
      p.lean = -4 + 3 * s(w * 14);
      p.bob = 0.012 * Math.abs(s(w * 14));
      p.open = 0.8;
      p.browUp = 0.4;
      break;
    case 'shock':
      p.lean = -7;
      p.hp = -9;
      p.l = [42, 28, 82];
      p.r = [42, 28, 82];
      p.wide = 1.45;
      p.open = 0.75;
      p.browUp = 1;
      break;
    case 'shrug':
      p.l = [18, 34, 100];
      p.r = [18, 34, 100];
      p.hr = 10;
      p.browUp = 0.8;
      p.tilt = 0.25;
      p.bob = 0.015 * Math.min(1, u * 4);
      break;
    case 'point':
      p.r = [86, 6, 6];
      p.lean = 3;
      p.brow = 0.4;
      break;
    case 'facepalm':
      p.r = [90, -26, 122];
      p.hp = 16;
      p.lean = 6;
      p.brow = -0.6;
      break;
    case 'cross':
      p.l = [36, -34, 112];
      p.r = [44, -30, 104];
      p.hr = -5;
      p.brow = 0.3;
      break;
    case 'drink':
      p.r = [76, -12, 128 - 6 * s(w * 1.2)];
      p.hp = -6;
      break;
    case 'nod':
      p.hp = 6 + 9 * s(w * 7);
      p.tilt = 0.15;
      break;
    case 'angry':
      p.lean = 8;
      p.hp = 4;
      p.l = [18, 20, 48 + 6 * s(w * 30)];
      p.r = [18, 20, 48 + 6 * s(w * 30 + 1)];
      p.brow = 1;
      p.open = 0.25;
      break;
    case 'sad':
      p.lean = 6;
      p.hp = 20;
      p.l = [2, 4, 6];
      p.r = [2, 4, 6];
      p.brow = -1;
      break;
    case 'smirk':
      p.hr = 7;
      p.hp = -3;
      p.l = [10, 40, 98];
      p.tilt = 0.32;
      p.brow = 0.2;
      break;
    case 'wave':
      p.r = [12, 158, 30 + 28 * s(w * 9)];
      p.tilt = 0.1;
      p.browUp = 0.4;
      break;
    case 'think':
      p.r = [80, -20, 126];
      p.hr = -8;
      p.hy += 8;
      p.brow = 0.25;
      break;
    case 'phone':
      p.r = [56, -14, 96];
      p.hp = 18;
      break;
    default:
      break;
  }
  return p;
}

function mixPose(a: Pose, b: Pose, k: number): Pose {
  const l = (x: number, y: number): number => x + (y - x) * k;
  const l3 = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [l(x[0], y[0]), l(x[1], y[1]), l(x[2], y[2])];
  return { lean: l(a.lean, b.lean), twist: l(a.twist, b.twist), hp: l(a.hp, b.hp), hy: l(a.hy, b.hy), hr: l(a.hr, b.hr), l: l3(a.l, b.l), r: l3(a.r, b.r), bob: l(a.bob, b.bob), sway: l(a.sway, b.sway), brow: l(a.brow, b.brow), browUp: l(a.browUp, b.browUp), wide: l(a.wide, b.wide), open: l(a.open, b.open), tilt: l(a.tilt, b.tilt) };
}

const settle = (x: number): number => (x >= 1 ? 1 : 1 - Math.exp(-5 * x) * Math.cos(6 * x) * (1 - x));

function pose(r: Rig, a: Ps2Actor, t: number): void {
  const cur = poseOf(a.move, a.local, t, a.seed);
  const p = a.from && a.blend < 1 ? mixPose(poseOf(a.from, a.local, t, a.seed), cur, settle(a.blend)) : cur;
  r.root.position.set(a.x, 0, a.z);
  r.root.rotation.y = a.yaw * D;
  r.hips.position.set(p.sway, 0.98 + p.bob, 0);
  r.torso.rotation.set(p.lean * D, p.twist * D, 0);
  r.head.rotation.set(p.hp * D, p.hy * D, p.hr * D);
  const setArm = (arm: Arm, side: number, v: [number, number, number]): void => {
    arm.sh.rotation.set(-v[0] * D, 0, side * v[1] * D);
    arm.el.rotation.set(-v[2] * D, 0, 0);
  };
  setArm(r.armL, -1, p.l);
  setArm(r.armR, 1, p.r);
  for (const e of r.eyes) e.scale.set(p.wide, a.blink ? 0.12 : p.wide, 1);
  r.browL.position.y = 0.188 + 0.014 * p.browUp;
  r.browR.position.y = 0.188 + 0.014 * p.browUp;
  r.browL.rotation.z = -0.35 * p.brow;
  r.browR.rotation.z = 0.35 * p.brow;
  const open = Math.max(p.open, a.talk);
  r.mouth.scale.set(p.open > 0.6 && a.move === 'shock' ? 0.75 : 0.9, 1 + open * 2.3, 1);
  r.mouth.rotation.z = p.tilt;
  for (const k of ['cup', 'phone', 'glass'] as const) r.props[k].visible = a.prop === k || (a.move === 'phone' && k === 'phone' && !a.prop);
}

// ── Sets ──────────────────────────────────────────────────────────────────
interface Practical {
  light: THREE.PointLight;
  glow: THREE.MeshBasicMaterial;
  always: boolean;
}

function car(color: string): THREE.Group {
  const g = new THREE.Group();
  const body = mat(color);
  g.add(mesh(box(4, 0.55, 1.8), body, 0, 0.55, 0));
  g.add(mesh(box(2.1, 0.5, 1.6), body, -0.2, 1.05, 0));
  g.add(mesh(box(2.0, 0.42, 1.62), mat('#202830'), -0.2, 1.06, 0, false));
  for (const x of [-1.3, 1.3]) for (const z of [-0.85, 0.85]) {
    const w = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
    w.rotateX(Math.PI / 2);
    g.add(mesh(w, mat('#1A1A1C'), x, 0.34, z));
  }
  g.add(mesh(box(0.05, 0.14, 0.4), mat('#FFF2C0', { basic: true }), 2.0, 0.65, 0.55, false));
  g.add(mesh(box(0.05, 0.14, 0.4), mat('#FFF2C0', { basic: true }), 2.0, 0.65, -0.55, false));
  return g;
}

function plant(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 7), mat('#8A5A3C'), 0, 0.2, 0));
  for (let i = 0; i < 6; i++) g.add(mesh(ico(0.2 + 0.05 * hash(i), 0), mat('#3F6B3A'), Math.sin(i * 2) * 0.15, 0.6 + i * 0.12, Math.cos(i * 2) * 0.12));
  g.position.set(x, 0, z);
  return g;
}

function buildSets(): { groups: Record<Ps2Set, THREE.Group>; practicals: Record<Ps2Set, Practical[]>; windows: Record<Ps2Set, THREE.MeshLambertMaterial[]> } {
  const groups = {} as Record<Ps2Set, THREE.Group>;
  const practicals = {} as Record<Ps2Set, Practical[]>;
  const windows = {} as Record<Ps2Set, THREE.MeshLambertMaterial[]>;
  const lamp = (set: Ps2Set, g: THREE.Group, x: number, y: number, z: number, color: string, power: number, shade: THREE.BufferGeometry, always: boolean): void => {
    const glow = new THREE.MeshBasicMaterial({ color });
    g.add(mesh(shade, glow, x, y, z, false));
    const light = new THREE.PointLight(color, power, 7, 1.6);
    light.position.set(x, y - 0.1, z + 0.2);
    g.add(light);
    practicals[set].push({ light, glow, always });
  };
  const winMat = (set: Ps2Set, base: string): THREE.MeshLambertMaterial => {
    const m = new THREE.MeshLambertMaterial({ color: base, emissive: '#FFC870', emissiveIntensity: 0, flatShading: true });
    windows[set].push(m);
    return m;
  };
  const room = (g: THREE.Group, wall: string, floor: string, floorTex?: THREE.Texture): void => {
    const fm = new THREE.MeshLambertMaterial({ color: floor, map: floorTex ?? null });
    const f = mesh(new THREE.PlaneGeometry(14, 10), fm, 0, 0, 0);
    f.rotation.x = -Math.PI / 2;
    g.add(f);
    g.add(mesh(box(12, 4, 0.2), mat(wall), 0, 2, -3.1));
    g.add(mesh(box(0.2, 4, 8), mat(wall), -4.2, 2, 0));
    g.add(mesh(box(0.2, 4, 8), mat(wall), 4.2, 2, 0));
    g.add(mesh(box(12, 0.12, 0.06), mat('#F0EAE0'), 0, 0.06, -2.98));
  };
  for (const k of ['cafe', 'office', 'street', 'living', 'party', 'bar', 'garage'] as Ps2Set[]) {
    groups[k] = new THREE.Group();
    practicals[k] = [];
    windows[k] = [];
  }

  // Cafe terrace: a brick wall, hedges, round tables, string lights.
  {
    const g = groups.cafe;
    const paving = canvasTex(64, 64, (c) => {
      c.fillStyle = '#9A8E80';
      c.fillRect(0, 0, 64, 64);
      c.strokeStyle = '#7E7366';
      c.lineWidth = 2;
      for (let i = 0; i <= 64; i += 16) {
        c.beginPath();
        c.moveTo(0, i);
        c.lineTo(64, i);
        c.moveTo(i, 0);
        c.lineTo(i, 64);
        c.stroke();
      }
    }, [14, 10]);
    const f = mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshLambertMaterial({ map: paving }), 0, 0, 0);
    f.rotation.x = -Math.PI / 2;
    g.add(f);
    const brick = canvasTex(64, 64, (c) => {
      c.fillStyle = '#A0583E';
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#7A3E2C';
      for (let r = 0; r < 8; r++) {
        c.fillRect(0, r * 8, 64, 1);
        for (let x = (r % 2) * 8; x < 64; x += 16) c.fillRect(x, r * 8, 1, 8);
      }
    }, [8, 4]);
    g.add(mesh(box(16, 6, 0.4), new THREE.MeshLambertMaterial({ map: brick }), 0, 3, -3.4));
    for (const x of [-3, 3]) {
      g.add(mesh(box(1.3, 1.8, 0.06), winMat('cafe', '#2E2A28'), x, 1.9, -3.18));
      g.add(mesh(box(1.45, 0.1, 0.12), mat('#E8E0D0'), x, 0.95, -3.14));
    }
    g.add(mesh(box(1.3, 2.3, 0.06), mat('#3A2A20'), 0, 1.15, -3.18));
    for (const x of [-2.4, 2.5]) {
      g.add(mesh(box(1.8, 0.9, 0.7), mat('#3E6B34'), x, 0.45, -2.5));
      for (let i = 0; i < 5; i++) g.add(mesh(ico(0.3, 0), mat('#4A7A3E'), x - 0.7 + i * 0.35, 0.9, -2.5 + 0.1 * Math.sin(i)));
    }
    for (const [x, z] of [[-1.7, 0.7], [1.9, -1.0], [-2.6, -1.4]] as const) {
      g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 10), mat('#E6E2DA'), x, 0.74, z));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6), mat('#2A2A2A'), x, 0.37, z));
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.03, 8), mat('#2A2A2A'), x, 0.015, z));
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 8), mat('#F4F0E8'), x + 0.12, 0.8, z + 0.05));
    }
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      const x = -5 + u * 10;
      const y = 3.3 - 0.7 * Math.sin(Math.PI * u);
      const glow = new THREE.MeshBasicMaterial({ color: '#FFE2A0' });
      g.add(mesh(ico(0.05, 0), glow, x, y, -2.6, false));
      if (i % 4 === 2) {
        const light = new THREE.PointLight('#FFD08A', 0.6, 5, 1.6);
        light.position.set(x, y - 0.2, -2.3);
        g.add(light);
        practicals.cafe.push({ light, glow, always: false });
      }
    }
  }

  // Office: window band with blinds, desks and monitors, ceiling panels, a plant.
  {
    const g = groups.office;
    room(g, '#D8D3CA', '#5A6474');
    const blinds = canvasTex(32, 64, (c) => {
      c.fillStyle = '#E8EEF2';
      c.fillRect(0, 0, 32, 64);
      c.fillStyle = '#B8C2CA';
      for (let y = 0; y < 64; y += 4) c.fillRect(0, y, 32, 1);
    }, [8, 1]);
    g.add(mesh(box(8, 1.7, 0.05), new THREE.MeshBasicMaterial({ map: blinds, color: '#DCE6EE' }), 0, 2.0, -2.98, false));
    for (const [x, z] of [[-2.2, -1.4], [2.2, -1.8]] as const) {
      g.add(mesh(box(1.5, 0.06, 0.75), mat('#C9B898'), x, 0.75, z));
      for (const dx of [-0.68, 0.68]) g.add(mesh(box(0.05, 0.75, 0.6), mat('#9A9088'), x + dx, 0.375, z));
      g.add(mesh(box(0.6, 0.36, 0.04), mat('#18181C'), x, 1.05, z - 0.15));
      g.add(mesh(box(0.54, 0.3, 0.01), mat('#6FA8E8', { basic: true }), x, 1.05, z - 0.125, false));
      g.add(mesh(box(0.06, 0.2, 0.06), mat('#18181C'), x, 0.85, z - 0.15));
      g.add(mesh(box(0.5, 0.08, 0.5), mat('#2A2C34'), x, 0.48, z + 0.6));
      g.add(mesh(box(0.5, 0.55, 0.08), mat('#2A2C34'), x, 0.8, z + 0.85));
    }
    for (const x of [-2, 2]) g.add(mesh(box(1.3, 0.04, 0.6), mat('#FFFFFF', { basic: true }), x, 3.6, -0.5, false));
    g.add(plant(3.2, -2.4));
    g.add(plant(-3.4, -2.2));
    const fill = new THREE.PointLight('#FFFFFF', 0.9, 9, 1.4);
    fill.position.set(0, 3.4, 0);
    g.add(fill);
    practicals.office.push({ light: fill, glow: new THREE.MeshBasicMaterial(), always: true });
  }

  // Street: shop fronts, a sidewalk, a parked car, a lamp post.
  {
    const g = groups.street;
    const road = mesh(new THREE.PlaneGeometry(40, 20), mat('#3E4046'), 0, -0.12, 0);
    road.rotation.x = -Math.PI / 2;
    g.add(road);
    g.add(mesh(box(40, 0.12, 5), mat('#A8A296'), 0, -0.06, -0.8));
    const facade = (seed: number): THREE.CanvasTexture =>
      canvasTex(64, 128, (c) => {
        c.fillStyle = ['#C8B8A0', '#B87858', '#8A9AA8', '#D8CCB0'][seed % 4];
        c.fillRect(0, 0, 64, 128);
        for (let r = 0; r < 4; r++)
          for (let k = 0; k < 2; k++) {
            c.fillStyle = '#2A3038';
            c.fillRect(8 + k * 30, 10 + r * 26, 18, 18);
          }
        c.fillStyle = '#1E2228';
        c.fillRect(6, 112, 52, 16);
      });
    for (let i = -3; i <= 3; i++) {
      const h = 7 + 3 * hash(i + 9);
      g.add(mesh(box(3.6, h, 1), new THREE.MeshLambertMaterial({ map: facade(i + 3) }), i * 3.7, h / 2 - 0.1, -4.2));
      g.add(mesh(box(3.0, 1.5, 0.06), winMat('street', '#2A3038'), i * 3.7, 1.0, -3.68));
    }
    const c = car('#B8BCC4');
    c.position.set(2.6, -0.12, -2.6);
    g.add(c);
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 4, 6), mat('#2A2C30'), -2.6, 2, -2.9));
    lamp('street', g, -2.6, 4.0, -2.9, '#FFE0A0', 1.5, box(0.4, 0.15, 0.3), false);
    for (const x of [-4.5, 5.2]) {
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), mat('#5A3E2A'), x, 1.1, -2.9));
      g.add(mesh(ico(0.9, 0), mat('#4A7038'), x, 2.6, -2.9));
    }
  }

  // Living room: couch, floor lamp, window, rug, pictures.
  {
    const g = groups.living;
    room(g, '#C8B494', '#7A5A40');
    g.add(mesh(box(3.2, 0.01, 2.2), mat('#8A3A34'), 0, 0.006, -0.6, false));
    g.add(mesh(box(2.4, 0.45, 0.95), mat('#5E4A6A'), 0, 0.225, -2.35));
    g.add(mesh(box(2.4, 0.7, 0.25), mat('#5E4A6A'), 0, 0.6, -2.75));
    for (const x of [-1.25, 1.25]) g.add(mesh(box(0.25, 0.65, 0.95), mat('#5E4A6A'), x, 0.33, -2.35));
    for (const x of [-0.6, 0.6]) g.add(mesh(box(0.7, 0.18, 0.6), mat('#6E5A7A'), x, 0.54, -2.3));
    g.add(mesh(box(1.3, 1.3, 0.06), winMat('living', '#1E2A44'), -2.6, 1.9, -2.98));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), mat('#2A2420'), 2.3, 0.8, -2.5));
    lamp('living', g, 2.3, 1.7, -2.5, '#FFD08A', 1.6, new THREE.CylinderGeometry(0.16, 0.26, 0.3, 8, 1, true), true);
    for (const [x, c] of [[-0.6, '#3A5A6A'], [0.7, '#8A6A3A']] as const) {
      g.add(mesh(box(0.6, 0.45, 0.04), mat('#2A2420'), x, 2.1, -2.98));
      g.add(mesh(box(0.52, 0.37, 0.01), mat(c), x, 2.1, -2.955, false));
    }
    g.add(plant(-3.3, -2.3));
  }

  // Party: balloons, a snack table, pennants.
  {
    const g = groups.party;
    room(g, '#E4D4C2', '#B09070');
    const cols = ['#D4AF37', '#F2F0EA', '#B8BCC4', '#D4AF37'];
    for (let i = 0; i < 9; i++) {
      const x = (i < 5 ? -1 : 1) * (1.4 + 0.5 * hash(i)) + (i % 2) * 0.3;
      const y = 1.7 + 0.8 * hash(i + 4);
      const z = -1.8 - 0.8 * hash(i + 7);
      const b = ico(0.2, 1);
      b.scale(1, 1.15, 1);
      g.add(mesh(b, mat(cols[i % 4], { emissive: '#221A0A' }), x, y, z));
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, y - 0.9, 3), mat('#DDDDDD'), x, (y + 0.9) / 2 - 0.2, z, false));
    }
    g.add(mesh(box(1.8, 0.05, 0.8), mat('#7A1E24'), -2.1, 0.76, -1.9));
    g.add(mesh(box(1.8, 0.7, 0.02), mat('#7A1E24'), -2.1, 0.4, -1.5));
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.1, 7), mat('#E8E8F0', { opacity: 0.75 }), -2.7 + i * 0.12, 0.83, -2.0));
    const bowl = new THREE.SphereGeometry(0.18, 7, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    g.add(mesh(bowl, mat('#F2F0EA'), -1.6, 0.96, -1.9));
    g.add(mesh(ico(0.14, 0), mat('#E0B050'), -1.6, 0.92, -1.9));
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      const p = new THREE.ConeGeometry(0.12, 0.22, 3);
      p.rotateX(Math.PI);
      g.add(mesh(p, mat(['#C0392B', '#F2C230', '#2F6FD6'][i % 3]), -3.5 + u * 7, 3.0 - 0.4 * Math.sin(Math.PI * u), -2.9, false));
    }
    lamp('party', g, 0, 3.6, -1, '#FFF0D8', 1.2, box(0.8, 0.05, 0.4), true);
  }

  // Bar: shelves of bottles, a counter, a neon sign, stools.
  {
    const g = groups.bar;
    room(g, '#3A2622', '#2A1C18');
    for (const y of [1.3, 1.75, 2.2]) {
      g.add(mesh(box(5, 0.05, 0.3), mat('#5A3A24'), 0, y, -2.85));
      for (let i = 0; i < 18; i++) {
        const c = ['#2E6B3A', '#9A5A1E', '#D8E0E0', '#6A1E2A'][Math.floor(hash(i + y * 10) * 4)];
        const h = 0.25 + 0.1 * hash(i * 3 + y);
        g.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, h, 7), mat(c, { emissive: '#1A1008' }), -2.3 + i * 0.27, y + h / 2 + 0.025, -2.85));
      }
    }
    g.add(mesh(box(5, 1.05, 0.7), mat('#4A2C1C'), 0, 0.52, -2.0));
    g.add(mesh(box(5.1, 0.06, 0.8), mat('#2A1810'), 0, 1.07, -2.0));
    const neon = new THREE.TorusGeometry(0.35, 0.035, 4, 16);
    g.add(mesh(neon, mat('#FF5AA8', { basic: true }), 2.6, 2.9, -2.95, false));
    g.add(mesh(box(0.9, 0.08, 0.03), mat('#5AD8FF', { basic: true }), -2.4, 3.0, -2.95, false));
    for (const x of [-1.6, -0.5, 0.6, 1.7]) {
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 8), mat('#2A1810'), x, 0.75, -1.4));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), mat('#8A8A8A'), x, 0.375, -1.4));
    }
    lamp('bar', g, -1.2, 3.2, -1.6, '#FFB060', 1.4, new THREE.ConeGeometry(0.2, 0.2, 8, 1, true), true);
    lamp('bar', g, 1.2, 3.2, -1.6, '#FFB060', 1.4, new THREE.ConeGeometry(0.2, 0.2, 8, 1, true), true);
  }

  // Garage: a car with its hood up, a workbench, a tool wall, shop lights.
  {
    const g = groups.garage;
    room(g, '#A8A090', '#86847E');
    const peg = canvasTex(64, 32, (c) => {
      c.fillStyle = '#C8A878';
      c.fillRect(0, 0, 64, 32);
      c.fillStyle = '#9A7E58';
      for (let x = 2; x < 64; x += 4) for (let y = 2; y < 32; y += 4) c.fillRect(x, y, 1, 1);
    });
    g.add(mesh(box(2.4, 1.2, 0.04), new THREE.MeshLambertMaterial({ map: peg }), -2.0, 1.7, -2.97));
    for (let i = 0; i < 6; i++) g.add(mesh(box(0.05, 0.3 + 0.2 * hash(i), 0.03), mat('#3A3A40'), -2.9 + i * 0.35, 1.7, -2.93));
    g.add(mesh(box(2.4, 0.08, 0.7), mat('#6A4A2E'), -2.0, 0.92, -2.55));
    g.add(mesh(box(2.3, 0.88, 0.6), mat('#7A2A2A'), -2.0, 0.44, -2.55));
    const c = car('#8A2A26');
    c.position.set(2.3, 0, -2.0);
    c.rotation.y = -0.35;
    g.add(c);
    const hood = mesh(box(1.1, 0.05, 1.7), mat('#8A2A26'), 0, 0, 0);
    hood.position.set(4.0, 1.25, -1.35);
    hood.rotation.z = -1.0;
    g.add(hood);
    for (const [x, col] of [[3.6, '#2F5FA8'], [-3.4, '#A83A2F']] as const) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), mat(col), x, 0.45, -2.6));
    for (const x of [-1.5, 1.5]) lamp('garage', g, x, 3.6, -0.8, '#F0F6FF', 1.0, box(1.2, 0.05, 0.15), true);
  }
  return { groups, practicals, windows };
}

// ── Stage ─────────────────────────────────────────────────────────────────
interface Stage {
  key: string;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hemi: THREE.HemisphereLight;
  key3: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  fog: THREE.Fog;
  rigs: Rig[];
  sets: ReturnType<typeof buildSets>;
  w: number;
  h: number;
}

let stage: Stage | null = null;

function build(looks: Ps2Look[], key: string, hd: boolean, fast: boolean): Stage {
  const w = hd ? 720 : 360;
  const h = hd ? 1280 : 640;
  const renderer = makeRenderer(w, h, hd && !fast);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 9 / 16, 0.05, 80);
  const fog = new THREE.Fog('#BFD4E6', 12, 40);
  scene.fog = fog;
  const hemi = new THREE.HemisphereLight('#DDE6F0', '#6B5B4A', 0.9);
  scene.add(hemi);
  const key3 = new THREE.DirectionalLight('#FFF1DC', 1.6);
  key3.castShadow = true;
  key3.shadow.mapSize.set(1024, 1024);
  const sc = key3.shadow.camera as THREE.OrthographicCamera;
  sc.left = -5;
  sc.right = 5;
  sc.top = 5;
  sc.bottom = -5;
  sc.far = 30;
  key3.shadow.bias = -0.0015;
  scene.add(key3);
  scene.add(key3.target);
  const sets = buildSets();
  for (const g of Object.values(sets.groups)) scene.add(g);
  const rigs = looks.map((l) => buildRig(l));
  for (const r of rigs) scene.add(r.root);
  const fill = new THREE.DirectionalLight('#FFE6CC', 0.4);
  scene.add(fill);
  scene.add(fill.target);
  return { key, renderer, scene, camera, hemi, key3, fill, fog, rigs, sets, w, h };
}

const LIGHT: Record<Ps2Time, { sky: string; ground: string; hemi: number; key: string; power: number; at: [number, number, number]; clear: string; practical: number }> = {
  day: { sky: '#DDE6F0', ground: '#6B5B4A', hemi: 0.95, key: '#FFF1DC', power: 1.7, at: [3, 6, 5], clear: '#BFD4E6', practical: 0.2 },
  evening: { sky: '#D8A8B8', ground: '#3A2A2A', hemi: 0.6, key: '#FFB070', power: 1.6, at: [-5, 2.6, 4], clear: '#E3A07C', practical: 0.8 },
  night: { sky: '#46567E', ground: '#141420', hemi: 0.42, key: '#8FA8E0', power: 0.45, at: [-3, 6, 3], clear: '#0E1220', practical: 1.4 },
};
const INDOOR: Ps2Set[] = ['office', 'living', 'party', 'bar', 'garage'];

export function renderPs2(f: Ps2Frame): { canvas: HTMLCanvasElement } {
  const fast = perfNow().fast3d;
  const key = `${JSON.stringify(f.actors.map((a) => a.look))}|${f.hd}|${fast}`;
  if (stage && stage.key !== key) {
    stage.renderer.dispose();
    stage.renderer.forceContextLoss();
    stage = null;
  }
  const st = (stage ??= build(f.actors.map((a) => a.look), key, f.hd, fast));
  const L = LIGHT[f.time] ?? LIGHT.day;
  const indoor = INDOOR.includes(f.set);
  st.hemi.color.set(indoor && f.time === 'day' ? '#F2EAE0' : L.sky);
  st.hemi.groundColor.set(L.ground);
  st.hemi.intensity = indoor ? (f.time === 'night' ? 0.7 : Math.max(0.6, L.hemi)) : L.hemi;
  st.key3.color.set(indoor ? (f.time === 'night' ? '#FFC890' : '#FFE8D0') : L.key);
  st.key3.intensity = indoor ? (f.time === 'night' ? 0.85 : 1.1) : L.power;
  st.key3.position.set(L.at[0], L.at[1], L.at[2]);
  st.key3.target.position.set(0, 1, 0);
  st.fog.color.set(indoor ? '#2A2420' : L.clear);
  st.fog.near = indoor ? 14 : 12;
  st.renderer.setClearColor(L.clear, 1);
  (Object.keys(st.sets.groups) as Ps2Set[]).forEach((k) => {
    st.sets.groups[k].visible = k === f.set;
    for (const p of st.sets.practicals[k]) {
      const on = p.always || f.time !== 'day';
      p.light.intensity = k === f.set && on ? (p.always ? 1 : L.practical) * (1 + 0.04 * s(f.t * 9 + p.light.position.x)) : 0;
      p.glow.color.set(on ? '#FFE2A0' : '#8A8578');
    }
    for (const m of st.sets.windows[k]) m.emissiveIntensity = f.time === 'day' ? 0 : 0.85;
  });
  st.rigs.forEach((r, k) => {
    const a = f.actors[k];
    r.root.visible = !!a;
    if (a) pose(r, a, f.t);
  });
  const c = f.cam;
  st.camera.fov = c.fov;
  st.camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
  st.camera.lookAt(c.at[0], c.at[1], c.at[2]);
  st.camera.updateProjectionMatrix();
  // A soft light from just above the camera keeps faces readable in dark sets, like a cutscene fill.
  st.fill.position.set(c.pos[0] + 0.4, c.pos[1] + 0.8, c.pos[2]);
  st.fill.target.position.set(c.at[0], c.at[1], c.at[2]);
  st.fill.intensity = f.time === 'day' ? (indoor ? 0.35 : 0.2) : indoor ? 0.75 : 0.6;
  st.fill.color.set(f.time === 'night' && !indoor ? '#B8C8F0' : '#FFE6CC');
  st.renderer.render(st.scene, st.camera);
  return { canvas: st.renderer.domElement };
}

/** Where an actor's face is (for the camera): the middle of the head, world units. */
export const PS2_HEAD_Y = 1.79;
