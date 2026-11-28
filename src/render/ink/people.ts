import type { Ctx } from '../engine';
import { INK_CAST, INK_FIXED, type InkLook, type InkMove, type InkPalette, type InkProp, type InkRole } from '@shared/ink';
import { FINE, INK, dots, glint, line, oval, rng, seedOf, setZoom, shape, split, ticks, tone, type Pt } from './pen';
import { drawProp } from './props';

// The ink cartoon's cast: caricatures, not anatomy. Big lumpy heads with small features crowded in the middle, one
// silhouette and one feature each (a walrus moustache, a gold tooth, a bun), jowls and folds drawn as structure.
// Each one is a jointed cut-out: legs, torso, two arms with hands, a head per expression. A pose change snaps in and
// overshoots on a spring; the face changes every 0.3-0.8 s while it is on screen. Origin = between the feet, facing
// right (+x); the caller mirrors it to face left.

type Build = InkLook['build'];
interface Body {
  /** Feet to hips. */
  legs: number;
  torsoW: number;
  torsoH: number;
  headW: number;
  headH: number;
  arm: number;
  /** Upper arm, forearm. */
  lu: number;
  lf: number;
  belly: number;
}
const BODY: Record<Build, Body> = {
  huge: { legs: 250, torsoW: 560, torsoH: 430, headW: 300, headH: 330, arm: 100, lu: 190, lf: 180, belly: 0.22 },
  big: { legs: 300, torsoW: 430, torsoH: 410, headW: 280, headH: 320, arm: 78, lu: 190, lf: 180, belly: 0.1 },
  mid: { legs: 330, torsoW: 330, torsoH: 370, headW: 260, headH: 300, arm: 58, lu: 180, lf: 170, belly: 0.04 },
  thin: { legs: 410, torsoW: 250, torsoH: 410, headW: 230, headH: 320, arm: 44, lu: 200, lf: 190, belly: -0.04 },
  short: { legs: 210, torsoW: 320, torsoH: 300, headW: 270, headH: 290, arm: 58, lu: 150, lf: 140, belly: 0.12 },
};

/** The top of a cast member's head above the ground, for framing. */
export function heightOf(name: string): number {
  const b = BODY[(INK_CAST[name] ?? INK_CAST.bubba).build];
  return b.legs + b.torsoH + b.headH * 0.82;
}
/** Where the head's centre is (above the ground). */
export function headOf(name: string): number {
  const b = BODY[(INK_CAST[name] ?? INK_CAST.bubba).build];
  return b.legs + b.torsoH + b.headH * 0.36;
}
export function widthOf(name: string): number {
  return BODY[(INK_CAST[name] ?? INK_CAST.bubba).build].torsoW;
}

// ── Poses ──────────────────────────────────────────────────────────────────
interface Arm {
  /** From hanging straight down, + toward the way they face. */
  sh: number;
  el: number;
}
interface Pose {
  lean: number;
  bob: number;
  tilt: number;
  /** Head pushed back (shock) or forward (anger), px. */
  push: number;
  front: Arm;
  back: Arm;
  shrug: number;
  /** Fists instead of open hands. */
  fist?: boolean;
}

const P = (lean: number, tilt: number, front: [number, number], back: [number, number], extra: Partial<Pose> = {}): Pose => ({ lean, bob: 0, tilt, push: 0, front: { sh: front[0], el: front[1] }, back: { sh: back[0], el: back[1] }, shrug: 0, ...extra });

const POSES: Record<InkMove, Pose> = {
  idle: P(0, 0, [0.1, 0.18], [-0.08, 0.22]),
  talk: P(0.02, -0.02, [0.12, 0.25], [0.75, 1.25]),
  point: P(0.05, -0.04, [0.1, 0.2], [1.5, 0.05]),
  shock: P(-0.12, -0.16, [-2.1, -0.6], [2.1, 0.6], { push: -26, shrug: 22 }),
  anger: P(0.12, 0.06, [0.25, 0.45], [2.75, 0.55], { push: 22, fist: true }),
  smug: P(-0.04, -0.14, [-0.55, 1.95], [0.55, -1.95]),
  joy: P(-0.05, -0.1, [-2.6, -0.25], [2.6, 0.25], { bob: -18 }),
  grief: P(0.07, 0.3, [0.02, 0.06], [0.02, 0.1], { shrug: -16 }),
  think: P(0, -0.08, [0.55, 1.3], [0.5, 2.55]),
  shrug: P(0, 0.08, [-0.55, 1.55], [0.55, -1.55], { shrug: 26 }),
  hold: P(0.04, 0.02, [0.75, 0.95], [0.65, 1.05]),
  phone: P(0, 0.06, [0.1, 0.2], [0.55, 2.75]),
  fear: P(-0.1, 0.04, [1.15, 1.6], [1.3, 1.5], { push: -14, shrug: 14 }),
  laugh: P(-0.08, -0.22, [0.7, 1.7], [0.3, 0.4], { push: -12 }),
  facepalm: P(0.08, 0.22, [0.15, 0.25], [1.35, 2.45]),
  dig: P(0.24, 0.12, [1.05, 0.5], [0.95, 0.4]),
};

const mixArm = (a: Arm, b: Arm, k: number): Arm => ({ sh: a.sh + (b.sh - a.sh) * k, el: a.el + (b.el - a.el) * k });
function mixPose(a: Pose, b: Pose, k: number): Pose {
  const m = (x: number, y: number): number => x + (y - x) * k;
  return { lean: m(a.lean, b.lean), bob: m(a.bob, b.bob), tilt: m(a.tilt, b.tilt), push: m(a.push, b.push), shrug: m(a.shrug, b.shrug), front: mixArm(a.front, b.front, k), back: mixArm(a.back, b.back, k), fist: k > 0.5 ? b.fist : a.fist };
}

/** A pose change snaps in within a frame or two and overshoots on a spring. */
const spring = (t: number): number => (t <= 0 ? 0 : 1 - Math.exp(-t * 11) * Math.cos(t * 17));

/** The move's own life: talking hands, a shaking fist, a laughing bounce, a dig. */
function alive(pose: Pose, move: InkMove, t: number, seed: number): Pose {
  const p = { ...pose, front: { ...pose.front }, back: { ...pose.back } };
  const s = Math.sin;
  p.bob += s(t * 2.1 + seed) * 3;
  if (move === 'talk') {
    p.back.sh += s(t * 3.1 + seed) * 0.28;
    p.back.el += s(t * 4.3 + seed) * 0.25;
    p.tilt += s(t * 2.7) * 0.03;
  } else if (move === 'anger') {
    p.back.sh += s(t * 19) * 0.08;
    p.lean += s(t * 3.2) * 0.02;
    p.bob += s(t * 6.4) * 4;
  } else if (move === 'laugh') {
    p.bob += Math.abs(s(t * 11)) * -10;
    p.tilt += s(t * 11) * 0.03;
  } else if (move === 'fear') {
    p.lean += s(t * 23) * 0.012;
  } else if (move === 'joy') {
    p.bob += -Math.abs(s(t * 6)) * 22;
  } else if (move === 'dig') {
    const c = (s(t * 3.4) + 1) / 2;
    p.lean = 0.08 + c * 0.3;
    p.front.sh = 0.6 + c * 0.7;
    p.back.sh = 0.5 + c * 0.7;
  } else if (move === 'think') {
    p.tilt += s(t * 1.3) * 0.04;
  } else if (move === 'grief') {
    p.bob += s(t * 1.2) * 3;
  }
  return p;
}

// ── Faces ──────────────────────────────────────────────────────────────────
type Face = 'neutral' | 'blink' | 'anger' | 'smug' | 'joy' | 'shock' | 'fear' | 'grief' | 'glance';
interface FaceSet {
  brow: number;
  /** Inner ends of the brows: - pushed down (anger), + up (worry). */
  inner: number;
  eye: number;
  pupil: number;
  mouth: number;
  curve: number;
  /** Side-of-the-mouth smirk. */
  smirk?: boolean;
  look: number;
}
const FACES: Record<Face, FaceSet> = {
  neutral: { brow: 0, inner: 0, eye: 1, pupil: 1, mouth: 0, curve: 0, look: 0 },
  blink: { brow: 0, inner: 0, eye: 0, pupil: 1, mouth: 0, curve: 0, look: 0 },
  glance: { brow: 0.2, inner: 0, eye: 1, pupil: 1, mouth: 0, curve: -0.1, look: -1 },
  anger: { brow: -0.6, inner: -1, eye: 0.75, pupil: 0.55, mouth: 0.35, curve: -0.7, look: 0 },
  smug: { brow: 0.35, inner: 0.1, eye: 0.5, pupil: 1, mouth: 0, curve: 0.65, smirk: true, look: 0 },
  joy: { brow: 0.6, inner: 0.2, eye: 0.38, pupil: 1, mouth: 0.75, curve: 1, look: 0 },
  shock: { brow: 1.2, inner: 0.4, eye: 1.85, pupil: 0.35, mouth: 0.95, curve: -0.1, look: 0 },
  fear: { brow: 0.9, inner: 1, eye: 1.4, pupil: 0.5, mouth: 0.4, curve: -0.6, look: -0.5 },
  grief: { brow: 0.3, inner: 1, eye: 0.45, pupil: 1, mouth: 0.1, curve: -0.9, look: 0.6 },
};
const MOVE_FACE: Record<InkMove, Face[]> = {
  idle: ['neutral', 'glance', 'neutral'],
  talk: ['neutral', 'smug', 'neutral', 'glance'],
  point: ['anger', 'neutral', 'smug'],
  shock: ['shock', 'shock', 'fear'],
  anger: ['anger', 'anger', 'shock'],
  smug: ['smug', 'joy', 'smug'],
  joy: ['joy', 'joy', 'smug'],
  grief: ['grief', 'grief', 'fear'],
  think: ['neutral', 'glance', 'smug'],
  shrug: ['smug', 'neutral', 'grief'],
  hold: ['neutral', 'smug', 'joy'],
  phone: ['neutral', 'glance', 'shock'],
  fear: ['fear', 'shock', 'fear'],
  laugh: ['joy', 'joy', 'smug'],
  facepalm: ['grief', 'anger', 'grief'],
  dig: ['anger', 'neutral', 'grief'],
};

/** The face at this moment: the move's faces in turn, each held 0.3-0.8 s, with blinks. */
function faceAt(move: InkMove, local: number, seed: number): FaceSet {
  const list = MOVE_FACE[move];
  const r = rng(seed * 31 + 5);
  let at = 0;
  let k = 0;
  while (at + 0.3 + r() * 0.5 < local) {
    at += 0.3 + r() * 0.5;
    k++;
  }
  // The first face is the move's own and holds the longest: the snap reads.
  const f = FACES[list[k === 0 ? 0 : k % list.length]];
  const blink = (local + seed * 1.7) % (2.6 + (seed % 1)) < 0.11 && f.eye > 0.2 && f.eye < 1.5;
  return blink ? { ...f, eye: 0 } : f;
}

// ── Drawing ────────────────────────────────────────────────────────────────
export interface Actor {
  name: string;
  move: InkMove;
  from: InkMove | null;
  /** Seconds into the line. */
  local: number;
  /** Seconds overall. */
  t: number;
  /** Mouth open from talking, 0-1. */
  talk: number;
  facing: 1 | -1;
  prop?: InkProp;
  /** In shadow (night, or the dark side of a room). */
  dim?: number;
}

const roleColor = (pal: InkPalette, r: InkRole | undefined, fallback = '#888'): string => (!r ? fallback : r in INK_FIXED ? INK_FIXED[r as keyof typeof INK_FIXED] : ((pal as unknown as Record<string, string>)[r] ?? fallback));

/** Arm end points from the shoulder. */
function armPts(s: Pt, a: Arm, lu: number, lf: number): { e: Pt; h: Pt } {
  const e: Pt = [s[0] + Math.sin(a.sh) * lu, s[1] + Math.cos(a.sh) * lu];
  const f = a.sh + a.el;
  return { e, h: [e[0] + Math.sin(f) * lf, e[1] + Math.cos(f) * lf] };
}

/** A sausage around a polyline (an arm or a leg), width w (tapering to w*end). */
function limb(pts: Pt[], w: number, end = 0.85): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const h = (w * (1 - ((1 - end) * i) / Math.max(1, pts.length - 1))) / 2;
    left.push([pts[i][0] - dy * h, pts[i][1] + dx * h]);
    right.push([pts[i][0] + dy * h, pts[i][1] - dx * h]);
  }
  return [...left, ...right.reverse()];
}

function hand(ctx: Ctx, h: Pt, dir: number, size: number, fill: string, shade: string, fist: boolean, ring: boolean, seed: number): void {
  ctx.save();
  ctx.translate(h[0], h[1]);
  ctx.rotate(dir);
  const s = size;
  if (fist) {
    const p = shape(ctx, oval(0, s * 0.35, s * 0.55, s * 0.5, 12), fill, { w: 3.6, seed });
    split(ctx, p, shade, -s, s * 0.6, s, s * 0.2);
    for (let i = 0; i < 3; i++) line(ctx, [[-s * 0.35 + i * s * 0.28, s * 0.62], [-s * 0.3 + i * s * 0.28, s * 0.4]], { w: 2.4, seed: seed + i });
  } else {
    // Palm, padded fingers with knuckle creases, a short nail on each tip, the thumb.
    const pts: Pt[] = [
      [-s * 0.45, 0],
      [s * 0.45, 0],
      [s * 0.55, s * 0.55],
      [s * 0.42, s * 1.12],
      [s * 0.18, s * 1.2],
      [-s * 0.06, s * 1.22],
      [-s * 0.3, s * 1.15],
      [-s * 0.5, s * 0.6],
    ];
    const p = shape(ctx, pts, fill, { w: 3.6, seed });
    split(ctx, p, shade, -s, s * 0.2, s * 0.2, s * 1.4);
    for (let i = 0; i < 3; i++) {
      const x = -s * 0.22 + i * s * 0.24;
      line(ctx, [[x, s * 0.72], [x + s * 0.02, s * 1.12]], { w: 2.2, seed: seed + i });
      line(ctx, [[x - s * 0.06, s * 0.6], [x + s * 0.06, s * 0.6]], { w: 1.6, color: FINE, seed: seed + 9 + i });
      ctx.fillStyle = tone(fill, 0.25);
      ctx.beginPath();
      ctx.ellipse(x + s * 0.08, s * 1.1, s * 0.05, s * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    shape(ctx, [[s * 0.4, s * 0.15], [s * 0.82, s * 0.45], [s * 0.78, s * 0.72], [s * 0.42, s * 0.6]], fill, { w: 3.2, seed: seed + 4 });
    if (ring) {
      ctx.fillStyle = '#F2C14A';
      ctx.fillRect(-s * 0.06, s * 0.82, s * 0.2, s * 0.1);
    }
  }
  ctx.restore();
}

/** Pattern inside a clip: plaid, stripes, dots or argyle, in the pattern colour. */
function pattern(ctx: Ctx, clip: Path2D, kind: InkLook['pattern'], color: string, x: number, y: number, w: number, h: number, seed: number): void {
  if (!kind) return;
  ctx.save();
  ctx.clip(clip);
  ctx.globalAlpha = 0.85;
  if (kind === 'plaid') {
    const step = 64;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.32;
    for (let xx = x - step; xx < x + w + step; xx += step) ctx.fillRect(xx, y, step * 0.38, h);
    for (let yy = y; yy < y + h; yy += step) ctx.fillRect(x, yy, w, step * 0.38);
    ctx.globalAlpha = 0.7;
    for (let xx = x - step; xx < x + w + step; xx += step) line(ctx, [[xx + step * 0.7, y], [xx + step * 0.7 + 4, y + h]], { w: 2, color, seed: seed + xx, pressure: 0.2, taper: false });
    for (let yy = y; yy < y + h; yy += step) line(ctx, [[x, yy + step * 0.7], [x + w, yy + step * 0.7 + 3]], { w: 2, color, seed: seed + yy, pressure: 0.2, taper: false });
  } else if (kind === 'stripes') {
    ctx.fillStyle = color;
    for (let yy = y; yy < y + h; yy += 56) ctx.fillRect(x, yy, w, 20);
  } else if (kind === 'dots') {
    ctx.fillStyle = color;
    for (let yy = y; yy < y + h; yy += 46) for (let xx = x + ((yy / 46) % 2) * 23; xx < x + w; xx += 46) {
      ctx.beginPath();
      ctx.arc(xx, yy, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'argyle') {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.45;
    const d = 70;
    for (let yy = y; yy < y + h + d; yy += d) for (let xx = x + ((yy / d) % 2) * (d / 2); xx < x + w + d; xx += d) {
      ctx.beginPath();
      ctx.moveTo(xx, yy - d / 2);
      ctx.lineTo(xx + d / 2, yy);
      ctx.lineTo(xx, yy + d / 2);
      ctx.lineTo(xx - d / 2, yy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The head: lumpy mass, crowded features, hair, hat, glasses. Centre at (0,0), facing right. */
function head(ctx: Ctx, L: InkLook, b: Body, pal: InkPalette, f: FaceSet, talk: number, seed: number, hairColor: string): void {
  const w = b.headW;
  const h = b.headH;
  const r = rng(seed + 11);
  const lump = (): number => 1 + (r() - 0.5) * 0.08;
  // The outline: cranium on top, jowls below, the chin forward.
  const prof: Record<InkLook['head'], Array<[number, number]>> = {
    jaw: [[-0.38, -0.46], [0.02, -0.52], [0.36, -0.42], [0.5, -0.12], [0.56, 0.2], [0.48, 0.46], [0.18, 0.56], [-0.22, 0.54], [-0.5, 0.36], [-0.54, 0.02], [-0.5, -0.26]],
    egg: [[-0.44, -0.4], [0, -0.54], [0.42, -0.42], [0.52, -0.06], [0.42, 0.28], [0.22, 0.5], [-0.02, 0.56], [-0.28, 0.46], [-0.44, 0.22], [-0.5, -0.08]],
    long: [[-0.36, -0.46], [0, -0.52], [0.34, -0.44], [0.44, -0.1], [0.46, 0.24], [0.4, 0.5], [0.16, 0.6], [-0.18, 0.56], [-0.4, 0.34], [-0.44, -0.08]],
    round: [[-0.46, -0.36], [-0.04, -0.52], [0.42, -0.38], [0.54, 0], [0.46, 0.36], [0.14, 0.54], [-0.24, 0.5], [-0.5, 0.3], [-0.54, -0.04]],
  };
  const outline = prof[L.head].map(([x, y]) => [x * w * lump(), y * h * lump()] as Pt);
  const skin = pal.skin;
  // Ear on the far side.
  shape(ctx, oval(-w * 0.47, h * 0.02, w * 0.08, h * 0.11, 10), skin, { w: 3.4, seed: seed + 2 });
  const p = shape(ctx, outline, skin, { w: 4.4, seed: seed + 3 });
  split(ctx, p, pal.skinDark, -w * 0.2, -h, -w * 0.5, h);
  ctx.save();
  ctx.clip(p);
  ctx.fillStyle = pal.skinLit;
  ctx.beginPath();
  ctx.ellipse(w * 0.16, -h * 0.28, w * 0.18, h * 0.08, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ticks(ctx, p, -w * 0.5, -h * 0.1, w, h * 0.6, 18, { len: 9, color: FINE, seed: seed + 4, w: 1.5 });

  // Features crowded toward the face side, a little up from the middle.
  const fx = w * 0.12;
  const ey = -h * 0.02;
  const gap = w * 0.17;
  const er = w * 0.072;
  for (const side of [-1, 1]) {
    const x = fx + side * gap * (side < 0 ? 0.85 : 1);
    const open = f.eye;
    if (open <= 0.05) line(ctx, [[x - er, ey], [x, ey + er * 0.35], [x + er, ey]], { w: 3.8, seed: seed + 20 + side });
    else {
      const ry = er * Math.min(1.9, open) * (open > 1.2 ? 1 : 0.85);
      const rx = er * (open > 1.2 ? 1.35 : 1);
      ctx.fillStyle = '#E6DCF4';
      ctx.beginPath();
      ctx.ellipse(x, ey, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // Pupil (pinprick in shock), looking where the face looks.
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x + er * 0.25 + f.look * er * 0.3, ey + Math.abs(f.look) * er * 0.15, er * 0.38 * f.pupil, 0, Math.PI * 2);
      ctx.fill();
      line(ctx, oval(x, ey, rx, ry, 12), { w: 2.2, closed: true, seed: seed + 22 + side });
      // Hooded lid with a thick lash line, unless wide open.
      if (open < 1.2) {
        const lid = ey - ry + ry * 2 * (1 - Math.min(1, open)) * 0.5;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, ey, rx + 2, ry + 2, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = pal.skinDark;
        ctx.fillRect(x - rx - 3, ey - ry - 3, rx * 2 + 6, lid - (ey - ry) + ry * 0.35);
        ctx.restore();
        line(ctx, [[x - rx * 1.15, lid + ry * 0.3], [x, lid + ry * 0.12], [x + rx * 1.15, lid + ry * 0.32]], { w: 5, seed: seed + 24 + side });
      }
      // Bags under the eyes (stacked).
      line(ctx, [[x - rx * 0.8, ey + ry + 6], [x, ey + ry + 11], [x + rx * 0.8, ey + ry + 6]], { w: 1.8, color: FINE, seed: seed + 26 + side });
      if (L.build === 'huge' || L.head === 'egg') line(ctx, [[x - rx * 0.6, ey + ry + 18], [x, ey + ry + 22], [x + rx * 0.6, ey + ry + 18]], { w: 1.4, color: FINE, seed: seed + 28 + side });
    }
    // Brows: height and the inner end.
    const by = ey - er * 1.7 - f.brow * er * 0.9;
    const inner = side < 0 ? 1 : -1;
    const bx0 = x - er * 1.2;
    const bx1 = x + er * 1.2;
    const innerY = by + (-f.inner * er * 0.7);
    const outerY = by + f.inner * er * 0.25;
    const smirkUp = f.smirk && side > 0 ? -er * 0.6 : 0;
    const pts: Pt[] = inner > 0 ? [[bx0, outerY + smirkUp], [x, by - 3 + smirkUp], [bx1, innerY + smirkUp]] : [[bx0, innerY + smirkUp], [x, by - 3 + smirkUp], [bx1, outerY + smirkUp]];
    line(ctx, pts, { w: L.build === 'huge' || L.build === 'big' ? 9 : 6.5, seed: seed + 30 + side, color: roleColor(pal, L.hairColor, INK) === '#F7F2E8' ? '#B8B0A8' : INK });
  }
  if (L.glasses) {
    for (const side of [-1, 1]) line(ctx, oval(fx + side * gap * (side < 0 ? 0.85 : 1), ey, er * 1.9, er * 1.6, 12), { w: 3.6, closed: true, seed: seed + 40 + side });
    line(ctx, [[fx - gap * 0.85 + er * 1.9, ey - 4], [fx + gap - er * 1.9, ey - 4]], { w: 3, seed: seed + 43 });
  }

  // Nose: sticks out toward the face side.
  const ny = ey + h * 0.14;
  const noses: Record<InkLook['nose'], Pt[]> = {
    bulb: [[fx - w * 0.04, ey + h * 0.02], [fx + w * 0.12, ny - h * 0.02], [fx + w * 0.16, ny + h * 0.06], [fx + w * 0.04, ny + h * 0.09], [fx - w * 0.08, ny + h * 0.05]],
    long: [[fx - w * 0.02, ey], [fx + w * 0.22, ny + h * 0.06], [fx + w * 0.14, ny + h * 0.1], [fx - w * 0.04, ny + h * 0.05]],
    hook: [[fx - w * 0.02, ey - h * 0.02], [fx + w * 0.14, ny - h * 0.04], [fx + w * 0.16, ny + h * 0.06], [fx + w * 0.04, ny + h * 0.08], [fx - w * 0.06, ny + h * 0.04]],
    button: [[fx, ny - h * 0.04], [fx + w * 0.08, ny], [fx + w * 0.05, ny + h * 0.05], [fx - w * 0.05, ny + h * 0.04]],
  };
  const np = shape(ctx, noses[L.nose], pal.skin, { w: 3.6, seed: seed + 50 });
  split(ctx, np, pal.skinDark, fx - w * 0.2, ny + h * 0.2, fx + w * 0.3, ny + h * 0.02);
  // Flared nostril in anger.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(fx + w * 0.04, ny + h * 0.065, w * (f.inner < -0.5 ? 0.03 : 0.018), h * 0.012, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Folds from the nose wings around the mouth, the jowls, a second chin.
  line(ctx, [[fx - w * 0.1, ny + h * 0.05], [fx - w * 0.16, ny + h * 0.16], [fx - w * 0.13, ny + h * 0.28]], { w: 2.6, seed: seed + 52 });
  line(ctx, [[fx + w * 0.2, ny + h * 0.06], [fx + w * 0.26, ny + h * 0.17], [fx + w * 0.24, ny + h * 0.27]], { w: 2.2, seed: seed + 53 });
  if (L.build === 'huge' || L.build === 'big' || L.head === 'jaw') line(ctx, [[-w * 0.2, h * 0.5], [w * 0.05, h * 0.56], [w * 0.3, h * 0.48]], { w: 2.4, color: FINE, seed: seed + 54 });

  // Mouth: open from the face and from talking; the jaw drops with it.
  const my = ny + h * 0.2;
  const open = Math.max(f.mouth, talk * 0.7);
  const mw = w * (0.16 + Math.max(0, f.curve) * 0.06);
  const mx = fx + w * 0.04 + (f.smirk ? w * 0.04 : 0);
  if (open < 0.12) {
    const c = f.curve * h * 0.05;
    const sm = f.smirk ? -h * 0.03 : 0;
    line(ctx, [[mx - mw, my - c * 0.6], [mx, my + c * 0.3], [mx + mw, my - c + sm]], { w: 4.2, seed: seed + 60 });
  } else {
    const oh = h * 0.18 * open;
    const curveY = f.curve * h * 0.04;
    const mouth: Pt[] = [
      [mx - mw, my - curveY],
      [mx - mw * 0.4, my - h * 0.015],
      [mx + mw * 0.4, my - h * 0.015],
      [mx + mw, my - curveY],
      [mx + mw * 0.55, my + oh * 0.9],
      [mx - mw * 0.55, my + oh * 0.9],
    ];
    const mp = shape(ctx, mouth, '#3A0F14', { w: 4.2, seed: seed + 61 });
    ctx.save();
    ctx.clip(mp);
    // Top teeth, a tongue, the bottom teeth on a big grin, one gold tooth.
    ctx.fillStyle = '#FFF6E6';
    ctx.fillRect(mx - mw, my - h * 0.03, mw * 2, Math.min(oh * 0.32, h * 0.05));
    if (f.curve > 0.6 || f.inner < -0.5) ctx.fillRect(mx - mw, my + oh * 0.9 - Math.min(oh * 0.28, h * 0.04), mw * 2, h * 0.05);
    if (L.goldTooth) {
      ctx.fillStyle = '#F2C14A';
      ctx.fillRect(mx + mw * 0.2, my - h * 0.03, mw * 0.28, Math.min(oh * 0.32, h * 0.05));
    }
    ctx.fillStyle = '#C9505A';
    ctx.beginPath();
    ctx.ellipse(mx, my + oh * 0.85, mw * 0.55, oh * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    for (let i = -2; i <= 2; i++) line(ctx, [[mx + i * mw * 0.3, my - h * 0.03], [mx + i * mw * 0.3, my - h * 0.03 + Math.min(oh * 0.3, h * 0.045)]], { w: 1.4, color: FINE, seed: seed + 62 + i });
  }

  // Facial hair: solid with barbed edges, or stubble dots over the jaw.
  const hc = hairColor;
  if (L.beard === 'stubble') dots(ctx, p, -w * 0.3, ny, w * 0.85, h * 0.45, 140, { r: 1.6, color: 'rgba(23,11,8,0.55)', seed: seed + 70 });
  if (L.beard === 'walrus') {
    const pts: Pt[] = [[mx - mw * 1.5, my + h * 0.02], [mx - mw * 0.9, ny + h * 0.07], [mx, ny + h * 0.1], [mx + mw * 1.1, ny + h * 0.07], [mx + mw * 1.6, my + h * 0.04], [mx + mw * 1.2, my + h * 0.1], [mx + mw * 0.6, my + h * 0.06], [mx, my + h * 0.09], [mx - mw * 0.7, my + h * 0.06], [mx - mw * 1.2, my + h * 0.1]];
    const mp = shape(ctx, pts, hc, { w: 3.4, seed: seed + 71 });
    ticks(ctx, mp, mx - mw * 1.6, ny, mw * 3.2, h * 0.2, 26, { len: 12, angle: 1.4, color: 'rgba(23,11,8,0.5)', seed: seed + 72 });
  }
  if (L.beard === 'pencil') line(ctx, [[mx - mw * 0.9, my - h * 0.04], [mx, my - h * 0.055], [mx + mw * 0.95, my - h * 0.045]], { w: 4.5, seed: seed + 73 });
  if (L.beard === 'full') {
    const pts: Pt[] = [[-w * 0.46, -h * 0.02], [-w * 0.3, h * 0.46], [w * 0.1, h * 0.66], [w * 0.44, h * 0.44], [w * 0.52, h * 0.12], [mx + mw, my + h * 0.06], [mx - mw, my + h * 0.06], [-w * 0.2, h * 0.08]];
    shape(ctx, pts, hc, { w: 3.6, seed: seed + 74 });
  }

  // Hair and hats over the cranium.
  hairOf(ctx, L, w, h, hc, seed);
}

function hairOf(ctx: Ctx, L: InkLook, w: number, h: number, hc: string, seed: number): void {
  const top = -h * 0.5;
  const s = { w: 3.8, seed: seed + 80 };
  switch (L.hair) {
    case 'slick': {
      const p = shape(ctx, [[-w * 0.52, h * 0.05], [-w * 0.5, -h * 0.4], [-w * 0.1, -h * 0.58], [w * 0.34, -h * 0.5], [w * 0.4, -h * 0.3], [w * 0.05, -h * 0.36], [-w * 0.3, -h * 0.25], [-w * 0.4, h * 0.05]], hc, s);
      for (let i = 0; i < 5; i++) line(ctx, [[-w * 0.42 + i * w * 0.14, -h * 0.5], [-w * 0.3 + i * w * 0.15, -h * 0.4], [-w * 0.35 + i * w * 0.14, -h * 0.28]], { w: 1.6, color: 'rgba(255,255,255,0.25)', seed: seed + 81 + i });
      void p;
      break;
    }
    case 'mullet':
      shape(ctx, [[-w * 0.56, h * 0.4], [-w * 0.52, -h * 0.35], [-w * 0.05, -h * 0.58], [w * 0.38, -h * 0.46], [w * 0.36, -h * 0.3], [-w * 0.2, -h * 0.3], [-w * 0.36, h * 0.0], [-w * 0.42, h * 0.42]], hc, s);
      break;
    case 'horseshoe':
      shape(ctx, [[-w * 0.56, h * 0.08], [-w * 0.52, -h * 0.24], [-w * 0.36, -h * 0.3], [-w * 0.4, -h * 0.05], [-w * 0.44, h * 0.1]], hc, s);
      shape(ctx, [[w * 0.42, -h * 0.26], [w * 0.5, -h * 0.12], [w * 0.46, -h * 0.02], [w * 0.38, -h * 0.14]], hc, { ...s, seed: seed + 82 });
      line(ctx, [[-w * 0.1, -h * 0.42], [w * 0.1, -h * 0.44]], { w: 1.8, color: FINE, seed: seed + 83 });
      break;
    case 'buzz': {
      const p = new Path2D();
      p.ellipse(0, -h * 0.25, w * 0.54, h * 0.32, 0, Math.PI, 0);
      ctx.save();
      ctx.clip(p);
      ctx.fillStyle = hc;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(-w, top - 20, w * 2, h * 0.35);
      ctx.restore();
      dots(ctx, p, -w * 0.5, top, w, h * 0.3, 120, { r: 1.5, color: 'rgba(23,11,8,0.5)', seed: seed + 84 });
      break;
    }
    case 'curly':
      for (let i = 0; i < 9; i++) shape(ctx, oval(-w * 0.44 + i * w * 0.11, -h * 0.42 + Math.sin(i) * 10, w * 0.1, h * 0.09, 9), hc, { w: 3, seed: seed + 85 + i });
      break;
    case 'bob':
      shape(ctx, [[-w * 0.6, h * 0.3], [-w * 0.58, -h * 0.36], [-w * 0.1, -h * 0.6], [w * 0.44, -h * 0.44], [w * 0.5, -h * 0.1], [w * 0.2, -h * 0.3], [-w * 0.3, -h * 0.28], [-w * 0.4, h * 0.1], [-w * 0.32, h * 0.34]], hc, s);
      break;
    case 'bowl':
      shape(ctx, [[-w * 0.56, -h * 0.02], [-w * 0.5, -h * 0.4], [0, -h * 0.58], [w * 0.48, -h * 0.4], [w * 0.52, -h * 0.12], [w * 0.1, -h * 0.16], [-w * 0.4, -h * 0.12]], hc, s);
      break;
    case 'tufts':
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) line(ctx, [[sx * w * 0.42, -h * 0.12 + i * 8], [sx * w * (0.55 + i * 0.03), -h * (0.24 + i * 0.04)]], { w: 5, color: hc === '#F7F2E8' ? '#E8E2DA' : hc, seed: seed + 90 + i });
      break;
    case 'bun':
      shape(ctx, oval(-w * 0.1, -h * 0.62, w * 0.2, h * 0.14, 10), hc, { ...s, seed: seed + 95 });
      shape(ctx, [[-w * 0.54, h * 0.06], [-w * 0.52, -h * 0.34], [-w * 0.05, -h * 0.54], [w * 0.42, -h * 0.4], [w * 0.46, -h * 0.16], [w * 0.06, -h * 0.3], [-w * 0.36, -h * 0.18], [-w * 0.42, h * 0.08]], hc, s);
      break;
    default:
      break;
  }
  if (L.hat === 'cap') {
    const c = roleColor(INK_PAL_NOW, L.hatColor, '#C8423A');
    const p = shape(ctx, [[-w * 0.54, -h * 0.24], [-w * 0.46, -h * 0.5], [0, -h * 0.64], [w * 0.42, -h * 0.5], [w * 0.5, -h * 0.28]], c, s);
    split(ctx, p, tone(c, -0.25), -w * 0.2, -h, -w * 0.4, 0);
    shape(ctx, [[w * 0.3, -h * 0.3], [w * 0.78, -h * 0.26], [w * 0.74, -h * 0.2], [w * 0.3, -h * 0.22]], tone(c, -0.15), { ...s, seed: seed + 97 });
  } else if (L.hat === 'cowboy') {
    const c = roleColor(INK_PAL_NOW, L.hatColor, '#7A4A2C');
    shape(ctx, [[-w * 0.95, -h * 0.28], [-w * 0.5, -h * 0.4], [w * 0.5, -h * 0.4], [w * 0.95, -h * 0.3], [w * 0.7, -h * 0.22], [0, -h * 0.28], [-w * 0.7, -h * 0.2]], tone(c, -0.1), s);
    const p = shape(ctx, [[-w * 0.42, -h * 0.36], [-w * 0.36, -h * 0.74], [0, -h * 0.66], [w * 0.36, -h * 0.76], [w * 0.42, -h * 0.36]], c, { ...s, seed: seed + 98 });
    split(ctx, p, tone(c, -0.25), -w * 0.1, -h, -w * 0.3, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(-w * 0.42, -h * 0.44, w * 0.84, 12);
  } else if (L.hat === 'beanie') {
    const c = roleColor(INK_PAL_NOW, L.hatColor, '#3E5BB8');
    shape(ctx, [[-w * 0.54, -h * 0.2], [-w * 0.44, -h * 0.52], [0, -h * 0.66], [w * 0.44, -h * 0.52], [w * 0.54, -h * 0.2]], c, s);
  }
}

/** The palette for the cast being drawn (hats read it). */
let INK_PAL_NOW: InkPalette;

/** One cast member at the origin (feet), facing right; mirror outside for left. */
export function drawPerson(ctx: Ctx, a: Actor, pal: InkPalette, zoom: number): void {
  INK_PAL_NOW = pal;
  setZoom(zoom);
  const L = INK_CAST[a.name] ?? INK_CAST.bubba;
  const b = BODY[L.build];
  const seed = seedOf(a.name);
  const from = a.from ? POSES[a.from] : POSES[a.move];
  const pose = alive(mixPose(from, POSES[a.move], spring(a.local)), a.move, a.t, seed * 10);
  const face = faceAt(a.move, a.local, seed * 100 + a.move.length);
  const top = roleColor(pal, L.topColor);
  const pants = roleColor(pal, L.pants);
  const hairColor = roleColor(pal, L.hairColor, INK);
  const skinShade = pal.skinDark;

  // Ground shadow.
  ctx.fillStyle = 'rgba(30,14,40,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 6, b.torsoW * 0.62, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs and shoes.
  const hipY = -b.legs + pose.bob * 0.3;
  const legW = Math.max(70, b.torsoW * 0.32);
  for (const side of [-1, 1]) {
    const x = side * b.torsoW * 0.2;
    const lp = shape(ctx, limb([[x, hipY], [x + side * 8, hipY * 0.5], [x + side * 4, -30]], legW, 0.8), pants, { w: 4, seed: seed + side });
    split(ctx, lp, tone(pants, -0.22), x - 40, hipY, x - 30, 0);
    if (pants === INK_FIXED.denim) ticks(ctx, lp, x - legW, hipY, legW * 2, -hipY, 10, { len: 10, color: 'rgba(255,255,255,0.35)', seed: seed + 5 + side });
    shape(ctx, [[x - legW * 0.5, -36], [x + legW * 0.7, -40], [x + legW * 1.05, -12], [x + legW * 0.9, 6], [x - legW * 0.55, 6]], '#2B1A16', { w: 3.6, seed: seed + 8 + side });
  }

  // The upper body leans from the hips.
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(pose.lean);
  const breathe = 1 + Math.sin(a.t * 2.2 + seed) * 0.012 + (a.move === 'anger' ? Math.abs(Math.sin(a.t * 4)) * 0.03 : 0);
  const tw = b.torsoW;
  const th = b.torsoH * breathe;
  const sy = -th - pose.shrug * 0.4;
  const sL: Pt = [-tw * 0.4, sy + 30 - pose.shrug];
  const sR: Pt = [tw * 0.4, sy + 30 - pose.shrug];
  const hasSleeves = L.top !== 'tank';
  const sleeve = L.top === 'vest' ? pal.pale : top;

  const drawArm = (s: Pt, arm: Arm, front: boolean): void => {
    const { e, h } = armPts(s, arm, b.lu, b.lf);
    const aw = b.arm;
    if (hasSleeves) {
      const up = shape(ctx, limb([s, e], aw * 1.12, 0.92), sleeve, { w: 4, seed: seed + (front ? 20 : 30) });
      split(ctx, up, tone(sleeve, -0.22), s[0] - 60, s[1], e[0] - 60, e[1]);
      if (L.pattern && L.top !== 'vest') pattern(ctx, up, L.pattern, roleColor(pal, L.patternColor), s[0] - 200, s[1] - 100, 400, 400, seed);
      const fp = shape(ctx, limb([e, h], aw * (L.top === 'suit' || L.top === 'jacket' || L.top === 'hoodie' ? 1 : 0.88), 0.85), L.top === 'suit' || L.top === 'jacket' || L.top === 'hoodie' ? sleeve : pal.skin, { w: 4, seed: seed + (front ? 21 : 31) });
      split(ctx, fp, front ? pal.skinLit : skinShade, e[0] - 50, e[1], h[0] - 50, h[1]);
      if (L.hairy) ticks(ctx, fp, Math.min(e[0], h[0]) - aw, Math.min(e[1], h[1]) - aw, Math.abs(h[0] - e[0]) + aw * 2, Math.abs(h[1] - e[1]) + aw * 2, 26, { len: 12, seed: seed + 22, w: 1.6 });
    } else {
      const ap = shape(ctx, limb([s, e, h], aw * 1.05, 0.85), pal.skin, { w: 4, seed: seed + (front ? 23 : 33) });
      split(ctx, ap, skinShade, s[0] - 60, s[1], h[0] - 60, h[1]);
      if (L.hairy) ticks(ctx, ap, Math.min(s[0], h[0]) - aw, Math.min(s[1], h[1]) - aw, Math.abs(h[0] - s[0]) + aw * 2, Math.abs(h[1] - s[1]) + aw * 2, 40, { len: 12, seed: seed + 24, w: 1.6 });
    }
    const dir = Math.atan2(h[1] - e[1], h[0] - e[0]) - Math.PI / 2;
    hand(ctx, h, dir, aw * 0.62 + 18, front ? pal.skin : tone(pal.skin, -0.06), front ? pal.skinLit : skinShade, !!pose.fist && !front, !!L.ring && front, seed + (front ? 40 : 50));
  };

  // The back arm behind the body.
  drawArm(sR, pose.back, false);

  // Torso.
  const belly = b.belly;
  const tPts: Pt[] = [
    [-tw * 0.42, sy + 10],
    [0, sy - 6],
    [tw * 0.42, sy + 10],
    [tw * (0.5 + belly), -th * 0.45],
    [tw * (0.46 + belly * 0.8), -th * 0.12],
    [tw * 0.36, 0],
    [-tw * 0.36, 0],
    [-tw * (0.46 + belly * 0.6), -th * 0.12],
    [-tw * (0.5 + belly * 0.6), -th * 0.45],
  ];
  const torso = shape(ctx, tPts, L.top === 'tank' ? pal.skin : top, { w: 4.6, seed: seed + 60 });
  if (L.top === 'tank') {
    const tank = shape(ctx, [[-tw * 0.3, sy + 6], [-tw * 0.14, sy + 70], [tw * 0.14, sy + 70], [tw * 0.3, sy + 6], [tw * (0.5 + belly), -th * 0.45], [tw * 0.36, 0], [-tw * 0.36, 0], [-tw * (0.5 + belly * 0.6), -th * 0.45]], top, { w: 4, seed: seed + 61 });
    split(ctx, tank, tone(top, -0.18), -tw * 0.1, sy, -tw * 0.5, 0);
    if (L.hairy) ticks(ctx, torso, -tw * 0.2, sy + 10, tw * 0.4, 70, 22, { len: 12, seed: seed + 62, w: 1.6 });
  } else {
    pattern(ctx, torso, L.pattern, roleColor(pal, L.patternColor), -tw, sy - 20, tw * 2, th + 40, seed);
    split(ctx, torso, 'rgba(40,18,50,0.22)', -tw * 0.05, sy, -tw * 0.45, 0);
  }
  ctx.save();
  ctx.clip(torso);
  if (L.top === 'suit') {
    shape(ctx, [[-tw * 0.16, sy], [tw * 0.16, sy], [tw * 0.04, -th * 0.45], [-tw * 0.04, -th * 0.45]], pal.pale, { w: 3, seed: seed + 63 });
    shape(ctx, [[-tw * 0.03, sy + 18], [tw * 0.03, sy + 18], [tw * 0.05, -th * 0.5], [0, -th * 0.42], [-tw * 0.05, -th * 0.5]], pal.accent2, { w: 3, seed: seed + 64 });
    line(ctx, [[-tw * 0.18, sy], [-tw * 0.02, -th * 0.42]], { w: 3.4, seed: seed + 65 });
    line(ctx, [[tw * 0.18, sy], [tw * 0.02, -th * 0.42]], { w: 3.4, seed: seed + 66 });
  } else if (L.top === 'shirt' || L.top === 'cardigan' || L.top === 'jacket') {
    line(ctx, [[tw * 0.02, sy + 12], [tw * 0.03, -10]], { w: 3, seed: seed + 67 });
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#F5EEDD';
      ctx.beginPath();
      ctx.arc(tw * 0.07, sy + 60 + i * (th * 0.2), 7, 0, Math.PI * 2);
      ctx.fill();
      line(ctx, oval(tw * 0.07, sy + 60 + i * (th * 0.2), 7, 7, 8), { w: 1.6, closed: true, seed: seed + 68 + i });
    }
    line(ctx, [[-tw * 0.2, sy + 4], [0, sy + 50], [tw * 0.2, sy + 4]], { w: 3.4, seed: seed + 72 });
  } else if (L.top === 'hoodie') {
    line(ctx, [[-tw * 0.06, sy + 20], [-tw * 0.08, sy + 110]], { w: 3, seed: seed + 73 });
    line(ctx, [[tw * 0.08, sy + 20], [tw * 0.1, sy + 110]], { w: 3, seed: seed + 74 });
    line(ctx, [[-tw * 0.25, -th * 0.32], [tw * 0.25, -th * 0.32], [tw * 0.2, -th * 0.12], [-tw * 0.2, -th * 0.12]], { w: 3, closed: true, seed: seed + 75 });
  } else if (L.top === 'vest') {
    line(ctx, [[-tw * 0.26, sy + 4], [0, sy + 90], [tw * 0.26, sy + 4]], { w: 3.4, seed: seed + 76 });
  }
  // Belt and buckle.
  ctx.fillStyle = '#4A2C1C';
  ctx.fillRect(-tw, -46, tw * 2, 34);
  line(ctx, [[-tw * 0.6, -46], [tw * 0.6, -44]], { w: 2.4, seed: seed + 77, taper: false });
  ctx.restore();
  if (L.build === 'huge' || L.build === 'big') {
    const bp = shape(ctx, oval(tw * 0.04, -30, 46, 28, 10), '#D7D2C8', { w: 3, seed: seed + 78 });
    split(ctx, bp, '#A8A296', -10, -60, 40, 0);
    glint(ctx, tw * 0.04 + 18, -42, 12, a.t);
  }
  if (L.chain) {
    line(ctx, [[-tw * 0.18, sy + 10], [0, sy + 120], [tw * 0.18, sy + 10]], { w: 6, color: '#E0A82E', seed: seed + 79 });
    glint(ctx, 10, sy + 112, 14, a.t);
  }

  // Head on the shoulders (big, sitting low), tilted by the pose.
  ctx.save();
  ctx.translate(pose.push * 0.6, sy - b.headH * 0.36 + pose.push * 0.1);
  ctx.rotate(pose.tilt);
  head(ctx, L, b, pal, face, a.talk, seed, hairColor);
  ctx.restore();

  // The front arm over everything, and what it holds.
  drawArm(sL, pose.front, true);
  if (a.prop) {
    const { h: hb } = armPts(sR, pose.back, b.lu, b.lf);
    const { h: hf } = armPts(sL, pose.front, b.lu, b.lf);
    const two = a.move === 'hold' || a.move === 'dig';
    const at: Pt = two ? [(hb[0] + hf[0]) / 2, (hb[1] + hf[1]) / 2] : a.move === 'phone' ? hb : hf;
    drawProp(ctx, a.prop, at[0], at[1] + 30, 0.85, a.t, pal);
  }
  ctx.restore();
}
