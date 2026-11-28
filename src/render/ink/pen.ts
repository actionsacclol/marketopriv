import type { Ctx } from '../engine';

// The ink cartoon's pen: every line is a filled polygon that swells and thins along its length, tapers to points and
// wobbles a little, so it reads as dip-pen ink, never an even sticker outline. Every shape is seeded by its own id, so
// a part draws the same every frame and only what moves changes. Widths are in screen pixels: setZoom tells the pen how
// much the camera magnifies, so a close-up keeps the same thin line.

export const INK = '#170B08';
export const FINE = 'rgba(77,20,10,0.78)';
export type Pt = [number, number];

let zoom = 1;
/** The camera's magnification for the drawing that follows (line widths stay the same on screen). */
export const setZoom = (k: number): void => {
  zoom = Math.max(0.2, k);
};
const px = (w: number): number => w / zoom;

/** A small seeded random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = Math.floor(seed * 9973 + 12345) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string or number id as a seed. */
export function seedOf(id: string | number): number {
  if (typeof id === 'number') return id;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise over [0,1] from a seed: k random knots, eased between. */
function noise(seed: number, k = 6): (u: number) => number {
  const r = rng(seed);
  const knots = Array.from({ length: k + 1 }, () => r() * 2 - 1);
  return (u) => {
    const x = Math.max(0, Math.min(0.9999, u)) * k;
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return knots[i] * (1 - s) + knots[i + 1] * s;
  };
}

/** Catmull-Rom through the points (closed or open), `per` samples a segment. */
export function smooth(pts: Pt[], closed: boolean, per = 7): Pt[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const out: Pt[] = [];
  const at = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

/** Hand-cut edges: every point pushed a little along a seeded noise. */
function jitter(pts: Pt[], seed: number, amt: number): Pt[] {
  if (amt <= 0) return pts;
  const nx = noise(seed + 0.31, 9);
  const ny = noise(seed + 0.77, 9);
  return pts.map((p, i) => [p[0] + nx(i / pts.length) * amt, p[1] + ny(i / pts.length) * amt]);
}

export interface LineOpts {
  /** Width in screen px at its fullest (the main ink is 3-5). */
  w?: number;
  color?: string;
  closed?: boolean;
  /** Taper both ends to a point (open lines). */
  taper?: boolean;
  /** How much the width swells and thins (0-1). */
  pressure?: number;
  seed?: number;
}

/** One pen line through the points, as a filled variable-width polygon. */
export function line(ctx: Ctx, raw: Pt[], o: LineOpts = {}): void {
  const closed = !!o.closed;
  const pts = raw.length > 2 ? smooth(raw, closed, 6) : raw;
  if (pts.length < 2) return;
  const seed = o.seed ?? 1;
  const w = px(o.w ?? 4);
  const pr = noise(seed + 0.13, 5);
  const amount = o.pressure ?? 0.45;
  const taper = o.taper ?? !closed;
  const n = pts.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const u = i / (n - 1);
    let k = 1 + pr(u) * amount;
    if (taper) k *= Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.55) * 0.92 + 0.08;
    const h = (w * Math.max(0.12, k)) / 2;
    left.push([pts[i][0] - dy * h, pts[i][1] + dx * h]);
    right.push([pts[i][0] + dy * h, pts[i][1] - dx * h]);
  }
  ctx.fillStyle = o.color ?? INK;
  ctx.beginPath();
  if (closed) {
    poly(ctx, left, true);
    poly(ctx, right.reverse(), true);
    ctx.fill('evenodd');
  } else {
    poly(ctx, [...left, ...right.reverse()], true);
    ctx.fill();
  }
}

function poly(ctx: Ctx, pts: Pt[], close: boolean): void {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

/** A filled shape (flat colour) with its ink outline. Returns its path, to clip textures and shading to it. */
export function shape(ctx: Ctx, raw: Pt[], fill: string | null, o: LineOpts & { edge?: number } = {}): Path2D {
  const seed = o.seed ?? 1;
  const pts = jitter(smooth(raw, true, 6), seed, px(o.edge ?? 1.2));
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(p);
  }
  if ((o.w ?? 4) > 0) line(ctx, raw, { ...o, closed: true, taper: false, pressure: o.pressure ?? 0.55 });
  return p;
}

/** An ellipse as points (for shape / line). */
export function oval(cx: number, cy: number, rx: number, ry: number, n = 14, rot = 0): Pt[] {
  const out: Pt[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

/** A rectangle with slightly rounded corners as points. */
export function box(x: number, y: number, w: number, h: number, r = 0.08): Pt[] {
  const rx = w * r;
  const ry = h * r;
  return [
    [x + rx, y],
    [x + w - rx, y],
    [x + w, y + ry],
    [x + w, y + h - ry],
    [x + w - rx, y + h],
    [x + rx, y + h],
    [x, y + h - ry],
    [x, y + ry],
  ];
}

/** Flat shade inside a clip: a second flat tone on one side of a hard diagonal (the two-tone light). */
export function split(ctx: Ctx, clip: Path2D, color: string, x0: number, y0: number, x1: number, y1: number, far = 4000): void {
  ctx.save();
  ctx.clip(clip);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0 - (dx / len) * far, y0 - (dy / len) * far);
  ctx.lineTo(x1 + (dx / len) * far, y1 + (dy / len) * far);
  ctx.lineTo(x1 + (dx / len) * far + nx * far, y1 + (dy / len) * far + ny * far);
  ctx.lineTo(x0 - (dx / len) * far + nx * far, y0 - (dy / len) * far + ny * far);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Short tapered ticks scattered inside a clip (skin pores, hair on arms, grass, wood grain): never long hatching. */
export function ticks(ctx: Ctx, clip: Path2D | null, x: number, y: number, w: number, h: number, count: number, o: { len?: number; angle?: number; spread?: number; color?: string; w?: number; seed?: number } = {}): void {
  const r = rng(o.seed ?? 7);
  ctx.save();
  if (clip) ctx.clip(clip);
  const len = o.len ?? 14;
  for (let i = 0; i < count; i++) {
    const cx = x + r() * w;
    const cy = y + r() * h;
    const a = (o.angle ?? -1.1) + (r() - 0.5) * (o.spread ?? 0.6);
    const l = len * (0.6 + r() * 0.7);
    line(ctx, [[cx, cy], [cx + Math.cos(a) * l * 0.5, cy + Math.sin(a) * l * 0.5 + 0.5], [cx + Math.cos(a) * l, cy + Math.sin(a) * l]], { w: o.w ?? 1.8, color: o.color ?? FINE, seed: i + (o.seed ?? 7), pressure: 0.2 });
  }
  ctx.restore();
}

/** Small dots inside a clip (stubble, pores, a dotted pattern). */
export function dots(ctx: Ctx, clip: Path2D | null, x: number, y: number, w: number, h: number, count: number, o: { r?: number; color?: string; seed?: number } = {}): void {
  const r = rng(o.seed ?? 3);
  ctx.save();
  if (clip) ctx.clip(clip);
  ctx.fillStyle = o.color ?? FINE;
  const rad = o.r ?? 2;
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.arc(x + r() * w, y + r() * h, px(rad) * (0.6 + r() * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A one-point glint (a lamp, a coin, a blade). */
export function glint(ctx: Ctx, x: number, y: number, s: number, t: number): void {
  const k = s * (0.75 + 0.25 * Math.sin(t * 5));
  ctx.fillStyle = '#FFF8E0';
  ctx.beginPath();
  ctx.moveTo(x, y - k);
  ctx.quadraticCurveTo(x, y, x + k * 0.3, y);
  ctx.quadraticCurveTo(x, y, x, y + k);
  ctx.quadraticCurveTo(x, y, x - k * 0.3, y);
  ctx.quadraticCurveTo(x, y, x, y - k);
  ctx.moveTo(x - k * 0.7, y);
  ctx.quadraticCurveTo(x, y, x, y - k * 0.22);
  ctx.quadraticCurveTo(x, y, x + k * 0.7, y);
  ctx.quadraticCurveTo(x, y, x, y + k * 0.22);
  ctx.closePath();
  ctx.fill();
}

/** A colour lighter (+) or darker (-) by an amount 0-1. */
export function tone(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix two colours. */
export function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
