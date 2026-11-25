import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ACTIONS, type Action, type Art } from '@shared/character';
import { perfNow } from '../lib/perf';

// The reel mascot: one original character built from simple shapes, drawn in
// three art styles. Every frame is a pure function of the beat time, so the
// preview, stills and export all draw the same thing.
//   cartoon: toon shading with ink outlines on a flat colour backdrop
//   ps2:     low-res, wobbly low-poly world with fog and dithering
//   3d:      soft studio render (clay / toy look) with real shadows

export { ACTIONS };

const D = Math.PI / 180;

export interface CharFrame {
  art: Art;
  action: Action;
  /** Seconds into the beat. */
  local: number;
  /** Reel time, for idle motion that should not restart every beat. */
  t: number;
  /** Mouth open 0..1 (from the spoken line). */
  talk: number;
  /** Where the character stands: 'stage' = the star of the beat, 'corner' = small, bottom left, presenting a diagram. */
  place: 'stage' | 'corner';
  /** Camera variety per beat: -1..1. */
  side: number;
  /** 0 = wide, 1 = close. */
  zoom: number;
  /** Stand lower in the frame (a big word sits above the mascot). */
  low?: boolean;
  accent: string;
  /** Body colour. */
  color: string;
}

export interface CharOut {
  canvas: CanvasImageSource;
  /** Head position in the frame, 0..1. */
  head: { x: number; y: number };
  /** Rough head size as a fraction of the frame height. */
  headSize: number;
  /** ps2: the world is drawn too, so the frame is opaque. */
  opaque: boolean;
}

// ── Pose ───────────────────────────────────────────────────────────────────
export interface Pose {
  lean: number;
  twist: number;
  tilt: number;
  lift: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  /** [out to the side, forward, elbow bend], degrees. */
  lArm: [number, number, number];
  rArm: [number, number, number];
  eyeOpen: number;
  eyeScale: number;
  eyeUp: number;
  happy: number;
  brow: number;
  browLift: number;
  smile: number;
  mouth: number;
  spread: number;
}

const NEUTRAL: Pose = { lean: 0, twist: 0, tilt: 0, lift: 0, headPitch: 0, headYaw: 0, headRoll: 0, lArm: [12, 5, 18], rArm: [12, 5, 18], eyeOpen: 1, eyeScale: 1, eyeUp: 0, happy: 0, brow: 0, browLift: 0, smile: 0.45, mouth: 0, spread: 0 };

const s = Math.sin;

/** The pose an action settles into at u seconds (it springs in from neutral). */
function actionPose(a: Action, u: number, talking: number): Partial<Pose> {
  switch (a) {
    case 'point':
      return { rArm: [118, 28, 4], lArm: [14, 0, 40], headYaw: -14, headPitch: -12, twist: -10, smile: 0.6 };
    case 'present':
      return { lArm: [72, 42, 14], rArm: [14, 4, 22], headYaw: 22, headPitch: -6, twist: 12, smile: 0.7 };
    case 'shrug':
      return { lArm: [42, 32, 95], rArm: [42, 32, 95], lift: 0.04 + 0.015 * s(u * 3), headRoll: 13, brow: 10, browLift: 0.05, smile: -0.25, eyeOpen: 0.85 };
    case 'shock': {
      const jump = u < 0.45 ? 0.32 * s((Math.PI * u) / 0.45) : 0;
      return { lArm: [150, 18, 32], rArm: [150, 18, 32], lean: -12, lift: jump, eyeScale: 1.55, mouth: 0.95, browLift: 0.09, brow: 6, smile: 0, headRoll: 3 * s(u * 40) * Math.max(0, 1 - u * 2) };
    }
    case 'cheer': {
      const pump = s(u * 9);
      return { lArm: [158 + 12 * pump, 8, 12], rArm: [158 - 12 * pump, 8, 12], lift: 0.12 * Math.abs(s(u * 5.2)), happy: 1, smile: 1, mouth: Math.max(talking, 0.55), headRoll: 6 * s(u * 5.2) };
    }
    case 'think':
      return { rArm: [18, 72, 138], lArm: [28, 48, 108], headPitch: -12, headYaw: 14, headRoll: 9, eyeUp: 0.05, brow: -8, smile: 0, mouth: 0 };
    case 'wave':
      return { rArm: [142, 14, 22 + 28 * s(u * 10)], lArm: [12, 4, 20], headRoll: 8, smile: 0.9, happy: talking > 0.05 ? 0 : 1 };
    case 'facepalm':
      return { rArm: [20, 88, 152], lArm: [10, 0, 12], headPitch: 26, lean: 10, smile: -0.5, eyeOpen: 0.1, lift: -0.02 };
    case 'sad':
      return { lean: 14, headPitch: 24, lArm: [4, 0, 6], rArm: [4, 0, 6], eyeOpen: 0.6, brow: 22, smile: -0.85, lift: -0.04 + 0.01 * s(u * 1.4) };
    case 'laugh': {
      const shake = s(u * 18);
      return { lean: -10, tilt: 4 * shake, lArm: [26, 34, 72], rArm: [26, 34, 72], happy: 1, smile: 1, mouth: 0.65 + 0.3 * Math.abs(shake), lift: 0.03 * Math.abs(shake) };
    }
    default:
      // talk: hands move with the words.
      return {
        rArm: [20, 24 + 10 * s(u * 1.7), 48 + 22 * s(u * 2.3) * Math.min(1, talking * 3 + 0.3)],
        lArm: [15, 10, 26 + 12 * s(u * 1.9 + 1)],
        headYaw: 7 * s(u * 0.8),
        headRoll: 3 * s(u * 1.1),
        smile: 0.5,
      };
  }
}

function mix(a: Pose, b: Partial<Pose>, k: number): Pose {
  const out = { ...a } as Pose;
  for (const key of Object.keys(b) as Array<keyof Pose>) {
    const bv = b[key]!;
    const av = a[key];
    if (Array.isArray(av)) (out[key] as unknown as number[]) = (av as number[]).map((x, i) => x + ((bv as number[])[i] - x) * k);
    else (out[key] as number) = (av as number) + ((bv as number) - (av as number)) * k;
  }
  return out;
}

/** Springy 0→1 with a little overshoot. */
const spring = (x: number): number => (x >= 1 ? 1 : 1 - Math.exp(-6 * x) * Math.cos(9 * x));

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function poseAt(f: Pick<CharFrame, 'action' | 'local' | 't' | 'talk'>): Pose {
  const k = spring(Math.max(0, f.local) / 0.45);
  let p = mix(NEUTRAL, actionPose(f.action, f.local, f.talk), Math.min(1.08, k));
  // Breathing, a nod on the words, blinks.
  p.lift += 0.012 * s(f.t * 2.1);
  p.headPitch += f.talk * 4 * s(f.t * 7);
  const slot = Math.floor(f.t / 3.2);
  const blinkAt = slot * 3.2 + 0.4 + hash(slot) * 2.2;
  if (Math.abs(f.t - blinkAt) < 0.07) p = { ...p, eyeOpen: 0.08 };
  return p;
}

// ── Rig ────────────────────────────────────────────────────────────────────
export interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  lShoulder: THREE.Group;
  rShoulder: THREE.Group;
  lElbow: THREE.Group;
  rElbow: THREE.Group;
  lLeg: THREE.Group;
  rLeg: THREE.Group;
  eyes: THREE.Mesh[];
  happyEyes: THREE.Mesh[];
  brows: THREE.Mesh[];
  mouthOpen: THREE.Mesh;
  smile: THREE.Mesh;
  antenna: THREE.Mesh;
  body: THREE.Material[];
  limbs: THREE.Material[];
  glow: THREE.MeshBasicMaterial[];
  headAnchor: THREE.Object3D;
}

export interface Kit {
  mat: (color: string, opts?: { glossy?: boolean }) => THREE.Material;
  /** A person instead of the robot: skin, hair and a hoodie (the asker in duo reels). */
  person?: { skin: string; hair: string };
  outline?: THREE.Material;
  seg: number;
  shadows: boolean;
}

function outlineMaterial(width: number): THREE.Material {
  const m = new THREE.MeshBasicMaterial({ color: 0x0b0b10, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  return m;
}

/** PS2 look: vertices snap to a coarse screen grid, so edges shimmer as the camera moves. */
function snapVertices(m: THREE.Material): THREE.Material {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  { vec2 g = vec2(150.0, 266.0); gl_Position.xy = floor(gl_Position.xy / gl_Position.w * g + 0.5) / g * gl_Position.w; }');
  };
  return m;
}

export function buildRig(kit: Kit): Rig {
  const { seg } = kit;
  const P = kit.person;
  const body: THREE.Material[] = [];
  const limbs: THREE.Material[] = [];
  const glow: THREE.MeshBasicMaterial[] = [];
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, outline = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = kit.shadows;
    if (outline && kit.outline) m.add(new THREE.Mesh(geo, kit.outline));
    return m;
  };
  const bodyMat = kit.mat('#8B5CF6');
  const headMat = kit.mat(P ? P.skin : '#A78BFA');
  const limbMat = kit.mat('#7C3AED');
  body.push(bodyMat, headMat);
  limbs.push(limbMat);
  const bellyMat = kit.mat('#EDE9FE');
  const darkMat = kit.mat('#1A1626', { glossy: true });
  const handMat = kit.mat(P ? P.skin : '#F5F3FF');
  const footMat = kit.mat('#2A2340');
  const badgeMat = kit.mat('#FACC15', { glossy: true });
  const eyeMat = new THREE.MeshBasicMaterial({ color: P ? '#15121C' : '#7DF9E9' });
  const antMat = new THREE.MeshBasicMaterial({ color: '#C084FC' });
  glow.push(eyeMat, antMat);

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.62;
  root.add(hips);

  // Legs and feet.
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(0.2 * side, 0, 0);
    const thigh = mk(new THREE.CapsuleGeometry(0.13, 0.26, Math.max(2, seg / 2), seg), limbMat);
    thigh.position.y = -0.25;
    const foot = mk(new RoundedBoxGeometry(0.3, 0.16, 0.4, Math.max(1, seg / 4), 0.07), footMat);
    foot.position.set(0, -0.54, 0.06);
    leg.add(thigh, foot);
    hips.add(leg);
    return leg;
  });

  const torso = new THREE.Group();
  hips.add(torso);
  const trunk = mk(new THREE.CapsuleGeometry(0.4, 0.36, seg / 2, seg * 1.5), bodyMat);
  trunk.position.y = 0.38;
  // Tummy patch: a thin disc just proud of the body, so its edge stays clean.
  const belly = mk(new THREE.CylinderGeometry(0.25, 0.25, 0.05, seg * 2), bellyMat);
  belly.rotation.x = Math.PI / 2;
  belly.scale.set(1, 1, 1.18);
  belly.position.set(0, 0.3, 0.395);
  const badge = mk(new THREE.CylinderGeometry(0.075, 0.075, 0.04, seg * 1.5), badgeMat);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0.17, 0.66, 0.36);
  torso.add(trunk);
  if (!P) torso.add(belly, badge);

  const neck = new THREE.Group();
  neck.position.y = 0.95;
  torso.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.04;
  neck.add(head);
  const skull = mk(P ? new RoundedBoxGeometry(0.86, 0.9, 0.84, Math.max(2, seg / 2), 0.27) : new RoundedBoxGeometry(1.16, 0.96, 0.96, Math.max(2, seg / 2), 0.3), headMat);
  skull.position.y = 0.48;
  head.add(skull);
  if (P) {
    // Hair: a cap over the top and the back of the head; small ears; a nose.
    const hairMat = kit.mat(P.hair);
    const top = mk(new RoundedBoxGeometry(0.92, 0.36, 0.9, Math.max(1, seg / 4), 0.14), hairMat);
    top.position.set(0, 0.84, -0.03);
    const back = mk(new RoundedBoxGeometry(0.92, 0.6, 0.34, Math.max(1, seg / 4), 0.12), hairMat);
    back.position.set(0, 0.62, -0.3);
    const nose = mk(new THREE.SphereGeometry(0.055, Math.max(5, seg / 2), Math.max(4, seg / 2)), headMat, false);
    nose.position.set(0, 0.43, 0.44);
    head.add(top, back, nose);
    for (const side of [-1, 1]) {
      const ear = mk(new THREE.SphereGeometry(0.09, Math.max(5, seg / 2), Math.max(4, seg / 2)), headMat);
      ear.position.set(0.44 * side, 0.46, -0.02);
      head.add(ear);
    }
  } else {
    const face = mk(new RoundedBoxGeometry(0.92, 0.62, 0.12, Math.max(1, seg / 4), 0.06), darkMat, false);
    face.position.set(0, 0.46, 0.44);
    head.add(face);
    for (const side of [-1, 1]) {
      const ear = mk(new THREE.CylinderGeometry(0.15, 0.15, 0.12, seg * 1.5), darkMat);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(0.6 * side, 0.46, 0);
      head.add(ear);
    }
  }
  const stalk = mk(new THREE.CylinderGeometry(0.025, 0.03, 0.26, Math.max(5, seg)), darkMat);
  stalk.position.y = 1.07;
  const antenna = new THREE.Mesh(new THREE.SphereGeometry(0.08, seg, seg), antMat);
  antenna.position.y = 1.23;
  head.add(stalk, antenna);
  stalk.visible = antenna.visible = !P;
  const headAnchor = new THREE.Object3D();
  headAnchor.position.set(0, 0.5, 0.4);
  head.add(headAnchor);

  // Face: glowing eyes on the screen, brows, mouth.
  const fz = P ? 0.43 : 0.505;
  // A person's features are smaller and closer together than the robot's screen face.
  const fs = P ? 0.7 : 1;
  const ex = P ? 0.17 : 0.2;
  const eyes = [-1, 1].map((side) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1 * fs, seg, seg), eyeMat);
    e.position.set(ex * side, 0.53, fz);
    head.add(e);
    return e;
  });
  const happyEyes = [-1, 1].map((side) => {
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.085 * fs, 0.026 * fs, 6, Math.max(8, seg * 1.5), Math.PI), eyeMat);
    e.position.set(ex * side, 0.5, fz);
    e.visible = false;
    head.add(e);
    return e;
  });
  const brows = [-1, 1].map((side) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.19 * (P ? 0.85 : 1), 0.04, 0.02), eyeMat);
    b.position.set(ex * side, 0.69, fz);
    head.add(b);
    return b;
  });
  const mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(0.1 * fs, seg, seg), eyeMat);
  mouthOpen.position.set(0, 0.31, fz);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1 * fs, 0.024 * fs, 6, Math.max(8, seg * 1.5), Math.PI), eyeMat);
  smile.position.set(0, 0.35, fz);
  head.add(mouthOpen, smile);

  // Arms: shoulder → elbow → mitten hand, hanging down -y.
  const arm = (side: number): [THREE.Group, THREE.Group] => {
    const sh = new THREE.Group();
    sh.position.set(0.5 * side, 0.74, 0);
    sh.rotation.order = 'XYZ';
    const upper = mk(new THREE.CapsuleGeometry(0.11, 0.2, Math.max(2, seg / 2), seg), limbMat);
    upper.position.y = -0.19;
    const el = new THREE.Group();
    el.position.y = -0.38;
    const fore = mk(new THREE.CapsuleGeometry(0.1, 0.18, Math.max(2, seg / 2), seg), limbMat);
    fore.position.y = -0.17;
    const hand = mk(new THREE.SphereGeometry(0.155, seg, seg), handMat);
    hand.position.y = -0.4;
    el.add(fore, hand);
    sh.add(upper, el);
    torso.add(sh);
    return [sh, el];
  };
  const [lShoulder, lElbow] = arm(1);
  const [rShoulder, rElbow] = arm(-1);
  return { root, hips, torso, head, lShoulder, rShoulder, lElbow, rElbow, lLeg: legs[1], rLeg: legs[0], eyes, happyEyes, brows, mouthOpen, smile, antenna, body, limbs, glow, headAnchor };
}

export function applyPose(r: Rig, p: Pose, talk: number): void {
  r.hips.position.y = 0.62 + p.lift;
  r.torso.rotation.set(p.lean * D, p.twist * D, p.tilt * D);
  r.head.rotation.set(p.headPitch * D, p.headYaw * D, p.headRoll * D);
  const arm = (sh: THREE.Group, el: THREE.Group, a: [number, number, number], side: number): void => {
    sh.rotation.set(-a[1] * D, 0, side * a[0] * D);
    el.rotation.x = -a[2] * D;
  };
  arm(r.lShoulder, r.lElbow, p.lArm, 1);
  arm(r.rShoulder, r.rElbow, p.rArm, -1);
  r.lLeg.rotation.z = p.spread * D;
  r.rLeg.rotation.z = -p.spread * D;
  // Legs stay planted when the body lifts a little; a real jump lifts the feet.
  const happy = p.happy > 0.5;
  r.eyes.forEach((e, i) => {
    e.visible = !happy;
    e.scale.set(0.82 * p.eyeScale, 1.25 * p.eyeScale * Math.max(0.06, p.eyeOpen), 0.32);
    e.position.y = 0.53 + p.eyeUp;
    r.happyEyes[i].visible = happy;
  });
  r.brows.forEach((b, i) => {
    const side = i === 0 ? -1 : 1;
    b.rotation.z = -side * p.brow * D;
    b.position.y = 0.69 + p.browLift + (p.eyeScale - 1) * 0.08;
  });
  const open = Math.max(talk, p.mouth);
  if (open > 0.08) {
    r.mouthOpen.visible = true;
    r.smile.visible = false;
    r.mouthOpen.scale.set(1.25 - 0.35 * open, 0.25 + 0.95 * open, 0.3);
  } else if (Math.abs(p.smile) > 0.15) {
    r.mouthOpen.visible = false;
    r.smile.visible = true;
    r.smile.rotation.z = p.smile > 0 ? Math.PI : 0;
    r.smile.position.y = p.smile > 0 ? 0.35 : 0.27;
    r.smile.scale.set(0.7 + 0.5 * Math.abs(p.smile), 0.5 + 0.6 * Math.abs(p.smile), 1);
  } else {
    r.mouthOpen.visible = true;
    r.smile.visible = false;
    r.mouthOpen.scale.set(1, 0.16, 0.3);
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────
interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: Rig;
  w: number;
  h: number;
  /** ps2: the low-res frame after dithering. */
  post?: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
  world?: THREE.Object3D[];
  /** 3d: built with fast3d (Setup > Performance); a stage built under the other setting is rebuilt. */
  fast?: boolean;
}

const stages = new Map<Art, Stage>();

export function makeRenderer(w: number, h: number, aa: boolean): THREE.WebGLRenderer {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const r = new THREE.WebGLRenderer({ canvas, antialias: aa, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

function toonRamp(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([90, 175, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function checkerTexture(a: string, b: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = a;
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = b;
  g.fillRect(0, 0, 16, 16);
  g.fillRect(16, 16, 16, 16);
  // A little grime so it reads as a texture, not a flat pattern.
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + hash(i) * 0.08})`;
    g.fillRect(Math.floor(hash(i + 9) * 32), Math.floor(hash(i + 17) * 32), 2, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function blobShadow(opacity: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.005;
  m.scale.set(1, 0.8, 1);
  return m;
}

function buildStage(art: Art, fast = false): Stage {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 9 / 16, 0.1, 200);
  if (art === 'cartoon') {
    const ramp = toonRamp();
    const renderer = makeRenderer(720, 1280, true);
    const rig = buildRig({ seg: 16, shadows: false, outline: outlineMaterial(0.028), mat: (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp }) });
    scene.add(rig.root, blobShadow(0.18));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(-2.5, 4, 5);
    scene.add(key, new THREE.AmbientLight(0xffffff, 1.1));
    return { renderer, scene, camera, rig, w: 720, h: 1280 };
  }
  if (art === 'ps2') {
    const w = 300;
    const h = 534;
    const renderer = makeRenderer(w, h, false);
    renderer.setClearColor(0x000000, 1);
    const lam = (color: string, map?: THREE.Texture): THREE.Material => snapVertices(new THREE.MeshLambertMaterial({ color, map }));
    const rig = buildRig({ seg: 6, shadows: false, mat: (color) => lam(color) });
    scene.add(rig.root, blobShadow(0.45));
    scene.fog = new THREE.Fog(0x2a2f6b, 9, 34);
    // Sky: a gradient dome.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(80, 12, 8),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color('#0d1240') }, mid: { value: new THREE.Color('#3b3f8f') }, low: { value: new THREE.Color('#e58f6a') } },
        vertexShader: 'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying float vy; void main(){ vec3 c = vy > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, vy)) : mix(low, mid, smoothstep(-0.05, 0.12, vy)); gl_FragColor = vec4(c,1.0); }',
      }),
    );
    const floorTex = checkerTexture('#3b3466', '#2b2550');
    floorTex.repeat.set(30, 30);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 12, 12), lam('#ffffff', floorTex));
    floor.rotation.x = -Math.PI / 2;
    const world: THREE.Object3D[] = [sky, floor];
    // A ring of low-poly pillars and a floating crystal: an early-2000s hub world.
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const r = 11 + 3 * hash(i);
      const hgt = 2.5 + 4 * hash(i + 4);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, hgt, 6), lam(i % 2 ? '#5b5fb0' : '#7a6fcf'));
      p.position.set(Math.cos(ang) * r, hgt / 2, Math.sin(ang) * r - 4);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 1.9), lam('#c9b8ff'));
      cap.position.set(p.position.x, hgt + 0.17, p.position.z);
      world.push(p, cap);
    }
    for (let i = 0; i < 7; i++) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(6 + 5 * hash(i + 30), 5 + 6 * hash(i + 40), 5), lam('#2c2a5e'));
      const ang = Math.PI * (0.15 + 0.7 * (i / 6));
      hill.position.set(Math.cos(ang) * 40, 2, -Math.sin(ang) * 40);
      world.push(hill);
    }
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), snapVertices(new THREE.MeshLambertMaterial({ color: '#ffd166', emissive: '#7a4b00' })));
    crystal.name = 'crystal';
    crystal.position.set(3.6, 4.6, -6);
    world.push(crystal);
    scene.add(...world);
    const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
    sun.position.set(-4, 7, 6);
    scene.add(sun, new THREE.HemisphereLight(0x9aa6ff, 0x302040, 1.3));
    const post = document.createElement('canvas');
    post.width = w;
    post.height = h;
    return { renderer, scene, camera, rig, w, h, post: { canvas: post, ctx: post.getContext('2d', { willReadFrequently: true })! }, world };
  }
  // 3d: soft studio light, glossy toy plastic, real shadows.
  // fast3d: no antialias, plain PCF shadows at 512, standard material (no clearcoat / sheen).
  const renderer = makeRenderer(810, 1440, !fast);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = fast ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const rig = buildRig({
    seg: 24,
    shadows: true,
    mat: (color, o) =>
      fast
        ? new THREE.MeshStandardMaterial({ color, roughness: o?.glossy ? 0.18 : 0.42 })
        : new THREE.MeshPhysicalMaterial({ color, roughness: o?.glossy ? 0.18 : 0.42, clearcoat: o?.glossy ? 1 : 0.35, clearcoatRoughness: 0.25, sheen: o?.glossy ? 0 : 0.4, sheenColor: new THREE.Color('#ffffff') }),
  });
  rig.glow.forEach((m) => (m.color = m.color.clone().multiplyScalar(1.6)));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(fast ? 512 : 1024, fast ? 512 : 1024);
  key.shadow.radius = 6;
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -2;
  key.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(0xc4b5fd, 3);
  rim.position.set(3, 4, -5);
  scene.add(rig.root, ground, key, rim, new THREE.HemisphereLight(0xffffff, 0xd9d2f0, 0.8));
  return { renderer, scene, camera, rig, w: 810, h: 1440, fast };
}

function stageFor(art: Art): Stage {
  // Only the 3d stage depends on fast3d; the others are always built the same.
  const fast = art === '3d' && perfNow().fast3d;
  let st = stages.get(art);
  if (st && art === '3d' && !!st.fast !== fast) {
    // Built under the other setting: let its WebGL context go and build it again.
    st.renderer.dispose();
    st.renderer.forceContextLoss();
    stages.delete(art);
    st = undefined;
  }
  if (!st) {
    st = buildStage(art, fast);
    stages.set(art, st);
  }
  return st;
}

// PS2 dither: 4×4 Bayer, colour cut to 5 bits a channel.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5) * 8);
function dither(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = BAYER[(y & 3) * 4 + (x & 3)];
      for (let c = 0; c < 3; c++) {
        const v = Math.max(0, Math.min(255, d[i + c] + o));
        d[i + c] = (v >> 3) << 3;
      }
    }
  ctx.putImageData(img, 0, 0);
}

// ── Frame ──────────────────────────────────────────────────────────────────
const tmp = new THREE.Vector3();

export function renderCharacter(f: CharFrame): CharOut {
  const st = stageFor(f.art);
  const { rig, camera, renderer, scene } = st;
  const pose = poseAt(f);
  applyPose(rig, pose, f.talk);
  // The brand colour: body as given, head a little lighter, limbs a little darker.
  const base = new THREE.Color(f.color);
  (rig.body[0] as THREE.MeshStandardMaterial).color.copy(base);
  (rig.body[1] as THREE.MeshStandardMaterial).color.copy(base).lerp(new THREE.Color('#ffffff'), 0.22);
  (rig.limbs[0] as THREE.MeshStandardMaterial).color.copy(base).multiplyScalar(0.82);
  rig.glow[1].color.set(f.accent);
  rig.antenna.position.y = 1.23 + 0.03 * s(f.t * 3);

  // Camera: wide shows the whole body, close is head and shoulders. It drifts and pushes in a little over the beat.
  const corner = f.place === 'corner';
  const zoom = corner ? 0 : f.zoom;
  const visible = corner ? 12 : 5.6 - 2.2 * zoom;
  const focusY = corner ? 1.3 : 1.2 + 0.8 * zoom;
  const push = 1 - 0.06 * Math.min(1, f.local / 4);
  const dist = ((visible / 2) / Math.tan((camera.fov * D) / 2)) * push;
  const orbit = f.side * 0.42 + 0.06 * s(f.t * 0.35);
  camera.position.set(Math.sin(orbit) * dist, focusY + 0.25 + (corner ? 0.6 : 0), Math.cos(orbit) * dist);
  camera.lookAt(0, focusY, 0);
  // Place the focus point on screen: the stage sits below the headline, the corner bottom left.
  const fx = corner ? 0.19 : 0.5;
  const fy = corner ? 0.84 : f.low ? 0.74 : 0.66;
  camera.setViewOffset(st.w, st.h, (0.5 - fx) * st.w, (0.5 - fy) * st.h, st.w, st.h);
  camera.updateProjectionMatrix();

  if (st.world) {
    const crystal = st.world.find((o) => o.name === 'crystal');
    if (crystal) {
      crystal.rotation.y = f.t * 1.2;
      crystal.position.y = 4.6 + 0.3 * s(f.t * 1.6);
    }
  }
  renderer.render(scene, camera);

  rig.headAnchor.getWorldPosition(tmp);
  tmp.project(camera);
  const head = { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2 };
  const headSize = 1.0 / visible;

  if (st.post) {
    const { ctx } = st.post;
    ctx.clearRect(0, 0, st.w, st.h);
    ctx.drawImage(renderer.domElement, 0, 0);
    dither(ctx, st.w, st.h);
    return { canvas: st.post.canvas, head, headSize, opaque: true };
  }
  return { canvas: renderer.domElement, head, headSize, opaque: false };
}

/** Mouth openness for the spoken line at `local` seconds into the beat: syllable flaps, closed between words. */
export function mouthAt(say: string, local: number, start: number, dur: number): number {
  if (!say || dur <= 0 || local < start || local > start + dur) return 0;
  const u = (local - start) / dur;
  const ch = say[Math.min(say.length - 1, Math.floor(u * say.length))] ?? ' ';
  if (/[\s,.;:!?—-]/.test(ch)) return 0.05;
  const k = local * 11 + hash(Math.floor(local * 4)) * 2;
  return 0.25 + 0.65 * Math.abs(Math.sin(k)) * (0.7 + 0.3 * hash(Math.floor(local * 9)));
}
