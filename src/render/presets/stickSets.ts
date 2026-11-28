import { STICK_KNOCKS, STICK_LIGHTNING_AT } from '@shared/stickman';
import { H, W, rrect, type Ctx } from '../engine';

// Stickman scenes and weather: the place a story happens (a bedroom, a street, a
// forest...) drawn behind the figures in muted lines so they stay the focus, with
// small things moving in it (curtains, cars, steam, a clock, leaves, a campfire),
// and rain / snow / wind / fog / storm / night on top. Pure functions of t, like
// the rest of the stickman. Set names live in shared/stickman.ts.

type P = { x: number; y: number };
const G = 1440;

const nz = (a: number, b: number): number => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};
const r01 = (a: number, b: number): number => (nz(a, b) + 1) / 2;

function rgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
export function mixHex(a: string, b: string, k: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

export interface SetLook {
  bg: string;
  ink: string;
  hi: string;
  light: boolean;
  lw: number;
  dusk?: boolean;
}

/** The scene's colours, worked out from the look (muted so the figures stay on top). */
export interface Pal {
  line: string;
  wall: string;
  floor: string;
  fill: string;
  fill2: string;
  leaf: string;
  glow: string;
  win: string;
  face: string;
  hi: string;
  lw: number;
  light: boolean;
  dusk: boolean;
  night: boolean;
}

export function palOf(L: SetLook, night: boolean): Pal {
  const lw = Math.max(4, L.lw * 0.5);
  if (L.dusk)
    return { line: '#1A1020', wall: night ? '#22142C' : '#3A2340', floor: '#1C1022', fill: night ? '#1C1124' : '#2B1733', fill2: '#4A2A50', leaf: '#231229', glow: '#FFC27A', win: night ? '#141433' : '#F08A5D', face: '#4A2A50', hi: L.hi, lw, light: false, dusk: true, night };
  const dim = (c: string): string => (night ? mixHex(c, '#141A33', L.light ? 0.5 : 0.3) : c);
  return {
    line: mixHex(L.bg, L.ink, L.light ? 0.48 : 0.36),
    wall: dim(L.light ? mixHex(L.bg, '#C9B48E', 0.3) : mixHex(L.bg, L.ink, 0.07)),
    floor: dim(L.light ? mixHex(L.bg, '#8C7A5E', 0.26) : mixHex(L.bg, L.ink, 0.035)),
    fill: dim(L.light ? mixHex(L.bg, L.ink, 0.09) : mixHex(L.bg, L.ink, 0.13)),
    fill2: dim(mixHex(L.bg, L.hi, L.light ? 0.32 : 0.38)),
    leaf: dim(L.light ? mixHex(L.bg, '#6E9A5B', 0.45) : mixHex(L.bg, '#4F7A45', 0.45)),
    glow: '#FFD27A',
    win: night ? '#1B2445' : L.light ? '#CFE4EE' : '#22304A',
    face: L.light ? L.bg : mixHex(L.bg, L.ink, 0.2),
    hi: L.hi,
    lw,
    light: L.light,
    dusk: false,
    night,
  };
}

export const INTERIOR = ['bedroom', 'kitchen', 'office', 'classroom', 'hospital', 'store'];
/** Scenes with people walking by behind the figures. */
export const BUSY = ['street', 'city', 'park'];

interface S {
  ctx: Ctx;
  p: Pal;
  t: number;
  boil: number;
  pan: number;
  local: number;
  knock: boolean;
}

// ── Pen ───────────────────────────────────────────────────────────────────
function pen(s: S, pts: P[], seed: number, amp = 1.4): void {
  const { ctx } = s;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const j = nz(seed + i * 7.1, s.boil) * amp;
    ctx.quadraticCurveTo((a.x + b.x) / 2 - ((b.y - a.y) / len) * j, (a.y + b.y) / 2 + ((b.x - a.x) / len) * j, b.x, b.y);
  }
  ctx.stroke();
}

function ink(s: S, w = 1): void {
  const { ctx, p } = s;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = p.lw * w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function box(s: S, x: number, y: number, w: number, h: number, fill: string, seed: number, r = 0): void {
  const { ctx } = s;
  ctx.fillStyle = fill;
  if (r) {
    rrect(ctx, x, y, w, h, r);
    ctx.fill();
  } else ctx.fillRect(x, y, w, h);
  ink(s);
  if (r) {
    rrect(ctx, x, y, w, h, r);
    ctx.stroke();
  } else pen(s, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y: y - 0.5 }], seed);
}

function circle(s: S, x: number, y: number, r: number, fill: string | null, stroke = true): void {
  const { ctx } = s;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ink(s);
    ctx.stroke();
  }
}

/** Draw a layer that moves less than the camera (far things), k = 0..1 of the pan cancelled. */
function layer(s: S, k: number, fn: () => void): void {
  s.ctx.save();
  s.ctx.translate(s.pan * k, 0);
  fn();
  s.ctx.restore();
}

function glow(s: S, x: number, y: number, r: number, a: number): void {
  const { ctx, p } = s;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,210,122,${a})`);
  g.addColorStop(1, 'rgba(255,210,122,0)');
  ctx.save();
  if (!p.light) ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// ── Pieces ────────────────────────────────────────────────────────────────
function room(s: S): void {
  const { ctx, p } = s;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = p.wall;
  ctx.fillRect(-W, -H, W * 3, G + H);
  ctx.fillStyle = p.floor;
  ctx.fillRect(-W, G, W * 3, H * 2);
  ctx.restore();
  ink(s, 0.8);
  pen(s, [{ x: -W, y: G - 34 }, { x: W * 2, y: G - 34 }], 900, 1);
  // Floor boards.
  for (let i = 0; i < 6; i++) {
    const y = G + 70 + i * i * 22;
    pen(s, [{ x: -W, y }, { x: W * 2, y }], 901 + i, 0.6);
  }
}

function windowAt(s: S, x: number, y: number, w: number, h: number, seed: number, view: 'sky' | 'city' | 'trees'): void {
  const { ctx, p, t } = s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (p.dusk && !p.night) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#7A3A68');
    g.addColorStop(1, '#F59A62');
    ctx.fillStyle = g;
  } else ctx.fillStyle = p.win;
  ctx.fillRect(x, y, w, h);
  if (p.night) {
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(255,250,230,${0.4 + 0.5 * Math.abs(Math.sin(t * 1.5 + i))})`;
      ctx.fillRect(x + r01(seed + i, 1) * w, y + r01(seed + i, 2) * h * 0.6, 3, 3);
    }
    ctx.fillStyle = '#F4F0D8';
    ctx.beginPath();
    ctx.arc(x + w * 0.72, y + h * 0.28, Math.min(w, h) * 0.11, 0, Math.PI * 2);
    ctx.fill();
  } else if (!p.dusk) {
    // A cloud drifting past.
    const cx = x - 120 + ((t * 18 + seed * 37) % (w + 240));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [dx, dy, r] of [[0, 0, 34], [36, -14, 30], [70, 0, 28]] as const) {
      ctx.beginPath();
      ctx.arc(cx + dx, y + h * 0.32 + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (view === 'city') {
    for (let i = 0; i < 9; i++) {
      const bw = w / 7;
      const bh = h * (0.25 + 0.45 * r01(seed + i, 3));
      const bx = x + (i - 1) * bw * 0.95;
      ctx.fillStyle = p.dusk ? '#2B1733' : p.night ? '#0F1426' : 'rgba(120,130,150,0.45)';
      ctx.fillRect(bx, y + h - bh, bw * 0.85, bh);
      if (p.night || p.dusk)
        for (let k = 0; k < 6; k++) {
          if (Math.sin(t * 0.7 + i * 3 + k * 1.7) < 0.2) continue;
          ctx.fillStyle = 'rgba(255,210,122,0.8)';
          ctx.fillRect(bx + 8 + (k % 2) * bw * 0.4, y + h - bh + 14 + Math.floor(k / 2) * 26, 8, 10);
        }
    }
  } else if (view === 'trees') {
    ctx.fillStyle = p.leaf;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(x + (i + 0.3) * (w / 4), y + h + 10 + Math.sin(t * 0.8 + i) * 3, w * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ink(s);
  pen(s, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y: y - 0.5 }], seed);
  pen(s, [{ x: x + w / 2, y }, { x: x + w / 2, y: y + h }], seed + 1, 0.8);
  pen(s, [{ x, y: y + h * 0.45 }, { x: x + w, y: y + h * 0.45 }], seed + 2, 0.8);
  pen(s, [{ x: x - 20, y: y + h + 10 }, { x: x + w + 20, y: y + h + 10 }], seed + 3, 1);
  // Curtains, moving a little.
  for (const side of [0, 1]) {
    const x0 = side ? x + w + 16 : x - 16;
    const dir = side ? -1 : 1;
    const sway = 9 * Math.sin(t * 1.1 + side * 2);
    ctx.fillStyle = p.fill2;
    ctx.beginPath();
    ctx.moveTo(x0, y - 24);
    ctx.lineTo(x0 + dir * w * 0.26, y - 24);
    ctx.quadraticCurveTo(x0 + dir * (w * 0.1 + sway), y + h * 0.5, x0 + dir * (w * 0.16 + sway * 1.6), y + h + 26);
    ctx.lineTo(x0, y + h + 26);
    ctx.closePath();
    ctx.fill();
    ink(s, 0.8);
    ctx.stroke();
  }
  ink(s, 1.2);
  pen(s, [{ x: x - 50, y: y - 24 }, { x: x + w + 50, y: y - 24 }], seed + 4, 0.6);
}

function wallClock(s: S, x: number, y: number, r: number): void {
  circle(s, x, y, r, s.p.face);
  ink(s, 0.9);
  const a = s.t * 1.4;
  pen(s, [{ x, y }, { x: x + Math.sin(a) * r * 0.78, y: y - Math.cos(a) * r * 0.78 }], 910, 0);
  pen(s, [{ x, y }, { x: x + Math.sin(a / 12 + 2) * r * 0.5, y: y - Math.cos(a / 12 + 2) * r * 0.5 }], 911, 0);
  for (let i = 0; i < 4; i++) {
    const k = (i * Math.PI) / 2;
    pen(s, [{ x: x + Math.sin(k) * r * 0.82, y: y - Math.cos(k) * r * 0.82 }, { x: x + Math.sin(k) * r * 0.92, y: y - Math.cos(k) * r * 0.92 }], 912 + i, 0);
  }
}

function frame(s: S, x: number, y: number, w: number, h: number, seed: number): void {
  box(s, x, y, w, h, s.p.face, seed);
  ink(s, 0.8);
  // A little mountain picture.
  pen(s, [{ x: x + w * 0.12, y: y + h * 0.8 }, { x: x + w * 0.4, y: y + h * 0.35 }, { x: x + w * 0.6, y: y + h * 0.62 }, { x: x + w * 0.72, y: y + h * 0.48 }, { x: x + w * 0.88, y: y + h * 0.8 }], seed + 1, 1);
  circle(s, x + w * 0.74, y + h * 0.26, w * 0.07, s.p.fill2, false);
}

function plant(s: S, x: number, base: number, k = 1): void {
  const { ctx, p, t } = s;
  box(s, x - 46 * k, base - 90 * k, 92 * k, 90 * k, p.fill2, 920, 10 * k);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.32 + Math.sin(t * 1.3 + i) * 0.05;
    const len = (110 + 40 * r01(i, 9)) * k;
    const tip = { x: x + Math.cos(a) * len, y: base - 90 * k + Math.sin(a) * len };
    ctx.fillStyle = p.leaf;
    ctx.beginPath();
    ctx.ellipse((x + tip.x) / 2, (base - 90 * k + tip.y) / 2, len * 0.5, 15 * k, a, 0, Math.PI * 2);
    ctx.fill();
    ink(s, 0.7);
    ctx.stroke();
  }
}

function lampPost(s: S, x: number, top: number): void {
  const { p, t } = s;
  ink(s, 1.3);
  pen(s, [{ x, y: G }, { x, y: top }, { x: x - 70, y: top }], 930, 1);
  box(s, x - 110, top, 80, 34, p.fill, 931, 8);
  if (p.night || p.dusk) {
    const flick = 0.55 + 0.1 * Math.sin(t * 23) * (Math.sin(t * 0.7) > 0.85 ? 1 : 0);
    glow(s, x - 70, top + 40, 260, flick);
    s.ctx.fillStyle = `rgba(255,210,122,${p.light ? 0.16 : 0.1})`;
    s.ctx.beginPath();
    s.ctx.moveTo(x - 105, top + 34);
    s.ctx.lineTo(x - 260, G);
    s.ctx.lineTo(x + 120, G);
    s.ctx.lineTo(x - 35, top + 34);
    s.ctx.fill();
  }
}

function car(s: S, x: number, y: number, k: number, dir: number, fill: string, seed: number): void {
  const { ctx, t, p } = s;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * k, k);
  const bodyY = -74;
  box(s, -140, bodyY, 280, 52, fill, seed, 18);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-80, bodyY);
  ctx.lineTo(-50, bodyY - 48);
  ctx.lineTo(52, bodyY - 48);
  ctx.lineTo(92, bodyY);
  ctx.closePath();
  ctx.fill();
  ink(s);
  ctx.stroke();
  ctx.fillStyle = p.win;
  ctx.fillRect(-42, bodyY - 38, 40, 32);
  ctx.fillRect(8, bodyY - 38, 46, 32);
  for (const wx of [-82, 82]) {
    circle(s, wx, -20, 26, p.line, false);
    ink(s, 0.6);
    s.ctx.strokeStyle = p.face;
    const a = (t * 14 * dir) % (Math.PI * 2);
    pen(s, [{ x: wx + Math.cos(a) * 16, y: -20 + Math.sin(a) * 16 }, { x: wx - Math.cos(a) * 16, y: -20 - Math.sin(a) * 16 }], seed + 3, 0);
  }
  if (p.night || p.dusk) glow(s, 140, bodyY + 22, 120, 0.6);
  ctx.restore();
}

/** Cars driving past along a lane behind the figures. */
function traffic(s: S, y: number, k: number, seed: number): void {
  const { t, p } = s;
  for (let c = 0; c < 2; c++) {
    const period = 7 + c * 2.3;
    const u = ((t + seed + c * 3.7) % period) / period;
    const span = W + 700;
    const dir = c ? -1 : 1;
    const x = dir > 0 ? -350 + u * span * 1.6 : W + 350 - u * span * 1.6;
    if (x < -400 || x > W + 400) continue;
    car(s, x, y, k, dir, c ? p.fill2 : p.fill, 940 + c * 10);
  }
}

function birds(s: S, seed: number, y0 = 880): void {
  const { t } = s;
  const period = 11;
  const u = ((t + seed) % period) / period;
  ink(s, 0.6);
  for (let i = 0; i < 3; i++) {
    const x = -100 + u * (W + 300) - i * 70;
    const y = y0 - i * 26 + Math.sin(t * 2 + i) * 10;
    const f = Math.sin(t * 12 + i * 1.3) * 12;
    pen(s, [{ x: x - 22, y: y - f }, { x, y: y + 6 }, { x: x + 22, y: y - f }], 950 + i, 0);
  }
}

function pine(s: S, x: number, base: number, h: number, fill: string, seed: number, stroke = true): void {
  const { ctx, t } = s;
  const sway = Math.sin(t * 0.9 + seed) * h * 0.02;
  ctx.fillStyle = fill;
  for (let i = 0; i < 3; i++) {
    const top = base - h + i * h * 0.24;
    const bw = h * (0.22 + i * 0.1);
    ctx.beginPath();
    ctx.moveTo(x + sway * (1 - i * 0.3), top);
    ctx.lineTo(x + bw, top + h * 0.42);
    ctx.lineTo(x - bw, top + h * 0.42);
    ctx.closePath();
    ctx.fill();
    if (stroke) {
      ink(s, 0.8);
      ctx.stroke();
    }
  }
  ctx.fillStyle = fill;
  ctx.fillRect(x - h * 0.035, base - h * 0.12, h * 0.07, h * 0.12);
}

function roundTree(s: S, x: number, base: number, h: number, seed: number): void {
  const { ctx, p, t } = s;
  ink(s, 1.4);
  ctx.fillStyle = p.fill;
  ctx.beginPath();
  ctx.moveTo(x - h * 0.05, base);
  ctx.lineTo(x - h * 0.03, base - h * 0.55);
  ctx.lineTo(x + h * 0.03, base - h * 0.55);
  ctx.lineTo(x + h * 0.06, base);
  ctx.fill();
  ctx.stroke();
  const sway = Math.sin(t * 0.8 + seed) * h * 0.015;
  for (const [dx, dy, r] of [[-0.18, -0.62, 0.2], [0.17, -0.64, 0.21], [0, -0.82, 0.24], [-0.05, -0.6, 0.18]] as const) {
    circle(s, x + dx * h + sway, base + dy * h, r * h, p.leaf);
  }
}

function fallingLeaves(s: S, n: number, x0: number, x1: number, seed: number): void {
  const { ctx, t, p } = s;
  for (let i = 0; i < n; i++) {
    const period = 5 + r01(seed + i, 1) * 3;
    const u = ((t + r01(seed + i, 2) * period) % period) / period;
    const x = x0 + r01(seed + i, 3) * (x1 - x0) + Math.sin(t * 2 + i) * 40 + u * 60;
    const y = 700 + u * (G - 700);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 3 + i);
    ctx.fillStyle = i % 2 ? p.leaf : p.fill2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function campfire(s: S, x: number, base: number): void {
  const { ctx, t, p } = s;
  glow(s, x, base - 40, 380, p.light && !p.night ? 0.35 : 0.65);
  ink(s, 1.4);
  ctx.strokeStyle = p.line;
  pen(s, [{ x: x - 90, y: base - 6 }, { x: x + 80, y: base - 30 }], 960, 0.5);
  pen(s, [{ x: x - 80, y: base - 30 }, { x: x + 90, y: base - 6 }], 961, 0.5);
  for (let i = 0; i < 3; i++) {
    const fx = x + (i - 1) * 34;
    const fh = 120 + 40 * Math.sin(t * 9 + i * 2) + 20 * nz(i, s.boil);
    ctx.fillStyle = i === 1 ? '#FFD24A' : s.p.hi;
    ctx.beginPath();
    ctx.moveTo(fx - 30, base - 20);
    ctx.quadraticCurveTo(fx - 34, base - 20 - fh * 0.6, fx + nz(i + 5, s.boil) * 10, base - 20 - fh);
    ctx.quadraticCurveTo(fx + 34, base - 20 - fh * 0.6, fx + 30, base - 20);
    ctx.fill();
  }
  // Sparks rising.
  for (let i = 0; i < 8; i++) {
    const u = ((t * 0.7 + i / 8) % 1);
    ctx.fillStyle = `rgba(255,200,90,${1 - u})`;
    ctx.fillRect(x + Math.sin(t * 3 + i * 2) * 30 * u + nz(i, 3) * 20, base - 140 - u * 380, 5, 5);
  }
}

// ── Sets ──────────────────────────────────────────────────────────────────
function bedroom(s: S): void {
  const { ctx, p, t } = s;
  room(s);
  layer(s, 0.35, () => {
    windowAt(s, 640, 560, 280, 320, 1000, 'trees');
    frame(s, 150, 620, 170, 130, 1010);
    wallClock(s, 470, 640, 50);
  });
  // A rug, then the bed, the blanket moving a little.
  s.ctx.fillStyle = p.fill2;
  s.ctx.beginPath();
  s.ctx.ellipse(560, G + 60, 360, 46, 0, 0, Math.PI * 2);
  s.ctx.fill();
  box(s, 30, G - 400, 60, 400, p.fill, 1020, 14);
  box(s, 60, G - 210, 400, 150, p.fill, 1021, 12);
  const lift = Math.sin(t * 1.2) * 5;
  ctx.fillStyle = p.fill2;
  ctx.beginPath();
  ctx.moveTo(200, G - 205);
  ctx.quadraticCurveTo(330, G - 250 - lift, 470, G - 215);
  ctx.lineTo(475, G - 70);
  ctx.lineTo(200, G - 70);
  ctx.closePath();
  ctx.fill();
  ink(s);
  ctx.stroke();
  box(s, 95, G - 262, 120, 62, s.p.face, 1022, 26);
  ink(s);
  pen(s, [{ x: 80, y: G - 60 }, { x: 80, y: G }], 1023, 0);
  pen(s, [{ x: 440, y: G - 60 }, { x: 440, y: G }], 1024, 0);
  // Night stand and lamp.
  box(s, 900, G - 200, 170, 200, p.fill, 1025, 8);
  ink(s);
  pen(s, [{ x: 985, y: G - 200 }, { x: 985, y: G - 300 }], 1026, 0);
  ctx.fillStyle = p.fill2;
  ctx.beginPath();
  ctx.moveTo(935, G - 300);
  ctx.lineTo(1035, G - 300);
  ctx.lineTo(1010, G - 380);
  ctx.lineTo(960, G - 380);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (p.night || p.dusk) glow(s, 985, G - 320, 300, 0.55);
}

function kitchen(s: S): void {
  const { ctx, p, t } = s;
  room(s);
  layer(s, 0.35, () => {
    windowAt(s, 330, 560, 250, 260, 1100, 'trees');
    for (let i = 0; i < 3; i++) box(s, 700 + i * 130, 520, 126, 220, p.fill, 1101 + i, 6);
    wallClock(s, 160, 620, 46);
  });
  // Fridge on the left.
  box(s, -20, G - 680, 230, 680, p.face, 1110, 18);
  ink(s);
  pen(s, [{ x: -20, y: G - 430 }, { x: 210, y: G - 430 }], 1111, 0.6);
  pen(s, [{ x: 180, y: G - 620 }, { x: 180, y: G - 480 }], 1112, 0);
  pen(s, [{ x: 180, y: G - 380 }, { x: 180, y: G - 240 }], 1113, 0);
  box(s, 40, G - 600, 60, 70, p.fill2, 1114, 4);
  // Counter and stove on the right, a pot steaming.
  box(s, 730, G - 300, 420, 300, p.fill, 1120, 6);
  ink(s);
  for (let i = 0; i < 3; i++) pen(s, [{ x: 760 + i * 130, y: G - 260 }, { x: 860 + i * 130, y: G - 260 }], 1121 + i, 0);
  box(s, 800, G - 380, 160, 80, p.fill2, 1125, 10);
  ink(s);
  pen(s, [{ x: 780, y: G - 370 }, { x: 980, y: G - 370 }], 1126, 0);
  for (let i = 0; i < 4; i++) {
    const u = (t * 0.5 + i / 4) % 1;
    ctx.save();
    ctx.globalAlpha = 0.6 * (1 - u);
    ink(s, 0.9);
    const x = 880 + (i - 1.5) * 26 + Math.sin(t * 2 + i) * 14;
    const y = G - 400 - u * 230;
    pen(s, [{ x, y }, { x: x + 14, y: y - 30 }, { x: x - 4, y: y - 60 }], 1130 + i, 2);
    ctx.restore();
  }
}

function office(s: S): void {
  const { ctx, p, t } = s;
  room(s);
  layer(s, 0.45, () => windowAt(s, -60, 520, W + 120, 420, 1200, 'city'));
  // Ceiling lights, one flickering now and then.
  for (let i = 0; i < 3; i++) {
    const x = 120 + i * 380;
    box(s, x, 430, 240, 22, p.face, 1210 + i, 8);
    const off = i === 2 && Math.sin(t * 0.9) > 0.92 && Math.sin(t * 40) > 0;
    if (!off) glow(s, x + 120, 470, 220, p.light ? 0.25 : 0.35);
  }
  plant(s, 110, G, 1.1);
  // Water cooler with a bubble now and then.
  box(s, 900, G - 260, 150, 260, p.fill, 1220, 10);
  box(s, 920, G - 470, 110, 210, p.win, 1221, 30);
  for (let i = 0; i < 3; i++) {
    const u = (t * 0.4 + i / 3) % 1;
    if (Math.sin(t * 0.8 + i) < 0) continue;
    circle(s, 975 + Math.sin(t * 3 + i) * 12, G - 280 - u * 170, 9 + 4 * u, null);
  }
  void ctx;
}

function classroom(s: S): void {
  const { ctx, p, t } = s;
  room(s);
  layer(s, 0.3, () => {
    ctx.fillStyle = p.dusk ? '#1C2A22' : p.light ? '#3E5E4C' : '#1E3328';
    ctx.fillRect(110, 520, 860, 420);
    ink(s, 1.6);
    pen(s, [{ x: 110, y: 520 }, { x: 970, y: 520 }, { x: 970, y: 940 }, { x: 110, y: 940 }, { x: 110, y: 519 }], 1300, 1);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#F0F0E8';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    // Old chalk work, faded.
    pen({ ...s, p: { ...p, line: '#F0F0E8' } }, [{ x: 170, y: 600 }, { x: 330, y: 600 }], 1301, 2);
    pen({ ...s, p: { ...p, line: '#F0F0E8' } }, [{ x: 170, y: 660 }, { x: 420, y: 660 }], 1302, 2);
    pen({ ...s, p: { ...p, line: '#F0F0E8' } }, [{ x: 640, y: 820 }, { x: 700, y: 700 }, { x: 760, y: 780 }, { x: 840, y: 620 }, { x: 910, y: 640 }], 1303, 2);
    ctx.restore();
    box(s, 140, 940, 820, 16, p.fill, 1304);
    wallClock(s, 1010, 470, 44);
  });
  // Teacher's desk, a stack of books and an apple.
  box(s, 790, G - 230, 300, 230, p.fill, 1310, 6);
  box(s, 830, G - 290, 130, 30, p.fill2, 1311, 4);
  box(s, 845, G - 320, 110, 30, p.face, 1312, 4);
  circle(s, 1020, G - 260, 28, '#D94A3A');
  void t;
}

function hospital(s: S): void {
  const { ctx, p, t } = s;
  room(s);
  layer(s, 0.35, () => windowAt(s, 150, 560, 260, 300, 1400, 'sky'));
  // Curtain on a rail at the left edge.
  ink(s, 1.2);
  pen(s, [{ x: -60, y: 460 }, { x: 140, y: 460 }], 1401, 0.5);
  ctx.fillStyle = p.fill2;
  ctx.beginPath();
  ctx.moveTo(-60, 460);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-60 + i * 30 + Math.sin(t * 1.2 + i) * 4, 460 + (i % 2) * 10);
  ctx.lineTo(120 + Math.sin(t * 1.1) * 10, G - 20);
  ctx.lineTo(-60, G - 20);
  ctx.closePath();
  ctx.fill();
  ink(s);
  ctx.stroke();
  // Bed on the right.
  box(s, 700, G - 200, 420, 90, p.face, 1410, 10);
  box(s, 1060, G - 330, 40, 330, p.fill, 1411, 8);
  ink(s);
  pen(s, [{ x: 720, y: G - 110 }, { x: 720, y: G }], 1412, 0);
  pen(s, [{ x: 1040, y: G - 110 }, { x: 1040, y: G }], 1413, 0);
  pen(s, [{ x: 740, y: G - 250 }, { x: 1000, y: G - 250 }], 1414, 0.5);
  // Drip stand with a falling drop.
  ink(s, 1.1);
  pen(s, [{ x: 640, y: G }, { x: 640, y: G - 640 }, { x: 600, y: G - 640 }], 1420, 0);
  box(s, 560, G - 640, 80, 110, p.win, 1421, 18);
  const u = (t * 0.8) % 1;
  ctx.fillStyle = p.line;
  ctx.beginPath();
  ctx.arc(600, G - 520 + u * 60, 6, 0, Math.PI * 2);
  ctx.fill();
  // Heart monitor: the trace runs, a blip every beat.
  box(s, 860, G - 620, 230, 170, '#0D1A14', 1430, 14);
  ctx.save();
  ctx.beginPath();
  ctx.rect(870, G - 610, 210, 150);
  ctx.clip();
  ctx.strokeStyle = '#3DFF8A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let x = 0; x <= 210; x += 4) {
    const ph = (x / 210 + t * 0.9) % 1;
    const y = ph > 0.45 && ph < 0.5 ? -50 * Math.sin(((ph - 0.45) / 0.05) * Math.PI) : ph > 0.5 && ph < 0.53 ? 20 : 0;
    if (x === 0) ctx.moveTo(870 + x, G - 535 + y);
    else ctx.lineTo(870 + x, G - 535 + y);
  }
  ctx.stroke();
  ctx.restore();
  ink(s);
  pen(s, [{ x: 975, y: G - 450 }, { x: 975, y: G - 330 }], 1431, 0);
}

function store(s: S): void {
  const { ctx, p, t } = s;
  room(s);
  layer(s, 0.3, () => {
    box(s, 380, 470, 320, 110, p.fill2, 1500, 14);
    ctx.save();
    ctx.font = '900 64px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.line;
    ctx.fillText('OPEN', 540, 548);
    ctx.restore();
    for (let i = 0; i < 4; i++) glow(s, 140 + i * 270, 440, 200, p.light ? 0.18 + 0.04 * Math.sin(t * 30 + i) : 0.3);
  });
  for (const [x0, seed] of [[-40, 1510], [790, 1530]] as const) {
    box(s, x0, G - 760, 330, 760, p.fill, seed, 6);
    for (let r = 0; r < 4; r++) {
      const y = G - 760 + 40 + r * 180;
      ink(s);
      pen(s, [{ x: x0, y: y + 140 }, { x: x0 + 330, y: y + 140 }], seed + r, 0.4);
      for (let k = 0; k < 4; k++) {
        const bh = 70 + 50 * r01(seed + r * 4 + k, 1);
        const col = (r + k) % 3 === 0 ? p.fill2 : (r + k) % 3 === 1 ? p.face : p.leaf;
        box(s, x0 + 20 + k * 76, y + 140 - bh, 62, bh, col, seed + 10 + r * 4 + k, 6);
      }
    }
  }
}

function street(s: S): void {
  const { ctx, p } = s;
  // Far houses on the back line, the road, a lamp post.
  layer(s, 0.55, () => {
    for (let i = -1; i < 6; i++) {
      const x = i * 250 + 20;
      const h = 210 + 70 * r01(i, 4);
      const base = G - 150;
      box(s, x, base - h, 210, h, i % 2 ? p.fill : p.wall, 1600 + i * 7);
      ctx.fillStyle = i % 2 ? p.fill2 : p.fill;
      ctx.beginPath();
      ctx.moveTo(x - 20, base - h);
      ctx.lineTo(x + 105, base - h - 100);
      ctx.lineTo(x + 230, base - h);
      ctx.closePath();
      ctx.fill();
      ink(s);
      ctx.stroke();
      const lit = p.night || p.dusk;
      for (const wx of [40, 130]) {
        ctx.fillStyle = lit && r01(i, wx) > 0.3 ? '#FFD27A' : p.win;
        ctx.fillRect(x + wx, base - h + 50, 44, 56);
        ink(s, 0.7);
        ctx.strokeRect(x + wx, base - h + 50, 44, 56);
      }
    }
  });
  ctx.fillStyle = p.dusk ? '#1E1024' : p.light ? mixHex(p.floor, '#000000', 0.1) : p.fill;
  ctx.fillRect(-W, G - 150, W * 3, 150);
  ink(s, 0.8);
  for (let x = -W; x < W * 2; x += 160) pen(s, [{ x, y: G - 78 }, { x: x + 80, y: G - 78 }], 1650 + x, 0);
  pen(s, [{ x: -W, y: G - 150 }, { x: W * 2, y: G - 150 }], 1660, 0.6);
  traffic(s, G - 40, 0.62, 0);
  layer(s, 0.15, () => birds(s, 3));
  lampPost(s, 960, 640);
}

function city(s: S): void {
  const { ctx, p, t } = s;
  layer(s, 0.7, () => {
    for (let i = -2; i < 10; i++) {
      const bw = 150;
      const h = 380 + 380 * r01(i, 7);
      const x = i * 135;
      ctx.fillStyle = p.dusk ? '#2B1733' : p.light ? mixHex(p.wall, '#000000', 0.08) : p.fill;
      ctx.fillRect(x, G - 150 - h, bw, h);
      for (let r = 0; r < Math.floor(h / 70); r++)
        for (let c = 0; c < 3; c++) {
          const on = (p.night || p.dusk) && Math.sin(t * 0.4 + i * 5 + r * 3 + c * 7) > -0.2;
          ctx.fillStyle = on ? 'rgba(255,210,122,0.85)' : p.light ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.08)';
          ctx.fillRect(x + 18 + c * 44, G - 120 - h + r * 70, 26, 34);
        }
    }
    // A plane, its light blinking.
    const u = (t * 0.04) % 1;
    const px = -200 + u * (W + 400);
    ink(s, 0.6);
    pen(s, [{ x: px - 40, y: 700 }, { x: px + 40, y: 694 }], 1700, 0);
    if (Math.sin(t * 6) > 0.5) circle(s, px + 40, 694, 6, '#FF5A4A', false);
  });
  ctx.fillStyle = p.dusk ? '#1E1024' : p.light ? mixHex(p.floor, '#000000', 0.1) : p.fill;
  ctx.fillRect(-W, G - 150, W * 3, 150);
  ink(s, 0.8);
  for (let x = -W; x < W * 2; x += 160) pen(s, [{ x, y: G - 78 }, { x: x + 80, y: G - 78 }], 1750 + x, 0);
  traffic(s, G - 40, 0.62, 2);
  lampPost(s, 130 + 820, 640);
}

function door(s: S): void {
  const { ctx, p, local } = s;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = p.wall;
  ctx.fillRect(-W, 380, W * 3, G - 380);
  ctx.restore();
  ink(s, 0.6);
  for (let y = 420; y < G; y += 64) pen(s, [{ x: -W, y }, { x: W * 2, y }], 1800 + y, 0.8);
  ink(s, 1.2);
  pen(s, [{ x: -W, y: 380 }, { x: W * 2, y: 380 }], 1801, 0.6);
  // Knocks: the door jumps three times.
  const hits = STICK_KNOCKS;
  let shake = 0;
  if (s.knock) for (const h of hits) if (local > h && local < h + 0.12) shake = Math.sin(((local - h) / 0.12) * Math.PI * 3) * 7;
  ctx.save();
  ctx.translate(shake, 0);
  box(s, 700, G - 620, 290, 620, p.fill2, 1810, 6);
  ink(s);
  pen(s, [{ x: 680, y: G - 640 }, { x: 1010, y: G - 640 }], 1811, 0.5);
  box(s, 740, G - 570, 210, 220, p.fill, 1812, 4);
  box(s, 740, G - 300, 210, 240, p.fill, 1813, 4);
  circle(s, 950, G - 320, 14, p.face);
  ctx.restore();
  if (s.knock)
    for (const h of hits)
      if (local > h && local < h + 0.25) {
        const k = (local - h) / 0.25;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = p.hi;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const a = -0.5 + i * 0.5;
          ctx.beginPath();
          ctx.moveTo(1010 + Math.cos(a) * (30 + 40 * k), G - 380 + Math.sin(a) * (30 + 40 * k));
          ctx.lineTo(1010 + Math.cos(a) * (70 + 50 * k), G - 380 + Math.sin(a) * (70 + 50 * k));
          ctx.stroke();
        }
        ctx.restore();
      }
  // A window with a curtain, a porch light, a mat.
  windowAt(s, 40, G - 600, 230, 260, 1820, 'sky');
  box(s, 1020, G - 720, 50, 70, p.face, 1830, 10);
  if (p.night || p.dusk) glow(s, 1045, G - 680, 280, 0.6);
  box(s, 690, G - 26, 310, 26, p.fill, 1831, 4);
}

function forest(s: S): void {
  const { p } = s;
  layer(s, 0.7, () => {
    for (let i = -2; i < 12; i++) pine(s, i * 110 + 30 * nz(i, 1), G - 20, 300 + 120 * r01(i, 2), p.dusk ? '#2B1733' : mixHex(p.leaf, p.light ? '#FFFFFF' : '#000000', 0.35), 2000 + i, false);
  });
  layer(s, 0.35, () => {
    for (let i = -1; i < 6; i++) pine(s, i * 230 + 80, G, 480 + 140 * r01(i, 5), p.dusk ? '#231229' : p.leaf, 2050 + i);
  });
  // Near trunks at the edges.
  box(s, -30, 300, 90, G - 300, p.fill, 2090, 0);
  box(s, 1010, 260, 100, G - 260, p.fill, 2091, 0);
  fallingLeaves(s, 7, 0, W, 2100);
  layer(s, 0.2, () => birds(s, 7, 760));
}

function park(s: S): void {
  const { ctx, p } = s;
  layer(s, 0.6, () => {
    for (let i = -1; i < 8; i++) {
      ctx.fillStyle = p.dusk ? '#2B1733' : mixHex(p.leaf, p.light ? '#FFFFFF' : '#000000', 0.3);
      ctx.beginPath();
      ctx.arc(i * 170, G - 120, 110 + 30 * r01(i, 8), Math.PI, 0);
      ctx.fill();
    }
  });
  roundTree(s, 150, G, 760, 1);
  // A bench.
  ink(s, 1.2);
  box(s, 760, G - 190, 300, 26, p.fill2, 2200, 6);
  box(s, 760, G - 290, 300, 26, p.fill2, 2201, 6);
  pen(s, [{ x: 790, y: G - 164 }, { x: 790, y: G }], 2202, 0);
  pen(s, [{ x: 1030, y: G - 164 }, { x: 1030, y: G }], 2203, 0);
  pen(s, [{ x: 790, y: G - 264 }, { x: 790, y: G - 190 }], 2204, 0);
  pen(s, [{ x: 1030, y: G - 264 }, { x: 1030, y: G - 190 }], 2205, 0);
  fallingLeaves(s, 4, 0, 400, 2210);
  layer(s, 0.2, () => birds(s, 1, 820));
}

function camp(s: S): void {
  const { ctx, p } = s;
  layer(s, 0.7, () => {
    for (let i = -2; i < 12; i++) pine(s, i * 120 + 40 * nz(i, 3), G - 10, 260 + 140 * r01(i, 4), p.dusk ? '#231229' : mixHex(p.leaf, p.light ? '#FFFFFF' : '#000000', 0.25), 2300 + i, false);
  });
  // Tent on the right.
  ctx.fillStyle = p.fill2;
  ctx.beginPath();
  ctx.moveTo(700, G);
  ctx.lineTo(900, G - 380);
  ctx.lineTo(1120, G);
  ctx.closePath();
  ctx.fill();
  ink(s, 1.2);
  ctx.stroke();
  ctx.fillStyle = p.line;
  ctx.beginPath();
  ctx.moveTo(850, G);
  ctx.lineTo(900, G - 220);
  ctx.lineTo(950, G);
  ctx.closePath();
  ctx.fill();
  campfire(s, 220, G);
}

const SETS: Record<string, (s: S) => void> = { bedroom, kitchen, office, classroom, hospital, store, street, city, door, forest, park, camp };

export function drawSet(ctx: Ctx, name: string, p: Pal, o: { t: number; boil: number; pan: number; local: number; knock: boolean }): void {
  const fn = SETS[name];
  if (!fn) return;
  ctx.save();
  fn({ ctx, p, ...o });
  ctx.restore();
}

// ── Sky and weather (screen space) ────────────────────────────────────────
/** Night over the background: a dark wash, stars and the moon (scenes indoors cover it). */
export function nightSky(ctx: Ctx, p: Pal, t: number): void {
  ctx.fillStyle = p.dusk ? 'rgba(12,6,32,0.62)' : p.light ? 'rgba(24,30,64,0.62)' : 'rgba(8,10,30,0.5)';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(255,250,230,${0.3 + 0.5 * Math.abs(Math.sin(t * 1.1 + i * 1.7))})`;
    ctx.fillRect(r01(i, 31) * W, r01(i, 32) * G * 0.62, 3, 3);
  }
  const g = ctx.createRadialGradient(850, 680, 0, 850, 680, 220);
  g.addColorStop(0, 'rgba(244,240,216,0.35)');
  g.addColorStop(1, 'rgba(244,240,216,0)');
  ctx.fillStyle = g;
  ctx.fillRect(630, 460, 440, 440);
  ctx.fillStyle = '#F4F0D8';
  ctx.beginPath();
  ctx.arc(850, 680, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ctx.arc(830, 665, 14, 0, Math.PI * 2);
  ctx.arc(870, 700, 10, 0, Math.PI * 2);
  ctx.fill();
}

const LIGHTNING_AT = STICK_LIGHTNING_AT;

/** Rain, snow, wind, fog or a storm over everything (under the captions). strike = this beat starts the storm (a flash). */
export function weatherFx(ctx: Ctx, kind: string, p: Pal, t: number, local: number, strike: boolean): void {
  if (kind === 'rain' || kind === 'storm') {
    const heavy = kind === 'storm';
    if (heavy) {
      ctx.fillStyle = 'rgba(16,20,40,0.28)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.strokeStyle = p.light ? 'rgba(60,90,140,0.42)' : 'rgba(205,220,255,0.38)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const n = heavy ? 170 : 110;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = 1700 + 600 * r01(i, 41);
      const y = ((r01(i, 42) * H + t * sp) % (H + 100)) - 50;
      const x = ((r01(i, 43) * (W + 300) - y * 0.18) % (W + 300) + W + 300) % (W + 300) - 150;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 10, y + 52);
    }
    ctx.stroke();
    // Splashes on the ground.
    for (let i = 0; i < 14; i++) {
      const u = (t * 2.3 + r01(i, 44)) % 1;
      const x = r01(i, 45 + Math.floor(t * 2.3 + r01(i, 44))) * W;
      ctx.globalAlpha = 1 - u;
      ctx.beginPath();
      ctx.ellipse(x, G + 4, 6 + 22 * u, 3 + 6 * u, 0, Math.PI, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (heavy && strike && local > LIGHTNING_AT && local < LIGHTNING_AT + 0.45) {
      const k = (local - LIGHTNING_AT) / 0.45;
      const a = k < 0.1 ? 0.85 : k < 0.2 ? 0.2 : k < 0.3 ? 0.6 : 0.6 * (1 - k);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(255,250,200,${Math.min(1, a * 1.4)})`;
      ctx.lineWidth = 10;
      ctx.beginPath();
      let x = 760;
      let y = 0;
      ctx.moveTo(x, y);
      for (let i = 0; i < 7; i++) {
        x += nz(i, 77) * 80;
        y += 120;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (kind === 'snow') {
    for (let i = 0; i < 110; i++) {
      const sp = 90 + 110 * r01(i, 51);
      const y = ((r01(i, 52) * H + t * sp) % (H + 40)) - 20;
      const x = (r01(i, 53) * W + Math.sin(t * 1.2 + i) * 34 + W) % W;
      const r = 4 + 6 * r01(i, 54);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (p.light) {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // Snow building up on the ground.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, G + 10);
    for (let x = 0; x <= W; x += 60) ctx.lineTo(x, G - 6 - 8 * Math.sin(x * 0.03));
    ctx.lineTo(W, G + 10);
    ctx.fill();
  } else if (kind === 'wind') {
    ctx.strokeStyle = p.light ? 'rgba(40,40,40,0.25)' : 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const sp = 900 + 500 * r01(i, 61);
      const x = ((r01(i, 62) * (W + 600) + t * sp) % (W + 600)) - 300;
      const y = 650 + r01(i, 63) * 800;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 80, y - 10, x + 140, y + 20, x + 220, y - 6);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const sp = 700 + 300 * r01(i, 64);
      const x = ((r01(i, 65) * (W + 400) + t * sp) % (W + 400)) - 200;
      const y = 800 + r01(i, 66) * 600 + Math.sin(t * 4 + i) * 60;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 6 + i);
      ctx.fillStyle = i % 2 ? p.leaf : p.fill2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (kind === 'fog') {
    for (let i = 0; i < 6; i++) {
      const x = ((r01(i, 71) * (W + 800) + t * (30 + 20 * i)) % (W + 800)) - 400;
      const y = 900 + r01(i, 72) * 600;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 420);
      const c = p.dusk ? '255,200,220' : p.light ? '255,255,255' : '200,210,230';
      g.addColorStop(0, `rgba(${c},0.45)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - 420, y - 420, 840, 840);
    }
  }
}

/** A whip pan between scenes: speed lines across the frame. k = 1 at the start of the move, 0 when it lands. */
export function whipLines(ctx: Ctx, p: Pal, k: number): void {
  if (k <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.4);
  ctx.strokeStyle = p.light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    const y = 300 + r01(i, 81) * 1400;
    const len = 300 + 500 * r01(i, 82);
    const x = r01(i, 83) * W;
    ctx.lineWidth = 4 + 8 * r01(i, 84);
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
    ctx.stroke();
  }
  ctx.restore();
}
