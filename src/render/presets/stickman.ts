import { num, screenZoom, storyBeats, str, type StoryBeat } from '@shared/presets';
import { LABEL_AT } from '@shared/sfx';
import { STICK_GEAR, stickPoses, stickProps, type StickPose, type StickProp } from '@shared/stickman';
import { FONT, H, W, clamp01, easeBack, easeInOut, easeOut, fit, font, lerp, markLightFrame, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';
import { mouthAt } from '../char3d';
import { captions } from './narrated';
import { applyView, fxPost, fxView } from './fx';

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
}
const HIGHLIGHT: Record<string, string> = { orange: '#FF6B1A', yellow: '#FFC400', red: '#FF3B30', green: '#22C55E', cyan: '#06B6D4' };

function lookOf(env: Env): Look {
  const bg = str(env.fields, 'bg') || 'paper';
  const h = str(env.fields, 'highlight') || 'orange';
  const hi = h === 'accent' ? env.accent[1] : (HIGHLIGHT[h] ?? HIGHLIGHT.orange);
  const lw = Math.min(28, Math.max(8, num(env.fields, 'line', 16)));
  if (bg === 'dark') return { bg: '#0B0B0E', ink: '#F4F4F2', hi, light: false, lw };
  if (bg === 'chalk') return { bg: '#21392E', ink: '#F0F0E8', hi, light: false, lw };
  if (bg === 'white') return { bg: '#FFFFFF', ink: '#111111', hi, light: true, lw };
  return { bg: '#F3EFE6', ink: '#161514', hi, light: true, lw };
}

interface Slot {
  x: number;
  s: number;
}

const FRONT: StickProp['kind'][] = ['desk', 'laptop', 'monitor', 'chart', 'robot', 'fire', 'coffee'];

/** The props of a beat, with the ones its poses bring (a desk for typing, a phone for the phone pose...). */
function propsOf(b: StoryBeat, duo: boolean): StickProp[] {
  const list = stickProps(b.b);
  const poses = stickPoses(b.visual);
  for (const k of duo ? ([0, 1] as const) : ([0] as const)) {
    const mine = list.filter((p) => p.who === k);
    const has = (kind: string): boolean => mine.some((p) => p.kind === kind);
    if (poses[k] === 'type' && !has('desk') && !has('laptop') && !has('monitor')) list.push({ kind: 'laptop', who: k, value: '' });
    if (poses[k] === 'phone' && !has('phone')) list.push({ kind: 'phone', who: k, value: '' });
    if (poses[k] === 'sleep' && !has('zzz')) list.push({ kind: 'zzz', who: k, value: '' });
    // A laptop or monitor stands on a desk.
    const now = list.filter((p) => p.who === k);
    if (now.some((p) => p.kind === 'laptop' || p.kind === 'monitor') && !now.some((p) => p.kind === 'desk')) list.push({ kind: 'desk', who: k, value: '' });
  }
  return list.filter((p) => duo || p.who === 0);
}

function slotsOf(props: StickProp[], duo: boolean): Slot[] {
  const big = props.some((p) => p.kind === 'screen');
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
}

function drawFigure(ctx: Ctx, L: Look, f: FigDraw): void {
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
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = L.bg;
  ctx.fill();
  inkStyle(ctx, f.color, w);
  ctx.stroke();
  const u = r / HEAD;
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
  ctx.fillStyle = f.color;
  ctx.lineWidth = Math.max(3, w * 0.42);
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
  if (f.face === 'angry') brow(-4, 6, 16);
  else if (f.face === 'sad') brow(6, -3, 16);
  else if (f.face === 'shock') brow(0, 0, 26);
  else if (f.face === 'focus') brow(0, 0, 14);
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
    ctx.stroke();
  } else {
    ctx.moveTo(mx - 9 * u, my);
    ctx.lineTo(mx + 9 * u, my);
    ctx.stroke();
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

function background(ctx: Ctx, L: Look, chalk: boolean): void {
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
function titleCaption(ctx: Ctx, L: Look, text: string, alpha: number): void {
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
      const y = 300 + c.lh * (i + 0.8);
      words.forEach((w, k) => {
        ctx.fillStyle = hot[n++] ? L.hi : L.ink;
        ctx.fillText(w, x, y);
        x += widths[k] + space;
      });
    });
  });
}

function labels(ctx: Ctx, L: Look, env: Env, slots: Slot[], win: number): void {
  const names = str(env.fields, 'labels').split(';').map((x) => x.trim());
  slots.forEach((sl, k) => {
    const n = names[k];
    if (!n) return;
    const c = fit(ctx, n.toUpperCase(), { maxW: 440, maxH: 120, max: 54, min: 30, maxLines: 2, weight: 900, family: FONT.meme });
    font(ctx, c.size, 900, FONT.meme);
    ctx.textAlign = 'center';
    ctx.fillStyle = win === k ? L.hi : L.ink;
    const y0 = GROUND - FIG_H * sl.s - 60 - (c.lines.length - 1) * c.lh;
    c.lines.forEach((l, i) => ctx.fillText(l, sl.x, y0 + i * c.lh));
  });
}

// ── Frame ──────────────────────────────────────────────────────────────────
const sameSlots = (a: Slot[], b: Slot[]): boolean => a.length === b.length && a.every((s, i) => s.x === b[i].x && s.s === b[i].s);

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
}

function gearOf(env: Env): [string[], string[]] {
  const out: [string[], string[]] = [[], []];
  for (const part of str(env.fields, 'gear').split(/[;,]/)) {
    const m = /^\s*(?:([ab])\s*:\s*)?([a-z]+)\s*$/i.exec(part);
    if (!m) continue;
    const g = m[2].toLowerCase();
    if ((STICK_GEAR as readonly string[]).includes(g)) out[m[1]?.toLowerCase() === 'b' ? 1 : 0].push(g);
  }
  return out;
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
  const duo = str(env.fields, 'labels').includes(';') || beats.some((x) => x.visual.includes('/'));
  const n = duo ? 2 : 1;
  const props = propsOf(b, duo);
  const slots = slotsOf(props, duo).slice(0, n);
  const prev = i > 0 ? beats[i - 1] : null;
  const cut = !prev || !sameSlots(slots, slotsOf(propsOf(prev, duo), duo).slice(0, n));
  const seed = seedOf(str(env.fields, 'beats').slice(0, 60));
  const who = b.tags.includes('who=b') && duo ? 1 : 0;
  const winTag = b.tags.find((x) => x === 'win' || x.startsWith('win='));
  const win = winTag ? (winTag === 'win=b' && duo ? 1 : 0) : -1;
  const lit = win >= 0 && local >= 0.15;
  const gear = gearOf(env);
  const poses = stickPoses(b.visual);
  const talking = !!b.say && b.voDur > 0 && local >= b.voStart && local <= b.voStart + b.voDur;

  // Each figure's pose: moving into this beat's pose from the last one's.
  const figs: FigDraw[] = [];
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
    const j = jointsOf(p, slots[k]);
    const per = 3.3 + k * 0.7;
    const blink = ((tc + (seed % 7) + k * 1.3) % per) < 0.13;
    const mouth = speaking ? mouthAt(b.say, lc, b.voStart, b.voDur) : 0;
    figs.push({ j, pose: name, face: p.face, mouth, blink, color: lit && win === k ? L.hi : L.ink, gear: gear[k], seed: seed + k * 50 });
  }

  // Camera: wide, close on the speaker, or on one figure; push = a slow push-in; plus the beat's zoom / shake effects.
  const cam = b.tags.find((x) => x.startsWith('cam='))?.slice(4) ?? 'wide';
  const target = cam === 'b' && duo ? 1 : cam === 'a' ? 0 : cam === 'close' ? who : -1;
  let z = 1;
  let fx = W / 2;
  let fy = H / 2;
  if (target >= 0 && figs[target]) {
    z = duo ? 1.35 : 1.5;
    fx = slots[target].x;
    // Frame it so the head lands just under the captions and the big word, feet still in shot.
    const j = figs[target].j;
    fy = j.head.y - j.r + (H / 2 - 770) / z;
  }
  if (b.tags.includes('push')) z *= 1 + 0.1 * easeInOut(prog(local, 0, b.dur));
  const settle = cut && i > 0 ? lerp(1.045, 1, easeOut(prog(local, 0, 0.18))) : 1;
  const v = fxView(b, local);

  ctx.save();
  background(ctx, L, str(env.fields, 'bg') === 'chalk');
  ctx.restore();
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(z * settle, z * settle);
  // Keep the zoomed view on the target without showing past the frame edges.
  const cx = Math.min(W - W / (2 * z), Math.max(W / (2 * z), fx));
  const cy = Math.min(H - H / (2 * z), Math.max(H / (2 * z), fy));
  ctx.translate(-cx, -cy);
  applyView(ctx, v);
  const walking = poses.slice(0, n).some((p) => p === 'walk' || p === 'run');
  ground(ctx, L, slots, walking, t);
  const wasSeated = [0, 1].map((k) => !!prev && !cut && SEATED.includes(stickPoses(prev.visual)[k]));
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
  for (const f of figs) drawFigure(ctx, L, f);
  drawFrontProps(ctx, { env, L, b, local, t, slots, joints: figs.map((f) => f.j), wasSeated }, props);
  if (duo) labels(ctx, L, env, slots, lit ? win : -1);
  ctx.restore();

  // Words on top, outside the camera.
  const mode = str(env.fields, 'captions') || 'words';
  const big = props.some((p) => p.kind === 'screen');
  if (mode === 'title') {
    const same = prev && prev.headline.trim() === b.headline.trim();
    titleCaption(ctx, L, b.headline, same || i === 0 ? 1 : easeOut(prog(local, 0, 0.2)));
  } else if (mode !== 'off') captions(ctx, env, b, local, big ? 400 : 430, L.hi);
  bigWord(ctx, L, b.a, local, big ? 1250 : duo ? 590 : target >= 0 ? 650 : 620);
  fxPost(ctx, b, local);
}

registerPreset('stickman', draw);
