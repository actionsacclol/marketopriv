import { num, storyBeats, str, type StoryBeat } from '@shared/presets';
import { TV_CAST, TV_PHOSPHORS, TV_SETS, tvCast, tvMoves, tvProps, type TvLook, type TvMove, type TvPhosphor, type TvProp, type TvSet } from '@shared/tv';
import { FONT, H, W, clamp01, easeInOut, markLightFrame, registerPreset, type Ctx, type Env } from '../engine';
import { mouthAt } from '../char3d';
import { wordTimesOf } from './narrated';
import { applyView, fxMoves, fxPost, fxView } from './fx';

// Retro TV: everything is drawn as thin lines of light on black into a half-size layer, then put on the screen twice,
// once blurred wide (the phosphor bloom) and once sharp, both added as light. The tube goes on last: a soft colour
// split, scanlines, a rolling hum bar, flicker, and dark curved corners.

const GROUND = 1340;
const LS = 0.5;

let layer: HTMLCanvasElement | null = null;
const layerCanvas = (): HTMLCanvasElement => {
  if (layer) return layer;
  layer = document.createElement('canvas');
  layer.width = W * LS;
  layer.height = H * LS;
  return layer;
};

interface Pal {
  main: string;
  dim: string;
  hot: string;
  set: string;
  bg: string;
}
const PALS: Record<TvPhosphor, Pal> = {
  green: { main: '#5CFF8A', dim: '#1E8A44', hot: '#D8FFE2', set: '#2FCB63', bg: '#020A05' },
  amber: { main: '#FFB13D', dim: '#8A5A12', hot: '#FFF0D0', set: '#E08F22', bg: '#0A0602' },
  cyan: { main: '#5CE8FF', dim: '#1C6C80', hot: '#E0FBFF', set: '#3AB8D8', bg: '#02070A' },
  color: { main: '#7FE8FF', dim: '#2C4C8A', hot: '#FFFFFF', set: '#4A7CFF', bg: '#03040C' },
};

type C = CanvasRenderingContext2D;
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function line(c: C, color: string, w: number, pts: Array<[number, number]>, close = false): void {
  c.beginPath();
  pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (close) c.closePath();
  c.strokeStyle = color;
  c.lineWidth = w * 1.6;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}
function circle(c: C, color: string, w: number, x: number, y: number, r: number, fill = false): void {
  c.beginPath();
  c.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  if (fill) {
    c.fillStyle = color;
    c.fill();
  } else {
    c.strokeStyle = color;
    c.lineWidth = w * 1.6;
    c.stroke();
  }
}

// ── Places, in lines of light ──────────────────────────────────────────────
function drawSet(c: C, p: Pal, set: TvSet, t: number, pan: number): void {
  const s = p.set;
  const d = p.dim;
  const px = (k: number): number => -pan * k;
  const floor = (): void => line(c, s, 4, [
    [-300, GROUND],
    [W + 300, GROUND],
  ]);
  switch (set) {
    case 'city': {
      let x = -200 + (px(0.4) % 160);
      let k = 0;
      while (x < W + 200) {
        const w = 120 + (k % 3) * 40;
        const h = 360 + ((k * 137) % 5) * 90;
        line(c, d, 3, [
          [x, GROUND],
          [x, GROUND - h],
          [x + w, GROUND - h],
          [x + w, GROUND],
        ]);
        for (let wy = GROUND - h + 40; wy < GROUND - 40; wy += 60)
          for (let wx = x + 24; wx < x + w - 20; wx += 40) if (Math.sin(wx * 3.1 + wy * 7.7 + Math.floor(t * 0.7 + k)) > 0.2) c.fillStyle = s, c.fillRect(wx, wy, 14, 20);
        x += w + 30;
        k++;
      }
      // A plane blinking across the sky.
      const ax = ((t * 90) % (W + 400)) - 200;
      if (Math.floor(t * 2) % 2) circle(c, p.hot, 0, ax, 300, 6, true);
      floor();
      break;
    }
    case 'room':
    case 'office': {
      // Back wall corner lines, a window, a desk with a monitor (a blinking cursor).
      line(c, d, 3, [
        [-200, 200],
        [160 + px(0.3), 300],
        [160 + px(0.3), GROUND - 120],
        [-200, GROUND + 60],
      ]);
      line(c, d, 3, [
        [160 + px(0.3), 300],
        [W + 200, 300],
      ]);
      line(c, d, 3, [
        [160 + px(0.3), GROUND - 120],
        [W + 200, GROUND - 120],
      ]);
      const wx = 300 + px(0.5);
      line(c, s, 4, [
        [wx, 420],
        [wx + 260, 420],
        [wx + 260, 720],
        [wx, 720],
      ], true);
      line(c, d, 3, [
        [wx + 130, 420],
        [wx + 130, 720],
      ]);
      // Moon through the window.
      circle(c, s, 3, wx + 190, 500, 30);
      const n = set === 'office' ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const dx = 640 + k * 260 + px(0.7) - (n - 1) * 120;
        line(c, s, 4, [
          [dx - 120, GROUND - 300],
          [dx + 120, GROUND - 300],
        ]);
        line(c, s, 4, [
          [dx - 100, GROUND - 300],
          [dx - 100, GROUND - 120],
        ]);
        line(c, s, 4, [
          [dx + 100, GROUND - 300],
          [dx + 100, GROUND - 120],
        ]);
        line(c, s, 4, [
          [dx - 70, GROUND - 480],
          [dx + 70, GROUND - 480],
          [dx + 70, GROUND - 360],
          [dx - 70, GROUND - 360],
        ], true);
        line(c, d, 4, [
          [dx, GROUND - 360],
          [dx, GROUND - 300],
        ]);
        for (let r = 0; r < 3; r++) line(c, d, 3, [
          [dx - 50, GROUND - 455 + r * 25],
          [dx - 50 + (40 + ((r * 37 + Math.floor(t * 3)) % 50)), GROUND - 455 + r * 25],
        ]);
        if (Math.floor(t * 2.5) % 2) c.fillStyle = p.hot, c.fillRect(dx + 20, GROUND - 405, 16, 22);
      }
      break;
    }
    case 'road':
    case 'desert': {
      // A grid floor rushing to the horizon, a striped sun.
      const hz = 820;
      const sunY = hz - 40;
      for (let k = 0; k < 6; k++) {
        const y = sunY - 220 + k * 40;
        const half = Math.sqrt(Math.max(0, 220 * 220 - (y - sunY) ** 2));
        if (y < hz) line(c, k % 2 ? d : s, 6, [
          [W / 2 - half + px(0.1), y],
          [W / 2 + half + px(0.1), y],
        ]);
      }
      // Mountains or the road's edges.
      if (set === 'desert')
        line(c, d, 3, [
          [-100, hz],
          [120, hz - 140],
          [260, hz - 60],
          [420, hz - 190],
          [580, hz],
        ]);
      line(c, s, 4, [
        [-200, hz],
        [W + 200, hz],
      ]);
      for (let k = -10; k <= 10; k++) line(c, d, 3, [
        [W / 2 + k * 20 + px(0.05), hz],
        [W / 2 + k * 260 + px(0.6), H + 200],
      ]);
      for (let k = 0; k < 10; k++) {
        const u = (k / 10 + t * 0.35) % 1;
        const y = hz + (H + 200 - hz) * u * u;
        line(c, d, 3, [
          [-200, y],
          [W + 200, y],
        ]);
      }
      if (set === 'road')
        for (let k = 0; k < 6; k++) {
          const u = (k / 6 + t * 0.6) % 1;
          const y = hz + (H - hz) * u * u;
          const w = 6 + u * 30;
          c.fillStyle = s;
          c.fillRect(W / 2 - w / 2 + px(0.3) * u, y, w, 10 + u * 50);
        }
      break;
    }
    case 'space': {
      for (let k = 0; k < 80; k++) {
        const x = hash(k) * (W + 400) - 200 + px(0.1 + hash(k + 3) * 0.3);
        const y = hash(k + 1) * H * 0.8;
        if (Math.sin(t * (1 + hash(k + 2) * 4) + k) > -0.4) c.fillStyle = hash(k + 4) > 0.8 ? p.hot : s, c.fillRect(x, y, 4, 4);
      }
      circle(c, s, 4, 780 + px(0.2), 520, 140);
      c.save();
      c.translate(780 + px(0.2), 520);
      c.rotate(-0.3);
      c.scale(1, 0.25);
      circle(c, d, 12, 0, 0, 240);
      c.restore();
      // A moon floor.
      c.beginPath();
      c.moveTo(-200, GROUND);
      for (let x = -200; x < W + 200; x += 40) c.lineTo(x, GROUND - 20 * Math.sin(x * 0.01 + 1));
      c.strokeStyle = s;
      c.lineWidth = 4;
      c.stroke();
      break;
    }
    case 'ocean': {
      circle(c, s, 4, 780 + px(0.1), 520, 90);
      for (let r = 0; r < 7; r++) {
        const y = 760 + r * r * 14;
        c.beginPath();
        for (let x = -200; x <= W + 200; x += 20) c.lineTo(x, y + Math.sin(x * 0.012 + t * (1.4 + r * 0.2) + r) * (6 + r * 3));
        c.strokeStyle = r % 2 ? d : s;
        c.lineWidth = 3 + r * 0.6;
        c.stroke();
      }
      // Moon on the water.
      for (let k = 0; k < 5; k++) line(c, p.hot, 3, [
        [780 - 40 + Math.sin(t * 3 + k) * 20 + px(0.1), 790 + k * 40],
        [780 + 40 + Math.sin(t * 3 + k) * 20 + px(0.1), 790 + k * 40],
      ]);
      floor();
      break;
    }
    case 'mountains': {
      for (const [k, col, base, amp] of [
        [0.2, d, 900, 300],
        [0.5, s, 1100, 260],
      ] as Array<[number, string, number, number]>) {
        c.beginPath();
        for (let x = -300; x <= W + 300; x += 90) c.lineTo(x + px(k), base - Math.abs(Math.sin(x * 0.007 + k * 9)) * amp - (Math.floor(x / 90) % 2) * 40);
        c.strokeStyle = col;
        c.lineWidth = 4;
        c.stroke();
      }
      circle(c, s, 4, 240 + px(0.1), 380, 60);
      floor();
      break;
    }
    case 'studio': {
      // A news desk, a big screen behind with a moving wave, ON AIR.
      line(c, s, 4, [
        [140, 260],
        [940, 260],
        [940, 760],
        [140, 760],
      ], true);
      c.beginPath();
      for (let x = 160; x <= 920; x += 10) c.lineTo(x, 510 + Math.sin(x * 0.03 + t * 4) * 80 * Math.sin(x * 0.006));
      c.strokeStyle = d;
      c.lineWidth = 4;
      c.stroke();
      c.font = `700 54px ${FONT.mono}`;
      c.textAlign = 'center';
      c.fillStyle = Math.floor(t * 1.5) % 2 ? p.hot : p.dim;
      c.fillText('ON AIR', 540, 330);
      line(c, s, 4, [
        [60, GROUND - 260],
        [1020, GROUND - 260],
        [960, GROUND],
        [120, GROUND],
      ], true);
      break;
    }
  }
}

// ── The cast, as glowing figures ───────────────────────────────────────────
interface Pose {
  /** Angles (radians, 0 = straight down) for upper/lower arm and leg, back (b) and front (f). */
  ab: [number, number];
  af: [number, number];
  lb: [number, number];
  lf: [number, number];
  lean: number;
  lift: number;
}

function poseOf(move: TvMove, local: number, t: number): Pose {
  const s = Math.sin(t * 7);
  const breathe = Math.sin(t * 2.2) * 0.04;
  const base: Pose = { ab: [0.18 + breathe, 0.1], af: [-0.18 - breathe, -0.1], lb: [0.08, 0], lf: [-0.08, 0], lean: 0, lift: 0 };
  switch (move) {
    case 'talk':
      return { ...base, af: [-1.1 - Math.sin(t * 5) * 0.4, -1.4], ab: [0.3, 0.2] };
    case 'walk':
      return { ...base, ab: [s * 0.5, -0.3], af: [-s * 0.5, -0.3], lb: [s * 0.5, Math.max(0, s) * 0.6], lf: [-s * 0.5, Math.max(0, -s) * 0.6] };
    case 'run': {
      const r = Math.sin(t * 12);
      return { ...base, ab: [r * 1.1, -1.4], af: [-r * 1.1, -1.4], lb: [r * 0.9, Math.max(0, r) * 1.4], lf: [-r * 0.9, Math.max(0, -r) * 1.4], lean: 0.18 };
    }
    case 'jump':
      return { ...base, ab: [2.6, 0.2], af: [-2.6, -0.2], lb: [0.5, 1.2], lf: [-0.2, 1.0], lift: Math.sin(clamp01(local / 0.7) * Math.PI) * 200 };
    case 'shock':
      return { ...base, ab: [2.4, 0.6], af: [-2.4, -0.6], lb: [0.3, 0], lf: [-0.3, 0], lean: -0.12, lift: local < 0.3 ? Math.sin((local / 0.3) * Math.PI) * 60 : 0 };
    case 'happy':
    case 'dance':
      return { ...base, ab: [2.5 + s * 0.3, 0.3], af: [-2.5 + s * 0.3, -0.3], lb: [0.2 + Math.max(0, s) * 0.5, Math.max(0, s) * 0.8], lf: [-0.2 - Math.max(0, -s) * 0.5, Math.max(0, -s) * 0.8], lift: Math.abs(s) * 30 };
    case 'sad':
      return { ...base, ab: [0.05, 0], af: [-0.05, 0], lean: 0.22 };
    case 'think':
      return { ...base, af: [-0.6, -2.6], ab: [0.5, 1.4] };
    case 'point':
      return { ...base, af: [-1.57, 0] };
    case 'sit':
      return { ...base, lb: [1.5, -1.5], lf: [1.4, -1.4], lift: -70 };
    case 'type':
      return { ...base, ab: [-0.6, -0.8 + Math.sin(t * 20) * 0.15], af: [-0.8, -0.9 + Math.cos(t * 22) * 0.15], lb: [1.5, -1.5], lf: [1.4, -1.4], lift: -70 };
    case 'phone':
      return { ...base, af: [-0.3, -2.9], ab: [0.3, 0.2] };
    case 'wave':
      return { ...base, af: [-2.6, -0.4 + Math.sin(t * 9) * 0.5] };
    case 'shrug':
      return { ...base, ab: [0.7, -1.7], af: [-0.7, 1.7] };
    default:
      return base;
  }
}

interface Actor {
  look: TvLook;
  color: string;
  hot: string;
  move: TvMove;
  local: number;
  t: number;
  talk: number;
  facing: 1 | -1;
  prop?: { kind: TvProp; down: boolean };
}

function drawFigure(c: C, x: number, s: number, a: Actor): void {
  const { look, move, local, t, color } = a;
  const f = a.facing;
  if (move === 'fall' && local > 0.25) {
    line(c, color, 7, [
      [x - 130 * s, GROUND - 14],
      [x + 90 * s, GROUND - 14],
    ]);
    circle(c, color, 6, x - 170 * s, GROUND - 40 * s, 40 * s);
    for (let k = 0; k < 3; k++) {
      const ang = t * 4 + (k * Math.PI * 2) / 3;
      circle(c, a.hot, 0, x - 170 * s + Math.cos(ang) * 70 * s, GROUND - 110 * s + Math.sin(ang) * 18 * s, 7, true);
    }
    return;
  }
  const P = poseOf(move, local, t);
  const hh = look.h;
  const leg = 92 * s * hh;
  const arm = 74 * s * hh;
  const torso = 150 * s * hh;
  const hipY = GROUND - leg * 2 - P.lift + (move === 'sit' || move === 'type' ? 0 : 0);
  const hip: [number, number] = [x, hipY];
  const neck: [number, number] = [x + Math.sin(P.lean * f) * torso, hipY - Math.cos(P.lean) * torso];
  const limb = (from: [number, number], [a1, a2]: [number, number], len: number): Array<[number, number]> => {
    const k1: [number, number] = [from[0] + Math.sin(a1) * len * f, from[1] + Math.cos(a1) * len];
    const k2: [number, number] = [k1[0] + Math.sin(a1 + a2) * len * f, k1[1] + Math.cos(a1 + a2) * len];
    return [from, k1, k2];
  };
  // Torso: an outlined capsule.
  const tw = 46 * s;
  c.save();
  c.translate(hip[0], hip[1]);
  c.rotate(P.lean * f);
  c.beginPath();
  c.roundRect(-tw, -torso, tw * 2, torso + 10 * s, tw * 0.9);
  c.strokeStyle = color;
  c.lineWidth = 6;
  c.stroke();
  c.restore();
  const shoulder: [number, number] = [neck[0], neck[1] + 26 * s];
  const back = limb(shoulder, P.ab, arm);
  const front = limb(shoulder, P.af, arm);
  const lb = limb(hip, P.lb, leg);
  const lf = limb(hip, P.lf, leg);
  for (const L of [lb, lf]) {
    line(c, color, 7, L);
    line(c, color, 7, [
      L[2],
      [L[2][0] + f * 30 * s, L[2][1]],
    ]);
  }
  line(c, color, 6, back);
  line(c, color, 6, front);
  circle(c, color, 0, back[2][0], back[2][1], 9 * s, true);
  circle(c, color, 0, front[2][0], front[2][1], 9 * s, true);
  // Head.
  const hr = 52 * s;
  const head: [number, number] = [neck[0] + f * 4 * s, neck[1] - hr - 6 * s];
  circle(c, color, 6, head[0], head[1], hr);
  // Eyes and mouth.
  const blink = (t + hh * 2) % 3.3 < 0.12;
  const ex = head[0] + f * 16 * s;
  const ey = head[1] - 8 * s;
  for (const k of [-1, 1]) {
    if (blink || move === 'happy') line(c, a.hot, 4, [
      [ex + k * 16 * s - 7 * s, ey],
      [ex + k * 16 * s + 7 * s, ey],
    ]);
    else circle(c, a.hot, 0, ex + k * 16 * s, ey, (move === 'shock' ? 10 : 6) * s, true);
  }
  const my = head[1] + 24 * s;
  const open = Math.max(a.talk, move === 'shock' ? 0.8 : 0);
  if (open > 0.15) {
    c.beginPath();
    c.ellipse(ex, my, 14 * s, 4 * s + open * 12 * s, 0, 0, Math.PI * 2);
    c.strokeStyle = a.hot;
    c.lineWidth = 4;
    c.stroke();
  } else {
    c.beginPath();
    if (move === 'sad') c.arc(ex, my + 14 * s, 14 * s, 1.2 * Math.PI, 1.8 * Math.PI);
    else c.arc(ex, my - 10 * s, 16 * s, 0.25 * Math.PI, 0.75 * Math.PI);
    c.strokeStyle = a.hot;
    c.lineWidth = 4;
    c.stroke();
  }
  // Their one feature.
  const top = head[1] - hr;
  switch (look.mark) {
    case 'cap':
      c.beginPath();
      c.arc(head[0], head[1] - 8 * s, hr + 2, Math.PI, 0);
      c.strokeStyle = color;
      c.lineWidth = 7;
      c.stroke();
      line(c, color, 7, [
        [head[0], head[1] - 8 * s],
        [head[0] + f * (hr + 44 * s), head[1] - 8 * s],
      ]);
      break;
    case 'ponytail':
      c.beginPath();
      c.moveTo(head[0] - f * hr * 0.7, top + 16 * s);
      c.quadraticCurveTo(head[0] - f * (hr + 60 * s), top + Math.sin(t * 4) * 10, head[0] - f * (hr + 40 * s), head[1] + 30 * s);
      c.strokeStyle = color;
      c.lineWidth = 7;
      c.stroke();
      break;
    case 'glasses':
      for (const k of [-1, 1]) circle(c, color, 4, ex + k * 16 * s, ey, 13 * s);
      break;
    case 'bun':
      circle(c, color, 6, head[0] - f * 10 * s, top - 18 * s, 22 * s);
      break;
    case 'hat':
      line(c, color, 7, [
        [head[0] - hr - 24 * s, top + 22 * s],
        [head[0] + hr + 24 * s, top + 22 * s],
      ]);
      line(c, color, 7, [
        [head[0] - hr * 0.7, top + 22 * s],
        [head[0] - hr * 0.6, top - 40 * s],
        [head[0] + hr * 0.6, top - 40 * s],
        [head[0] + hr * 0.7, top + 22 * s],
      ]);
      break;
    case 'phones':
      c.beginPath();
      c.arc(head[0], head[1], hr + 10 * s, Math.PI * 1.05, Math.PI * 1.95);
      c.strokeStyle = color;
      c.lineWidth = 6;
      c.stroke();
      for (const k of [-1, 1]) {
        c.beginPath();
        c.roundRect(head[0] + k * (hr + 2 * s) - 12 * s, head[1] - 20 * s, 24 * s, 44 * s, 8 * s);
        c.stroke();
      }
      break;
    default:
      break;
  }
  // What they feel.
  if (move === 'think') {
    const n = Math.min(3, Math.floor(local * 2.5) + 1);
    for (let k = 0; k < n; k++) circle(c, color, 4, head[0] + f * (70 + k * 36) * s, top - (20 + k * 40) * s, (8 + k * 7) * s);
  }
  if (move === 'shock' && local < 1.2)
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4;
      const r0 = hr + 30 * s;
      const r1 = r0 + 50 * s * (1 - local / 1.2);
      line(c, a.hot, 4, [
        [head[0] + Math.cos(ang) * r0, head[1] + Math.sin(ang) * r0],
        [head[0] + Math.cos(ang) * r1, head[1] + Math.sin(ang) * r1],
      ]);
    }
  if (move === 'sad')
    for (let k = 0; k < 2; k++) {
      const u = (t * 0.8 + k * 0.5) % 1;
      circle(c, a.hot, 0, ex + f * 10 * s, ey + 20 * s + u * 60 * s, 5 * s * (1 - u), true);
    }
  if (move === 'phone') drawProp(c, 'phone', false, front[2][0] + f * 10 * s, front[2][1] - 10 * s, 0.8 * s, t, color, a.hot);
  else if (move === 'type') drawProp(c, 'laptop', false, x + f * 110 * s, hipY - 20 * s, 1.1 * s, t, color, a.hot);
  if (a.prop) drawProp(c, a.prop.kind, a.prop.down, front[2][0] + f * 40 * s, front[2][1] - 30 * s, s, t, color, a.hot);
}

// ── Props, in light ────────────────────────────────────────────────────────
function drawProp(c: C, kind: TvProp, down: boolean, x: number, y: number, k: number, t: number, col: string, hot: string): void {
  const L = (pts: Array<[number, number]>, close = false, w = 5): void => line(c, col, w, pts.map(([a, b]) => [x + a * k, y + b * k] as [number, number]), close);
  switch (kind) {
    case 'coin':
      c.beginPath();
      c.ellipse(x, y, 38 * k * Math.abs(Math.cos(t * 3)) + 4, 38 * k, 0, 0, Math.PI * 2);
      c.strokeStyle = hot;
      c.lineWidth = 5;
      c.stroke();
      break;
    case 'cash':
      L([
        [-60, -30],
        [60, -30],
        [60, 30],
        [-60, 30],
      ], true);
      circle(c, col, 4, x, y, 16 * k);
      break;
    case 'phone':
      c.beginPath();
      c.roundRect(x - 26 * k, y - 48 * k, 52 * k, 96 * k, 10 * k);
      c.strokeStyle = col;
      c.lineWidth = 5;
      c.stroke();
      if (Math.floor(t * 4) % 2) c.fillStyle = hot, c.fillRect(x - 16 * k, y - 34 * k, 32 * k, 56 * k);
      break;
    case 'letter':
    case 'card':
      L([
        [-56, -38],
        [56, -38],
        [56, 38],
        [-56, 38],
      ], true);
      if (kind === 'letter')
        L([
          [-56, -38],
          [0, 4],
          [56, -38],
        ]);
      else
        L([
          [-56, -14],
          [56, -14],
        ], false, 8);
      break;
    case 'laptop':
      L([
        [-70, 0],
        [-60, -90],
        [60, -90],
        [70, 0],
      ], true);
      L([
        [-90, 0],
        [90, 0],
      ], false, 6);
      for (let r = 0; r < 3; r++) L([
        [-44, -70 + r * 20],
        [-44 + 30 + ((r * 23 + Math.floor(t * 4)) % 60), -70 + r * 20],
      ], false, 3);
      break;
    case 'chart': {
      L([
        [-90, -80],
        [-90, 60],
        [100, 60],
      ]);
      const pts: Array<[number, number]> = [];
      const grow = clamp01((t % 3) / 1.2);
      for (let i = 0; i <= 8; i++) {
        if (i / 8 > grow) break;
        const v = (down ? i : 8 - i) * 14 + Math.sin(i * 2.3) * 10 - 60;
        pts.push([-80 + i * 22, v - 10]);
      }
      if (pts.length > 1) line(c, hot, 6, pts.map(([a, b]) => [x + a * k, y + b * k] as [number, number]));
      break;
    }
    case 'clock':
      circle(c, col, 5, x, y, 50 * k);
      L([
        [0, 0],
        [0, -32],
      ]);
      line(c, hot, 5, [
        [x, y],
        [x + Math.cos(t * 4) * 40 * k, y + Math.sin(t * 4) * 40 * k],
      ]);
      break;
    case 'key':
      circle(c, col, 5, x - 40 * k, y, 22 * k);
      L([
        [-18, 0],
        [60, 0],
        [60, 18],
      ]);
      L([
        [44, 0],
        [44, 14],
      ]);
      break;
    case 'bag':
      L([
        [-50, -30],
        [50, -30],
        [64, 50],
        [-64, 50],
      ], true);
      c.font = `700 ${Math.round(56 * k)}px ${FONT.mono}`;
      c.fillStyle = hot;
      c.textAlign = 'center';
      c.fillText('$', x, y + 32 * k);
      break;
    case 'heart':
      c.beginPath();
      c.moveTo(x, y + 40 * k);
      c.bezierCurveTo(x - 80 * k, y - 10 * k, x - 30 * k, y - 60 * k, x, y - 24 * k);
      c.bezierCurveTo(x + 30 * k, y - 60 * k, x + 80 * k, y - 10 * k, x, y + 40 * k);
      c.strokeStyle = hot;
      c.lineWidth = 6;
      c.stroke();
      break;
    case 'star': {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2 + t;
        const r = i % 2 ? 22 : 52;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      line(c, hot, 5, pts.map(([a, b]) => [x + a * k, y + b * k] as [number, number]), true);
      break;
    }
    case 'cup':
      L([
        [-34, -40],
        [34, -40],
        [26, 40],
        [-26, 40],
      ], true);
      for (let i = 0; i < 2; i++) {
        const u = (t * 0.7 + i * 0.5) % 1;
        c.beginPath();
        c.moveTo(x + (-10 + i * 20) * k, y - 50 * k - u * 60 * k);
        c.quadraticCurveTo(x + (5 + i * 20) * k, y - 70 * k - u * 60 * k, x + (-10 + i * 20) * k, y - 90 * k - u * 60 * k);
        c.strokeStyle = col;
        c.globalAlpha = 1 - u;
        c.lineWidth = 3;
        c.stroke();
        c.globalAlpha = 1;
      }
      break;
    case 'lock':
      L([
        [-40, -10],
        [40, -10],
        [40, 56],
        [-40, 56],
      ], true);
      c.beginPath();
      c.arc(x, y - 10 * k, 28 * k, Math.PI, 0);
      c.strokeStyle = col;
      c.lineWidth = 5;
      c.stroke();
      break;
    case 'bulb':
      circle(c, hot, 5, x, y - 16 * k, 36 * k);
      L([
        [-16, 22],
        [16, 22],
        [12, 40],
        [-12, 40],
      ], true);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + t;
        line(c, hot, 3, [
          [x + Math.cos(a) * 50 * k, y - 16 * k + Math.sin(a) * 50 * k],
          [x + Math.cos(a) * 66 * k, y - 16 * k + Math.sin(a) * 66 * k],
        ]);
      }
      break;
  }
}

// ── The tube ───────────────────────────────────────────────────────────────
let lines: HTMLCanvasElement | null = null;
function scanTile(): HTMLCanvasElement {
  if (lines) return lines;
  lines = document.createElement('canvas');
  lines.width = 4;
  lines.height = 6;
  const g = lines.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.42)';
  g.fillRect(0, 3, 4, 3);
  return lines;
}

function tube(ctx: Ctx, t: number): void {
  // Scanlines.
  const pat = ctx.createPattern(scanTile(), 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
  }
  // A soft hum bar rolling up the screen.
  const by = H - ((t * 260) % (H + 400));
  const g = ctx.createLinearGradient(0, by - 200, 0, by + 200);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, by - 200, W, 400);
  // Flicker.
  const fl = hash(Math.floor(t * 30)) * 0.05;
  ctx.fillStyle = `rgba(0,0,0,${fl})`;
  ctx.fillRect(0, 0, W, H);
  // The curved glass: dark corners and edges.
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.66);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.roundRect(18, 18, W - 36, H - 36, 90);
  ctx.fillStyle = '#000000';
  ctx.fill('evenodd');
  ctx.restore();
  // A faint reflection on the glass.
  const r = ctx.createLinearGradient(0, 0, W, H * 0.4);
  r.addColorStop(0, 'rgba(255,255,255,0.05)');
  r.addColorStop(0.4, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);
}

function staticNoise(ctx: Ctx, t: number, amount: number): void {
  const fr = Math.floor(t * 30);
  ctx.save();
  ctx.globalAlpha = amount;
  for (let y = 0; y < H; y += 8) {
    const r = hash(fr * 1000 + y);
    ctx.fillStyle = `rgb(${Math.floor(r * 255)},${Math.floor(r * 255)},${Math.floor(r * 255)})`;
    ctx.fillRect(0, y, W, 8);
    for (let k = 0; k < 6; k++) {
      const v = hash(fr * 77 + y * 3 + k);
      ctx.fillStyle = v > 0.5 ? '#FFFFFF' : '#000000';
      ctx.fillRect(hash(fr + y + k * 9) * W, y, 30 + v * 160, 8);
    }
  }
  ctx.restore();
}

function glowText(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
  ctx.font = `600 ${size}px ${FONT.mono}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.55;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

let snap: HTMLCanvasElement | null = null;

function caption(ctx: Ctx, p: Pal, b: StoryBeat, local: number, wps: number): void {
  const text = b.headline.replace(/\*/g, '').trim();
  if (!text) return;
  const words = text.split(/\s+/);
  const times = wordTimesOf(b, words, wps);
  let lit = -1;
  for (let i = 0; i < words.length; i++) if (local >= times[i]) lit = i;
  if (lit < 0) return;
  const g = Math.floor(lit / 3);
  const shown = words.slice(g * 3, lit + 1).join(' ').toUpperCase();
  const cursor = Math.floor(local * 3) % 2 ? '_' : ' ';
  // A dark band behind the words so they read over a figure.
  ctx.font = `600 70px ${FONT.mono}`;
  const k = Math.min(1, (W - 120) / Math.max(1, ctx.measureText(shown + '_').width));
  const w = ctx.measureText(shown + '_').width * k + 60;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.beginPath();
  ctx.roundRect((W - w) / 2, 1590 - 56 * k, w, 112 * k, 18);
  ctx.fill();
  glowText(ctx, shown + cursor, W / 2, 1590, 70 * k, p.hot);
}

// ── Frame ──────────────────────────────────────────────────────────────────
const who = (b: StoryBeat): number => (b.tags.includes('who=c') ? 2 : b.tags.includes('who=b') ? 1 : 0);
function setAt(beats: StoryBeat[], i: number, field: string): TvSet {
  let v = field;
  for (const b of beats.slice(0, i + 1)) for (const t of b.tags) if (t.startsWith('set=')) v = t.slice(4);
  return ((TV_SETS as readonly string[]).includes(v) ? v : 'city') as TvSet;
}
function channelAt(beats: StoryBeat[], i: number): number {
  let ch = 3;
  for (let k = 1; k <= i; k++) {
    const tag = beats[k].tags.find((x) => x.startsWith('ch='));
    if (tag) ch = Number(tag.slice(3));
    else if (beats[k].tags.some((x) => x.startsWith('set='))) ch = (ch % 12) + 1 + (k % 3);
  }
  return ch;
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const phos = ((TV_PHOSPHORS as readonly string[]).includes(str(env.fields, 'phosphor')) ? str(env.fields, 'phosphor') : 'color') as TvPhosphor;
  const p = PALS[phos];
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  const field = str(env.fields, 'set');
  const set = setAt(beats, i, field);
  const prevSet = i > 0 ? setAt(beats, i - 1, field) : set;
  const newChannel = i > 0 && (prevSet !== set || beats[i - 1].tags.includes('title'));

  if (b.tags.includes('title')) {
    const s = b.headline.replace(/\*/g, '').toUpperCase();
    const on = local > 0.25;
    if (on) {
      ctx.font = `600 96px ${FONT.mono}`;
      const words = s.split(/\s+/);
      const rows: string[] = [];
      let cur = '';
      for (const w of words) {
        const n = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(n).width > W - 200 && cur) rows.push(cur), (cur = w);
        else cur = n;
      }
      if (cur) rows.push(cur);
      const shown = Math.floor((local - 0.25) * 26);
      let left = shown;
      rows.forEach((r, k) => {
        if (left <= 0) return;
        glowText(ctx, r.slice(0, left), W / 2, H / 2 - ((rows.length - 1) / 2 - k) * 120, 96, p.main);
        left -= r.length + 1;
      });
    }
    if (local < 0.3) staticNoise(ctx, t, 0.9 * (1 - local / 0.3));
    tube(ctx, t);
    markLightFrame(false);
    return;
  }

  const cast = tvCast(str(env.fields, 'cast') || 'neo;vee');
  const n = cast.length;
  const focus = Math.min(who(b), n - 1);
  const solo = b.tags.includes('solo');
  const spots = n === 1 || solo ? [540] : n === 2 ? [340, 740] : [230, 540, 850];
  const xs = cast.map((_, k) => (solo ? (k === focus ? 540 : -9999) : spots[k]));
  const shotTag = b.tags.find((x) => x.startsWith('shot='))?.slice(5);
  const close = shotTag ? shotTag === 'close' : i % 3 === 1;
  const moves = tvMoves(b.visual, n, focus);
  const props = tvProps(b.b);

  // Draw the picture as lines of light into the half-size layer.
  const L = layerCanvas();
  const c = L.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, L.width, L.height);
  c.scale(LS, LS);
  const push = 1 + 0.05 * clamp01(local / Math.max(1, b.dur));
  const zoom = (close ? 1.7 : 1) * push;
  const fx = xs[focus] > -1000 ? xs[focus] : 540;
  const fy = close ? GROUND - 420 : H * 0.5;
  const shake = b.tags.includes('shake') && local < 0.6 ? Math.sin(local * 70) * 14 * (1 - local / 0.6) : 0;
  const view = fxView(b, local);
  if (fxMoves(view)) applyView(c, view);
  c.translate(W / 2 + shake, H * 0.5);
  c.scale(zoom, zoom);
  c.translate(-(close ? fx : 540 + (fx - 540) * 0.2), -fy);
  const pan = Math.sin(t * 0.25) * 40 + i * 30;
  drawSet(c, p, set, t, pan);
  const voiced = b.voDur > 0;
  const text = b.headline.replace(/\*/g, '');
  cast.forEach((name, k) => {
    if (xs[k] < -1000) return;
    const mv = moves[k];
    let x = xs[k];
    if (mv === 'walk' || mv === 'run') x += (clamp01(local / Math.max(0.6, b.dur)) - 0.5) * (mv === 'run' ? 340 : 180);
    const facing: 1 | -1 = n > 1 && !solo ? (xs[k] < 540 ? 1 : -1) : 1;
    const look = TV_CAST[name];
    const pr = props.find((q) => (solo && q.who < n && q.who !== focus ? focus : q.who) === k);
    drawFigure(c, x, 1.25, {
      look,
      color: phos === 'color' ? look.hue : p.main,
      hot: p.hot,
      move: mv,
      local,
      t: t + k * 0.41,
      talk: mv === 'talk' ? (voiced ? mouthAt(text, local, b.voStart, b.voDur) : mouthAt(text, local, 0.1, Math.max(0.5, text.split(/\s+/).length / 3))) : 0,
      facing,
      prop: pr ? { kind: pr.kind, down: pr.down } : undefined,
    });
  });
  const loose = props.find((q) => q.who >= n);
  if (loose) {
    const u = easeInOut(clamp01(local / 0.4));
    drawProp(c, loose.kind, loose.down, 540, 620, 2.4 * (0.6 + 0.4 * u), t, p.main, p.hot);
  }
  if (b.tags.includes('rain'))
    for (let k = 0; k < 70; k++) {
      const x = hash(k) * (W + 200) - 100;
      const y = ((hash(k + 9) * H + t * 1300) % (H + 200)) - 100;
      line(c, p.dim, 3, [
        [x, y],
        [x - 6, y + 40],
      ]);
    }

  // Put the light on the screen: wide bloom, a tighter glow, then the sharp lines with a slight colour split.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(34px)';
  ctx.globalAlpha = 1;
  ctx.drawImage(L, 0, 0, W, H);
  ctx.drawImage(L, 0, 0, W, H);
  ctx.filter = 'blur(9px)';
  ctx.globalAlpha = 1;
  ctx.drawImage(L, 0, 0, W, H);
  ctx.filter = 'none';
  ctx.globalAlpha = 0.35;
  ctx.drawImage(L, -3, 0, W, H);
  ctx.drawImage(L, 3, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.drawImage(L, 0, 0, W, H);
  ctx.restore();

  // The corner label and channel number.
  const label = b.a.replace(/\*/g, '').trim().toUpperCase();
  if (label) glowText(ctx, label, 90, 170, 50, p.main, 'left');
  const ch = channelAt(beats, i);
  if (newChannel && local < 1.6) glowText(ctx, `CH ${String(ch).padStart(2, '0')}`, W - 90, 170, 64, p.main, 'right');
  else if (Math.floor(t * 1.2) % 2 === 0 && i === 0) glowText(ctx, 'PLAY ▶', W - 90, 170, 50, p.main, 'right');
  if (str(env.fields, 'captions') !== 'off') caption(ctx, p, b, local, num(env.fields, 'wps', 3));
  fxPost(ctx, b, local);

  // Static: on a new channel and on lines flagged static.
  if (newChannel && local < 0.35) staticNoise(ctx, t, 0.95 * (1 - local / 0.35));
  if (b.tags.includes('static') && local < 0.5) staticNoise(ctx, t, 0.6 * (1 - local / 0.5));
  tube(ctx, t);

  // The end: the set switches off, squashing the picture to a line, then a dot.
  if (b.tags.includes('end') && local > b.dur - 0.6) {
    const u = clamp01((local - (b.dur - 0.6)) / 0.6);
    const cv = ctx.canvas;
    snap ??= document.createElement('canvas');
    if (snap.width !== cv.width || snap.height !== cv.height) {
      snap.width = cv.width;
      snap.height = cv.height;
    }
    const sg = snap.getContext('2d')!;
    sg.clearRect(0, 0, snap.width, snap.height);
    sg.drawImage(cv, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    const hy = Math.max(4, H * (1 - Math.min(1, u * 2)));
    const wx = u < 0.5 ? W : Math.max(10, W * (1 - (u - 0.5) * 2));
    ctx.drawImage(snap, 0, 0, snap.width, snap.height, (W - wx) / 2, (H - hy) / 2, wx, hy);
    if (u > 0.4) {
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.8;
      ctx.fillRect((W - wx) / 2, H / 2 - 3, wx, 6);
      ctx.globalAlpha = 1;
    }
  }
  markLightFrame(false);
}

registerPreset('tv', draw);
