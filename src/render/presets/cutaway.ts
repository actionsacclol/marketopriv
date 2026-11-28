import * as THREE from 'three';
import { storyBeats, str, type StoryBeat } from '@shared/presets';
import { isCutItem, type CutItem } from '@shared/cutaway';
import { perfNow } from '../../lib/perf';
import { makeRenderer } from '../char3d';
import { captions } from './duo';
import { applyView, fxMoves, fxPost, fxView } from './fx';
import { FONT, H, W, clamp01, easeBack, easeInOut, easeOut, fit, font, lerp, markLightFrame, prog, registerPreset, rrect, withAlpha, type Ctx, type Env } from '../engine';

// Backyard cutaways: a block of ground cut open like a cake, the house on top. Each line builds one thing, dug out on
// the cut face (drawn as a cross-section on a canvas that is the block's front face) or standing on the lawn (3D),
// and it stays. A slow orbit camera, a label on the newest build, a running total of what it all cost.

const D = Math.PI / 180;
const RW = 810;
const RH = 1440;
// The block: x -5..5, z -4..4 (z = 4 is the cut face), y 0 (lawn) down to -6.
export const BX = 5;
export const BZ = 4;
export const BY = 6;
export const FW = 1024;
export const FH = Math.round((FW * BY) / (BX * 2));
export const TW = 1024;
export const TH = Math.round((TW * BZ * 2) / (BX * 2));
const fx = (x: number): number => ((x + BX) / (BX * 2)) * FW;
const fy = (y: number): number => (-y / BY) * FH;
export const tx = (x: number): number => ((x + BX) / (BX * 2)) * TW;
export const tz = (z: number): number => ((z + BZ) / (BZ * 2)) * TH;
const sx = FW / (BX * 2);

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export type SoilLayer = { to: number; color: string; dot: string };
export const LAYERS: SoilLayer[] = [
  { to: -0.25, color: '#5DBB4C', dot: '#4AA43C' },
  { to: -1.4, color: '#8B5A35', dot: '#6F4527' },
  { to: -2.8, color: '#B4733F', dot: '#99602F' },
  { to: -4.4, color: '#857A70', dot: '#6C625A' },
  { to: -6, color: '#5E544D', dot: '#4A423C' },
];

/** Where each build sits: its anchor (the point its label points at), in world units. */
export const ANCHOR: Record<CutItem, [number, number, number]> = {
  house: [0.4, 2.8, -2.2],
  basement: [-2, -1.4, BZ],
  pool: [2.2, -0.6, BZ],
  pond: [-3.1, -0.3, BZ],
  well: [0, 1.1, 3.4],
  pipe: [-3.6, -2.05, BZ],
  cable: [3.4, -0.7, BZ],
  septic: [3.85, -2.2, BZ],
  tunnel: [2.6, -3.9, BZ],
  bunker: [-2.6, -4.2, BZ],
  cave: [2.9, -5.2, BZ],
  tree: [4.3, 3.4, 3.3],
  garden: [-3.5, 0.6, -1.8],
  water: [0, -5.3, BZ],
};

// ── The cut face and the lawn, painted ─────────────────────────────────────
let baseFront: HTMLCanvasElement | null = null;
let baseTop: HTMLCanvasElement | null = null;
let baseSide: HTMLCanvasElement | null = null;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** The soil layers with wavy edges and stones, the same on the face and the side. */
export function layersCanvas(w: number, span: number, layers: SoilLayer[] = LAYERS, edge: string | null = '#4FA83F'): HTMLCanvasElement {
  const [c, g] = canvas(w, FH);
  let top = 0;
  layers.forEach((L, k) => {
    g.fillStyle = L.color;
    g.beginPath();
    g.moveTo(0, top === 0 ? 0 : fy(top) + 6 * Math.sin(k));
    for (let x = 0; x <= w; x += 16) g.lineTo(x, top === 0 ? 0 : fy(top) + 8 * Math.sin(x * 0.02 + k * 2) + 4 * Math.sin(x * 0.07 + k));
    g.lineTo(w, FH);
    g.lineTo(0, FH);
    g.closePath();
    g.fill();
    const y0 = fy(top);
    const y1 = fy(L.to);
    const n = Math.round(((y1 - y0) * w) / 900);
    for (let i = 0; i < n; i++) {
      const x = hash(i + k * 1000 + span) * w;
      const y = y0 + 10 + hash(i * 3 + k * 77 + span) * (y1 - y0 - 14);
      const r = k >= 3 ? 4 + hash(i + 9) * 12 : 1.5 + hash(i + 9) * 4;
      g.fillStyle = L.dot;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.7, hash(i) * 3, 0, Math.PI * 2);
      g.fill();
    }
    top = L.to;
  });
  // Grass blades along the top edge.
  if (edge) {
    g.fillStyle = edge;
    for (let x = 0; x < w; x += 7) g.fillRect(x, 0, 3, 8 + hash(x) * 10);
  }
  return c;
}

function lawnCanvas(): HTMLCanvasElement {
  const [c, g] = canvas(TW, TH);
  g.fillStyle = '#66C452';
  g.fillRect(0, 0, TW, TH);
  // Mowing stripes and a few flecks.
  for (let k = 0; k < 10; k++) {
    g.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    g.fillRect((k * TW) / 10, 0, TW / 10, TH);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = hash(i) > 0.5 ? 'rgba(40,110,30,0.35)' : 'rgba(170,230,120,0.35)';
    g.fillRect(hash(i + 3) * TW, hash(i + 7) * TH, 2, 5);
  }
  return c;
}

const DIRT = '#2B1B12';

/** A cavity dug down from its top over the first part of p, then what fills it fading in. */
function dig(g: CanvasRenderingContext2D, p: number, x0: number, y0: number, x1: number, y1: number, shape: () => void, fill: (a: number) => void): void {
  const d = easeOut(clamp01(p / 0.55));
  if (d <= 0) return;
  g.save();
  g.beginPath();
  g.rect(fx(x0) - 4, fy(y0) - 4, fx(x1) - fx(x0) + 8, (fy(y1) - fy(y0) + 8) * d);
  g.clip();
  shape();
  g.fillStyle = DIRT;
  g.fill();
  const a = clamp01((p - 0.45) / 0.45);
  if (a > 0) {
    g.globalAlpha = a;
    shape();
    g.save();
    g.clip();
    fill(a);
    g.restore();
    g.globalAlpha = 1;
  }
  g.restore();
}

function rr(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: number): void {
  const X = fx(x0);
  const Y = fy(y0);
  const w = fx(x1) - X;
  const h = fy(y1) - Y;
  const k = Math.min(r * sx, w / 2, h / 2);
  g.beginPath();
  g.roundRect(X, Y, w, h, k);
}

function room(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, wall: string, floor: string, lit: string): void {
  const X = fx(x0);
  const Y = fy(y0);
  const w = fx(x1) - X;
  const h = fy(y1) - Y;
  g.fillStyle = wall;
  g.fillRect(X, Y, w, h);
  const glow = g.createRadialGradient(X + w / 2, Y + 18, 4, X + w / 2, Y + 18, w * 0.7);
  glow.addColorStop(0, lit);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(X, Y, w, h);
  g.fillStyle = floor;
  g.fillRect(X, Y + h - 12, w, 12);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 8;
  g.strokeRect(X + 4, Y + 4, w - 8, h - 8);
  // The lamp.
  g.fillStyle = '#FFF2B8';
  g.beginPath();
  g.arc(X + w / 2, Y + 16, 7, 0, Math.PI * 2);
  g.fill();
}

export type Built = { item: CutItem; p: number };

export function paintFront(g: CanvasRenderingContext2D, built: Built[], t: number, base?: HTMLCanvasElement): void {
  g.drawImage(base ?? (baseFront ??= layersCanvas(FW, 1)), 0, 0);
  const p = (item: CutItem): number => built.find((b) => b.item === item)?.p ?? 0;
  // Under everything: the water table, the main pipe, the cable.
  const wt = p('water');
  if (wt > 0) {
    const y = fy(-4.6);
    g.fillStyle = `rgba(60,140,230,${0.45 * wt})`;
    g.fillRect(0, y + (FH - y) * (1 - wt), FW, (FH - y) * wt);
    g.strokeStyle = `rgba(190,230,255,${0.6 * wt})`;
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= FW; x += 12) g.lineTo(x, y + (FH - y) * (1 - wt) + 4 * Math.sin(x * 0.03 + t * 2));
    g.stroke();
  }
  const pipe = p('pipe');
  if (pipe > 0) {
    const w = FW * easeOut(clamp01(pipe / 0.8));
    g.fillStyle = '#3D7BD9';
    g.fillRect(0, fy(-1.92), w, fy(-2.18) - fy(-1.92));
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, fy(-1.92) + 3, w, 4);
    g.fillStyle = '#2C5DAA';
    for (let x = 60; x < w; x += 170) g.fillRect(x, fy(-1.88), 14, fy(-2.22) - fy(-1.88));
  }
  const cable = p('cable');
  if (cable > 0) {
    const w = FW * easeOut(clamp01(cable / 0.8));
    g.strokeStyle = '#F2B233';
    g.lineWidth = 6;
    g.setLineDash([26, 10]);
    g.beginPath();
    g.moveTo(FW, fy(-0.7));
    g.lineTo(FW - w, fy(-0.7));
    g.stroke();
    g.setLineDash([]);
  }
  // Roots under the tree, growing down.
  const tree = p('tree');
  if (tree > 0) {
    g.strokeStyle = '#5A3A22';
    g.lineCap = 'round';
    const grow = easeOut(clamp01(tree / 0.9));
    const root = (x: number, y: number, a: number, len: number, w: number, depth: number, seed: number): void => {
      if (depth > 3 || len < 6) return;
      const ex = x + Math.cos(a) * len * grow;
      const ey = y + Math.sin(a) * len * grow;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo((x + ex) / 2 + 8 * Math.sin(seed), (y + ey) / 2, ex, ey);
      g.stroke();
      root(ex, ey, a - 0.4 - hash(seed) * 0.3, len * 0.66, w * 0.62, depth + 1, seed * 2 + 1);
      root(ex, ey, a + 0.35 + hash(seed + 1) * 0.3, len * 0.62, w * 0.62, depth + 1, seed * 2 + 2);
    };
    const x0 = fx(4.3);
    root(x0, 0, Math.PI * 0.62, 70, 14, 0, 1);
    root(x0, 0, Math.PI * 0.5, 90, 16, 0, 2);
    root(x0, 0, Math.PI * 0.36, 60, 12, 0, 3);
  }
  // Cavities.
  const pool = p('pool');
  if (pool > 0)
    dig(g, pool, 0.8, 0, 3.6, -1.7, () => rr(g, 0.8, -0.02, 3.6, -1.7, 0.5), () => {
      g.fillStyle = '#E9F4FA';
      g.fillRect(fx(0.8), fy(0), fx(3.6) - fx(0.8), fy(-1.7));
      const water = g.createLinearGradient(0, fy(-0.15), 0, fy(-1.7));
      water.addColorStop(0, '#59C8F2');
      water.addColorStop(1, '#1F7FC9');
      g.fillStyle = water;
      g.beginPath();
      g.moveTo(fx(0.8), fy(-0.15));
      for (let x = fx(0.8); x <= fx(3.6); x += 8) g.lineTo(x, fy(-0.15) + 3 * Math.sin(x * 0.05 + t * 3));
      g.lineTo(fx(3.6), FH);
      g.lineTo(fx(0.8), FH);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 2;
      for (let x = fx(0.8) + 24; x < fx(3.6); x += 24) {
        g.beginPath();
        g.moveTo(x, fy(-0.2));
        g.lineTo(x, fy(-1.7));
        g.stroke();
      }
    });
  const pond = p('pond');
  if (pond > 0)
    dig(g, pond, -4.4, 0, -1.8, -0.95, () => {
      g.beginPath();
      g.ellipse(fx(-3.1), fy(0), (fx(-1.8) - fx(-4.4)) / 2, fy(-0.95), 0, 0, Math.PI);
    }, () => {
      g.fillStyle = '#3E9DC4';
      g.fillRect(fx(-4.4), fy(-0.1), fx(-1.8) - fx(-4.4), fy(-0.95));
      g.fillStyle = '#E39A3B';
      g.beginPath();
      g.ellipse(fx(-3.3) + 20 * Math.sin(t), fy(-0.5), 12, 6, 0, 0, Math.PI * 2);
      g.fill();
    });
  const basement = p('basement');
  if (basement > 0)
    dig(g, basement, -3.6, -0.3, -0.4, -2.5, () => rr(g, -3.6, -0.3, -0.4, -2.5, 0.05), () => {
      room(g, -3.6, -0.3, -0.4, -2.5, '#EFE3CF', '#9C6B43', 'rgba(255,230,160,0.55)');
      // A sofa and a TV.
      g.fillStyle = '#4E6BD6';
      g.fillRect(fx(-3.3), fy(-1.95), fx(-2.0) - fx(-3.3), fy(-2.4) - fy(-1.95));
      g.fillRect(fx(-3.3), fy(-1.7), 18, fy(-2.4) - fy(-1.7));
      g.fillStyle = '#1B1B22';
      g.fillRect(fx(-1.5), fy(-1.2), fx(-0.7) - fx(-1.5), fy(-1.7) - fy(-1.2));
      g.fillStyle = `rgba(120,200,255,${0.6 + 0.3 * Math.sin(t * 5)})`;
      g.fillRect(fx(-1.5) + 5, fy(-1.2) + 5, fx(-0.7) - fx(-1.5) - 10, fy(-1.7) - fy(-1.2) - 10);
    });
  const septic = p('septic');
  if (septic > 0)
    dig(g, septic, 3.0, -1.6, 4.7, -2.8, () => rr(g, 3.0, -1.6, 4.7, -2.8, 0.5), () => {
      g.fillStyle = '#BDB7AE';
      g.fillRect(fx(3), fy(-1.6), fx(4.7) - fx(3), fy(-2.8) - fy(-1.6));
      g.fillStyle = '#6E6A3A';
      g.fillRect(fx(3), fy(-2.1), fx(4.7) - fx(3), fy(-2.8) - fy(-2.1));
      g.fillStyle = '#9E978C';
      g.fillRect(fx(3.8), fy(-0.25), 16, fy(-1.6) - fy(-0.25));
    });
  const well = p('well');
  if (well > 0)
    dig(g, well, -0.35, 0, 0.35, -5.0, () => rr(g, -0.35, 0, 0.35, -5.0, 0.15), () => {
      g.fillStyle = '#5B5550';
      g.fillRect(fx(-0.35), 0, fx(0.35) - fx(-0.35), fy(-5));
      g.fillStyle = '#7E766E';
      for (let y = 0; y < fy(-5); y += 22)
        for (let k = 0; k < 2; k++) {
          g.fillRect(fx(-0.35) + 2, y + 2 + k * 11, 14, 9);
          g.fillRect(fx(0.35) - 16, y + 2 + k * 11, 14, 9);
        }
      g.fillStyle = '#2F8FD8';
      g.fillRect(fx(-0.35), fy(-4.5), fx(0.35) - fx(-0.35), fy(-5) - fy(-4.5));
      g.strokeStyle = '#C9B48A';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(fx(0), 0);
      g.lineTo(fx(0), fy(-3.6 + 0.4 * Math.sin(t)));
      g.stroke();
      g.fillStyle = '#8A5A2B';
      g.fillRect(fx(0) - 14, fy(-3.6 + 0.4 * Math.sin(t)), 28, 24);
    });
  const tunnel = p('tunnel');
  if (tunnel > 0) {
    const reach = 5 - 4.8 * easeOut(clamp01(tunnel / 0.7));
    dig(g, Math.min(1, tunnel * 1.2), reach, -3.3, 5, -4.4, () => {
      g.beginPath();
      g.moveTo(fx(reach), fy(-4.4));
      g.lineTo(fx(reach), fy(-3.75));
      g.quadraticCurveTo(fx(reach), fy(-3.3), fx(reach) + 40, fy(-3.3));
      g.lineTo(FW, fy(-3.3));
      g.lineTo(FW, fy(-4.4));
      g.closePath();
    }, () => {
      g.fillStyle = '#6F665E';
      g.fillRect(fx(0), fy(-3.3), FW, fy(-4.4) - fy(-3.3));
      g.fillStyle = '#4C4540';
      g.fillRect(fx(0), fy(-4.3), FW, fy(-4.4) - fy(-4.3));
      for (let x = fx(0.4); x < FW; x += 90) {
        const on = 0.7 + 0.3 * Math.sin(t * 4 + x);
        const gl = g.createRadialGradient(x, fy(-3.42), 2, x, fy(-3.42), 46);
        gl.addColorStop(0, `rgba(255,220,140,${on})`);
        gl.addColorStop(1, 'rgba(255,220,140,0)');
        g.fillStyle = gl;
        g.fillRect(x - 46, fy(-3.42) - 46, 92, 92);
      }
    });
  }
  const bunker = p('bunker');
  if (bunker > 0) {
    // The shaft first, then the room.
    dig(g, clamp01(bunker * 1.6), -1.2, 0, -0.8, -3.1, () => rr(g, -1.2, 0, -0.8, -3.1, 0), () => {
      g.fillStyle = '#8D8C88';
      g.fillRect(fx(-1.2), 0, fx(-0.8) - fx(-1.2), fy(-3.1));
      g.strokeStyle = '#C9C6BE';
      g.lineWidth = 4;
      for (let y = 12; y < fy(-3.1); y += 18) {
        g.beginPath();
        g.moveTo(fx(-1.15), y);
        g.lineTo(fx(-0.85), y);
        g.stroke();
      }
    });
    dig(g, clamp01((bunker - 0.3) / 0.7), -4.6, -3.1, -0.6, -5.3, () => rr(g, -4.6, -3.1, -0.6, -5.3, 0.05), () => {
      room(g, -4.6, -3.1, -0.6, -5.3, '#A9AAA6', '#6A6B68', 'rgba(255,240,200,0.5)');
      // Bunk bed, shelves of cans, a door.
      g.fillStyle = '#3F5F3A';
      g.fillRect(fx(-4.4), fy(-4.7), fx(-3.1) - fx(-4.4), 16);
      g.fillRect(fx(-4.4), fy(-5.15), fx(-3.1) - fx(-4.4), 16);
      g.fillStyle = '#5C4A36';
      g.fillRect(fx(-2.8), fy(-3.8), fx(-1.7) - fx(-2.8), 8);
      g.fillRect(fx(-2.8), fy(-4.4), fx(-1.7) - fx(-2.8), 8);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = ['#D9483B', '#E7C24A', '#4A8FD9'][k % 3];
        g.fillRect(fx(-2.75) + k * 17, fy(-3.8) - 22, 12, 22);
        g.fillRect(fx(-2.75) + k * 17, fy(-4.4) - 22, 12, 22);
      }
      g.fillStyle = '#55585C';
      g.fillRect(fx(-1.35), fy(-4.2), fx(-0.75) - fx(-1.35), fy(-5.25) - fy(-4.2));
      g.fillStyle = '#E2C14A';
      g.beginPath();
      g.arc(fx(-1.05), fy(-4.7), 9, 0, Math.PI * 2);
      g.fill();
    });
  }
  const cave = p('cave');
  if (cave > 0)
    dig(g, cave, 1.2, -4.6, 4.6, -5.8, () => {
      g.beginPath();
      const n = 20;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const r = 1 + 0.18 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 7);
        const x = fx(2.9) + Math.cos(a) * ((fx(4.6) - fx(1.2)) / 2) * r;
        const y = fy(-5.2) + Math.sin(a) * ((fy(-5.8) - fy(-4.6)) / 2) * r;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    }, () => {
      g.fillStyle = '#3A322D';
      g.fillRect(fx(1), fy(-4.4), fx(4.8) - fx(1), fy(-6) - fy(-4.4));
      g.fillStyle = '#6B5F55';
      for (let k = 0; k < 8; k++) {
        const x = fx(1.6) + k * ((fx(4.2) - fx(1.6)) / 7);
        g.beginPath();
        g.moveTo(x - 10, fy(-4.55));
        g.lineTo(x + 10, fy(-4.55));
        g.lineTo(x, fy(-4.55) + 22 + 18 * hash(k));
        g.fill();
      }
      g.fillStyle = '#2E7FBF';
      g.beginPath();
      g.ellipse(fx(3.1), fy(-5.7), 90, 14, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(120,255,210,0.5)';
      for (let k = 0; k < 6; k++) g.fillRect(fx(1.8) + k * 55, fy(-5.0) + 30 * hash(k + 3), 6, 6);
    });
  // A thin dark line round the edge.
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 6;
  g.strokeRect(0, 0, FW, FH);
}

function paintTop(g: CanvasRenderingContext2D, built: Built[], t: number): void {
  baseTop ??= lawnCanvas();
  g.drawImage(baseTop, 0, 0);
  paintTopItems(g, built, t);
  // A path from the house to the front.
  g.fillStyle = 'rgba(225,210,180,0.85)';
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    g.ellipse(tx(0.4) + 10 * Math.sin(k * 2), tz(-0.6) + k * 46, 26, 16, 0, 0, Math.PI * 2);
    if (tz(-0.6) + k * 46 < tz(2.8)) g.fill();
  }
}

/** The dug builds as seen from above (pool, pond, well, hatch...), over whatever ground is there. */
export function paintTopItems(g: CanvasRenderingContext2D, built: Built[], t: number): void {
  const p = (item: CutItem): number => built.find((b) => b.item === item)?.p ?? 0;
  const pool = p('pool');
  if (pool > 0) {
    const a = easeOut(clamp01(pool / 0.55));
    g.fillStyle = '#EDE6DA';
    g.fillRect(tx(0.65), tz(0.6), (tx(3.75) - tx(0.65)) * 1, (tz(4) - tz(0.6)) * a);
    const w = g.createLinearGradient(0, tz(0.8), 0, tz(4));
    w.addColorStop(0, '#6FD6F7');
    w.addColorStop(1, '#2C9BE0');
    g.fillStyle = clamp01((pool - 0.45) / 0.45) > 0 ? w : DIRT;
    g.fillRect(tx(0.8), tz(0.75), tx(3.6) - tx(0.8), (tz(4) - tz(0.75)) * a);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      const y = tz(1.2) + k * 46 + 6 * Math.sin(t * 2 + k);
      if (y > tz(0.75) + (tz(4) - tz(0.75)) * a) break;
      g.moveTo(tx(1.0) + 30 * Math.sin(k), y);
      g.quadraticCurveTo(tx(2.2), y + 10, tx(3.3), y);
      g.stroke();
    }
  }
  const pond = p('pond');
  if (pond > 0) {
    const a = easeOut(clamp01(pond / 0.55));
    g.fillStyle = clamp01((pond - 0.45) / 0.45) > 0 ? '#4CB0D6' : DIRT;
    g.beginPath();
    g.ellipse(tx(-3.1), tz(3.0), ((tx(-1.8) - tx(-4.4)) / 2) * a, ((tz(4) - tz(1.8)) / 1.6) * a, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7A8C3A';
    for (let k = 0; k < 9; k++) g.fillRect(tx(-4.3) + k * 30, tz(1.9) + 20 * hash(k), 6, 14);
  }
  const well = p('well');
  if (well > 0) {
    g.fillStyle = '#1D1610';
    g.beginPath();
    g.arc(tx(0), tz(3.4), 0.33 * sx * easeOut(clamp01(well / 0.5)), 0, Math.PI * 2);
    g.fill();
  }
  const bunker = p('bunker');
  if (bunker > 0) {
    g.fillStyle = '#A3A29D';
    g.fillRect(tx(-1.35), tz(2.8), tx(-0.65) - tx(-1.35), tz(3.6) - tz(2.8));
  }
  const garden = p('garden');
  if (garden > 0) {
    g.fillStyle = 'rgba(110,70,40,0.5)';
    g.fillRect(tx(-4.8), tz(-3.8), tx(-2.2) - tx(-4.8), tz(0.2) - tz(-3.8));
  }
  const tree = p('tree');
  if (tree > 0) {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.ellipse(tx(4.0), tz(3.0), 90 * tree, 60 * tree, 0, 0, Math.PI * 2);
    g.fill();
  }
}

// ── The 3D stage ───────────────────────────────────────────────────────────
interface Stage {
  key: string;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  front: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D };
  top: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D };
  props: Partial<Record<CutItem, THREE.Object3D>>;
  windows: THREE.MeshStandardMaterial;
}
let stage: Stage | null = null;

function build(key: string, fast: boolean): Stage {
  const renderer = makeRenderer(RW, RH, !fast);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = fast ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, RW / RH, 0.5, 300);
  const hemi = new THREE.HemisphereLight('#ffffff', '#7a5a3a', 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e0', 2.4);
  sun.position.set(9, 16, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(fast ? 1024 : 2048, fast ? 1024 : 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -9;
  sc.right = 9;
  sc.top = 9;
  sc.bottom = -9;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  const tex = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const [fc, fg] = canvas(FW, FH);
  const [tc, tg] = canvas(TW, TH);
  baseSide ??= layersCanvas(Math.round((FW * BZ) / BX), 2);
  const front = { tex: tex(fc), g: fg };
  const top = { tex: tex(tc), g: tg };
  const side = new THREE.MeshStandardMaterial({ map: tex(baseSide), roughness: 0.95 });
  const sideDark = new THREE.MeshStandardMaterial({ color: '#4A3A2E', roughness: 1 });
  const block = new THREE.Mesh(new THREE.BoxGeometry(BX * 2, BY, BZ * 2), [
    side,
    sideDark,
    new THREE.MeshStandardMaterial({ map: top.tex, roughness: 0.9 }),
    sideDark,
    new THREE.MeshStandardMaterial({ map: front.tex, roughness: 0.9 }),
    sideDark,
  ]);
  block.position.y = -BY / 2;
  block.receiveShadow = true;
  scene.add(block);

  const m = (color: string, rough = 0.8): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };
  const props: Stage['props'] = {};
  const windows = new THREE.MeshStandardMaterial({ color: '#9FD3F5', emissive: '#FFD27A', emissiveIntensity: 0, roughness: 0.3 });

  // The house.
  const house = new THREE.Group();
  house.add(mesh(new THREE.BoxGeometry(3.6, 2.0, 2.6), m('#F2EBDD'), 0, 1.0, 0));
  const roof = mesh(new THREE.ConeGeometry(1, 1.3, 4), m('#C4513B', 0.7), 0, 2.65, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(2.8, 1, 2.05);
  house.add(roof);
  house.add(mesh(new THREE.BoxGeometry(0.6, 1.1, 0.06), m('#7A4A2A'), 0, 0.55, 1.31));
  for (const x of [-1.1, 1.1]) house.add(mesh(new THREE.BoxGeometry(0.7, 0.6, 0.06), windows, x, 1.15, 1.31));
  house.add(mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), m('#8E8A84'), 0.9, 3.0, -0.4));
  house.position.set(0.4, 0, -2.2);
  props.house = house;

  // The well.
  const well = new THREE.Group();
  well.add(mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.5, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#9C948A', roughness: 0.9, side: THREE.DoubleSide }), 0, 0.25, 0));
  for (const x of [-0.45, 0.45]) well.add(mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), m('#6E4A2A'), x, 0.55, 0));
  const wroof = mesh(new THREE.ConeGeometry(0.8, 0.45, 4), m('#9A3F2E'), 0, 1.3, 0);
  wroof.rotation.y = Math.PI / 4;
  wroof.scale.set(1, 1, 0.7);
  well.add(wroof);
  well.position.set(0, 0, 3.4);
  props.well = well;

  // The tree.
  const tree = new THREE.Group();
  tree.add(mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.8, 8), m('#7A4E2C'), 0, 0.9, 0));
  const leaves = m('#3E9F45', 0.9);
  leaves.flatShading = true;
  for (const [x, y, z, r] of [[0, 2.1, 0, 0.95], [0.5, 1.8, 0.2, 0.7], [-0.45, 1.85, -0.1, 0.7], [0.1, 2.7, -0.1, 0.65]] as const) tree.add(mesh(new THREE.IcosahedronGeometry(r, 0), leaves, x, y, z));
  tree.position.set(4.3, 0, 3.3);
  props.tree = tree;

  // The garden: two raised beds with plants.
  const garden = new THREE.Group();
  for (const z of [-2.8, -1.0]) {
    garden.add(mesh(new THREE.BoxGeometry(2.2, 0.35, 1.2), m('#8A5B34'), 0, 0.17, z));
    garden.add(mesh(new THREE.BoxGeometry(2.0, 0.06, 1.0), m('#4A3020'), 0, 0.36, z));
    for (let k = 0; k < 6; k++) garden.add(mesh(new THREE.IcosahedronGeometry(0.18, 0), leaves, -0.8 + (k % 3) * 0.8, 0.5, z - 0.25 + Math.floor(k / 3) * 0.5));
  }
  garden.position.set(-3.5, 0, 0);
  props.garden = garden;

  // The bunker hatch.
  const hatch = new THREE.Group();
  hatch.add(mesh(new THREE.BoxGeometry(0.7, 0.12, 0.7), m('#6F726F', 0.5), 0, 0.06, 0));
  hatch.add(mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 16), m('#C9C2A0', 0.4), 0, 0.15, 0));
  (hatch.children[1] as THREE.Mesh).rotation.x = Math.PI / 2;
  hatch.position.set(-1, 0, 3.2);
  props.bunker = hatch;

  // The pool's ladder.
  const ladder = new THREE.Group();
  for (const x of [-0.18, 0.18]) {
    const rail = mesh(new THREE.TorusGeometry(0.25, 0.03, 6, 12, Math.PI), m('#D9DDE2', 0.3), x, 0.05, 0.25);
    rail.rotation.y = Math.PI / 2;
    ladder.add(rail);
  }
  ladder.position.set(3.2, 0, 1.0);
  props.pool = ladder;

  for (const o of Object.values(props)) scene.add(o!);
  return { key, renderer, scene, camera, sun, hemi, front, top, props, windows };
}

// ── Camera ─────────────────────────────────────────────────────────────────
interface Shot {
  yaw: number;
  pitch: number;
  dist: number;
  at: [number, number, number];
}
const WIDE: Shot = { yaw: 30, pitch: 24, dist: 42, at: [0, -3.4, 0] };
const mixShot = (a: Shot, b: Shot, k: number): Shot => ({
  yaw: lerp(a.yaw, b.yaw, k),
  pitch: lerp(a.pitch, b.pitch, k),
  dist: lerp(a.dist, b.dist, k),
  at: [lerp(a.at[0], b.at[0], k), lerp(a.at[1], b.at[1], k), lerp(a.at[2], b.at[2], k)],
});

function shotOf(b: StoryBeat, last: CutItem | null): Shot {
  const cam = b.tags.find((x) => x.startsWith('cam='))?.slice(4) ?? '';
  if (cam === 'top') return { yaw: 20, pitch: 58, dist: 38, at: [0, -2.2, 0.6] };
  if (cam === 'front') return { yaw: 0, pitch: 10, dist: 34, at: [0, -3.6, 0] };
  if (cam === 'close' && last) {
    const a = ANCHOR[last];
    return { yaw: 18, pitch: a[1] > 0 ? 28 : 12, dist: 34, at: [a[0] * 0.7, (a[1] > 0 ? a[1] * 0.5 : a[1]) - 1.6, a[2] > 3 ? 2 : a[2]] };
  }
  return WIDE;
}

// ── Frame ──────────────────────────────────────────────────────────────────
const SKY: Record<string, [string, string, string, number]> = {
  day: ['#7EC8F7', '#CDEBFF', '#F4FAFF', 0],
  dusk: ['#2E2A6B', '#B65B7A', '#FFB27A', 0.6],
  night: ['#060A22', '#16204E', '#2B3570', 1],
};
const HIGHLIGHTS: Record<string, string> = { yellow: '#FFD43B', orange: '#FF9F1C', green: '#4ADE80', white: '#FFFFFF' };

const cost = (s: string): number => {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(s.replace(/\s/g, ''));
  if (!m) return 0;
  let n = Number(m[0].replace(/,/g, ''));
  if (/\d\s*k\b/i.test(s)) n *= 1000;
  if (/\d\s*m\b/i.test(s) && !/\bm\s*deep/i.test(s)) n *= 1e6;
  return Number.isFinite(n) ? n : 0;
};

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const hiKey = str(env.fields, 'highlight');
  const hi = hiKey === 'accent' ? env.accent[1] : (HIGHLIGHTS[hiKey] ?? HIGHLIGHTS.yellow);
  const skyKey = SKY[str(env.fields, 'sky')] ? str(env.fields, 'sky') : 'day';
  const [s0, s1, s2, night] = SKY[skyKey];

  // What is built by now, and how far along each one is (1.4 s to dig and fill).
  const built: Built[] = [];
  let last: CutItem | null = null;
  let lastBeat: StoryBeat | null = null;
  let total = 0;
  let anyCost = false;
  if (str(env.fields, 'house') !== 'off') built.push({ item: 'house', p: 1 });
  for (let k = 0; k <= i; k++) {
    const x = beats[k];
    const item = x.visual.trim().toLowerCase();
    if (x.b.trim()) anyCost = true;
    if (!isCutItem(item)) continue;
    const p = clamp01((t - x.start) / 1.4);
    const had = built.findIndex((y) => y.item === item);
    if (had >= 0) built.splice(had, 1);
    built.push({ item, p });
    last = item;
    lastBeat = x;
    total += cost(x.b) * easeOut(clamp01((t - x.start - 0.3) / 0.9));
  }

  // The 3D picture.
  const fast = perfNow().fast3d;
  const key = `${fast}`;
  if (stage && stage.key !== key) {
    stage.renderer.dispose();
    stage.renderer.forceContextLoss();
    stage = null;
  }
  const st = (stage ??= build(key, fast));
  paintFront(st.front.g, built, t);
  st.front.tex.needsUpdate = true;
  paintTop(st.top.g, built, t);
  st.top.tex.needsUpdate = true;
  for (const [item, o] of Object.entries(st.props) as Array<[CutItem, THREE.Object3D]>) {
    const p = built.find((x) => x.item === item)?.p ?? 0;
    o.visible = p > 0.05 && (item !== 'pool' || p > 0.7);
    const s = item === 'pool' ? easeOut(prog(p, 0.7, 0.3)) : Math.max(0.001, easeBack(clamp01(p / 0.7)));
    o.scale.setScalar(Math.max(0.001, s));
  }
  if (st.props.tree) st.props.tree.rotation.z = Math.sin(t * 1.3) * 0.02;
  st.windows.emissiveIntensity = night * 1.2;
  st.hemi.intensity = lerp(1.2, 0.45, night);
  st.sun.intensity = lerp(2.4, 0.9, night);
  st.sun.color.set(skyKey === 'dusk' ? '#FFB27A' : skyKey === 'night' ? '#9FB4FF' : '#FFF3E0');

  // Camera: each line's shot, eased in from the last one's; a slow drift round the block.
  const prev = i > 0 ? beats[i - 1] : null;
  const prevLast = (() => {
    let l: CutItem | null = null;
    for (let k = 0; k < i; k++) if (isCutItem(beats[k].visual.trim().toLowerCase())) l = beats[k].visual.trim().toLowerCase() as CutItem;
    return l;
  })();
  const from = prev ? shotOf(prev, prevLast) : WIDE;
  const to = shotOf(b, last);
  const sh = mixShot(from, to, easeInOut(prog(local, 0, 0.9)));
  const yaw = (sh.yaw + 7 * Math.sin(t * 0.12)) * D;
  const pitch = sh.pitch * D;
  const c = st.camera;
  c.position.set(sh.at[0] + Math.sin(yaw) * Math.cos(pitch) * sh.dist, sh.at[1] + Math.sin(pitch) * sh.dist, sh.at[2] + Math.cos(yaw) * Math.cos(pitch) * sh.dist);
  c.lookAt(sh.at[0], sh.at[1], sh.at[2]);
  c.updateProjectionMatrix();
  c.updateMatrixWorld();
  const toScreen = (p: [number, number, number]): { x: number; y: number } => {
    const v = new THREE.Vector3(...p).project(c);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  };

  const view = fxView(b, local);
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s0);
  g.addColorStop(0.55, s1);
  g.addColorStop(1, s2);
  ctx.fillStyle = g;
  ctx.fillRect(-W, -H, W * 3, H * 3);
  // A soft shadow under the floating block.
  const under = toScreen([0, -BY - 0.6, 0]);
  const sg = ctx.createRadialGradient(under.x, under.y, 10, under.x, under.y, 460);
  sg.addColorStop(0, 'rgba(20,30,60,0.28)');
  sg.addColorStop(1, 'rgba(20,30,60,0)');
  ctx.fillStyle = sg;
  ctx.save();
  ctx.translate(under.x, under.y);
  ctx.scale(1, 0.25);
  ctx.translate(-under.x, -under.y);
  ctx.fillRect(under.x - 480, under.y - 480, 960, 960);
  ctx.restore();
  st.renderer.render(st.scene, c);
  ctx.drawImage(st.renderer.domElement, 0, 0, W, H);

  // The newest build's tag, on a leader line.
  if (last && lastBeat && lastBeat.a.trim()) {
    const ap = toScreen(ANCHOR[last]);
    const k = easeBack(prog(t - lastBeat.start, 0.5, 0.35));
    if (k > 0) {
      const text = lastBeat.a.replace(/\*/g, '').trim();
      const lx = Math.min(W - 200, Math.max(200, ap.x + (ap.x > W / 2 ? -150 : 150)));
      const ly = Math.max(330, ap.y - 230);
      withAlpha(ctx, clamp01(k), () => {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(ap.x, ap.y);
        ctx.lineTo(lx, ly + 36);
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, 10, 0, Math.PI * 2);
        ctx.fill();
        const c2 = fit(ctx, text, { maxW: 380, maxH: 70, max: 50, min: 30, maxLines: 1, weight: 800, family: FONT.meme });
        font(ctx, c2.size, 800, FONT.meme);
        const w = ctx.measureText(c2.lines[0] ?? text).width + 48;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.scale(k, k);
        rrect(ctx, -w / 2, -36, w, 72, 22);
        ctx.fillStyle = '#111318';
        ctx.fill();
        ctx.fillStyle = hi;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c2.lines[0] ?? text, 0, 2);
        ctx.restore();
        ctx.textBaseline = 'alphabetic';
      });
    }
  }

  // The running total.
  if (anyCost) {
    const money = beats.some((x) => x.b.includes('$'));
    const txt = `${money ? '$' : ''}${Math.round(total).toLocaleString('en-US')}`;
    rrect(ctx, 60, 250, 420, 132, 28);
    ctx.fillStyle = 'rgba(17,19,24,0.82)';
    ctx.fill();
    font(ctx, 30, 800, FONT.mono);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(str(env.fields, 'total_label') || 'TOTAL SPENT', 92, 298);
    font(ctx, 62, 900, FONT.meme);
    ctx.fillStyle = hi;
    ctx.fillText(txt, 92, 358);
  }

  captions(ctx, env, b, local, 1500, hi);
  ctx.restore();
  fxPost(ctx, b, local);
  markLightFrame(skyKey === 'day');
}

registerPreset('cutaway', draw);
