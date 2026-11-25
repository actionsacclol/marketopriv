import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { BloxLook, BloxMove, BloxSet, BloxTime } from '@shared/blox';
import { perfNow } from '../lib/perf';
import { makeRenderer } from './char3d';

// Blocky avatars in a small 3D world: our own six-part figures (head, torso, two arms, two legs, no elbows or
// knees) that snap from move to move, on a studded baseplate, in a park, on an obby path or on a city street.
// Every frame is a pure function of its input, so the preview, stills and export draw the same thing.

const D = Math.PI / 180;
const RW = 810;
const RH = 1440;
/** The scenery repeats every PERIOD units along x, so the world can slide past a walking avatar for ever. */
const PERIOD = 12;
const s = Math.sin;

export interface Shot {
  x: number;
  y: number;
  z: number;
  /** Radians round the point the camera looks at (0 = straight on). */
  orbit: number;
  /** Height of the world the frame shows at that point. */
  vis: number;
  /** Where that point sits down the frame, 0..1. */
  fy: number;
  /** Camera height above (or, negative, below) that point. */
  rise: number;
}

export const mixShot = (p: Shot, q: Shot, k: number): Shot => ({
  x: p.x + (q.x - p.x) * k,
  y: p.y + (q.y - p.y) * k,
  z: p.z + (q.z - p.z) * k,
  orbit: p.orbit + (q.orbit - p.orbit) * k,
  vis: p.vis + (q.vis - p.vis) * k,
  fy: p.fy + (q.fy - p.fy) * k,
  rise: p.rise + (q.rise - p.rise) * k,
});

export interface BloxActor {
  move: BloxMove;
  /** Seconds since this move began. */
  local: number;
  /** The move it is coming out of, and how far into this one it is (0..1). */
  from: BloxMove | null;
  fromLocal: number;
  blend: number;
  /** Mouth open 0..1. */
  talk: number;
  /** Where it stands, and its turn in degrees (two avatars face each other a little). */
  x: number;
  face: number;
  /** The right-hand avatar does every move the other way round. */
  mirror: boolean;
  /** Text on a sign it holds over its head ('' = none). */
  sign: string;
  /** Pointing goes up (at the screen panel) instead of out to the side. */
  pointUp: boolean;
  coin: boolean;
  robot: boolean;
  /** Which side its floating props are on: -1 left, 1 right. */
  side: number;
}

export interface BloxFrame {
  set: BloxSet;
  time: BloxTime;
  t: number;
  /** How far the world has slid past (walk and run beats). */
  travel: number;
  shot: Shot;
  looks: [BloxLook, BloxLook];
  actors: BloxActor[];
  floor: { kind: 'crate' | 'trophy'; x: number; z: number } | null;
  /** The highlight colour (signs). */
  hi: string;
}

export interface BloxHead {
  /** Head centre in the frame, 0..1. */
  x: number;
  y: number;
  /** The highest point of the avatar (hat, a held sign), 0..1 down the frame. */
  top: number;
  /** Head size as a fraction of the frame height. */
  r: number;
}

export interface BloxOut {
  canvas: HTMLCanvasElement;
  heads: BloxHead[];
}

// ── Moves ──────────────────────────────────────────────────────────────────
const KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'lean', 'twist', 'tilt', 'hp', 'hy', 'hr', 'la', 'lo', 'ra', 'ro', 'll', 'lso', 'rl', 'rso'] as const;
type Key = (typeof KEYS)[number];
/** Degrees, except x / y / z (world units). la / ra = an arm swung forward, lo / ro = out to the side; ll / rl and lso / rso the same for the legs. */
type Pose = Record<Key, number>;
type Eyes = 'open' | 'happy' | 'wide' | 'angry' | 'sad' | 'shut';
type Mouth = 'smile' | 'grin' | 'flat' | 'open' | 'wide' | 'o' | 'frown';

interface Act {
  p: Partial<Pose>;
  eyes: Eyes;
  mouth: Mouth;
  seat?: boolean;
  desk?: boolean;
  phone?: boolean;
}

const ZERO = Object.fromEntries(KEYS.map((k) => [k, 0])) as Pose;
const REST: Pose = { ...ZERO, lo: 4, ro: 4 };
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

function act(move: BloxMove, u: number, talk: number, up: boolean): Act {
  switch (move) {
    case 'talk':
      return {
        p: { ra: 20 + 12 * s(u * 2.3), ro: 12, la: 6 + 7 * s(u * 1.9 + 1), lo: 7, hy: 6 * s(u * 0.9), hr: 2.5 * s(u * 1.3), twist: 3 * s(u * 0.8), hp: talk * 3 * s(u * 7) },
        eyes: 'open',
        mouth: 'smile',
      };
    case 'point':
      return up
        ? { p: { lo: 152, la: 6, hp: -16, hy: 10, lean: -4, ro: 8 }, eyes: 'open', mouth: 'smile' }
        : { p: { lo: 98, la: 6, hy: 24, twist: 8, ro: 6, y: 0.012 * s(u * 3) }, eyes: 'open', mouth: 'smile' };
    case 'present':
      return { p: { lo: 62 + 3 * s(u * 2), ro: 62 - 3 * s(u * 2), la: 12, ra: 12, lean: -5, hy: 5 * s(u * 0.9) }, eyes: 'open', mouth: 'grin' };
    case 'shrug':
      return { p: { lo: 40, ro: 40, la: 14, ra: 14, y: 0.035 + 0.012 * s(u * 3), hr: 12, hy: -6 }, eyes: 'open', mouth: 'flat' };
    case 'shock': {
      const jump = u < 0.4 ? 0.34 * s((Math.PI * u) / 0.4) : 0;
      return { p: { y: jump, lean: -11, lo: 122, ro: 122, hp: -6, hr: 3 * s(u * 40) * Math.max(0, 1 - u * 2), lso: 8, rso: 8 }, eyes: 'wide', mouth: 'o' };
    }
    case 'cheer': {
      const hop = Math.abs(s(u * 5.2));
      return { p: { lo: 166 + 8 * s(u * 10.4), ro: 166 - 8 * s(u * 10.4), y: 0.24 * hop, hr: 5 * s(u * 5.2), ll: -10 * hop, rl: 12 * hop }, eyes: 'happy', mouth: 'grin' };
    }
    case 'think':
      return { p: { ro: 150 + 4 * s(u * 6), ra: 8, lo: 6, hr: -9, hp: -9, hy: 12, tilt: 2 }, eyes: 'open', mouth: 'flat' };
    case 'wave':
      return { p: { ro: 150 + 18 * s(u * 10), ra: 4, hr: 6, tilt: -2 }, eyes: 'happy', mouth: 'grin' };
    case 'facepalm':
      return { p: { hp: 30, lean: 9, hy: 14 * s(u * 6) * Math.max(0, 1 - u / 1.3), lo: 7, ro: 7, y: -0.01 }, eyes: 'shut', mouth: 'frown' };
    case 'sad':
      return { p: { hp: 24, lean: 11, la: -5, ra: -5, lo: 2, ro: 2, hy: 3 * s(u * 1.2), y: -0.01 }, eyes: 'sad', mouth: 'frown' };
    case 'laugh': {
      const shake = s(u * 18);
      return { p: { lean: -13, tilt: 3 * shake, y: 0.03 * Math.abs(shake), lo: 22, ro: 22, la: 22, ra: 22, hp: -8 }, eyes: 'happy', mouth: 'wide' };
    }
    case 'thumbsup':
      return { p: { ra: 80, ro: 10, twist: -7, hp: 5 * s(u * 5) * Math.max(0, 1 - u * 0.8), lo: 5 }, eyes: 'happy', mouth: 'grin' };
    case 'angry': {
      const st = s(u * 8.5);
      return { p: { lo: 16, ro: 16, la: -14, ra: -14, lean: 7, hy: 4 * s(u * 22) * Math.max(0.25, 1 - u), ll: Math.max(0, 24 * st), rl: Math.max(0, -24 * st), hp: 6 }, eyes: 'angry', mouth: 'frown' };
    }
    case 'walk': {
      const ph = u * 7;
      return { p: { yaw: 62, ll: 32 * s(ph), rl: -32 * s(ph), la: -28 * s(ph), ra: 28 * s(ph), y: 0.03 * Math.abs(s(ph)), lean: 3, lo: 3, ro: 3 }, eyes: 'open', mouth: 'smile' };
    }
    case 'run': {
      const ph = u * 12;
      return { p: { yaw: 66, ll: 54 * s(ph), rl: -54 * s(ph), la: -62 * s(ph), ra: 62 * s(ph), y: 0.07 * Math.abs(s(ph)), lean: 15, lo: 5, ro: 5 }, eyes: 'wide', mouth: 'open' };
    }
    case 'jump': {
      const k = (u % 0.95) / 0.95;
      const air = k < 0.72 ? s((Math.PI * k) / 0.72) : 0;
      return { p: { y: 0.6 * air, lo: 14 + 140 * air, ro: 14 + 140 * air, ll: -20 * air, rl: 24 * air, lean: 4 * (1 - air) }, eyes: air > 0.4 ? 'happy' : 'open', mouth: 'grin' };
    }
    case 'dance': {
      const b = u * Math.PI * 2 * 1.05;
      return {
        p: { x: 0.12 * s(b), tilt: 7 * s(b), lo: 92 + 72 * s(b), ro: 92 - 72 * s(b), y: 0.055 * Math.abs(s(b * 2)), lso: 6 + 9 * Math.max(0, s(b)), rso: 6 + 9 * Math.max(0, -s(b)), hr: -7 * s(b) },
        eyes: 'happy',
        mouth: 'grin',
      };
    }
    case 'groove': {
      const b = u * Math.PI * 2 * 1.9;
      return { p: { la: 58 + 36 * s(b), ra: 58 - 36 * s(b), twist: 15 * s(b), y: 0.04 * Math.abs(s(b)), hp: 7 * s(b * 2), lean: 6, ll: 8 * s(b), rl: -8 * s(b), lo: 8, ro: 8 }, eyes: 'open', mouth: 'smile' };
    }
    case 'spin':
      return { p: { yaw: (u * 430) % 360, lo: 90, ro: 90, y: 0.04 * Math.abs(s(u * 10)) }, eyes: 'happy', mouth: 'wide' };
    case 'sit':
      return { p: { y: -0.36, ll: 88, rl: 88, la: 34, ra: 34, lo: 2, ro: 2, lean: -2, hy: 5 * s(u * 0.8) }, eyes: 'open', mouth: 'smile', seat: true };
    case 'type':
      return { p: { y: -0.36, yaw: 40, ll: 88, rl: 88, la: 54 + 6 * s(u * 17), ra: 54 - 6 * s(u * 17), lo: -3, ro: -3, hp: 13, lean: 7 }, eyes: 'open', mouth: 'flat', seat: true, desk: true };
    case 'phone':
      return { p: { ra: 64 + 2 * s(u * 9), ro: -9, hp: 21, lean: 4, hy: -6, lo: 3 }, eyes: 'open', mouth: 'flat', phone: true };
    case 'sleep':
      return { p: { pitch: -90, yaw: 90, x: 1.2, y: 0.2 + 0.012 * s(u * 1.5), lo: 6, ro: 6, lso: 4, rso: 4 }, eyes: 'shut', mouth: 'flat' };
    case 'fall': {
      // Tips over sideways across the frame, lands at 0.3 s with one small bounce.
      const k = clamp01(u / 0.3);
      const e = k * k;
      const after = Math.max(0, u - 0.3);
      const bounce = Math.exp(-after * 9) * Math.abs(s(after * 15));
      return {
        p: { pitch: -90 * e + 9 * bounce * (k >= 1 ? 1 : 0), yaw: 82 * e, x: 1.2 * e, y: 0.2 * e + 0.1 * bounce * (k >= 1 ? 1 : 0), lo: 20 + 55 * e, ro: 20 + 55 * e, lso: 14 * e, rso: 14 * e, la: 30 * (1 - e) },
        eyes: u > 0.7 ? 'shut' : 'wide',
        mouth: 'o',
      };
    }
    default:
      // idle: the arms sway a little and the head looks around.
      return { p: { la: 3 * s(u * 1.6), ra: -3 * s(u * 1.6), y: 0.008 * s(u * 2.1), hy: 5 * s(u * 0.7), hr: 1.5 * s(u * 0.5) }, eyes: 'open', mouth: 'smile' };
  }
}

const full = (p: Partial<Pose>): Pose => ({ ...REST, ...p });

/** A snap with a little overshoot: the way these avatars change move. */
const snap = (x: number): number => {
  const k = clamp01(x);
  return 1 + 1.7 * Math.pow(k - 1, 3) + 0.7 * Math.pow(k - 1, 2);
};

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── Textures ───────────────────────────────────────────────────────────────
function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The studded surface: two by two studs a tile, drawn in greys so the material's colour tints it. */
function studTexture(): THREE.CanvasTexture {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = '#e9e9e9';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.10)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 128, 128);
    for (const [cx, cy] of [[32, 32], [96, 32], [32, 96], [96, 96]]) {
      g.beginPath();
      g.arc(cx + 2, cy + 3, 19, 0, Math.PI * 2);
      g.fillStyle = 'rgba(0,0,0,0.20)';
      g.fill();
      g.beginPath();
      g.arc(cx, cy, 18, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      g.beginPath();
      g.arc(cx, cy, 18, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.lineWidth = 2;
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const faces = new Map<string, THREE.CanvasTexture>();
/** Our own face: tall oval eyes with a glint, thick brows when angry or sad, a simple mouth. */
function faceTexture(eyes: Eyes, mouth: Mouth): THREE.CanvasTexture {
  const key = `${eyes}|${mouth}`;
  const hit = faces.get(key);
  if (hit) return hit;
  const INK = '#17141D';
  const t = canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const side of [-1, 1]) {
      const ex = 128 + side * 42;
      const ey = 104;
      g.fillStyle = INK;
      g.strokeStyle = INK;
      if (eyes === 'happy') {
        g.lineWidth = 11;
        g.beginPath();
        g.arc(ex, ey + 10, 17, Math.PI * 1.12, Math.PI * 1.88);
        g.stroke();
      } else if (eyes === 'shut') {
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(ex - 16, ey + 4);
        g.lineTo(ex + 16, ey + 4);
        g.stroke();
      } else if (eyes === 'wide') {
        g.beginPath();
        g.arc(ex, ey, 25, 0, Math.PI * 2);
        g.fillStyle = '#FFFFFF';
        g.fill();
        g.lineWidth = 5;
        g.stroke();
        g.beginPath();
        g.arc(ex, ey, 10, 0, Math.PI * 2);
        g.fillStyle = INK;
        g.fill();
      } else {
        const h = eyes === 'sad' ? 19 : 23;
        g.beginPath();
        g.ellipse(ex, ey + (eyes === 'sad' ? 4 : 0), 13, h, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(ex - 4, ey - 9, 5, 0, Math.PI * 2);
        g.fillStyle = '#FFFFFF';
        g.fill();
        if (eyes === 'angry' || eyes === 'sad') {
          // Brows: down towards the nose when angry, down towards the ears when sad.
          const inner = eyes === 'angry' ? 14 : -10;
          g.strokeStyle = INK;
          g.lineWidth = 10;
          g.beginPath();
          g.moveTo(ex - side * 22, ey - 40 - inner + (eyes === 'angry' ? 0 : 20));
          g.lineTo(ex + side * 18, ey - 40 + (eyes === 'angry' ? 0 : -6) + (eyes === 'sad' ? 16 : 0) - (eyes === 'angry' ? 14 : 0));
          g.stroke();
        }
      }
    }
    g.strokeStyle = INK;
    g.fillStyle = INK;
    g.lineWidth = 10;
    const mx = 128;
    const my = 178;
    g.beginPath();
    if (mouth === 'smile') {
      g.arc(mx, my - 26, 40, Math.PI * 0.2, Math.PI * 0.8);
      g.stroke();
    } else if (mouth === 'frown') {
      g.arc(mx, my + 34, 40, Math.PI * 1.22, Math.PI * 1.78);
      g.stroke();
    } else if (mouth === 'flat') {
      g.moveTo(mx - 24, my);
      g.lineTo(mx + 24, my);
      g.stroke();
    } else if (mouth === 'o') {
      g.arc(mx, my, 15, 0, Math.PI * 2);
      g.fill();
    } else if (mouth === 'grin') {
      g.moveTo(mx - 40, my - 12);
      g.lineTo(mx + 40, my - 12);
      g.arc(mx, my - 12, 40, 0, Math.PI);
      g.closePath();
      g.fill();
      g.fillStyle = '#FFFFFF';
      g.fillRect(mx - 31, my - 8, 62, 11);
    } else {
      // open / wide: talking and laughing.
      const ry = mouth === 'wide' ? 26 : 14;
      g.ellipse(mx, my, mouth === 'wide' ? 26 : 22, ry, 0, 0, Math.PI * 2);
      g.fill();
      if (mouth === 'wide') {
        g.beginPath();
        g.ellipse(mx, my + 14, 15, 9, 0, 0, Math.PI * 2);
        g.fillStyle = '#E2556B';
        g.fill();
      }
    }
  });
  faces.set(key, t);
  return t;
}

function printTexture(kind: string): THREE.CanvasTexture | null {
  if (kind === 'none') return null;
  return canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    if (kind === 'stripe') {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(0, 40, 128, 16);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, 66, 128, 16);
    } else if (kind === 'star') {
      g.fillStyle = 'rgba(255,255,255,0.94)';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 22 : 52;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    } else {
      g.fillStyle = '#FDE047';
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 5;
      g.lineJoin = 'round';
      g.beginPath();
      [[76, 8], [34, 70], [60, 70], [48, 120], [96, 52], [68, 52]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.stroke();
      g.fill();
    }
  });
}

function signTexture(text: string, color: string): THREE.CanvasTexture {
  return canvasTex(520, 224, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 520, 224);
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 12;
    g.strokeRect(6, 6, 508, 212);
    let size = 120;
    const fontOf = (px: number): string => `900 ${px}px "Montserrat", "Arial Black", Inter, sans-serif`;
    g.font = fontOf(size);
    const w = g.measureText(text).width;
    if (w > 450) size = Math.max(40, Math.floor((size * 450) / w));
    g.font = fontOf(size);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#111016';
    g.fillText(text, 260, 118);
  });
}

function windowTextures(seed: number): { map: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const paint = (lit: boolean) => (g: CanvasRenderingContext2D): void => {
    g.fillStyle = lit ? '#000000' : '#ffffff';
    g.fillRect(0, 0, 128, 256);
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 4; c++) {
        const on = hash(seed + r * 7 + c * 13) > 0.42;
        g.fillStyle = lit ? (on ? '#ffffff' : '#141414') : on ? '#bcd4ea' : '#7f93a8';
        g.fillRect(12 + c * 29, 10 + r * 25, 19, 15);
      }
  };
  const map = canvasTex(128, 256, paint(false));
  const lit = canvasTex(128, 256, paint(true));
  return { map, lit };
}

// ── Avatar ─────────────────────────────────────────────────────────────────
interface Avatar {
  stand: THREE.Group;
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  lArm: THREE.Group;
  rArm: THREE.Group;
  lLeg: THREE.Group;
  rLeg: THREE.Group;
  face: THREE.MeshBasicMaterial;
  headMid: THREE.Object3D;
  headTop: THREE.Object3D;
  signTop: THREE.Object3D;
  sign: THREE.Group;
  signMat: THREE.MeshBasicMaterial;
  signKey: string;
  phone: THREE.Mesh;
  seat: THREE.Mesh;
  desk: THREE.Group;
  cape: THREE.Group | null;
  coin: THREE.Mesh;
  robot: THREE.Group;
}

interface Kit {
  mat: (color: string, rough?: number, metal?: number) => THREE.MeshStandardMaterial;
  box: (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, round?: number) => THREE.Mesh;
}

function buildAvatar(kit: Kit, look: BloxLook): Avatar {
  const { mat, box } = kit;
  const skin = mat(look.skin, 0.55);
  const shirt = mat(look.shirt, 0.6);
  const pants = mat(look.pants, 0.65);
  const hairM = mat(look.hairColor, 0.8);
  const stand = new THREE.Group();
  const root = new THREE.Group();
  stand.add(root);
  const hips = new THREE.Group();
  hips.position.y = 0.8;
  root.add(hips);

  const leg = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.2 * side, 0, 0);
    g.add(box(0.39, 0.8, 0.39, pants, 0, -0.4, 0, 0.035));
    hips.add(g);
    return g;
  };
  const lLeg = leg(1);
  const rLeg = leg(-1);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(box(0.8, 0.8, 0.4, shirt, 0, 0.4, 0, 0.04));
  const printTex = printTexture(look.print);
  if (printTex) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: printTex, transparent: true, depthWrite: false }));
    p.position.set(0, 0.42, 0.203);
    torso.add(p);
  }
  if (look.wear.includes('backpack')) {
    const bag = mat('#3A4252', 0.8);
    torso.add(box(0.56, 0.6, 0.22, bag, 0, 0.42, -0.31, 0.04), box(0.4, 0.2, 0.06, mat('#566178', 0.8), 0, 0.3, -0.44, 0.02));
  }
  let cape: THREE.Group | null = null;
  if (look.wear.includes('cape')) {
    cape = new THREE.Group();
    cape.position.set(0, 0.78, -0.215);
    cape.add(box(0.78, 1.05, 0.03, mat(look.hatColor, 0.7), 0, -0.52, 0));
    torso.add(cape);
  }

  const arm = (side: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(0.6 * side, 0.7, 0);
    // Sleeve, then the hand end in skin.
    g.add(box(0.39, 0.5, 0.39, shirt, 0, -0.15, 0, 0.035), box(0.385, 0.32, 0.385, skin, 0, -0.54, 0, 0.035));
    torso.add(g);
    return g;
  };
  const lArm = arm(1);
  const rArm = arm(-1);
  const phone = box(0.15, 0.26, 0.03, mat('#15161C', 0.3), 0, -0.6, 0.215);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.22), new THREE.MeshBasicMaterial({ color: '#9FD8FF' }));
  glass.position.z = -0.0155;
  glass.rotation.y = Math.PI;
  phone.add(glass);
  phone.visible = false;
  rArm.add(phone);

  const head = new THREE.Group();
  head.position.y = 0.8;
  torso.add(head);
  head.add(box(0.52, 0.5, 0.52, skin, 0, 0.25, 0, 0.11));
  const face = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), face);
  facePlane.position.set(0, 0.25, 0.2615);
  head.add(facePlane);
  if (look.wear.includes('shades')) {
    const dark = mat('#0E0E14', 0.15, 0.4);
    head.add(box(0.2, 0.13, 0.04, dark, -0.115, 0.3, 0.275, 0.015), box(0.2, 0.13, 0.04, dark, 0.115, 0.3, 0.275, 0.015), box(0.06, 0.03, 0.04, dark, 0, 0.32, 0.275), box(0.02, 0.03, 0.3, dark, -0.265, 0.32, 0.14), box(0.02, 0.03, 0.3, dark, 0.265, 0.32, 0.14));
  }
  // Hair.
  const covered = look.hat === 'cap' || look.hat === 'beanie' || look.hat === 'tophat';
  if (look.hair !== 'none') {
    if (!covered) head.add(box(0.56, 0.14, 0.56, hairM, 0, 0.49, 0, 0.04));
    head.add(box(0.56, 0.3, 0.12, hairM, 0, 0.33, -0.235, 0.03));
    if (look.hair === 'swoop' && !covered) head.add(box(0.56, 0.11, 0.1, hairM, 0, 0.44, 0.25, 0.03), box(0.1, 0.24, 0.32, hairM, 0.265, 0.36, 0.1, 0.03));
    if (look.hair === 'long') head.add(box(0.58, 0.66, 0.12, hairM, 0, 0.12, -0.25, 0.03), box(0.08, 0.5, 0.3, hairM, -0.275, 0.2, -0.1, 0.03), box(0.08, 0.5, 0.3, hairM, 0.275, 0.2, -0.1, 0.03));
    if (look.hair === 'spiky' && !covered)
      for (let i = 0; i < 9; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 4), hairM);
        sp.position.set(-0.17 + (i % 3) * 0.17, 0.62 + 0.03 * hash(i), -0.17 + Math.floor(i / 3) * 0.17);
        sp.rotation.set((hash(i + 3) - 0.5) * 0.7, hash(i) * 3, (hash(i + 6) - 0.5) * 0.7);
        sp.castShadow = true;
        head.add(sp);
      }
  }
  // Hat.
  const hatM = mat(look.hat === 'crown' ? '#F6C343' : look.hatColor, look.hat === 'crown' ? 0.3 : 0.7, look.hat === 'crown' ? 0.55 : 0);
  let topY = look.hair === 'spiky' && !covered ? 0.76 : look.hair !== 'none' ? 0.57 : 0.5;
  if (look.hat === 'cap') {
    head.add(box(0.57, 0.18, 0.57, hatM, 0, 0.52, 0, 0.05), box(0.5, 0.04, 0.3, hatM, 0, 0.45, 0.37, 0.015));
    topY = 0.62;
  } else if (look.hat === 'beanie') {
    const pom = mat('#F4F4F6', 0.9);
    head.add(box(0.58, 0.26, 0.58, hatM, 0, 0.54, 0, 0.08), box(0.61, 0.09, 0.61, pom, 0, 0.43, 0, 0.03), box(0.15, 0.15, 0.15, pom, 0, 0.73, 0, 0.05));
    topY = 0.82;
  } else if (look.hat === 'crown') {
    for (const [x, z, w, d] of [[0, 0.24, 0.52, 0.04], [0, -0.24, 0.52, 0.04], [0.24, 0, 0.04, 0.52], [-0.24, 0, 0.04, 0.52]]) head.add(box(w, 0.13, d, hatM, x, 0.565, z));
    for (const [x, z] of [[0.24, 0.24], [-0.24, 0.24], [0.24, -0.24], [-0.24, -0.24], [0, 0.24], [0, -0.24]]) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 4), hatM);
      sp.position.set(x, 0.7, z);
      sp.rotation.y = Math.PI / 4;
      sp.castShadow = true;
      head.add(sp);
    }
    topY = 0.78;
  } else if (look.hat === 'tophat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), hatM);
    brim.position.y = 0.51;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.42, 20), hatM);
    body.position.y = 0.73;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.256, 0.256, 0.07, 20), mat('#E7E7EC', 0.7));
    band.position.y = 0.58;
    brim.castShadow = body.castShadow = true;
    head.add(brim, body, band);
    topY = 0.95;
  } else if (look.hat === 'headphones') {
    const pad = mat('#1B1C22', 0.5);
    head.add(box(0.62, 0.06, 0.1, hatM, 0, 0.6, 0, 0.02), box(0.05, 0.34, 0.1, hatM, -0.305, 0.44, 0, 0.02), box(0.05, 0.34, 0.1, hatM, 0.305, 0.44, 0, 0.02), box(0.1, 0.24, 0.24, pad, -0.315, 0.26, 0, 0.04), box(0.1, 0.24, 0.24, pad, 0.315, 0.26, 0, 0.04));
    topY = 0.64;
  }
  const headMid = new THREE.Object3D();
  headMid.position.y = 0.25;
  const headTop = new THREE.Object3D();
  headTop.position.y = topY;
  head.add(headMid, headTop);

  // A sign held over the head with both hands.
  const sign = new THREE.Group();
  const signMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  sign.add(box(1.4, 0.64, 0.05, mat('#2A2530', 0.8), 0, 2.5, 0, 0.02));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.57), signMat);
  front.position.set(0, 2.5, 0.027);
  sign.add(front);
  const signTop = new THREE.Object3D();
  signTop.position.y = 2.86;
  sign.add(signTop);
  sign.visible = false;
  root.add(sign);

  // Things that stay on the ground while the body moves.
  const wood = mat('#A9743F', 0.85);
  const seat = box(0.86, 0.24, 0.62, wood, 0, 0.12, 0.14, 0.03);
  seat.visible = false;
  const desk = new THREE.Group();
  const top = mat('#D9D2C4', 0.7);
  desk.add(box(1.5, 0.07, 0.74, top, 0, 0.745, 0.97, 0.02), box(0.07, 0.72, 0.66, top, -0.68, 0.36, 0.97), box(0.07, 0.72, 0.66, top, 0.68, 0.36, 0.97));
  const metal = mat('#3B3F49', 0.35, 0.5);
  desk.add(box(0.52, 0.03, 0.34, metal, 0, 0.795, 0.9, 0.01));
  const lid = new THREE.Group();
  lid.position.set(0, 0.8, 1.07);
  lid.rotation.x = 0.26;
  lid.add(box(0.52, 0.34, 0.025, metal, 0, 0.17, 0, 0.01));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.29), new THREE.MeshBasicMaterial({ color: '#BFE3FF' }));
  glow.position.set(0, 0.17, -0.0135);
  glow.rotation.y = Math.PI;
  lid.add(glow);
  desk.add(lid);
  desk.visible = false;
  stand.add(seat, desk);

  // Floating props (placed in the world each frame).
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 24), mat('#F6C343', 0.28, 0.65));
  coin.castShadow = true;
  coin.rotation.order = 'YXZ';
  coin.visible = false;
  const robot = new THREE.Group();
  const shell = mat('#DCE3EE', 0.4, 0.2);
  robot.add(box(0.3, 0.26, 0.24, shell, 0, 0, 0, 0.05), box(0.26, 0.2, 0.22, shell, 0, 0.26, 0, 0.05), box(0.02, 0.1, 0.02, mat('#3B3F49', 0.4), 0, 0.41, 0));
  const eye = new THREE.MeshBasicMaterial({ color: '#5CF2E0' });
  for (const x of [-0.06, 0.06]) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.07), eye);
    e.position.set(x, 0.27, 0.112);
    robot.add(e);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eye);
  tip.position.y = 0.47;
  robot.add(tip, box(0.07, 0.16, 0.07, shell, -0.2, -0.02, 0, 0.02), box(0.07, 0.16, 0.07, shell, 0.2, -0.02, 0, 0.02));
  robot.visible = false;

  return { stand, root, torso, head, lArm, rArm, lLeg, rLeg, face, headMid, headTop, signTop, sign, signMat, signKey: '', phone, seat, desk, cape, coin, robot };
}

// ── Stage ──────────────────────────────────────────────────────────────────
interface Sky {
  top: string;
  mid: string;
  low: string;
  sun: string;
  sunPower: number;
  sunAt: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  cloud: string;
  windows: number;
}

const SKIES: Record<BloxTime, Sky> = {
  day: { top: '#1F6FDB', mid: '#62B4F7', low: '#C4E6FF', sun: '#FFF6E0', sunPower: 2.5, sunAt: [-5, 9, 7], hemiSky: '#E6F2FF', hemiGround: '#8C9485', hemi: 1.05, cloud: '#FFFFFF', windows: 0 },
  sunset: { top: '#2B2C78', mid: '#E58A62', low: '#FFD9A6', sun: '#FFB877', sunPower: 2.3, sunAt: [-8, 4.5, 5], hemiSky: '#FFC9A3', hemiGround: '#5B4A63', hemi: 0.8, cloud: '#FFC6A8', windows: 0.5 },
  night: { top: '#050817', mid: '#141C4A', low: '#2C3A78', sun: '#B9CCFF', sunPower: 1.5, sunAt: [5, 8, 6], hemiSky: '#7C8CC4', hemiGround: '#23263A', hemi: 1.0, cloud: '#3A467A', windows: 1 },
};

const GROUND: Record<BloxSet, string> = { baseplate: '#A9ADB5', park: '#63B34C', obby: '#000000', city: '#A4A6AD' };

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  key: string;
  avatars: [Avatar, Avatar];
  sky: THREE.ShaderMaterial;
  fog: THREE.Fog;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ground: THREE.Mesh;
  groundMat: THREE.MeshStandardMaterial;
  studs: THREE.Texture;
  sets: Record<BloxSet, THREE.Group>;
  spinners: THREE.Object3D[];
  lava: THREE.Mesh;
  clouds: THREE.Group;
  cloudMat: THREE.MeshBasicMaterial;
  stars: THREE.Points;
  windowMats: THREE.MeshStandardMaterial[];
  lampMats: THREE.MeshBasicMaterial[];
  crate: THREE.Mesh;
  trophy: THREE.Group;
}

let stage: Stage | null = null;

function build(looks: [BloxLook, BloxLook], key: string, fast: boolean): Stage {
  const renderer = makeRenderer(RW, RH, !fast);
  renderer.setClearColor(0x87c5f5, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = fast ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 9 / 16, 0.1, 260);
  const fog = new THREE.Fog(0xcfebff, 28, 120);
  scene.fog = fog;

  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string, rough = 0.7, metal = 0): THREE.MeshStandardMaterial => {
    const k = `${color}|${rough}|${metal}`;
    let m = mats.get(k);
    if (!m) {
      // There is no environment to reflect, so real metal would come out nearly black: gold and steel stay glossy plastic.
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: Math.min(metal, 0.1) });
      mats.set(k, m);
    }
    return m;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, round = 0): THREE.Mesh => {
    const geo = round > 0 ? new RoundedBoxGeometry(w, h, d, fast ? 1 : 3, Math.min(round, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };
  const kit: Kit = { mat, box };

  // Sky: a three-colour dome, blocky clouds, stars at night.
  const sky = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() } },
    vertexShader: 'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying float vy; void main(){ vec3 c = vy > 0.1 ? mix(mid, top, smoothstep(0.07, 0.4, vy)) : mix(low, mid, smoothstep(-0.02, 0.07, vy)); gl_FragColor = vec4(c,1.0);\n#include <colorspace_fragment>\n}',
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 24, 12), sky));
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false });
  const clouds = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(hash(i) * 3);
    for (let k = 0; k < n; k++) {
      const w = 5 + hash(i * 9 + k) * 6;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6 + hash(i + k * 5) * 1.4, 4), cloudMat);
      b.position.set(k * 3.2 - n * 1.6, hash(i * 3 + k) * 1.2, hash(i + k) * 2);
      c.add(b);
    }
    c.position.set(-60 + i * 19, 15 + hash(i + 40) * 16, -70 - hash(i + 50) * 40);
    c.userData.x0 = c.position.x;
    clouds.add(c);
  }
  scene.add(clouds);
  const starPos: number[] = [];
  for (let i = 0; i < 260; i++) {
    const a = hash(i) * Math.PI * 2;
    const e = 0.08 + hash(i + 500) * 1.3;
    starPos.push(Math.cos(a) * Math.cos(e) * 180, Math.sin(e) * 180, Math.sin(a) * Math.cos(e) * 180);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false }));
  scene.add(stars);

  // Ground.
  const studs = studTexture();
  studs.repeat.set(300, 300);
  studs.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const groundMat = new THREE.MeshStandardMaterial({ color: '#A9ADB5', roughness: 0.85, map: studs });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Sets: each is one strip of scenery, PERIOD long, placed four times in a row ──
  const windowMats: THREE.MeshStandardMaterial[] = [];
  const lampMats: THREE.MeshBasicMaterial[] = [];
  const spinners: THREE.Object3D[] = [];
  const row = (fill: (g: THREE.Group) => void): THREE.Group => {
    const strip = new THREE.Group();
    fill(strip);
    const all = new THREE.Group();
    for (let k = -1; k <= 2; k++) {
      const c = k === 0 ? strip : strip.clone();
      c.position.x = k * PERIOD - PERIOD / 2;
      all.add(c);
    }
    all.traverse((o) => {
      if (o.name === 'spin') spinners.push(o);
    });
    return all;
  };

  const baseplate = row((g) => {
    g.add(box(2.3, 2.3, 2.3, mat('#E5484D'), 1.5, 1.15, -9));
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3.4, 20), mat('#F5C518'));
    cyl.position.set(4.6, 1.7, -12);
    cyl.castShadow = true;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), mat('#3FB950'));
    ball.position.set(10.2, 1.25, -13);
    ball.castShadow = true;
    const ramp = box(3.2, 0.3, 2, mat('#3B82F6'), 7.6, 0.72, -8.4);
    ramp.rotation.z = 0.42;
    g.add(cyl, ball, ramp, box(0.3, 1.3, 2, mat('#3B82F6'), 8.9, 0.65, -8.4));
    g.add(box(1.6, 0.5, 0.8, mat('#F4F4F6'), 5.6, 0.25, -6.2), box(1.6, 0.5, 0.8, mat('#F97316'), 5.9, 0.75, -6.2), box(0.8, 0.5, 0.8, mat('#F4F4F6'), 5.5, 1.25, -6.2));
    g.add(box(1, 1, 1, mat('#A855F7'), 11.3, 0.5, -6.8));
  });

  const park = row((g) => {
    const trunk = mat('#7A5230', 0.9);
    const leaf = [mat('#2F8F3A', 0.9), mat('#3FA548', 0.9), mat('#57B85A', 0.9)];
    const tree = (x: number, z: number, k: number): void => {
      g.add(box(0.5 * k, 1.9 * k, 0.5 * k, trunk, x, 0.95 * k, z));
      g.add(box(2.3 * k, 1.1 * k, 2.3 * k, leaf[0], x, 2.3 * k, z, 0.12), box(1.7 * k, 0.9 * k, 1.7 * k, leaf[1], x, 3.25 * k, z, 0.12), box(1.0 * k, 0.7 * k, 1.0 * k, leaf[2], x, 4.0 * k, z, 0.1));
    };
    tree(1.4, -5.5, 1);
    tree(6.6, -8, 1.35);
    tree(10.4, -4.8, 0.85);
    // A path, a bench, a fence, flowers.
    const path = box(PERIOD, 0.03, 1.5, mat('#DCC591', 0.95), PERIOD / 2, 0.015, -2.6);
    path.castShadow = false;
    g.add(path);
    const wood = mat('#B0773F', 0.85);
    g.add(box(1.6, 0.1, 0.5, wood, 4.2, 0.5, -3.9), box(1.6, 0.5, 0.1, wood, 4.2, 0.85, -4.15), box(0.1, 0.5, 0.5, mat('#4A4F58'), 3.5, 0.25, -3.9), box(0.1, 0.5, 0.5, mat('#4A4F58'), 4.9, 0.25, -3.9));
    const white = mat('#F2EEE6', 0.9);
    for (let i = 0; i < 8; i++) g.add(box(0.16, 0.9, 0.16, white, i * 1.5 + 0.4, 0.45, -11));
    g.add(box(PERIOD, 0.12, 0.08, white, PERIOD / 2, 0.7, -11), box(PERIOD, 0.12, 0.08, white, PERIOD / 2, 0.35, -11));
    const petals = ['#F472B6', '#FDE047', '#F4F4F6', '#FB7185', '#A78BFA'];
    for (let i = 0; i < 14; i++) {
      const x = hash(i + 70) * PERIOD;
      const z = -3.6 - hash(i + 90) * 5.5;
      g.add(box(0.05, 0.22, 0.05, leaf[0], x, 0.11, z), box(0.16, 0.16, 0.16, mat(petals[i % petals.length], 0.8), x, 0.28, z));
    }
    g.add(box(11, 5, 7, mat('#4E9A44', 0.95), 3, 1.2, -30, 0.6), box(9, 7, 7, mat('#448A3C', 0.95), 10, 1.5, -36, 0.6));
  });

  const city = row((g) => {
    const walls = ['#C96F4A', '#8D99AE', '#D9C7A3', '#6C7A89'];
    const styles = [windowTextures(3), windowTextures(41)];
    let x = 0;
    [[3.4, 8], [2.6, 12], [3.2, 6.5], [2.8, 9.5]].forEach(([w, h], i) => {
      const st = styles[i % 2];
      const map = st.map.clone();
      const lit = st.lit.clone();
      for (const tx of [map, lit]) {
        tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
        tx.repeat.set(Math.max(1, Math.round(w / 2.4)), Math.max(1, Math.round(h / 5)));
        tx.needsUpdate = true;
      }
      const m = new THREE.MeshStandardMaterial({ color: walls[i], roughness: 0.85, map, emissive: '#FFD98A', emissiveMap: lit, emissiveIntensity: 0 });
      windowMats.push(m);
      const b = box(w, h, 3, m, x + w / 2, h / 2, -7.5);
      g.add(b, box(w + 0.2, 0.25, 3.2, mat('#3A3D45', 0.9), x + w / 2, h + 0.12, -7.5));
      x += w;
    });
    // Street lamp, a bin, a hydrant, and the road in front with its dashes.
    const pole = mat('#2E3138', 0.5, 0.4);
    const lamp = new THREE.MeshBasicMaterial({ color: '#8A8D96' });
    lampMats.push(lamp);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), lamp);
    bulb.position.set(3.4, 3.72, -3);
    g.add(box(0.14, 3.9, 0.14, pole, 3, 1.95, -3), box(0.8, 0.1, 0.14, pole, 3.35, 3.85, -3), bulb);
    g.add(box(0.5, 0.75, 0.5, mat('#2F7D4F', 0.7), 8.2, 0.375, -3.4, 0.04), box(0.26, 0.5, 0.26, mat('#E5484D', 0.6), 10.6, 0.25, -2.9, 0.05), box(0.4, 0.1, 0.16, mat('#E5484D', 0.6), 10.6, 0.36, -2.9));
    const road = box(PERIOD, 0.02, 9, mat('#3B3E46', 0.95), PERIOD / 2, 0.012, 6.3);
    const kerb = box(PERIOD, 0.12, 0.3, mat('#D5D6DB', 0.9), PERIOD / 2, 0.06, 1.75);
    road.castShadow = kerb.castShadow = false;
    g.add(road, kerb);
    for (let i = 0; i < 4; i++) {
      const dash = box(1.5, 0.024, 0.16, mat('#F2D34A', 0.9), i * 3 + 0.9, 0.014, 4.4);
      dash.castShadow = false;
      g.add(dash);
    }
  });

  const obby = row((g) => {
    const rainbow = ['#E5484D', '#F97316', '#F5C518', '#3FB950', '#3B82F6', '#A855F7'];
    rainbow.forEach((c, i) => g.add(box(1.96, 0.5, 3.4, mat(c, 0.6), i * 2 + 1, -0.25, 0, 0.03)));
    const float = (w: number, d: number, color: string, x: number, y: number, z: number): void => {
      g.add(box(w, 0.4, d, mat(color, 0.6), x, y, z, 0.03));
    };
    float(2.2, 2.2, '#22D3EE', 1.6, 1.6, -6);
    float(2, 2, '#F472B6', 5.2, 3.4, -9);
    float(1.8, 1.8, '#A3E635', 8.6, 0.9, -5.4);
    float(2.6, 2.6, '#F4F4F6', 10.6, 4.8, -12);
    // Pillars down into the lava, a spinning red bar, a flag on its own pad, steps.
    g.add(box(0.6, 12, 0.6, mat('#3A3F4B', 0.8), 1.6, -4.6, -6), box(0.6, 14, 0.6, mat('#3A3F4B', 0.8), 5.2, -3.8, -9), box(0.6, 12, 0.6, mat('#3A3F4B', 0.8), 8.6, -5.3, -5.4));
    const bar = new THREE.Group();
    bar.name = 'spin';
    bar.position.set(8.6, 1.4, -5.4);
    bar.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: '#FF3B4E' })), box(0.24, 0.6, 0.24, mat('#3A3F4B', 0.8), 0, -0.2, 0));
    g.add(bar);
    g.add(box(0.08, 1.5, 0.08, mat('#E7E7EC', 0.5), 1.6, 2.55, -6));
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.03), new THREE.MeshBasicMaterial({ color: '#39E57A' }));
    flag.position.set(1.98, 3.06, -6);
    g.add(flag);
    for (let i = 0; i < 5; i++) g.add(box(0.9, 0.3, 1.6, mat(rainbow[(i + 2) % 6], 0.6), 9.2 + i * 0.6, 5.2 + i * 0.42, -12 - i * 0.2));
  });

  const lavaTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#FF7A1A';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 46; i++) {
      g.fillStyle = hash(i) > 0.5 ? 'rgba(255,214,90,0.9)' : 'rgba(214,52,20,0.85)';
      g.fillRect(Math.floor(hash(i + 11) * 8) * 16, Math.floor(hash(i + 23) * 8) * 16, 16, 16);
    }
  });
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  lavaTex.repeat.set(40, 40);
  lavaTex.magFilter = THREE.NearestFilter;
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ map: lavaTex, fog: true }));
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = -9;

  const sets = { baseplate, park, obby, city };
  scene.add(baseplate, park, obby, city, lava);

  // Things on the ground next to an avatar.
  const crate = box(0.8, 0.8, 0.8, mat('#B98548', 0.85), 0, 0.4, 0, 0.03);
  const plank = mat('#8F6233', 0.85);
  for (const z of [0.405, -0.405]) crate.add(box(0.84, 0.1, 0.02, plank, 0, 0.3, z), box(0.84, 0.1, 0.02, plank, 0, -0.3, z), box(0.1, 0.7, 0.02, plank, -0.33, 0, z), box(0.1, 0.7, 0.02, plank, 0.33, 0, z));
  const trophy = new THREE.Group();
  const gold = mat('#F6C343', 0.25, 0.7);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.46, 20), gold);
  cup.position.y = 1.0;
  cup.castShadow = true;
  trophy.add(box(0.7, 0.34, 0.7, mat('#3A3F4B', 0.6), 0, 0.17, 0, 0.03), box(0.36, 0.12, 0.36, gold, 0, 0.4, 0), box(0.1, 0.3, 0.1, gold, 0, 0.6, 0), cup, box(0.1, 0.24, 0.06, gold, -0.36, 1.02, 0), box(0.1, 0.24, 0.06, gold, 0.36, 1.02, 0));
  scene.add(crate, trophy);

  // The avatars.
  const avatars: [Avatar, Avatar] = [buildAvatar(kit, looks[0]), buildAvatar(kit, looks[1])];
  for (const a of avatars) scene.add(a.stand, a.coin, a.robot);

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(fast ? 1024 : 2048, fast ? 1024 : 2048);
  sun.shadow.radius = 3;
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -6;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  scene.add(sun, sun.target, hemi);

  return { renderer, scene, camera, key, avatars, sky, fog, sun, hemi, ground, groundMat, studs, sets, spinners, lava, clouds, cloudMat, stars, windowMats, lampMats, crate, trophy };
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function mirrored(p: Pose): Pose {
  return { ...p, x: -p.x, yaw: -p.yaw, roll: -p.roll, twist: -p.twist, tilt: -p.tilt, hy: -p.hy, hr: -p.hr, la: p.ra, ra: p.la, lo: p.ro, ro: p.lo, ll: p.rl, rl: p.ll, lso: p.rso, rso: p.lso };
}

function place(av: Avatar, a: BloxActor, t: number, hi: string): void {
  const cur = act(a.move, a.local, a.talk, a.pointUp);
  let p = full(cur.p);
  let eyes = cur.eyes;
  let mouth = cur.mouth;
  let seat = !!cur.seat;
  let desk = !!cur.desk;
  let phone = !!cur.phone;
  if (a.from && a.from !== a.move && a.blend < 1) {
    const old = act(a.from, a.fromLocal, 0, a.pointUp);
    const o = full(old.p);
    const k = snap(a.blend);
    // A full turn (spin) is left where it is rather than unwound.
    if (a.from === 'spin') o.yaw = 0;
    const out = { ...p };
    for (const key of KEYS) out[key] = o[key] + (p[key] - o[key]) * k;
    p = out;
    if (a.blend < 0.4) {
      eyes = old.eyes;
      mouth = old.mouth;
      seat = !!old.seat;
      desk = !!old.desk;
      phone = !!old.phone;
    }
  }
  // Walking, running and spinning go the same way for both; everything else is mirrored for the right-hand avatar.
  const absolute = a.move === 'walk' || a.move === 'run' || a.move === 'spin';
  if (a.sign) {
    p.lo = 174 + 2 * s(t * 3);
    p.ro = 174 - 2 * s(t * 3);
    p.la = p.ra = 0;
  }
  if (a.mirror && !absolute) p = mirrored(p);

  av.stand.visible = true;
  av.stand.position.set(a.x + p.x, 0, p.z);
  av.stand.rotation.y = (a.face * (absolute ? 0 : 1) + p.yaw) * D;
  av.root.rotation.order = 'YXZ';
  av.root.position.y = p.y;
  av.root.rotation.set(p.pitch * D, 0, p.roll * D);
  av.torso.rotation.set(p.lean * D, p.twist * D, p.tilt * D);
  av.head.rotation.set(p.hp * D, p.hy * D, p.hr * D);
  av.lArm.rotation.set(-p.la * D, 0, p.lo * D);
  av.rArm.rotation.set(-p.ra * D, 0, -p.ro * D);
  av.lLeg.rotation.set(-p.ll * D, 0, p.lso * D);
  av.rLeg.rotation.set(-p.rl * D, 0, -p.rso * D);
  if (av.cape) av.cape.rotation.x = (9 + 5 * s(t * 2.3) + (a.move === 'run' ? 38 : a.move === 'walk' ? 18 : 0) + Math.max(0, p.lean) * 0.6) * D;

  // Face: blinks, and the mouth follows the voice.
  const slot = Math.floor((t + a.x * 3.1) / 3.4);
  const blinkAt = slot * 3.4 + 0.5 + hash(slot + Math.round(a.x * 10)) * 2.4;
  if (eyes === 'open' && Math.abs(t + a.x * 3.1 - blinkAt) < 0.06) eyes = 'shut';
  if (a.talk > 0.12) mouth = a.talk > 0.55 ? 'wide' : 'open';
  const tex = faceTexture(eyes, mouth);
  if (av.face.map !== tex) {
    av.face.map = tex;
    av.face.needsUpdate = true;
  }

  av.seat.visible = seat;
  av.desk.visible = desk;
  av.phone.visible = phone;
  av.sign.visible = !!a.sign;
  if (a.sign) {
    const key = `${a.sign}|${hi}`;
    if (av.signKey !== key) {
      av.signMat.map?.dispose();
      av.signMat.map = signTexture(a.sign.toUpperCase().slice(0, 16), hi);
      av.signMat.needsUpdate = true;
      av.signKey = key;
    }
  }
  av.coin.visible = a.coin;
  if (a.coin) {
    av.coin.position.set(a.x + a.side * 0.6, 2.3 + 0.07 * s(t * 2.6), 0.32);
    av.coin.rotation.set(Math.PI / 2, t * 3.2, 0);
  }
  av.robot.visible = a.robot;
  if (a.robot) {
    av.robot.position.set(a.x + a.side * 0.8, (a.coin ? 1.0 : 1.5) + 0.06 * s(t * 2.1 + 1), 0.36);
    av.robot.rotation.set(0.08 * s(t * 1.7), -a.side * 0.5 + 0.15 * s(t * 0.9), 0);
  }
}

export function renderBlox(f: BloxFrame): BloxOut {
  const fast = perfNow().fast3d;
  const key = `${JSON.stringify(f.looks)}|${fast}`;
  if (stage && stage.key !== key) {
    stage.renderer.dispose();
    stage.renderer.forceContextLoss();
    stage = null;
  }
  const st = (stage ??= build(f.looks, key, fast));
  const S = SKIES[f.time] ?? SKIES.day;

  // Sky and light.
  (st.sky.uniforms.top.value as THREE.Color).set(S.top);
  (st.sky.uniforms.mid.value as THREE.Color).set(S.mid);
  (st.sky.uniforms.low.value as THREE.Color).set(S.low);
  st.fog.color.set(S.low);
  st.fog.far = f.set === 'obby' ? 190 : 120;
  st.renderer.setClearColor(st.fog.color, 1);
  st.sun.color.set(S.sun);
  st.sun.intensity = S.sunPower;
  st.sun.position.set(f.shot.x + S.sunAt[0], S.sunAt[1], S.sunAt[2]);
  st.sun.target.position.set(f.shot.x, 0, 0);
  st.hemi.color.set(S.hemiSky);
  st.hemi.groundColor.set(S.hemiGround);
  st.hemi.intensity = S.hemi;
  st.cloudMat.color.set(S.cloud);
  st.stars.visible = f.time === 'night';
  for (const c of st.clouds.children) c.position.x = ((((c.userData.x0 as number) + f.t * 0.5 + 70) % 140) + 140) % 140 - 70;
  for (const m of st.windowMats) m.emissiveIntensity = S.windows * 0.95;
  for (const m of st.lampMats) m.color.set(S.windows > 0 ? '#FFE7A8' : '#8A8D96');

  // The world, slid back by how far the avatars have walked.
  (Object.keys(st.sets) as BloxSet[]).forEach((k) => {
    st.sets[k].visible = k === f.set;
    st.sets[k].position.x = -(((f.travel % PERIOD) + PERIOD) % PERIOD);
  });
  st.ground.visible = f.set !== 'obby';
  st.groundMat.color.set(GROUND[f.set] ?? GROUND.baseplate);
  st.studs.offset.x = (f.travel / 0.8) % 1;
  st.lava.visible = f.set === 'obby';
  if (st.lava.visible) ((st.lava.material as THREE.MeshBasicMaterial).map as THREE.Texture).offset.set(f.t * 0.01 + f.travel / 10, f.t * 0.006);
  for (const o of st.spinners) o.rotation.y = f.t * 2.2;

  st.avatars.forEach((av, k) => {
    const a = f.actors[k];
    if (!a) {
      av.stand.visible = av.coin.visible = av.robot.visible = false;
      return;
    }
    place(av, a, f.t, f.hi);
  });
  st.crate.visible = f.floor?.kind === 'crate';
  st.trophy.visible = f.floor?.kind === 'trophy';
  if (f.floor) {
    const o = f.floor.kind === 'crate' ? st.crate : st.trophy;
    o.position.set(f.floor.x, f.floor.kind === 'crate' ? 0.4 : 0, f.floor.z);
    o.rotation.y = f.floor.kind === 'crate' ? 0.35 : f.t * 0.6;
  }

  // Camera.
  const sh = f.shot;
  const dist = sh.vis / 2 / Math.tan((st.camera.fov * D) / 2);
  st.camera.position.set(sh.x + Math.sin(sh.orbit) * dist, Math.max(0.12, sh.y + sh.rise), sh.z + Math.cos(sh.orbit) * dist);
  st.camera.lookAt(sh.x, sh.y, sh.z);
  st.camera.setViewOffset(RW, RH, 0, (0.5 - sh.fy) * RH, RW, RH);
  st.camera.updateProjectionMatrix();
  st.renderer.render(st.scene, st.camera);

  const proj = (o: THREE.Object3D, into: THREE.Vector3): THREE.Vector3 => {
    o.getWorldPosition(into);
    return into.project(st.camera);
  };
  const heads = f.actors.map((a, k) => {
    const av = st.avatars[k];
    const mid = proj(av.headMid, tmp);
    const x = (mid.x + 1) / 2;
    const y = (1 - mid.y) / 2;
    const top = proj(a.sign ? av.signTop : av.headTop, tmp2);
    const topY = (1 - top.y) / 2;
    // The head is about half a unit tall; how big that is in the frame depends on how far it is.
    av.headMid.getWorldPosition(tmp2);
    const d = tmp2.distanceTo(st.camera.position);
    const r = 0.27 / (2 * d * Math.tan((st.camera.fov * D) / 2));
    return { x, y, top: Math.min(topY, y - r), r };
  });
  return { canvas: st.renderer.domElement, heads };
}
