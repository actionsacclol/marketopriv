import { num, screenZoom, storyBeats, str, type StoryBeat } from '@shared/presets';
import { LABEL_AT } from '@shared/sfx';
import { STICK_GEAR, STICK_SHIRTS, hudAt, stickLast, stickPoses, stickProps, type StickPose, type StickProp } from '@shared/stickman';
import { BUSY, INTERIOR, drawSet, mixHex, nightSky, palOf, weatherFx, whipLines, type Pal } from './stickSets';
import { FONT, H, W, clamp01, easeBack, easeInOut, easeOut, fit, font, lerp, markLightFrame, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';
import { mouthAt } from '../char3d';
import { captions } from './narrated';
import { applyView, fxPost, fxView } from './fx';
import { PX, renderStick3d, type Stick3dLook } from '../stick3d';

// Stickman: a hand-drawn stick figure (or two, side by side for versus clips)
// acting a story out. Every frame is computed from t: each beat names a pose per
// figure, and the figure moves into it with a small anticipation and an
// overshoot (hips first, arms and head a moment later). On top: breathing,
// blinks, walk / run / typing cycles, talk gestures and a mouth that moves with
// the voice. The character moves on twos (15 poses a second, the way hand-made
// animation does) and its ink lines boil slightly, while the camera and the
// captions run at the full frame rate.

type P = { x: number; y: number };
type Face = 'neutral' | 'happy' | 'sad' | 'shock' | 'angry' | 'laugh' | 'focus' | 'sleep';

interface Pose {
  /** Torso lean (deg, + = forward) and head tilt on top of it. */
  spine: number;
  head: number;
  /** Arms and legs: [upper, lower] absolute angles in deg, 0 = straight down, + = forward. a1/l1 = the near side. */
  a1: [number, number];
  a2: [number, number];
  l1: [number, number];
  l2: [number, number];
  /** Off the ground (jumps), hip shift, whole-body tilt around the feet (falls) and a shift after it. */
  lift: number;
  hx: number;
  rot: number;
  shift: number;
  face: Face;
}

// Body proportions (local units; a standing figure is about 640 tall).
const THIGH = 128;
const SHIN = 126;
const SPINE = 186;
const NECK = 18;
const HEAD = 64;
const UPPER = 108;
const FORE = 100;
const FIG_H = 650;
const GROUND = 1440;

const pose = (p: Partial<Pose>): Pose => ({ spine: 0, head: 0, a1: [12, 4], a2: [-12, -4], l1: [8, 2], l2: [-8, -2], lift: 0, hx: 0, rot: 0, shift: 0, face: 'neutral', ...p });
const SEAT = { l1: [88, 4] as [number, number], l2: [80, -2] as [number, number] };

const POSES: Record<StickPose, Pose> = {
  idle: pose({}),
  talk: pose({ spine: 2, head: -3, a1: [35, 95] }),
  point: pose({ spine: 3, head: -6, a1: [100, 108], a2: [-18, -10] }),
  present: pose({ a1: [55, 115], a2: [-55, -115], face: 'happy' }),
  shrug: pose({ head: 12, a1: [45, 150], a2: [-45, -150] }),
  shock: pose({ spine: -10, head: -8, a1: [140, 165], a2: [-140, -165], l1: [22, 12], l2: [-22, -12], lift: 18, face: 'shock' }),
  cheer: pose({ spine: -4, head: -10, a1: [135, 160], a2: [-135, -160], l1: [10, 0], l2: [-14, -4], face: 'happy' }),
  think: pose({ spine: 2, head: -12, a1: [25, 172], a2: [-40, 40] }),
  wave: pose({ a1: [140, 175], face: 'happy' }),
  facepalm: pose({ spine: 10, head: 18, a1: [20, 178], a2: [-10, -2], face: 'sad' }),
  sad: pose({ spine: 14, head: 24, a1: [6, 2], a2: [-6, -2], l1: [5, 0], l2: [-5, 0], face: 'sad' }),
  laugh: pose({ spine: -12, head: -14, a1: [-10, 75], a2: [-35, 60], face: 'laugh' }),
  thumbsup: pose({ a1: [70, 165], face: 'happy' }),
  angry: pose({ spine: 6, head: 6, a1: [40, -40], a2: [-40, 40], l1: [16, 6], l2: [-16, -6], face: 'angry' }),
  walk: pose({}),
  run: pose({ spine: 14, head: -4 }),
  sit: pose({ ...SEAT, a1: [25, 70], a2: [18, 60] }),
  type: pose({ ...SEAT, spine: 8, head: 8, a1: [48, 104], a2: [42, 100], face: 'focus' }),
  phone: pose({ spine: 4, head: 22, a1: [25, 150], face: 'focus' }),
  sleep: pose({ ...SEAT, spine: -14, head: -26, a1: [8, 0], a2: [-4, 0], face: 'sleep' }),
  fall: pose({ a1: [150, 170], a2: [-150, -170], l1: [20, 10], l2: [-10, 0], rot: -86, shift: 300, face: 'shock' }),
};
const SEATED: StickPose[] = ['sit', 'type', 'sleep'];

const rad = (d: number): number => (d * Math.PI) / 180;
const down = (deg: number): P => ({ x: Math.sin(rad(deg)), y: Math.cos(rad(deg)) });
const add = (a: P, d: P, k: number): P => ({ x: a.x + d.x * k, y: a.y + d.y * k });

/** Small anticipation (a dip the other way) then an overshoot that settles. */
function antic(x: number): number {
  if (x <= 0) return 0;
  if (x < 0.18) return -0.07 * Math.sin((Math.PI * x) / 0.18);
  return easeBack((x - 0.18) / 0.82);
}

/** Signed noise in -1..1. */
function nz(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** The pose with its own motion at time t (breathing, cycles, gestures). */
function moving(name: StickPose, t: number, talking: boolean): Pose {
  const p = { ...POSES[name], a1: [...POSES[name].a1], a2: [...POSES[name].a2], l1: [...POSES[name].l1], l2: [...POSES[name].l2] } as Pose;
  const breath = Math.sin(t * 2.4);
  p.spine += 1.2 * breath;
  p.a1[0] += 1.5 * Math.sin(t * 2.4 + 1);
  p.a2[0] -= 1.5 * Math.sin(t * 2.4 + 1);
  if (!SEATED.includes(name) && name !== 'fall') p.hx += 3 * Math.sin(t * 0.9);
  switch (name) {
    case 'walk':
    case 'run': {
      const run = name === 'run';
      const ph = t * (run ? 11 : 6.5);
      const A = run ? 42 : 24;
      const bend = run ? 75 : 36;
      for (const [leg, off] of [[p.l1, 0], [p.l2, Math.PI]] as const) {
        const th = A * Math.sin(ph + off);
        leg[0] = th;
        leg[1] = th - bend * Math.max(0, Math.cos(ph + off));
      }
      const sw = run ? 38 : 20;
      p.a1 = [-sw * Math.sin(ph), -sw * Math.sin(ph) + (run ? 80 : 20)];
      p.a2 = [sw * Math.sin(ph), sw * Math.sin(ph) + (run ? 80 : 20)];
      if (run) p.lift += 10 * Math.abs(Math.sin(ph));
      break;
    }
    case 'type':
      p.a1[1] += 7 * Math.sin(t * 19);
      p.a2[1] += 7 * Math.sin(t * 19 + 2);
      p.head += 1.5 * Math.sin(t * 1.7);
      break;
    case 'wave':
      p.a1[1] += 24 * Math.sin(t * 9);
      break;
    case 'cheer':
      p.lift += 34 * Math.abs(Math.sin(t * 5));
      p.a1[1] += 8 * Math.sin(t * 10);
      p.a2[1] -= 8 * Math.sin(t * 10);
      break;
    case 'laugh':
      p.spine += 4 * Math.sin(t * 16);
      p.lift += 4 * Math.abs(Math.sin(t * 16));
      break;
    case 'angry':
      p.hx += 3 * Math.sin(t * 40);
      break;
    case 'shock':
      p.hx += 1.5 * Math.sin(t * 50);
      break;
    case 'sleep':
      p.spine += 2 * Math.sin(t * 1.2);
      break;
    case 'sad':
    case 'phone':
      p.head += 2 * Math.sin(t * 1.3);
      break;
    case 'think':
      p.head += 2 * Math.sin(t * 0.8);
      break;
    default:
      break;
  }
  // Talking hands and nods while its line is read.
  if (talking && ['idle', 'talk', 'present', 'point', 'shrug', 'think', 'sad', 'angry'].includes(name)) {
    if (name === 'talk' || name === 'present') p.a1[1] += 14 * Math.sin(t * 5.3);
    if (name === 'present') p.a2[1] -= 10 * Math.sin(t * 4.1);
    p.head += 3 * Math.sin(t * 3.1);
  }
  return p;
}

function mix(a: Pose, b: Pose, wc: number, wa: number, wh: number): Pose {
  const l2 = (x: [number, number], y: [number, number], w: number): [number, number] => [lerp(x[0], y[0], w), lerp(x[1], y[1], w)];
  return {
    spine: lerp(a.spine, b.spine, wc),
    head: lerp(a.head, b.head, wh),
    a1: l2(a.a1, b.a1, wa),
    a2: l2(a.a2, b.a2, wa),
    l1: l2(a.l1, b.l1, wc),
    l2: l2(a.l2, b.l2, wc),
    lift: lerp(a.lift, b.lift, wc),
    hx: lerp(a.hx, b.hx, wc),
    rot: lerp(a.rot, b.rot, wc),
    shift: lerp(a.shift, b.shift, wc),
    face: wh > 0.4 ? b.face : a.face,
  };
}

// ── Scene ──────────────────────────────────────────────────────────────────
interface Look {
  bg: string;
  ink: string;
  hi: string;
  light: boolean;
  lw: number;
  /** Words drawn straight on the background (title captions, names): the ink, except on dusk's dark sky. */
  text: string;
  dusk?: boolean;
}
const HIGHLIGHT: Record<string, string> = { orange: '#FF6B1A', yellow: '#FFC400', red: '#FF3B30', green: '#22C55E', cyan: '#06B6D4' };

function lookOf(env: Env): Look {
  const bg = str(env.fields, 'bg') || 'paper';
  const h = str(env.fields, 'highlight') || 'orange';
  const hi = h === 'accent' ? env.accent[1] : (HIGHLIGHT[h] ?? HIGHLIGHT.orange);
  const lw = Math.min(28, Math.max(8, num(env.fields, 'line', 16)));
  if (bg === 'dark') return { bg: '#0B0B0E', ink: '#F4F4F2', hi, light: false, lw, text: '#F4F4F2' };
  if (bg === 'chalk') return { bg: '#21392E', ink: '#F0F0E8', hi, light: false, lw, text: '#F0F0E8' };
  if (bg === 'white') return { bg: '#FFFFFF', ink: '#111111', hi, light: true, lw, text: '#111111' };
  // Dusk: dark figures against a sunset, the "what if" cartoon look.
  if (bg === 'dusk') return { bg: '#E9825F', ink: '#1A1020', hi, light: false, lw, text: '#FFF4E8', dusk: true };
  return { bg: '#F3EFE6', ink: '#161514', hi, light: true, lw, text: '#161514' };
}

interface Slot {
  x: number;
  s: number;
}

const FRONT: StickProp['kind'][] = ['desk', 'laptop', 'monitor', 'chart', 'robot', 'fire', 'coffee'];

/** The props of a beat, with the ones its poses bring (a desk for typing, a phone for the phone pose...). */
function propsOf(b: StoryBeat, n: number): StickProp[] {
  const list = stickProps(b.b);
  const poses = stickPoses(b.visual);
  for (const k of ([0, 1, 2] as const).slice(0, n)) {
    const mine = list.filter((p) => p.who === k);
    const has = (kind: string): boolean => mine.some((p) => p.kind === kind);
    if (poses[k] === 'type' && !has('desk') && !has('laptop') && !has('monitor')) list.push({ kind: 'laptop', who: k, value: '' });
    if (poses[k] === 'phone' && !has('phone')) list.push({ kind: 'phone', who: k, value: '' });
    if (poses[k] === 'sleep' && !has('zzz')) list.push({ kind: 'zzz', who: k, value: '' });
    // A laptop or monitor stands on a desk.
    const now = list.filter((p) => p.who === k);
    if (now.some((p) => p.kind === 'laptop' || p.kind === 'monitor') && !now.some((p) => p.kind === 'desk')) list.push({ kind: 'desk', who: k, value: '' });
  }
  return list.filter((p) => p.who < n);
}

function slotsOf(props: StickProp[], n: number): Slot[] {
  const big = props.some((p) => p.kind === 'screen');
  const duo = n > 1;
  if (n > 2) return big ? [{ x: 130, s: 0.46 }, { x: 540, s: 0.46 }, { x: 950, s: 0.46 }] : [{ x: 190, s: 0.76 }, { x: 540, s: 0.78 }, { x: 890, s: 0.76 }];
  if (duo) return big ? [{ x: 170, s: 0.55 }, { x: 900, s: 0.55 }] : [{ x: 250, s: 0.86 }, { x: 740, s: 0.86 }];
  if (big) return [{ x: 190, s: 0.6 }];
  const front = props.some((p) => FRONT.includes(p.kind));
  return [{ x: front ? 320 : 540, s: 1.08 }];
}

interface Joints {
  hip: P;
  neck: P;
  head: P;
  shoulder: P;
  e1: P;
  h1: P;
  e2: P;
  h2: P;
  k1: P;
  f1: P;
  k2: P;
  f2: P;
  /** Head angle (deg) for the face, and the head radius on screen. */
  ang: number;
  r: number;
  s: number;
}

function jointsOf(p: Pose, slot: Slot): Joints {
  const d1 = THIGH * Math.cos(rad(p.l1[0])) + SHIN * Math.cos(rad(p.l1[1]));
  const d2 = THIGH * Math.cos(rad(p.l2[0])) + SHIN * Math.cos(rad(p.l2[1]));
  const hip: P = { x: p.hx, y: -Math.max(d1, d2) - p.lift };
  const up: P = { x: Math.sin(rad(p.spine)), y: -Math.cos(rad(p.spine)) };
  const neck = add(hip, up, SPINE);
  const shoulder = add(hip, up, SPINE - 12);
  const hd: P = { x: Math.sin(rad(p.spine + p.head)), y: -Math.cos(rad(p.spine + p.head)) };
  const head = add(neck, hd, NECK + HEAD);
  const e1 = add(shoulder, down(p.a1[0]), UPPER);
  const h1 = add(e1, down(p.a1[1]), FORE);
  const e2 = add(shoulder, down(p.a2[0]), UPPER);
  const h2 = add(e2, down(p.a2[1]), FORE);
  const k1 = add(hip, down(p.l1[0]), THIGH);
  const f1 = add(k1, down(p.l1[1]), SHIN);
  const k2 = add(hip, down(p.l2[0]), THIGH);
  const f2 = add(k2, down(p.l2[1]), SHIN);
  const pts = { hip, neck, head, shoulder, e1, h1, e2, h2, k1, f1, k2, f2 };
  const pivot: P = { x: (f1.x + f2.x) / 2, y: Math.max(f1.y, f2.y) };
  const c = Math.cos(rad(p.rot));
  const sn = Math.sin(rad(p.rot));
  const out = {} as Record<keyof typeof pts, P>;
  for (const [k, v] of Object.entries(pts) as Array<[keyof typeof pts, P]>) {
    let x = v.x;
    let y = v.y;
    if (p.rot) {
      const dx = x - pivot.x;
      const dy = y - pivot.y;
      x = pivot.x + dx * c - dy * sn;
      y = pivot.y + dx * sn + dy * c;
    }
    out[k] = { x: slot.x + (x + p.shift) * slot.s, y: GROUND + y * slot.s };
  }
  return { ...out, ang: p.spine + p.head + p.rot, r: HEAD * slot.s, s: slot.s };
}

// ── Ink ────────────────────────────────────────────────────────────────────
let boil = 0;

/** A line through the points with a slightly wobbling middle (the hand-drawn boil). */
function inkPath(ctx: Ctx, pts: P[], seed: number, amp: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const j = nz(seed + i * 7.1, boil) * amp;
    ctx.quadraticCurveTo((a.x + b.x) / 2 - ((b.y - a.y) / len) * j, (a.y + b.y) / 2 + ((b.x - a.x) / len) * j, b.x, b.y);
  }
  ctx.stroke();
}

function inkStyle(ctx: Ctx, color: string, w: number): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** A wobbly rectangle outline. */
function inkRect(ctx: Ctx, x: number, y: number, w: number, h: number, seed: number, amp: number): void {
  inkPath(ctx, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y: y - 0.5 }], seed, amp);
}

// ── Figure ─────────────────────────────────────────────────────────────────
interface FigDraw {
  j: Joints;
  pose: StickPose;
  face: Face;
  mouth: number;
  blink: boolean;
  color: string;
  gear: string[];
  seed: number;
  /** The cartoon figure's T-shirt colour (cartoon look), or none for plain ink lines. */
  shirt?: string;
  /** Tears running (the tear prop, or a sad cartoon face). */
  tear?: boolean;
  /** Where the eyes glance (head units, changes every half second or so) and a quick brow raise. */
  dart?: P;
  browUp?: number;
}

/** The cartoon figure's head: bigger, sitting on the neck (moves the joints the props read too). */
function cartoonHead(j: Joints): Joints {
  const dx = j.head.x - j.neck.x;
  const dy = j.head.y - j.neck.y;
  const len = Math.hypot(dx, dy) || 1;
  const r = HEAD * 1.32 * j.s;
  return { ...j, r, head: { x: j.neck.x + (dx / len) * r * 0.95, y: j.neck.y + (dy / len) * r * 0.95 } };
}

const CLOTH_LINE = '#141414';

/** The cartoon figure: trousers and shoes, a T-shirt with sleeves, thin arms with round white hands, a big white head. */
function drawCartoon(ctx: Ctx, L: Look, f: FigDraw): void {
  const { j } = f;
  const s = j.s;
  const w = L.lw * Math.max(0.55, s);
  const amp = 2 * s;
  const ow = Math.max(3, w * 0.38);
  const shirt = f.shirt ?? '#2F6FD6';
  const pants = '#3A3F47';
  const thick = (pts: P[], width: number, color: string, seed: number): void => {
    inkStyle(ctx, CLOTH_LINE, width + ow * 2);
    inkPath(ctx, pts, seed, amp);
    inkStyle(ctx, color, width);
    inkPath(ctx, pts, seed, amp);
  };
  const hand = (h: P, e: P): void => {
    const d = Math.hypot(h.x - e.x, h.y - e.y) || 1;
    const c = { x: h.x + ((h.x - e.x) / d) * 6 * s, y: h.y + ((h.y - e.y) / d) * 6 * s };
    ctx.beginPath();
    ctx.arc(c.x, c.y, 17 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = ow;
    ctx.strokeStyle = CLOTH_LINE;
    ctx.stroke();
  };
  const arm = (sh: P, e: P, h: P, seed: number): void => {
    inkStyle(ctx, L.light || L.dusk ? CLOTH_LINE : f.color, w * 0.8);
    inkPath(ctx, [sh, e, h], seed, amp);
    hand(h, e);
    const mid = { x: lerp(sh.x, e.x, 0.55), y: lerp(sh.y, e.y, 0.55) };
    thick([sh, mid], 48 * s, shirt, seed + 30);
  };
  const leg = (k: P, ft: P, seed: number): void => {
    thick([j.hip, k, ft], 32 * s, pants, seed);
    ctx.beginPath();
    ctx.ellipse(ft.x + 16 * s, ft.y + 2 * s, 30 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1E1E24';
    ctx.fill();
    ctx.lineWidth = Math.max(2, ow * 0.6);
    ctx.strokeStyle = L.light || L.dusk ? CLOTH_LINE : '#55555F';
    ctx.stroke();
  };
  // Far arm, legs, the shirt over the hips, then the near arm and the head.
  arm(j.shoulder, j.e2, j.h2, f.seed + 1);
  leg(j.k2, j.f2, f.seed + 2);
  leg(j.k1, j.f1, f.seed + 4);
  const ux = (j.neck.x - j.hip.x) / (SPINE * s);
  const uy = (j.neck.y - j.hip.y) / (SPINE * s);
  const top = { x: j.shoulder.x - ux * 22 * s, y: j.shoulder.y - uy * 22 * s };
  const bottom = { x: j.hip.x + ux * 26 * s, y: j.hip.y + uy * 26 * s };
  thick([bottom, top], 106 * s, shirt, f.seed + 3);
  if (f.gear.includes('tie')) {
    const tip = { x: lerp(top.x, bottom.x, 0.75), y: lerp(top.y, bottom.y, 0.75) };
    ctx.fillStyle = L.hi === shirt ? '#C0392B' : L.hi;
    ctx.beginPath();
    ctx.moveTo(top.x - 9 * s, top.y - 20 * s);
    ctx.lineTo(top.x + 9 * s, top.y - 20 * s);
    ctx.lineTo(tip.x + 13 * s, tip.y);
    ctx.lineTo(tip.x, tip.y + 16 * s);
    ctx.lineTo(tip.x - 13 * s, tip.y);
    ctx.closePath();
    ctx.fill();
  }
  arm(j.shoulder, j.e1, j.h1, f.seed + 5);
  if (f.pose === 'thumbsup') {
    inkStyle(ctx, CLOTH_LINE, ow);
    inkPath(ctx, [{ x: j.h1.x, y: j.h1.y - 10 * s }, { x: j.h1.x - 2 * s, y: j.h1.y - 38 * s }], f.seed + 6, 0);
  }
  drawHead(ctx, L, f, w);
}

function drawFigure(ctx: Ctx, L: Look, f: FigDraw): void {
  if (f.shirt) {
    drawCartoon(ctx, L, f);
    return;
  }
  const { j } = f;
  const w = L.lw * Math.max(0.55, j.s);
  const amp = 2.2 * j.s;
  inkStyle(ctx, f.color, w);
  // Far limbs, then the body, then the near limbs.
  inkPath(ctx, [j.shoulder, j.e2, j.h2], f.seed + 1, amp);
  inkPath(ctx, [j.hip, j.k2, j.f2], f.seed + 2, amp);
  inkPath(ctx, [j.hip, j.neck], f.seed + 3, amp);
  if (f.gear.includes('tie')) {
    const d = { x: (j.hip.x - j.neck.x) / SPINE / j.s, y: (j.hip.y - j.neck.y) / SPINE / j.s };
    const top = add(j.neck, d, 14 * j.s);
    const tip = add(j.neck, d, 92 * j.s);
    ctx.save();
    ctx.fillStyle = L.hi;
    ctx.beginPath();
    ctx.moveTo(top.x - 9 * j.s, top.y);
    ctx.lineTo(top.x + 9 * j.s, top.y);
    ctx.lineTo(tip.x + 13 * j.s, tip.y);
    ctx.lineTo(tip.x, tip.y + 16 * j.s);
    ctx.lineTo(tip.x - 13 * j.s, tip.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  inkPath(ctx, [j.hip, j.k1, j.f1], f.seed + 4, amp);
  inkPath(ctx, [j.shoulder, j.e1, j.h1], f.seed + 5, amp);
  if (f.pose === 'thumbsup') inkPath(ctx, [j.h1, { x: j.h1.x - 4 * j.s, y: j.h1.y - 30 * j.s }], f.seed + 6, 0);
  drawHead(ctx, L, f, w);
}

function drawHead(ctx: Ctx, L: Look, f: FigDraw, w: number): void {
  const { j } = f;
  const r = j.r * (1 + nz(f.seed + 9, boil) * 0.015);
  ctx.save();
  ctx.translate(j.head.x, j.head.y);
  ctx.rotate(rad(j.ang));
  const toon = !!f.shirt;
  // The cartoon head is white with dark features on every look; its outline lights up for the winner.
  const feat = toon ? CLOTH_LINE : f.color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = toon ? '#FFFFFF' : L.bg;
  ctx.fill();
  inkStyle(ctx, toon ? (f.color === L.hi ? L.hi : CLOTH_LINE) : f.color, toon ? Math.max(4, w * 0.62) : w);
  ctx.stroke();
  const u = r / HEAD;
  if (f.gear.includes('bun')) {
    // Hair over the top of the head and a bun at the back.
    ctx.fillStyle = toon ? '#5A3A26' : f.color;
    ctx.beginPath();
    ctx.arc(-r * 0.62, -r * 0.78, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.02, Math.PI * 0.95, Math.PI * 1.85);
    ctx.quadraticCurveTo(r * 0.1, -r * 0.45, -r * 0.6, -r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  // Gear behind the face.
  if (f.gear.includes('hair')) {
    for (let i = 0; i < 4; i++) {
      const a = rad(-150 + i * 30);
      inkPath(ctx, [{ x: Math.cos(a) * r * 0.9, y: Math.sin(a) * r * 0.9 }, { x: Math.cos(a - 0.15) * r * 1.38, y: Math.sin(a - 0.15) * r * 1.38 }], f.seed + 20 + i, 1);
    }
  }
  // The face sits toward the way the figure looks (three-quarter view).
  const ex1 = 8 * u;
  const ex2 = 32 * u;
  const ey = -8 * u;
  ctx.fillStyle = feat;
  ctx.strokeStyle = feat;
  ctx.lineWidth = Math.max(3, w * (toon ? 0.34 : 0.42));
  const closed = f.blink || f.face === 'sleep' || f.face === 'laugh';
  if (closed) {
    for (const x of [ex1, ex2]) {
      ctx.beginPath();
      if (f.face === 'laugh') ctx.arc(x, ey + 4 * u, 7 * u, Math.PI * 1.1, Math.PI * 1.9);
      else {
        ctx.moveTo(x - 7 * u, ey);
        ctx.lineTo(x + 7 * u, ey);
      }
      ctx.stroke();
    }
  } else if (toon) {
    // Eye whites with pupils looking the way the figure faces (tiny pupils when shocked).
    const shock = f.face === 'shock';
    const pr = (shock ? 3.6 : 5.6) * u;
    for (const x of [ex1 - 2 * u, ex2 + 1 * u]) {
      ctx.beginPath();
      ctx.ellipse(x, ey, (shock ? 12.5 : 11) * u, (shock ? 14.5 : 12.5) * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      const dx = shock ? 0 : (f.dart?.x ?? 0) * u;
      const dy = shock ? 0 : (f.dart?.y ?? 0) * u;
      ctx.arc(x + (shock ? 0 : 3.5 * u) + dx, ey + (f.face === 'sad' ? 3 * u : 1 * u) + dy, pr, 0, Math.PI * 2);
      ctx.fillStyle = feat;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + (shock ? 1 : 5) * u + dx, ey - 1.5 * u + dy, pr * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
    ctx.fillStyle = feat;
  } else {
    const er = (f.face === 'shock' ? 9.5 : 6.8) * u;
    for (const x of [ex1, ex2]) {
      ctx.beginPath();
      ctx.arc(x, ey, er, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Brows.
  // inner = the brow end toward the other eye (lower = angry, higher = sad).
  const brow = (inner: number, outer: number, lift: number): void => {
    for (const [x, near] of [[ex1, true], [ex2, false]] as const) {
      const left = near ? outer : inner;
      const right = near ? inner : outer;
      ctx.beginPath();
      ctx.moveTo(x - 9 * u, ey - (lift + left) * u);
      ctx.lineTo(x + 9 * u, ey - (lift + right) * u);
      ctx.stroke();
    }
  };
  if (toon) ctx.lineWidth = Math.max(3.5, w * 0.42);
  const lift = (toon ? 8 : 0) + (f.browUp ?? 0) * 6;
  if (f.face === 'angry') brow(-4, 6, 16 + lift);
  else if (f.face === 'sad') brow(6, -3, 16 + lift);
  else if (f.face === 'shock') brow(0, 0, 26 + lift);
  else if (f.face === 'focus') brow(0, 0, 14 + lift);
  else if (toon && !closed) brow(1, 0, 18 + lift);
  if (toon) ctx.lineWidth = Math.max(3, w * 0.34);
  // Mouth.
  const mx = 22 * u;
  const my = 26 * u;
  ctx.beginPath();
  if (f.mouth > 0.08) {
    ctx.ellipse(mx, my, 10 * u, (3 + 15 * f.mouth) * u, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.face === 'happy') {
    ctx.arc(mx, my - 8 * u, 13 * u, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  } else if (f.face === 'laugh') {
    ctx.moveTo(mx - 15 * u, my - 4 * u);
    ctx.lineTo(mx + 15 * u, my - 4 * u);
    ctx.arc(mx, my - 4 * u, 15 * u, 0, Math.PI);
    ctx.fill();
  } else if (f.face === 'sad') {
    ctx.arc(mx, my + 10 * u, 12 * u, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (f.face === 'shock') {
    ctx.ellipse(mx, my + 2 * u, 8 * u, 11 * u, 0, 0, Math.PI * 2);
    if (toon) ctx.fill();
    else ctx.stroke();
  } else if (toon && f.face === 'angry') {
    // Gritted teeth.
    rrect(ctx, mx - 16 * u, my - 7 * u, 32 * u, 15 * u, 4 * u);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - 16 * u, my + 0.5 * u);
    ctx.lineTo(mx + 16 * u, my + 0.5 * u);
    for (const x of [-8, 0, 8]) {
      ctx.moveTo(mx + x * u, my - 7 * u);
      ctx.lineTo(mx + x * u, my + 8 * u);
    }
    ctx.stroke();
  } else {
    ctx.moveTo(mx - 9 * u, my);
    ctx.lineTo(mx + 9 * u, my);
    ctx.stroke();
  }
  // Tears running down from the eyes.
  if (f.tear) {
    for (let i = 0; i < 2; i++) {
      const k = ((boil / 8) * 0.9 + i * 0.5) % 1;
      const x = (i ? ex2 + 6 : ex1 - 10) * u;
      const y = ey + (14 + k * 46) * u;
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.fillStyle = '#4FB3FF';
      ctx.beginPath();
      ctx.moveTo(x, y - 9 * u);
      ctx.quadraticCurveTo(x + 7 * u, y + 3 * u, x, y + 6 * u);
      ctx.quadraticCurveTo(x - 7 * u, y + 3 * u, x, y - 9 * u);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // Gear on top.
  if (f.gear.includes('glasses')) {
    ctx.lineWidth = Math.max(2.5, w * 0.3);
    for (const x of [ex1, ex2]) {
      ctx.beginPath();
      ctx.arc(x, ey, 13 * u, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(ex1 + 13 * u, ey);
    ctx.lineTo(ex2 - 13 * u, ey);
    ctx.moveTo(ex1 - 13 * u, ey);
    ctx.lineTo(-r * 0.75, ey - 4 * u);
    ctx.stroke();
  }
  if (f.gear.includes('cap')) {
    ctx.fillStyle = L.hi;
    ctx.beginPath();
    ctx.arc(0, -4 * u, r * 1.02, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(r * 0.2, -r * 0.42, r * 0.95, 10 * u);
    ctx.strokeStyle = f.color;
    ctx.lineWidth = Math.max(3, w * 0.4);
    ctx.stroke();
  }
  if (f.gear.includes('headphones')) {
    ctx.lineWidth = Math.max(3, w * 0.6);
    ctx.strokeStyle = f.color;
    ctx.beginPath();
    ctx.arc(-10 * u, 0, r * 1.1, Math.PI * 1.02, Math.PI * 1.75);
    ctx.stroke();
    // The ear cup sits behind the face (side view).
    ctx.fillStyle = L.hi;
    rrect(ctx, -76 * u, -22 * u, 26 * u, 46 * u, 9 * u);
    ctx.fill();
    ctx.lineWidth = Math.max(2.5, w * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Stage {
  env: Env;
  L: Look;
  b: StoryBeat;
  local: number;
  t: number;
  slots: Slot[];
  joints: Joints[];
  wasSeated: boolean[];
}

/** A point in front of a figure: dx forward, dy up from the ground (local units). */
const at = (sl: Slot, dx: number, dy: number): P => ({ x: sl.x + dx * sl.s, y: GROUND - dy * sl.s });

function screenBox(ctx: Ctx, st: Stage, x: number, y: number, w: number, h: number, value: string, seed: number): void {
  const { env, L } = st;
  ctx.save();
  rrect(ctx, x, y, w, h, Math.min(w, h) * 0.05);
  ctx.clip();
  ctx.fillStyle = '#12151C';
  ctx.fillRect(x, y, w, h);
  const v = env.video;
  const vs = env.videoSize;
  const numbered = /^\s*\d/.test(value);
  if (v && vs && numbered) {
    const zm = screenZoom(value);
    const z = lerp(1, zm.z, easeInOut(prog(st.local, 0.3, 0.6)));
    const cw = vs.w / z;
    const ch = vs.h / z;
    const sx = Math.min(vs.w - cw, Math.max(0, zm.x * vs.w - cw / 2));
    const sy = Math.min(vs.h - ch, Math.max(0, zm.y * vs.h - ch / 2));
    const k = Math.max(w / cw, h / ch);
    ctx.drawImage(v, sx, sy, cw, ch, x + (w - cw * k) / 2, y + (h - ch * k) / 2, cw * k, ch * k);
  } else {
    // An app window: a title bar and a few lines, glowing in the highlight colour.
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, w, h * 0.12);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i === 1 ? L.hi : 'rgba(255,255,255,0.22)';
      const lw = w * (0.35 + 0.4 * Math.abs(nz(seed + i, 1)));
      rrect(ctx, x + w * 0.08, y + h * (0.24 + i * 0.17), lw, h * 0.07, h * 0.03);
      ctx.fill();
    }
  }
  ctx.restore();
  inkStyle(ctx, L.ink, Math.max(4, L.lw * 0.55));
  rrect(ctx, x, y, w, h, Math.min(w, h) * 0.05);
  ctx.stroke();
}

/** Text in a box (signs, bubbles). Returns nothing; the box is centred on c. */
function textBox(ctx: Ctx, st: Stage, text: string, c: P, maxW: number, kind: 'sign' | 'bubble' | 'think', tail: P | null, pop: number): void {
  const { L } = st;
  const s = text.replace(/\*/g, '').trim() || (kind === 'think' ? '...' : '');
  if (!s) return;
  const ft = fit(ctx, s, { maxW, maxH: 220, max: 60, min: 30, maxLines: 3, weight: 800, family: FONT.meme, lh: 1.12 });
  font(ctx, ft.size, 800, FONT.meme);
  const tw = Math.max(...ft.lines.map((l) => ctx.measureText(l).width));
  const bw = tw + 70;
  const bh = ft.lines.length * ft.lh + 46;
  withAlpha(ctx, clamp01(pop * 3), () =>
    scaled(ctx, lerp(0.6, 1, easeBack(clamp01(pop))), c.x, c.y, () => {
      inkStyle(ctx, L.ink, Math.max(5, L.lw * 0.5));
      ctx.fillStyle = kind === 'sign' ? L.hi : L.bg;
      if (kind === 'think') {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, bw / 2 + 24, bh / 2 + 18, 0, 0, Math.PI * 2);
        ctx.fill();
        inkPath(ctx, ellipsePts(c.x, c.y, bw / 2 + 24, bh / 2 + 18, 14), 31, 3);
        if (tail) {
          for (let i = 1; i <= 2; i++) {
            const p = { x: lerp(c.x, tail.x, 0.55 + i * 0.18), y: lerp(c.y + bh / 2, tail.y, 0.55 + i * 0.18) };
            ctx.beginPath();
            ctx.arc(p.x, p.y, 16 - i * 5, 0, Math.PI * 2);
            ctx.fillStyle = L.bg;
            ctx.fill();
            ctx.stroke();
          }
        }
      } else {
        rrect(ctx, c.x - bw / 2, c.y - bh / 2, bw, bh, kind === 'sign' ? 10 : 30);
        ctx.fill();
        if (tail && kind === 'bubble') {
          ctx.beginPath();
          ctx.moveTo(c.x - 26, c.y + bh / 2 - 4);
          ctx.lineTo(tail.x, tail.y);
          ctx.lineTo(c.x + 14, c.y + bh / 2 - 4);
          ctx.fill();
          inkPath(ctx, [{ x: c.x - 26, y: c.y + bh / 2 }, tail, { x: c.x + 14, y: c.y + bh / 2 }], 33, 1.5);
        }
        inkRect(ctx, c.x - bw / 2, c.y - bh / 2, bw, bh, 32, 2.5);
      }
      font(ctx, ft.size, 800, FONT.meme);
      ctx.fillStyle = kind === 'sign' ? '#111' : L.ink;
      ctx.textAlign = 'center';
      ft.lines.forEach((l, i) => ctx.fillText(l, c.x, c.y - bh / 2 + 23 + ft.lh * (i + 0.8)));
    }),
  );
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, n: number): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * rx * (1 + 0.06 * Math.sin(a * 5)), y: cy + Math.sin(a) * ry * (1 + 0.06 * Math.sin(a * 5)) });
  }
  return out;
}

/** Props that stand behind the figure (desk, chair, monitor, chart, big screen, clock). */
function drawBackProps(ctx: Ctx, st: Stage, props: StickProp[], poses: StickPose[]): void {
  const { L, local } = st;
  const lw = Math.max(5, L.lw * 0.7);
  if (props.some((p) => p.kind === 'screen')) {
    const v = props.find((p) => p.kind === 'screen')?.value ?? '';
    const pop = easeOut(prog(local, 0, 0.25));
    scaled(ctx, lerp(0.94, 1, pop), W / 2, 790, () => screenBox(ctx, st, 60, 520, 960, 540, v, 3));
  }
  if (props.some((p) => p.kind === 'clock')) {
    const c = { x: 905, y: 700 };
    inkStyle(ctx, L.ink, lw);
    ctx.fillStyle = L.bg;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 70, 0, Math.PI * 2);
    ctx.fill();
    inkPath(ctx, ellipsePts(c.x, c.y, 70, 70, 16), 41, 2);
    const a = st.t * 6;
    inkPath(ctx, [c, { x: c.x + Math.sin(a) * 52, y: c.y - Math.cos(a) * 52 }], 42, 0);
    inkPath(ctx, [c, { x: c.x + Math.sin(a / 12) * 34, y: c.y - Math.cos(a / 12) * 34 }], 43, 0);
  }
  st.slots.forEach((sl, k) => {
    const mine = props.filter((p) => p.who === k);
    const has = (kind: string): StickProp | undefined => mine.find((p) => p.kind === kind);
    inkStyle(ctx, L.ink, lw * sl.s);
    // A chair under a seated figure (kept for a moment while it gets up).
    if (SEATED.includes(poses[k]) || (st.wasSeated[k] && local < 0.25)) {
      const seat = at(sl, 0, 122);
      inkPath(ctx, [{ x: seat.x - 70 * sl.s, y: seat.y }, { x: seat.x + 60 * sl.s, y: seat.y }], 50 + k, 1.5);
      inkPath(ctx, [{ x: seat.x - 66 * sl.s, y: seat.y }, at(sl, -70, 0)], 51 + k, 1.5);
      inkPath(ctx, [{ x: seat.x + 52 * sl.s, y: seat.y }, at(sl, 56, 0)], 52 + k, 1.5);
      inkPath(ctx, [{ x: seat.x - 70 * sl.s, y: seat.y }, at(sl, -80, 330)], 53 + k, 1.5);
    }
    // A backpack behind the body.
    const jb = st.joints[k];
    if (has('bag') && jb) {
      const ux = (jb.neck.x - jb.hip.x) / SPINE / sl.s;
      const uy = (jb.neck.y - jb.hip.y) / SPINE / sl.s;
      const c = { x: lerp(jb.hip.x, jb.neck.x, 0.55) - 62 * sl.s - uy * 0, y: lerp(jb.hip.y, jb.neck.y, 0.55) };
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(Math.atan2(ux, -uy));
      rrect(ctx, -52 * sl.s, -95 * sl.s, 92 * sl.s, 190 * sl.s, 26 * sl.s);
      ctx.fillStyle = '#7A5230';
      ctx.fill();
      ctx.lineWidth = Math.max(3, lw * 0.6 * sl.s);
      ctx.strokeStyle = CLOTH_LINE;
      ctx.stroke();
      rrect(ctx, -44 * sl.s, 10 * sl.s, 76 * sl.s, 60 * sl.s, 12 * sl.s);
      ctx.fillStyle = '#5E3E22';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const chart = has('chart');
    if (chart) {
      const x0 = sl.x + 150 * sl.s;
      const y0 = GROUND - 620 * sl.s;
      const w = 330 * sl.s;
      const h = 230 * sl.s;
      ctx.fillStyle = L.bg;
      ctx.fillRect(x0, y0, w, h);
      inkRect(ctx, x0, y0, w, h, 60 + k, 2);
      const shape = chart.value.toLowerCase();
      const ys = shape === 'down' ? [0.2, 0.3, 0.25, 0.5, 0.45, 0.7, 0.85] : shape === 'flat' ? [0.5, 0.45, 0.55, 0.48, 0.52, 0.47, 0.5] : [0.85, 0.7, 0.75, 0.5, 0.55, 0.3, 0.15];
      const p = easeInOut(prog(local, 0.2, 1.2));
      const n = (ys.length - 1) * p;
      const pts: P[] = [];
      for (let i = 0; i <= Math.ceil(n); i++) {
        const u = Math.min(i, n);
        const a = ys[Math.floor(u)];
        const b2 = ys[Math.min(ys.length - 1, Math.floor(u) + 1)];
        const yy = lerp(a, b2, u - Math.floor(u));
        pts.push({ x: x0 + 24 * sl.s + (u / (ys.length - 1)) * (w - 48 * sl.s), y: y0 + 20 * sl.s + yy * (h - 40 * sl.s) });
      }
      if (pts.length > 1) {
        inkStyle(ctx, L.hi, lw * 1.1 * sl.s);
        inkPath(ctx, pts, 62 + k, 0);
      }
    }
    if (has('desk')) {
      inkStyle(ctx, L.ink, lw * sl.s);
      const l = at(sl, 70, 205);
      const r = at(sl, 340, 205);
      inkPath(ctx, [l, r], 70 + k, 1.5);
      inkPath(ctx, [at(sl, 95, 205), at(sl, 95, 0)], 71 + k, 1.5);
      inkPath(ctx, [at(sl, 315, 205), at(sl, 315, 0)], 72 + k, 1.5);
    }
    const mon = has('monitor');
    if (mon) {
      const base = at(sl, 260, 205);
      inkStyle(ctx, L.ink, lw * sl.s);
      inkPath(ctx, [base, { x: base.x, y: base.y - 40 * sl.s }], 80 + k, 0);
      inkPath(ctx, [{ x: base.x - 50 * sl.s, y: base.y }, { x: base.x + 50 * sl.s, y: base.y }], 81 + k, 0);
      screenBox(ctx, st, base.x - 150 * sl.s, base.y - 240 * sl.s, 300 * sl.s, 200 * sl.s, mon.value, 82 + k);
    }
    const lap = has('laptop');
    if (lap) {
      const base = at(sl, 230, 205);
      inkStyle(ctx, L.ink, lw * sl.s);
      inkPath(ctx, [{ x: base.x - 95 * sl.s, y: base.y - 4 * sl.s }, { x: base.x + 95 * sl.s, y: base.y - 4 * sl.s }], 90 + k, 0);
      screenBox(ctx, st, base.x - 85 * sl.s, base.y - 140 * sl.s, 170 * sl.s, 128 * sl.s, lap.value, 91 + k);
    }
  });
}

/** Props in front of or around the figure (held things, bubbles, marks, the robot). */
function drawFrontProps(ctx: Ctx, st: Stage, props: StickProp[]): void {
  const { L, local, t } = st;
  const lw = Math.max(5, L.lw * 0.7);
  const pop = (d = 0.15): number => prog(local, d, 0.3);
  st.slots.forEach((sl, k) => {
    const j = st.joints[k];
    if (!j) return;
    const mine = props.filter((p) => p.who === k);
    const has = (kind: string): StickProp | undefined => mine.find((p) => p.kind === kind);
    const top: P = { x: j.head.x, y: j.head.y - j.r };
    if (has('coffee')) {
      const c = has('desk') ? at(sl, 110, 205) : { x: j.h2.x, y: j.h2.y + 20 * sl.s };
      inkStyle(ctx, L.ink, lw * 0.8 * sl.s);
      ctx.fillStyle = L.bg;
      ctx.fillRect(c.x - 20 * sl.s, c.y - 48 * sl.s, 40 * sl.s, 48 * sl.s);
      inkRect(ctx, c.x - 20 * sl.s, c.y - 48 * sl.s, 40 * sl.s, 48 * sl.s, 100 + k, 1);
      for (let i = 0; i < 2; i++) {
        const yy = c.y - 60 * sl.s - ((t * 30 + i * 20) % 40) * sl.s;
        withAlpha(ctx, 0.5, () => inkPath(ctx, [{ x: c.x - 6 * sl.s + i * 12 * sl.s, y: yy }, { x: c.x + i * 12 * sl.s, y: yy - 18 * sl.s }], 101 + i, 3));
      }
    }
    const robot = has('robot');
    if (robot) {
      const s = sl.s * 1.1;
      const bob = Math.sin(t * 3) * 6 * s;
      const x = sl.x + (has('desk') ? 300 : 230) * sl.s;
      const feet = GROUND;
      const hipY = feet - 90 * s + bob;
      const neckY = hipY - 80 * s;
      inkStyle(ctx, L.ink, lw * s);
      inkPath(ctx, [{ x: x - 18 * s, y: feet }, { x: x - 10 * s, y: hipY }, { x: x + 10 * s, y: hipY }, { x: x + 18 * s, y: feet }], 110, 1);
      inkPath(ctx, [{ x, y: hipY }, { x, y: neckY }], 111, 1);
      const reach = has('laptop') || has('monitor') ? -1 : 1;
      inkPath(ctx, [{ x, y: neckY + 14 * s }, { x: x + reach * 46 * s, y: neckY + 40 * s + Math.sin(t * 18) * 5 * s }], 112, 1);
      inkPath(ctx, [{ x, y: neckY + 14 * s }, { x: x - reach * 40 * s, y: neckY + 56 * s }], 113, 1);
      ctx.fillStyle = L.bg;
      rrect(ctx, x - 52 * s, neckY - 80 * s, 104 * s, 80 * s, 16 * s);
      ctx.fill();
      ctx.stroke();
      inkPath(ctx, [{ x, y: neckY - 80 * s }, { x, y: neckY - 112 * s }], 114, 0);
      ctx.fillStyle = L.hi;
      ctx.beginPath();
      ctx.arc(x, neckY - 118 * s, 10 * s, 0, Math.PI * 2);
      ctx.fill();
      const blinkR = (t % 2.7) < 0.12;
      for (const ex of [-20, 20]) {
        ctx.beginPath();
        if (blinkR) ctx.fillRect(x + ex * s - 9 * s, neckY - 42 * s, 18 * s, 4 * s);
        else {
          ctx.arc(x + ex * s, neckY - 40 * s, 9 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    const fire = has('fire');
    if (fire) {
      const c = has('desk') ? at(sl, 230, 205) : at(sl, 200, 0);
      for (let i = 0; i < 3; i++) {
        const fx = c.x + (i - 1) * 46 * sl.s;
        const fh = (110 + 40 * Math.sin(t * 9 + i * 2)) * sl.s;
        ctx.fillStyle = i === 1 ? L.hi : '#FFB020';
        ctx.beginPath();
        ctx.moveTo(fx - 30 * sl.s, c.y);
        ctx.quadraticCurveTo(fx - 34 * sl.s, c.y - fh * 0.6, fx + nz(i, boil) * 10 * sl.s, c.y - fh);
        ctx.quadraticCurveTo(fx + 34 * sl.s, c.y - fh * 0.6, fx + 30 * sl.s, c.y);
        ctx.fill();
      }
    }
    const ph = has('phone');
    if (ph) {
      const c = j.h1;
      const pw = 54 * sl.s;
      const phh = 96 * sl.s;
      screenBox(ctx, st, c.x - pw / 2, c.y - phh * 0.8, pw, phh, ph.value, 120 + k);
    }
    const s = sl.s;
    const torch = has('torch');
    if (torch) {
      // A flashlight along the forearm, its beam flickering ahead.
      const a = Math.atan2(j.h1.y - j.e1.y, j.h1.x - j.e1.x);
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      const tip = add(j.h1, dir, 34 * s);
      const flick = 0.75 + 0.25 * Math.sin(t * 31) * (Math.sin(t * 1.7) > 0.8 ? 1 : 0);
      const reach = 620 * s;
      const n = { x: -dir.y, y: dir.x };
      const g = ctx.createLinearGradient(tip.x, tip.y, tip.x + dir.x * reach, tip.y + dir.y * reach);
      g.addColorStop(0, `rgba(255,236,150,${(L.light ? 0.85 : 0.55) * flick})`);
      g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.save();
      if (!L.light) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(tip.x + n.x * 14 * s, tip.y + n.y * 14 * s);
      ctx.lineTo(tip.x + dir.x * reach + n.x * 170 * s, tip.y + dir.y * reach + n.y * 170 * s);
      ctx.lineTo(tip.x + dir.x * reach - n.x * 170 * s, tip.y + dir.y * reach - n.y * 170 * s);
      ctx.lineTo(tip.x - n.x * 14 * s, tip.y - n.y * 14 * s);
      ctx.fill();
      ctx.restore();
      inkStyle(ctx, CLOTH_LINE, 30 * s);
      inkPath(ctx, [add(j.h1, dir, -18 * s), tip], 160 + k, 0);
      inkStyle(ctx, '#FFE68A', 14 * s);
      inkPath(ctx, [add(tip, dir, -4 * s), tip], 161 + k, 0);
    }
    const held = (c: P, draw: () => void): void => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(s, s);
      ctx.lineWidth = 5;
      ctx.strokeStyle = CLOTH_LINE;
      draw();
      ctx.restore();
    };
    if (has('bottle'))
      held(j.h2, () => {
        rrect(ctx, -16, -72, 32, 84, 10);
        ctx.fillStyle = 'rgba(120,200,255,0.85)';
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#2F6FD6';
        ctx.fillRect(-10, -88, 20, 16);
        ctx.strokeRect(-10, -88, 20, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(-9, -60, 6, 50);
      });
    if (has('food'))
      held(j.h2, () => {
        rrect(ctx, -26, -60, 52, 66, 8);
        ctx.fillStyle = '#C8CDD4';
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = L.hi;
        ctx.fillRect(-26, -46, 52, 32);
        ctx.strokeRect(-26, -46, 52, 32);
      });
    if (has('key'))
      held(j.h1, () => {
        ctx.translate(0, -24);
        ctx.rotate(-0.6 + Math.sin(t * 3) * 0.08);
        ctx.fillStyle = '#F2C230';
        ctx.beginPath();
        ctx.arc(0, -26, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(-5, -10, 10, 52);
        ctx.strokeRect(-5, -10, 10, 52);
        ctx.fillRect(5, 24, 14, 8);
        ctx.fillRect(5, 36, 10, 6);
        // A glint.
        const gk = (t * 0.8) % 1;
        if (gk < 0.2) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(-14, -40);
          ctx.lineTo(-14 + 16, -40 + 16);
          ctx.moveTo(2, -40);
          ctx.lineTo(-14, -24);
          ctx.stroke();
        }
      });
    if (has('money'))
      held(j.h1, () => {
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.rotate(-0.5 + i * 0.22);
          rrect(ctx, -6, -86, 46, 82, 5);
          ctx.fillStyle = '#5FB26A';
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#2E7D3B';
          ctx.font = '900 30px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('$', 17, -36);
          ctx.restore();
        }
      });
    const sign = has('sign');
    if (sign) {
      const c = { x: j.h1.x + 10 * sl.s, y: j.h1.y - 120 * sl.s };
      inkStyle(ctx, L.ink, lw * sl.s);
      inkPath(ctx, [j.h1, { x: c.x, y: c.y }], 130 + k, 0);
      textBox(ctx, st, sign.value || 'FREE', c, 300 * sl.s + 60, 'sign', null, 1);
    }
    const bubble = has('bubble');
    if (bubble) textBox(ctx, st, bubble.value, { x: Math.min(W - 250, Math.max(250, j.head.x + 150 * sl.s)), y: top.y - 130 }, 420, 'bubble', { x: j.head.x + j.r * 0.6, y: j.head.y - j.r * 0.4 }, pop());
    const think = has('think');
    // A thought bubble rises clear of a light bulb when both are there.
    if (think) textBox(ctx, st, think.value, { x: Math.min(W - 250, Math.max(250, j.head.x + (has('bulb') ? 230 : 110) * sl.s)), y: top.y - (has('bulb') ? 250 : 160) }, 400, 'think', { x: j.head.x + 20, y: top.y }, pop());
    const mark = (text: string, color: string, d: number): void => {
      const p = easeBack(pop(d));
      if (p <= 0) return;
      const c = { x: j.head.x + 30 * sl.s, y: top.y - 70 * sl.s + Math.sin(t * 5) * 6 };
      withAlpha(ctx, clamp01(p * 2), () =>
        scaled(ctx, p, c.x, c.y, () => {
          font(ctx, 130 * sl.s, 900, FONT.meme);
          ctx.textAlign = 'center';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 12 * sl.s;
          ctx.strokeStyle = L.ink;
          ctx.strokeText(text, c.x, c.y + 40 * sl.s);
          ctx.fillStyle = color;
          ctx.fillText(text, c.x, c.y + 40 * sl.s);
        }),
      );
    };
    if (has('question')) mark('?', L.hi, 0.1);
    if (has('exclaim')) mark('!', L.hi, 0.05);
    if (has('bulb')) {
      const p = easeBack(pop(0.2));
      const c = { x: j.head.x, y: top.y - 110 * sl.s };
      if (p > 0)
        scaled(ctx, p, c.x, c.y, () => {
          ctx.fillStyle = L.hi;
          ctx.beginPath();
          ctx.arc(c.x, c.y, 42 * sl.s, 0, Math.PI * 2);
          ctx.fill();
          inkStyle(ctx, L.ink, lw * 0.8 * sl.s);
          ctx.stroke();
          ctx.strokeRect(c.x - 18 * sl.s, c.y + 42 * sl.s, 36 * sl.s, 22 * sl.s);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.3;
            const r0 = 60 * sl.s;
            const r1 = (78 + 10 * Math.sin(t * 8 + i)) * sl.s;
            inkPath(ctx, [{ x: c.x + Math.cos(a) * r0, y: c.y + Math.sin(a) * r0 }, { x: c.x + Math.cos(a) * r1, y: c.y + Math.sin(a) * r1 }], 140 + i, 0);
          }
        });
    }
    if (has('sweat')) {
      for (let i = 0; i < 2; i++) {
        const k2 = ((t * 0.6 + i * 0.5) % 1);
        const c = { x: j.head.x - j.r * (0.9 + i * 0.25), y: j.head.y - j.r * 0.3 + k2 * 60 * sl.s };
        withAlpha(ctx, 1 - k2, () => {
          ctx.fillStyle = '#4FB3FF';
          ctx.beginPath();
          ctx.moveTo(c.x, c.y - 16 * sl.s);
          ctx.quadraticCurveTo(c.x + 12 * sl.s, c.y + 4 * sl.s, c.x, c.y + 8 * sl.s);
          ctx.quadraticCurveTo(c.x - 12 * sl.s, c.y + 4 * sl.s, c.x, c.y - 16 * sl.s);
          ctx.fill();
        });
      }
    }
    if (has('zzz')) {
      for (let i = 0; i < 3; i++) {
        const k2 = (t * 0.45 + i / 3) % 1;
        withAlpha(ctx, Math.sin(k2 * Math.PI), () => {
          font(ctx, (40 + 30 * k2) * sl.s, 900, FONT.meme);
          ctx.fillStyle = L.ink;
          ctx.textAlign = 'center';
          ctx.fillText('z', j.head.x + (40 + 60 * k2) * sl.s, top.y - (20 + 160 * k2) * sl.s);
        });
      }
    }
    const arrow = has('arrow');
    if (arrow) {
      const fromLeft = j.head.x > W / 2;
      const tip = { x: j.head.x + (fromLeft ? -1 : 1) * (j.r + 20), y: j.head.y - 10 };
      const tail = { x: tip.x + (fromLeft ? -1 : 1) * 230, y: tip.y - 230 };
      const p = easeOut(pop(0.1));
      const end = { x: lerp(tail.x, tip.x, p), y: lerp(tail.y, tip.y, p) };
      inkStyle(ctx, L.hi, lw * 1.1);
      inkPath(ctx, [tail, end], 150, 2);
      if (p > 0.95) {
        const a = Math.atan2(tip.y - tail.y, tip.x - tail.x);
        inkPath(ctx, [{ x: tip.x - Math.cos(a - 0.5) * 40, y: tip.y - Math.sin(a - 0.5) * 40 }, tip, { x: tip.x - Math.cos(a + 0.5) * 40, y: tip.y - Math.sin(a + 0.5) * 40 }], 151, 1);
      }
      if (arrow.value) {
        const ft = fit(ctx, arrow.value, { maxW: 380, maxH: 150, max: 68, min: 34, maxLines: 2, weight: 900, family: FONT.meme });
        font(ctx, ft.size, 900, FONT.meme);
        ctx.fillStyle = L.ink;
        ctx.textAlign = 'center';
        ft.lines.forEach((l, i) => ctx.fillText(l, Math.min(W - 200, Math.max(200, tail.x)), tail.y - 20 - (ft.lines.length - 1 - i) * ft.lh));
      }
    }
  });
}

// ── Background ─────────────────────────────────────────────────────────────
let paper: { key: string; tile: HTMLCanvasElement } | null = null;

function texture(L: Look): HTMLCanvasElement {
  const key = `${L.bg}${L.light}`;
  if (paper?.key === key) return paper.tile;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = L.bg;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = ((nz(i, 1) + 1) / 2) * 256;
    const y = ((nz(i, 2) + 1) / 2) * 256;
    g.fillStyle = L.light ? `rgba(90,70,40,${0.03 + 0.03 * Math.abs(nz(i, 3))})` : `rgba(255,255,255,${0.015 + 0.02 * Math.abs(nz(i, 3))})`;
    g.fillRect(x, y, 1 + Math.abs(nz(i, 4)) * 2, 1 + Math.abs(nz(i, 5)) * 2);
  }
  paper = { key, tile: c };
  return c;
}

/** The dusk sky: a sunset over a dark field, a low sun, a few early stars, drifting slowly. */
function dusk(ctx: Ctx, t: number): void {
  const sky = ctx.createLinearGradient(0, -H, 0, GROUND);
  sky.addColorStop(0, '#160E2E');
  sky.addColorStop(0.45, '#3A1F55');
  sky.addColorStop(0.75, '#B14E6A');
  sky.addColorStop(0.93, '#F08A5D');
  sky.addColorStop(1, '#FFC27A');
  ctx.fillStyle = sky;
  ctx.fillRect(-W, -H, W * 3, GROUND + H);
  const sx = W * 0.72;
  const sy = GROUND - 150;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 520);
  glow.addColorStop(0, 'rgba(255,214,150,0.85)');
  glow.addColorStop(0.25, 'rgba(255,170,110,0.35)');
  glow.addColorStop(1, 'rgba(255,150,100,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-W, -H, W * 3, GROUND + H);
  ctx.fillStyle = '#FFE3B0';
  ctx.beginPath();
  ctx.arc(sx, sy, 120, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 40; i++) {
    const x = ((nz(i, 11) + 1) / 2) * W;
    const y = ((nz(i, 12) + 1) / 2) * GROUND * 0.55;
    ctx.fillStyle = `rgba(255,240,220,${0.25 + 0.35 * Math.abs(Math.sin(t * 1.3 + i))})`;
    ctx.fillRect(x, y, 3, 3);
  }
  // Far hills, then the dark field the figures stand on.
  ctx.fillStyle = '#4A2440';
  ctx.beginPath();
  ctx.moveTo(-W, GROUND);
  for (let x = -W; x <= W * 2; x += 60) ctx.lineTo(x, GROUND - 70 - 40 * Math.sin(x * 0.006) - 25 * Math.sin(x * 0.017));
  ctx.lineTo(W * 2, GROUND);
  ctx.closePath();
  ctx.fill();
  const field = ctx.createLinearGradient(0, GROUND, 0, H);
  field.addColorStop(0, '#2A1530');
  field.addColorStop(1, '#120A18');
  ctx.fillStyle = field;
  ctx.fillRect(-W, GROUND, W * 3, H * 2);
}

function background(ctx: Ctx, L: Look, chalk: boolean, t = 0): void {
  if (L.dusk) {
    dusk(ctx, t);
    return;
  }
  ctx.fillStyle = ctx.createPattern(texture(L), 'repeat')!;
  ctx.fillRect(-W, -H, W * 3, H * 3);
  if (chalk) {
    for (const [x, y, r] of [[260, 500, 500], [800, 1300, 600]] as const) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

function ground(ctx: Ctx, L: Look, slots: Slot[], walking: boolean, t: number): void {
  inkStyle(ctx, L.ink, Math.max(4, L.lw * 0.6));
  inkPath(ctx, [{ x: -60, y: GROUND + 2 }, { x: W / 2, y: GROUND - 2 }, { x: W + 60, y: GROUND + 3 }], 200, 2);
  // Ticks on the ground slide by while someone walks (the figure stays in frame).
  if (walking) {
    ctx.lineWidth = Math.max(3, L.lw * 0.35);
    const off = (t * 420) % 180;
    for (let x = -off; x < W + 40; x += 180) inkPath(ctx, [{ x, y: GROUND + 26 }, { x: x + 50, y: GROUND + 26 }], 201 + Math.round(x), 0);
  }
  for (const sl of slots) {
    ctx.fillStyle = L.light ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(sl.x, GROUND + 6, 110 * sl.s, 14 * sl.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Words ──────────────────────────────────────────────────────────────────
function bigWord(ctx: Ctx, L: Look, text: string, local: number, y: number): void {
  const s = text.replace(/\*/g, '').trim();
  if (!s) return;
  const p = prog(local, LABEL_AT, 0.3);
  if (p <= 0) return;
  const c = fit(ctx, s, { maxW: 900, maxH: 200, max: 150, min: 60, maxLines: 2, weight: 900, family: FONT.meme, lh: 1.02 });
  const h = c.lines.length * c.lh;
  withAlpha(ctx, clamp01(p * 2.5), () =>
    scaled(ctx, lerp(0.55, 1, easeBack(p)), W / 2, y, () => {
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.rotate(-0.04);
      font(ctx, c.size, 900, FONT.meme);
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      c.lines.forEach((l, i) => {
        const yy = -h / 2 + c.lh * (i + 0.82);
        ctx.lineWidth = c.size * 0.16;
        ctx.strokeStyle = L.light ? L.ink : '#000';
        ctx.strokeText(l, 0, yy);
        ctx.fillStyle = L.hi;
        ctx.fillText(l, 0, yy);
      });
      ctx.restore();
    }),
  );
}

/** Title captions: the line as plain text at the top, *word* in the highlight colour (wordless versus clips). */
function titleCaption(ctx: Ctx, L: Look, text: string, alpha: number, top = 300): void {
  const raw = text.trim();
  if (!raw) return;
  const plain = raw.replace(/\*/g, '');
  const c = fit(ctx, plain, { maxW: 920, maxH: 300, max: 78, min: 40, maxLines: 3, weight: 800, family: FONT.meme, lh: 1.14 });
  // Which words are inside *...*, in order (the wrap keeps the word order).
  const hot: boolean[] = [];
  let on = false;
  for (const w of raw.split(/\s+/).filter(Boolean)) {
    if (w.startsWith('*')) on = true;
    hot.push(on || w.includes('*'));
    if (w.endsWith('*') && (w.length > 1 || !w.startsWith('*'))) on = false;
  }
  let n = 0;
  withAlpha(ctx, alpha, () => {
    font(ctx, c.size, 800, FONT.meme);
    ctx.textAlign = 'left';
    const space = ctx.measureText(' ').width;
    c.lines.forEach((line, i) => {
      const words = line.split(' ');
      const widths = words.map((w) => ctx.measureText(w).width);
      let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + space * (words.length - 1)) / 2;
      const y = top + c.lh * (i + 0.8);
      words.forEach((w, k) => {
        ctx.fillStyle = hot[n++] ? L.hi : L.text;
        ctx.fillText(w, x, y);
        x += widths[k] + space;
      });
    });
  });
}

/** Box captions: the line in a white rounded box at the top, dark text, *word* in the highlight colour. */
function boxCaption(ctx: Ctx, L: Look, text: string, alpha: number, top: number): void {
  const plain = text.trim().replace(/\*/g, '');
  if (!plain) return;
  const c = fit(ctx, plain, { maxW: 920, maxH: 300, max: 78, min: 40, maxLines: 3, weight: 800, family: FONT.meme, lh: 1.14 });
  font(ctx, c.size, 800, FONT.meme);
  const tw = Math.max(...c.lines.map((l) => ctx.measureText(l).width));
  const bw = Math.min(W - 80, tw + 80);
  const bh = c.lines.length * c.lh + 44;
  withAlpha(ctx, alpha, () => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    rrect(ctx, W / 2 - bw / 2, top - 22, bw, bh, 26);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#141414';
    rrect(ctx, W / 2 - bw / 2, top - 22, bw, bh, 26);
    ctx.stroke();
  });
  titleCaption(ctx, { ...L, text: '#141414' }, text, alpha, top - 4);
}

function labels(ctx: Ctx, L: Look, env: Env, slots: Slot[], win: number): void {
  const names = str(env.fields, 'labels').split(';').map((x) => x.trim());
  slots.forEach((sl, k) => {
    const n = names[k];
    if (!n) return;
    const c = fit(ctx, n.toUpperCase(), { maxW: 440, maxH: 120, max: 54, min: 30, maxLines: 2, weight: 900, family: FONT.meme });
    font(ctx, c.size, 900, FONT.meme);
    ctx.textAlign = 'center';
    ctx.fillStyle = win === k ? L.hi : L.text;
    const y0 = GROUND - FIG_H * sl.s - 60 - (c.lines.length - 1) * c.lh;
    c.lines.forEach((l, i) => ctx.fillText(l, sl.x, y0 + i * c.lh));
  });
}

// ── Survival series: the HUD, rule / fact cards, the vote ─────────────────────
const HUD_Y = 268;

/** Day, time and a phone battery across the top, the way the survival stickman pages show them. */
function hud(ctx: Ctx, L: Look, h: { day: string; clock: string; battery: number }, changed: boolean, local: number): void {
  const bump = changed ? 1 + 0.12 * Math.sin(Math.PI * clamp01(local / 0.35)) : 1;
  const panel = 'rgba(10,10,14,0.82)';
  // The day, big, on the left.
  scaled(ctx, bump, 190, HUD_Y, () => {
    font(ctx, 54, 900, FONT.meme);
    const label = `DAY ${h.day}`;
    const w = ctx.measureText(label).width + 56;
    rrect(ctx, 80, HUD_Y - 42, w, 84, 20);
    ctx.fillStyle = L.hi;
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111111';
    ctx.fillText(label, 108, HUD_Y + 3);
  });
  // The clock.
  if (h.clock) {
    font(ctx, 46, 700, FONT.mono);
    const w = ctx.measureText(h.clock).width + 48;
    rrect(ctx, W / 2 - w / 2 + 40, HUD_Y - 36, w, 72, 18);
    ctx.fillStyle = panel;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(h.clock, W / 2 + 40, HUD_Y + 2);
  }
  // A phone battery: red and blinking when it is nearly gone.
  if (h.battery >= 0) {
    const x = 830;
    const low = h.battery <= 20;
    rrect(ctx, x - 20, HUD_Y - 36, 190, 72, 18);
    ctx.fillStyle = panel;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    rrect(ctx, x, HUD_Y - 18, 70, 36, 8);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + 72, HUD_Y - 8, 7, 16);
    const on = !low || Math.floor(local * 3) % 2 === 0;
    if (on) {
      ctx.fillStyle = low ? '#FF3B30' : h.battery <= 50 ? '#FFC400' : '#34C759';
      rrect(ctx, x + 6, HUD_Y - 12, Math.max(4, 58 * (h.battery / 100)), 24, 4);
      ctx.fill();
    }
    font(ctx, 34, 700, FONT.mono);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = low ? '#FF6B60' : '#FFFFFF';
    ctx.fillText(`${h.battery}%`, x + 92, HUD_Y + 2);
  }
  ctx.textBaseline = 'alphabetic';
}

/** The rule card or fact card: a label tab and the line, sliding down under the HUD. */
function infoCard(ctx: Ctx, L: Look, kind: 'rule' | 'fact', text: string, n: number, local: number, top: number): void {
  const p = easeBack(prog(local, 0.05, 0.35));
  if (p <= 0) return;
  const label = kind === 'rule' ? (n > 0 ? `RULE #${n}` : 'RULE') : 'FACT';
  const c = fit(ctx, text, { maxW: 820, maxH: 220, max: 58, min: 34, maxLines: 4, weight: 800, family: FONT.meme, lh: 1.15 });
  const h = c.lines.length * c.lh + 110;
  ctx.save();
  ctx.translate(0, (1 - clamp01(p)) * -60);
  withAlpha(ctx, clamp01(p * 1.6), () => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    rrect(ctx, 80, top, W - 160, h, 26);
    ctx.fillStyle = kind === 'rule' ? '#FFF7E6' : '#ECF6FF';
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 6;
    ctx.strokeStyle = kind === 'rule' ? '#111111' : '#0B4A86';
    rrect(ctx, 80, top, W - 160, h, 26);
    ctx.stroke();
    font(ctx, 34, 900, FONT.meme);
    const lw = ctx.measureText(label).width + 40;
    rrect(ctx, 110, top - 26, lw, 52, 14);
    ctx.fillStyle = kind === 'rule' ? L.hi : '#2F80ED';
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = kind === 'rule' ? '#111111' : '#FFFFFF';
    ctx.fillText(label, 130, top + 1);
    font(ctx, c.size, 800, FONT.meme);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#111111';
    c.lines.forEach((l, i) => ctx.fillText(l, W / 2, top + 62 + c.lh * (i + 0.8)));
  });
  ctx.restore();
}

/** The vote: two options at the top, A and B, and the line that asks for it. */
function voteCards(ctx: Ctx, L: Look, value: string, local: number, top: number): void {
  const [a, b] = value.split('/').map((x) => x.trim());
  const opts = [a || 'Option A', b || 'Option B'];
  opts.forEach((text, k) => {
    const p = easeBack(prog(local, 0.15 + k * 0.25, 0.35));
    if (p <= 0) return;
    const y = top + k * 170;
    const c = fit(ctx, text, { maxW: 700, maxH: 110, max: 52, min: 30, maxLines: 2, weight: 800, family: FONT.meme, lh: 1.1 });
    scaled(ctx, lerp(0.8, 1, clamp01(p)), W / 2, y + 70, () =>
      withAlpha(ctx, clamp01(p * 1.6), () => {
        rrect(ctx, 80, y, W - 160, 140, 28);
        ctx.fillStyle = 'rgba(12,12,16,0.88)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(160, y + 70, 46, 0, Math.PI * 2);
        ctx.fillStyle = k ? '#2F80ED' : L.hi;
        ctx.fill();
        font(ctx, 56, 900, FONT.meme);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = k ? '#FFFFFF' : '#111111';
        ctx.fillText(k ? 'B' : 'A', 160, y + 72);
        font(ctx, c.size, 800, FONT.meme);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFFFFF';
        const h = c.lines.length * c.lh;
        c.lines.forEach((l, i) => ctx.fillText(l, 236, y + 70 - h / 2 + c.lh * (i + 0.5)));
      }),
    );
  });
  const q = easeOut(prog(local, 0.75, 0.3));
  withAlpha(ctx, q, () => {
    font(ctx, 46, 900, FONT.meme);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText('COMMENT A OR B', W / 2, top + 380);
    ctx.fillStyle = L.hi;
    ctx.fillText('COMMENT A OR B', W / 2, top + 380);
  });
  ctx.textBaseline = 'alphabetic';
}

// ── Life in the scene ─────────────────────────────────────────────────────
/** Small people walking by on the back line of a street, city or park (muted, so they stay background). */
function passersBy(ctx: Ctx, L: Look, pal: Pal, t: number, seed: number, cartoon: boolean, place: string): void {
  const back = place === 'park' ? 110 : 150;
  const colours = ['#2F6FD6', '#D94A3A', '#3F9B5A', '#F2C230'];
  for (let e = 0; e < 3; e++) {
    const s = 0.4 + 0.05 * e;
    const speed = 95 + 35 * e;
    const dir = e % 2 ? -1 : 1;
    const span = W + 500;
    const u = ((t * speed + e * 611 + seed * 7) % span) - 250;
    const x = dir > 0 ? u : W - u;
    const tw = Math.floor((t + e * 0.37) * 15) / 15;
    let j = jointsOf(moving('walk', tw + e, false), { x, s });
    if (cartoon) j = cartoonHead(j);
    const f: FigDraw = { j, pose: 'walk', face: 'neutral', mouth: 0, blink: false, color: pal.line, gear: e === 1 ? ['bun'] : [], seed: 700 + e * 13, shirt: cartoon ? mixHex(colours[(e + seed) % 4], L.bg, 0.4) : undefined };
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(0, -back);
    if (dir < 0) {
      ctx.translate(x * 2, 0);
      ctx.scale(-1, 1);
    }
    drawFigure(ctx, { ...L, lw: L.lw * 0.8 }, f);
    ctx.restore();
  }
}

/** Dust kicked up behind running feet, and a puff where a fall lands. */
function dust(ctx: Ctx, L: Look, figs: FigDraw[], poses: StickPose[], lc: number, t: number): void {
  const col = L.light ? '150,130,100' : L.dusk ? '255,200,170' : '220,220,220';
  const puff = (x: number, y: number, r: number, a: number): void => {
    ctx.fillStyle = `rgba(${col},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  figs.forEach((f, k) => {
    const s = f.j.s;
    if (poses[k] === 'run')
      for (let i = 0; i < 4; i++) {
        const u = (t * 2.4 + i / 4) % 1;
        puff(Math.min(f.j.f1.x, f.j.f2.x) - u * 150 * s, GROUND - 12 * s - u * 40 * s, (12 + 30 * u) * s, 0.45 * (1 - u));
      }
    if (poses[k] === 'fall' && lc > 0.28 && lc < 1) {
      const u = (lc - 0.28) / 0.72;
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + (i / 5) * Math.PI;
        puff(f.j.hip.x + Math.cos(a) * (60 + 160 * u) * s, GROUND - 10 + Math.sin(a) * 50 * u * s, (18 + 26 * u) * s, 0.5 * (1 - u));
      }
    }
  });
}

// ── Frame ──────────────────────────────────────────────────────────────────
const sameSlots = (a: Slot[], b: Slot[]): boolean => a.length === b.length && a.every((s, i) => s.x === b[i].x && s.s === b[i].s);

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
}

function gearOf(env: Env): [string[], string[], string[]] {
  const out: [string[], string[], string[]] = [[], [], []];
  for (const part of str(env.fields, 'gear').split(/[;,]/)) {
    const m = /^\s*(?:([abc])\s*:\s*)?([a-z]+)\s*$/i.exec(part);
    if (!m) continue;
    const g = m[2].toLowerCase();
    if ((STICK_GEAR as readonly string[]).includes(g)) out[Math.max(0, 'abc'.indexOf(m[1]?.toLowerCase() ?? 'a'))].push(g);
  }
  return out;
}

/** A steady 0..1 value from a number (glances, brow pops). */
function h01(x: number): number {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Behind a 3D place: the sky (outside it shows; inside the walls cover it). */
function sky3d(ctx: Ctx, look: Stick3dLook, pal: Pal, t: number): void {
  if (look === 'dusk') {
    ctx.save();
    dusk(ctx, t);
    ctx.restore();
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (look === 'night') {
    g.addColorStop(0, '#0E1230');
    g.addColorStop(1, '#2A3466');
  } else {
    g.addColorStop(0, '#8FCBEF');
    g.addColorStop(0.6, '#CFEAF6');
    g.addColorStop(1, '#F6EEDC');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (look === 'night') nightSky(ctx, pal, t);
}

/** Soft shadows under the figures standing in a 3D place. */
function shadows(ctx: Ctx, slots: Slot[]): void {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (const sl of slots) {
    ctx.beginPath();
    ctx.ellipse(sl.x, GROUND + 4, 120 * sl.s, 20 * sl.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const L = lookOf(env);
  markLightFrame(L.light);
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  // The character moves on twos; its lines boil 8 times a second.
  const tc = Math.floor(t * 15) / 15;
  const lc = tc - b.start;
  boil = Math.floor(t * 8);
  // One, two (versus) or three figures: by the poses ("a/b/c") and the names in labels.
  const names = str(env.fields, 'labels').split(';').filter((x) => x.trim()).length;
  const n = beats.some((x) => x.visual.split('/').length > 2) || names > 2 ? 3 : beats.some((x) => x.visual.includes('/')) || names > 1 ? 2 : 1;
  const duo = n > 1;
  const props = propsOf(b, n);
  const slots = slotsOf(props, n).slice(0, n);
  const prev = i > 0 ? beats[i - 1] : null;
  const cut = !prev || !sameSlots(slots, slotsOf(propsOf(prev, n), n).slice(0, n));
  const seed = seedOf(str(env.fields, 'beats').slice(0, 60));
  const whoOf = (bk: StoryBeat): number => Math.min(n - 1, bk.tags.includes('who=c') ? 2 : bk.tags.includes('who=b') ? 1 : 0);
  const who = whoOf(b);
  const winTag = b.tags.find((x) => x === 'win' || x.startsWith('win='));
  const win = winTag ? Math.min(n - 1, winTag === 'win=c' ? 2 : winTag === 'win=b' ? 1 : 0) : -1;
  const lit = win >= 0 && local >= 0.15;
  const gear = gearOf(env);
  const poses = stickPoses(b.visual);
  const talking = !!b.say && b.voDur > 0 && local >= b.voStart && local <= b.voStart + b.voDur;

  // The place, the weather, the cartoon look.
  const tagsSoFar = beats.slice(0, i + 1).map((x) => x.tags);
  const place = stickLast(tagsSoFar, 'set');
  const placeBefore = i > 0 ? stickLast(tagsSoFar.slice(0, -1), 'set') : place;
  const weather = stickLast(tagsSoFar, 'weather');
  const pal = palOf(L, weather === 'night');
  const whip = place !== placeBefore ? 1 - easeOut(prog(local, 0, 0.34)) : 0;
  const cartoon = (str(env.fields, 'figure') || 'cartoon') !== 'stick';
  const shirts = (str(env.fields, 'shirts') || 'blue;orange').split(';').map((x) => {
    const v = x.trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(v) ? v : (STICK_SHIRTS[v] ?? '');
  });
  const shirtOf = (k: number): string => shirts[k] || [STICK_SHIRTS.blue, STICK_SHIRTS.orange, STICK_SHIRTS.green][k] || STICK_SHIRTS.blue;

  // Walking in or out: the speaker walks from / to the side of the frame.
  const enterTo = b.tags.find((x) => x.startsWith('enter='))?.slice(6);
  const exitTo = b.tags.find((x) => x.startsWith('exit='))?.slice(5);
  const walkT = Math.min(1.0, b.dur * 0.45);

  // Each figure's pose: moving into this beat's pose from the last one's.
  const figs: FigDraw[] = [];
  const flips: Array<number | undefined> = [];
  const moved: boolean[] = [];
  for (let k = 0; k < n; k++) {
    const name = poses[k];
    const speaking = talking && k === who;
    const cur = moving(name, tc, speaking);
    let p = cur;
    if (prev && !cut) {
      const before = stickPoses(prev.visual)[k];
      if (before !== name) {
        const old = moving(before, tc, false);
        p = mix(old, cur, antic(prog(lc, 0, 0.3)), antic(prog(lc, 0.05, 0.3)), antic(prog(lc, 0.08, 0.28)));
      }
    }
    let slot = slots[k];
    let flip: number | undefined;
    let walking = false;
    if (k === who && (enterTo || exitTo)) {
      const walkPose = moving('walk', tc, false);
      if (enterTo && lc < walkT + 0.3) {
        const u = prog(lc, 0, walkT);
        const side = enterTo === 'left' ? -1 : 1;
        const dist = side < 0 ? slot.x + 260 * slot.s : W - slot.x + 260 * slot.s;
        slot = { ...slot, x: slot.x + side * dist * (1 - easeOut(u) * 0.15 - u * 0.85) };
        walking = u < 1;
        p = mix(walkPose, cur, antic(prog(lc, walkT - 0.08, 0.3)), antic(prog(lc, walkT - 0.04, 0.3)), antic(prog(lc, walkT, 0.28)));
        if (walking && side > 0) flip = slot.x;
      }
      if (exitTo && lc > b.dur - walkT - 0.25) {
        const u = prog(lc, b.dur - walkT, walkT);
        const side = exitTo === 'left' ? -1 : 1;
        const dist = side < 0 ? slot.x + 260 * slot.s : W - slot.x + 260 * slot.s;
        slot = { ...slot, x: slot.x + side * dist * u * u * 0.4 + side * dist * u * 0.6 };
        walking = u > 0;
        p = mix(cur, walkPose, antic(prog(lc, b.dur - walkT - 0.25, 0.25)), antic(prog(lc, b.dur - walkT - 0.22, 0.25)), antic(prog(lc, b.dur - walkT - 0.2, 0.25)));
        if (walking && side < 0) flip = slot.x;
      }
    }
    // Held things are held up where they can be seen: a torch aimed ahead, a key or cash shown, food or water at the chest.
    if (!walking && !SEATED.includes(name) && name !== 'fall') {
      const mine = props.filter((x) => x.who === k).map((x) => x.kind);
      const hold = (cur2: [number, number], to: [number, number]): [number, number] => [lerp(cur2[0], to[0], 0.85), lerp(cur2[1], to[1], 0.85)];
      if (mine.includes('torch')) p = { ...p, a1: hold(p.a1, [78, 86]) };
      else if (mine.includes('key') || mine.includes('money')) p = { ...p, a1: hold(p.a1, [38, 128]) };
      if (mine.includes('bottle') || mine.includes('food')) p = { ...p, a2: hold(p.a2, [28, 118]) };
    }
    let j = jointsOf(p, slot);
    if (cartoon) j = cartoonHead(j);
    const per = 3.3 + k * 0.7;
    const blink = ((tc + (seed % 7) + k * 1.3) % per) < 0.13;
    const mouth = speaking ? mouthAt(b.say, lc, b.voStart, b.voDur) : 0;
    const tear = props.some((x) => x.kind === 'tear' && x.who === k) || (cartoon && p.face === 'sad' && name === 'sad');
    // Faces never sit still: the eyes glance somewhere new every 0.3-0.8 s, the brows pop up now and then,
    // and a talker's (or a listener's) easy expression shifts between neutral, a smile and focus.
    const ph = tc + k * 0.37;
    const segF = ph / 0.55 + 0.35 * Math.sin(ph * 1.7 + seed + k);
    const segN = Math.floor(segF);
    const segU = segF - segN;
    const dart = { x: (h01(segN * 3.1 + k * 7 + seed) - 0.4) * 7, y: (h01(segN * 5.7 + k * 3 + seed) - 0.5) * 4 };
    const browUp = h01(segN * 9.3 + k + seed) > 0.7 ? Math.sin(Math.PI * Math.min(1, segU * 2.2)) : 0;
    let face = p.face;
    if (cartoon && !walking && (face === 'neutral' || face === 'happy')) {
      const r = h01(segN * 2.3 + k * 5 + seed);
      if (speaking) face = r > 0.6 ? 'happy' : r > 0.45 ? 'focus' : face;
      else if (k !== who) face = r > 0.8 ? 'happy' : face;
    }
    figs.push({ j, pose: walking ? 'walk' : name, face, mouth, blink, color: lit && win === k ? L.hi : L.ink, gear: gear[k], seed: seed + k * 50, shirt: cartoon ? (lit && win === k ? L.hi : shirtOf(k)) : undefined, tear, dart: cartoon ? dart : undefined, browUp: cartoon ? browUp : 0 });
    flips.push(flip);
    moved.push(walking);
  }

  // Camera: wide, close on the speaker, or on one figure; push = a slow push-in; plus the beat's zoom / shake effects.
  // It glides from the last beat's framing to this one's instead of cutting, and never sits dead still.
  const camOf = (bk: StoryBeat, atEnd: boolean): { z: number; fx: number; fy: number; target: number } => {
    const sl = slotsOf(propsOf(bk, n), n).slice(0, n);
    const c = bk.tags.find((x) => x.startsWith('cam='))?.slice(4) ?? 'wide';
    const tg = c === 'c' && n > 2 ? 2 : c === 'b' && duo ? 1 : c === 'a' ? 0 : c === 'close' ? whoOf(bk) : -1;
    let zz = 1;
    let x = W / 2;
    let y = H / 2;
    if (tg >= 0 && sl[tg]) {
      zz = n > 2 ? 1.55 : duo ? 1.35 : 1.5;
      x = sl[tg].x;
      // Frame it so the head lands just under the captions and the big word, feet still in shot.
      let jj = jointsOf(moving(stickPoses(bk.visual)[tg], 0, false), sl[tg]);
      if (cartoon) jj = cartoonHead(jj);
      y = jj.head.y - jj.r + (H / 2 - 770) / zz;
    }
    if (bk.tags.includes('push')) zz *= 1 + 0.1 * easeInOut(atEnd ? 1 : prog(local, 0, bk.dur));
    return { z: zz, fx: x, fy: y, target: tg };
  };
  const now = camOf(b, false);
  const target = now.target;
  let z = now.z;
  let fx = now.fx;
  let fy = now.fy;
  if (prev && !whip) {
    const was = camOf(prev, true);
    const e = easeInOut(prog(local, 0, 0.6));
    z = lerp(was.z, z, e);
    fx = lerp(was.fx, fx, e);
    fy = lerp(was.fy, fy, e);
  }
  z *= 1.04 + 0.025 * Math.sin(t * 0.31 + seed);
  fx += 26 * Math.sin(t * 0.23 + seed);
  fy += 10 * Math.sin(t * 0.17);
  const settle = cut && i > 0 && !whip ? lerp(1.045, 1, easeOut(prog(local, 0, 0.18))) : 1;
  const v = fxView(b, local);

  // 2.5D: a place is a real 3D set the flat figures stand in, filmed by a camera that slowly orbits (the parallax).
  const world3d = !!place && (str(env.fields, 'world') || '3d') === '3d' && str(env.fields, 'bg') !== 'chalk';
  const walking = poses.slice(0, n).some((p, k) => (p === 'walk' || p === 'run') && !moved[k]);
  if (world3d) {
    const look: Stick3dLook = weather === 'night' ? 'night' : L.dusk ? 'dusk' : 'day';
    const out = renderStick3d({
      place,
      look,
      t,
      local,
      knock: b.tags.includes('knock'),
      cam: { x: (fx - W / 2) / PX, y: (GROUND - fy) / PX, zoom: z * settle, yaw: 6 * Math.sin(t * 0.19 + seed) + 2.5 * Math.sin(t * 0.47), pitch: 3 + 1.5 * Math.sin(t * 0.29) },
    });
    ctx.save();
    sky3d(ctx, look, pal, t);
    applyView(ctx, v);
    // A new place whips in from the right.
    if (whip > 0) ctx.translate(whip * W * 0.95, 0);
    ctx.drawImage(out.canvas, 0, 0, W, H);
    ctx.translate(out.ox, out.oy);
    ctx.scale(out.k, out.k);
    ctx.translate(-W / 2, -GROUND);
    if (b.tags.includes('crowd')) passersBy(ctx, L, pal, t, seed, cartoon, BUSY.includes(place) ? place : 'street');
    shadows(ctx, slots);
  } else {
    ctx.save();
    background(ctx, L, str(env.fields, 'bg') === 'chalk', t);
    if (weather === 'night' && !INTERIOR.includes(place)) nightSky(ctx, pal, t);
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(z * settle, z * settle);
    // Keep the zoomed view on the target without showing past the frame edges.
    const cx = Math.min(W - W / (2 * z), Math.max(W / (2 * z), fx));
    const cy = Math.min(H - H / (2 * z), Math.max(H / (2 * z), fy));
    ctx.translate(-cx, -cy);
    applyView(ctx, v);
    // A new place whips in from the right.
    if (whip > 0) ctx.translate(whip * W * 0.95, 0);
    if (place) drawSet(ctx, place, pal, { t, boil, pan: cx - W / 2, local, knock: b.tags.includes('knock') });
    if (b.tags.includes('crowd')) passersBy(ctx, L, pal, t, seed, cartoon, BUSY.includes(place) ? place : 'street');
    ground(ctx, L, slots, walking, t);
  }
  dust(ctx, L, figs, poses.slice(0, n), lc, t);
  const wasSeated = [0, 1, 2].map((k) => !!prev && !cut && SEATED.includes(stickPoses(prev.visual)[k]));
  drawBackProps(ctx, { env, L, b, local, t, slots, joints: figs.map((f) => f.j), wasSeated }, props, poses.slice(0, n));
  // The winner gets a burst of lines when it lights up.
  if (lit) {
    const f = figs[win];
    const k = prog(local, 0.15, 0.5);
    if (k < 1)
      withAlpha(ctx, 1 - k, () => {
        inkStyle(ctx, L.hi, L.lw * 0.6);
        for (let r = 0; r < 10; r++) {
          const a = (r / 10) * Math.PI * 2;
          const c = { x: f.j.neck.x, y: f.j.neck.y };
          const r0 = (200 + 80 * k) * f.j.s;
          const r1 = (260 + 160 * k) * f.j.s;
          inkPath(ctx, [{ x: c.x + Math.cos(a) * r0, y: c.y + Math.sin(a) * r0 }, { x: c.x + Math.cos(a) * r1, y: c.y + Math.sin(a) * r1 }], 300 + r, 0);
        }
      });
  }
  figs.forEach((f, k) => {
    const fl = flips[k];
    if (fl === undefined) drawFigure(ctx, L, f);
    else {
      // Walking toward the left: the figure is drawn mirrored.
      ctx.save();
      ctx.translate(fl * 2, 0);
      ctx.scale(-1, 1);
      drawFigure(ctx, L, f);
      ctx.restore();
    }
  });
  drawFrontProps(ctx, { env, L, b, local, t, slots, joints: figs.map((f) => f.j), wasSeated }, props);
  if (duo) labels(ctx, L, env, slots, lit ? win : -1);
  ctx.restore();
  if (weather && weather !== 'night') weatherFx(ctx, weather, pal, t, local, b.tags.includes('weather=storm'));
  whipLines(ctx, pal, whip);

  // Words on top, outside the camera. The survival HUD across the top; a rule, fact or vote card takes the captions' place.
  const mode = str(env.fields, 'captions') || 'words';
  const big = props.some((p) => p.kind === 'screen');
  const h = hudAt(str(env.fields, 'hud'), beats.slice(0, i + 1).map((x) => x.tags));
  if (h) hud(ctx, L, h, b.tags.some((x) => /^(day|clock|battery)=/.test(x)) && i > 0, local);
  const cardTop = h ? 380 : 300;
  const card = props.find((p) => p.kind === 'rule' || p.kind === 'fact');
  const vote = props.find((p) => p.kind === 'vote');
  if (vote) voteCards(ctx, L, vote.value, local, cardTop);
  else if (card) {
    const n = card.kind === 'rule' ? beats.slice(0, i + 1).filter((x) => stickProps(x.b).some((p) => p.kind === 'rule')).length : 0;
    infoCard(ctx, L, card.kind as 'rule' | 'fact', card.value.replace(/\*/g, ''), n, local, cardTop + 20);
  } else if (mode === 'title' || mode === 'box') {
    const same = prev && prev.headline.trim() === b.headline.trim();
    const a = same || i === 0 ? 1 : easeOut(prog(local, 0, 0.2));
    if (mode === 'box') boxCaption(ctx, L, b.headline, a, h ? 390 : 300);
    else titleCaption(ctx, L, b.headline, a, h ? 370 : 300);
  } else if (mode !== 'off') captions(ctx, env, b, local, big ? 400 : h ? 470 : 430, L.hi);
  bigWord(ctx, L, b.a, local, big ? 1250 : duo ? 590 : target >= 0 ? 650 : 620);
  fxPost(ctx, b, local);
}

registerPreset('stickman', draw);
