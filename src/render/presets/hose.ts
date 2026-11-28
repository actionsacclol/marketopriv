import { num, storyBeats, str, type StoryBeat } from '@shared/presets';
import { HOSE_CAST, HOSE_FILMS, HOSE_SETS, hoseCast, hoseMoves, hoseProps, type HoseFilm, type HoseLook, type HoseMove, type HoseProp, type HoseSet } from '@shared/hose';
import { H, W, clamp01, easeInOut, markLightFrame, registerPreset, type Ctx, type Env } from '../engine';
import { mouthAt } from '../char3d';
import { wordTimesOf } from './narrated';
import { applyView, fxMoves, fxPost, fxView } from './fx';

// Rubber hose: a 1930s ink-and-paint cartoon. Drawn at full size with thick black lines; everything is coloured from
// one film palette (black and white, sepia or two-strip colour). The cast and the world bounce on a 120 bpm beat and
// move "on twos" (12 drawings a second), like the old cartoons. Old film goes on last: gate weave, flicker, grain, dust,
// scratches and a vignette.

const GROUND = 1390;
const SERIF = 'Georgia, "Times New Roman", serif';

interface Pal {
  ink: string;
  paper: string;
  sky: string;
  skyNight: string;
  far: string;
  mid: string;
  near: string;
  ground: string;
  accent: string;
  accent2: string;
  skin: string;
  tone: string;
}
const PALS: Record<HoseFilm, Pal> = {
  mono: { ink: '#101010', paper: '#F4F1E8', sky: '#D9D6CC', skyNight: '#3A3A3A', far: '#B8B5AC', mid: '#8E8B84', near: '#5E5C58', ground: '#A8A59C', accent: '#6A6864', accent2: '#CFCBC0', skin: '#F7F4EC', tone: 'rgba(0,0,0,0)' },
  sepia: { ink: '#1E140C', paper: '#F3E6CC', sky: '#E2CFA8', skyNight: '#3E2E1E', far: '#C9B188', mid: '#A48A64', near: '#6E5A40', ground: '#BFA67C', accent: '#8A5A34', accent2: '#E8D4AA', skin: '#F6EAD2', tone: 'rgba(120,70,20,0.10)' },
  twostrip: { ink: '#1A1410', paper: '#F2E2C4', sky: '#9CC7C0', skyNight: '#1F3A40', far: '#E2A27A', mid: '#C8714A', near: '#5E7A6E', ground: '#D8B07A', accent: '#D2502E', accent2: '#6FB3A8', skin: '#F5D9BC', tone: 'rgba(255,140,60,0.06)' },
};

type C = CanvasRenderingContext2D;
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function stroke(ctx: C, p: Pal, w: number): void {
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
function blob(ctx: C, p: Pal, fill: string, w = 8): void {
  ctx.fillStyle = fill;
  ctx.fill();
  stroke(ctx, p, w);
}
function ell(ctx: C, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}
/** A bendy hose limb from a to b, sagging by `bend` (signed). */
function hose(ctx: C, p: Pal, ax: number, ay: number, bx: number, by: number, bend: number, w: number): void {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = by - ay;
  const dy = -(bx - ax);
  const l = Math.hypot(dx, dy) || 1;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(mx + (dx / l) * bend, my + (dy / l) * bend, bx, by);
  stroke(ctx, p, w);
}

// ── Sets ───────────────────────────────────────────────────────────────────
/** Draw something that dances on the beat: it leans side to side from its base and squashes a little. */
function dancing(ctx: C, x: number, base: number, ph: number, amt: number, draw: () => void): void {
  ctx.save();
  ctx.translate(x, base);
  const lean = Math.sin(ph * Math.PI) * 0.06 * amt;
  const sq = 1 + Math.abs(Math.cos(ph * Math.PI)) * 0.03 * amt;
  ctx.transform(1, 0, -lean, 1, 0, 0);
  ctx.scale(1 / sq, sq);
  ctx.translate(-x, -base);
  draw();
  ctx.restore();
}

function house(ctx: C, p: Pal, x: number, w: number, h: number, fill: string, ph: number, k: number): void {
  dancing(ctx, x + w / 2, GROUND - 20, ph + k * 0.5, 1, () => {
    const y = GROUND - 20 - h;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    blob(ctx, p, fill, 7);
    ctx.beginPath();
    ctx.moveTo(x - 20, y);
    ctx.lineTo(x + w / 2, y - w * 0.45);
    ctx.lineTo(x + w + 20, y);
    ctx.closePath();
    blob(ctx, p, p.near, 7);
    // Two windows like eyes, a door like a mouth.
    for (const wx of [x + w * 0.18, x + w * 0.58]) {
      ctx.beginPath();
      ctx.rect(wx, y + h * 0.18, w * 0.24, h * 0.26);
      blob(ctx, p, p.paper, 6);
      ctx.beginPath();
      ctx.moveTo(wx + w * 0.12, y + h * 0.18);
      ctx.lineTo(wx + w * 0.12, y + h * 0.44);
      stroke(ctx, p, 4);
    }
    ctx.beginPath();
    ctx.roundRect(x + w * 0.38, y + h * 0.58, w * 0.24, h * 0.42, [w * 0.12, w * 0.12, 0, 0]);
    blob(ctx, p, p.near, 6);
  });
}

function tree(ctx: C, p: Pal, x: number, s: number, ph: number, k: number): void {
  dancing(ctx, x, GROUND - 10, ph + k * 0.7, 1.4, () => {
    ctx.beginPath();
    ctx.moveTo(x - 16 * s, GROUND - 10);
    ctx.quadraticCurveTo(x - 4 * s, GROUND - 150 * s, x - 10 * s, GROUND - 220 * s);
    ctx.lineTo(x + 10 * s, GROUND - 220 * s);
    ctx.quadraticCurveTo(x + 4 * s, GROUND - 150 * s, x + 16 * s, GROUND - 10);
    ctx.closePath();
    blob(ctx, p, p.near, 6);
    for (const [dx, dy, r] of [
      [0, -300, 90],
      [-70, -250, 70],
      [70, -250, 70],
      [-30, -360, 60],
      [40, -350, 62],
    ])
      ell(ctx, x + dx * s, GROUND + dy * s, r * s, r * s * 0.9), blob(ctx, p, p.mid, 6);
  });
}

function sun(ctx: C, p: Pal, x: number, y: number, t: number, night: boolean): void {
  if (night) {
    ell(ctx, x, y, 70, 70);
    blob(ctx, p, p.paper, 6);
    ell(ctx, x + 34, y - 14, 60, 62);
    ctx.fillStyle = p.skyNight;
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.4);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(84, -10);
    ctx.lineTo(124, 0);
    ctx.lineTo(84, 10);
    ctx.closePath();
    blob(ctx, p, p.accent2, 5);
  }
  ctx.restore();
  ell(ctx, x, y, 76, 76);
  blob(ctx, p, p.accent2, 6);
  // A plain smiling sun.
  ell(ctx, x - 24, y - 12, 7, 12);
  ctx.fillStyle = p.ink;
  ctx.fill();
  ell(ctx, x + 24, y - 12, 7, 12);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + 6, 34, 0.2 * Math.PI, 0.8 * Math.PI);
  stroke(ctx, p, 6);
}

function drawSet(ctx: C, p: Pal, set: HoseSet, night: boolean, t: number, ph: number): void {
  const sky = night ? p.skyNight : p.sky;
  const inside = set === 'house' || set === 'bank' || set === 'office' || set === 'stage';
  ctx.fillStyle = sky;
  ctx.fillRect(-200, -200, W + 400, H + 400);
  if (!inside) {
    if (night)
      for (let i = 0; i < 40; i++) {
        const tw = Math.sin(t * 3 + i * 1.7) > 0 ? 1 : 0.4;
        ctx.fillStyle = p.paper;
        ctx.globalAlpha = tw;
        const sx = hash(i) * W;
        const sy = hash(i + 50) * 800;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          ctx.lineTo(sx + Math.cos(a) * 10, sy + Math.sin(a) * 10);
          ctx.lineTo(sx + Math.cos(a + Math.PI / 4) * 3, sy + Math.sin(a + Math.PI / 4) * 3);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    sun(ctx, p, 840, 300, t, night);
    // Puffy clouds drifting.
    if (!night)
      for (let i = 0; i < 3; i++) {
        const cx = ((i * 420 + t * 30) % (W + 400)) - 200;
        const cy = 200 + i * 130;
        for (const [dx, r] of [
          [-50, 40],
          [0, 56],
          [50, 42],
        ])
          ell(ctx, cx + dx, cy, r, r * 0.8), blob(ctx, p, p.paper, 5);
      }
  }
  switch (set) {
    case 'street':
    case 'city': {
      const city = set === 'city';
      for (let k = 0; k < 4; k++) {
        const x = -60 + k * 300;
        if (city) {
          dancing(ctx, x + 110, GROUND - 20, ph + k * 0.5, 0.8, () => {
            const h = 620 + (k % 2) * 220;
            ctx.beginPath();
            ctx.rect(x, GROUND - 20 - h, 220, h);
            blob(ctx, p, k % 2 ? p.far : p.mid, 7);
            for (let wy = GROUND - h + 20; wy < GROUND - 80; wy += 90)
              for (let wx = x + 30; wx < x + 190; wx += 60) {
                ctx.beginPath();
                ctx.rect(wx, wy, 34, 46);
                blob(ctx, p, night && hash(wx + wy) > 0.4 ? p.accent2 : p.paper, 4);
              }
          });
        } else house(ctx, p, x, 220, 330 + (k % 2) * 60, k % 2 ? p.far : p.mid, ph, k);
      }
      // A lamp post that sways.
      dancing(ctx, 120, GROUND, ph + 0.3, 1.6, () => {
        ctx.beginPath();
        ctx.moveTo(120, GROUND);
        ctx.quadraticCurveTo(110, GROUND - 260, 130, GROUND - 420);
        stroke(ctx, p, 14);
        ell(ctx, 140, GROUND - 440, 30, 22);
        blob(ctx, p, night ? p.accent2 : p.paper, 6);
      });
      break;
    }
    case 'park':
    case 'farm': {
      ctx.beginPath();
      ctx.moveTo(-200, GROUND - 160);
      ctx.quadraticCurveTo(250, GROUND - 330, 600, GROUND - 180);
      ctx.quadraticCurveTo(900, GROUND - 80, W + 200, GROUND - 220);
      ctx.lineTo(W + 200, GROUND + 50);
      ctx.lineTo(-200, GROUND + 50);
      ctx.closePath();
      blob(ctx, p, p.far, 7);
      if (set === 'farm') {
        // Barn and a turning windmill.
        dancing(ctx, 760, GROUND - 30, ph, 0.7, () => {
          ctx.beginPath();
          ctx.rect(640, GROUND - 330, 240, 300);
          blob(ctx, p, p.accent, 7);
          ctx.beginPath();
          ctx.moveTo(620, GROUND - 330);
          ctx.lineTo(760, GROUND - 450);
          ctx.lineTo(900, GROUND - 330);
          ctx.closePath();
          blob(ctx, p, p.near, 7);
          ctx.beginPath();
          ctx.rect(710, GROUND - 200, 100, 170);
          blob(ctx, p, p.paper, 6);
          ctx.beginPath();
          ctx.moveTo(710, GROUND - 200);
          ctx.lineTo(810, GROUND - 30);
          ctx.moveTo(810, GROUND - 200);
          ctx.lineTo(710, GROUND - 30);
          stroke(ctx, p, 6);
        });
        ctx.beginPath();
        ctx.moveTo(200, GROUND - 40);
        ctx.lineTo(230, GROUND - 420);
        ctx.lineTo(260, GROUND - 40);
        ctx.closePath();
        blob(ctx, p, p.paper, 6);
        ctx.save();
        ctx.translate(230, GROUND - 420);
        ctx.rotate(t * 2);
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.rect(6, -18, 150, 36);
          blob(ctx, p, p.mid, 5);
        }
        ctx.restore();
        ell(ctx, 230, GROUND - 420, 16, 16);
        blob(ctx, p, p.near, 5);
        // Fence.
        for (let x = -20; x < W + 40; x += 70) {
          ctx.beginPath();
          ctx.rect(x, GROUND - 90, 22, 90);
          blob(ctx, p, p.paper, 5);
        }
        ctx.beginPath();
        ctx.rect(-40, GROUND - 70, W + 80, 14);
        blob(ctx, p, p.paper, 5);
      } else {
        tree(ctx, p, 140, 1.1, ph, 0);
        tree(ctx, p, 900, 0.9, ph, 1);
        // Bench.
        ctx.beginPath();
        ctx.rect(560, GROUND - 120, 260, 20);
        blob(ctx, p, p.near, 6);
        ctx.beginPath();
        ctx.rect(560, GROUND - 200, 260, 18);
        blob(ctx, p, p.near, 6);
        for (const lx of [580, 790]) {
          ctx.beginPath();
          ctx.moveTo(lx, GROUND - 200);
          ctx.lineTo(lx, GROUND);
          stroke(ctx, p, 10);
        }
      }
      break;
    }
    case 'sea': {
      for (let row = 0; row < 3; row++) {
        const y = GROUND - 260 + row * 110;
        ctx.beginPath();
        ctx.moveTo(-100, y + 200);
        for (let x = -100; x <= W + 100; x += 60) ctx.quadraticCurveTo(x + 30, y - 26 + Math.sin(t * 3 + x * 0.02 + row) * 14, x + 60, y);
        ctx.lineTo(W + 100, H);
        ctx.lineTo(-100, H);
        ctx.closePath();
        blob(ctx, p, row === 1 ? p.mid : p.far, 6);
      }
      // A little steam boat bobbing.
      const by = GROUND - 330 + Math.sin(t * 2) * 12;
      ctx.save();
      ctx.translate(200, by);
      ctx.rotate(Math.sin(t * 1.6) * 0.05);
      ctx.beginPath();
      ctx.moveTo(-120, 0);
      ctx.lineTo(120, 0);
      ctx.lineTo(90, 60);
      ctx.lineTo(-90, 60);
      ctx.closePath();
      blob(ctx, p, p.paper, 6);
      ctx.beginPath();
      ctx.rect(-30, -110, 40, 110);
      blob(ctx, p, p.accent, 6);
      for (let k = 0; k < 3; k++) {
        const u = (t * 0.8 + k / 3) % 1;
        ell(ctx, -10 + u * 40, -130 - u * 140, 20 + u * 26, 16 + u * 20);
        ctx.globalAlpha = 1 - u;
        blob(ctx, p, p.paper, 5);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      return;
    }
    case 'house':
    case 'office':
    case 'bank': {
      ctx.fillStyle = set === 'bank' ? p.far : p.accent2;
      ctx.fillRect(-200, -200, W + 400, GROUND + 200);
      // Wallpaper stripes or columns.
      if (set === 'bank') {
        for (const cx of [120, 960]) {
          ctx.beginPath();
          ctx.rect(cx - 60, 200, 120, GROUND - 200);
          blob(ctx, p, p.paper, 7);
          for (let k = -40; k <= 40; k += 26) {
            ctx.beginPath();
            ctx.moveTo(cx + k, 220);
            ctx.lineTo(cx + k, GROUND - 20);
            stroke(ctx, p, 4);
          }
        }
        // The vault: a big round door with a spinning wheel.
        ell(ctx, 540, 640, 230, 230);
        blob(ctx, p, p.mid, 9);
        ell(ctx, 540, 640, 180, 180);
        blob(ctx, p, p.near, 7);
        ctx.save();
        ctx.translate(540, 640);
        ctx.rotate(t * 1.2);
        for (let k = 0; k < 3; k++) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(-110, 0);
          ctx.lineTo(110, 0);
          stroke(ctx, p, 16);
        }
        ctx.restore();
        ell(ctx, 540, 640, 26, 26);
        blob(ctx, p, p.paper, 6);
      } else {
        ctx.globalAlpha = 0.35;
        for (let x = -40; x < W + 40; x += 90) {
          ctx.beginPath();
          ctx.moveTo(x, -100);
          ctx.lineTo(x, GROUND - 80);
          stroke(ctx, p, 4);
        }
        ctx.globalAlpha = 1;
        // Window with clouds or the moon.
        ctx.beginPath();
        ctx.rect(120, 300, 300, 360);
        blob(ctx, p, night ? p.skyNight : p.sky, 9);
        ctx.beginPath();
        ctx.moveTo(270, 300);
        ctx.lineTo(270, 660);
        ctx.moveTo(120, 480);
        ctx.lineTo(420, 480);
        stroke(ctx, p, 8);
        if (set === 'house') {
          // The clock on the wall, its pendulum swinging.
          dancing(ctx, 800, 760, ph, 1.2, () => {
            ctx.beginPath();
            ctx.rect(730, 360, 140, 400);
            blob(ctx, p, p.near, 7);
            ell(ctx, 800, 440, 56, 56);
            blob(ctx, p, p.paper, 6);
            const a = Math.sin(t * Math.PI * 2) * 0.4;
            ctx.beginPath();
            ctx.moveTo(800, 520);
            ctx.lineTo(800 + Math.sin(a) * 160, 520 + Math.cos(a) * 160);
            stroke(ctx, p, 6);
            ell(ctx, 800 + Math.sin(a) * 160, 520 + Math.cos(a) * 160, 22, 22);
            blob(ctx, p, p.accent2, 5);
            ctx.beginPath();
            ctx.moveTo(800, 440);
            ctx.lineTo(800 + Math.cos(t) * 36, 440 + Math.sin(t) * 36);
            stroke(ctx, p, 5);
          });
        } else {
          // Filing cabinet and a ticker machine spitting tape.
          ctx.beginPath();
          ctx.rect(720, 560, 200, GROUND - 560);
          blob(ctx, p, p.mid, 7);
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.rect(745, 590 + k * 250, 150, 200);
            blob(ctx, p, p.far, 5);
            ctx.beginPath();
            ctx.rect(795, 670 + k * 250, 50, 16);
            blob(ctx, p, p.paper, 4);
          }
          ell(ctx, 820, 500, 70, 50);
          blob(ctx, p, p.paper, 7);
          ctx.beginPath();
          ctx.moveTo(870, 500);
          for (let k = 0; k < 6; k++) ctx.lineTo(900 + k * 18, 500 + k * 34 + Math.sin(t * 5 + k) * 6);
          stroke(ctx, p, 14);
        }
      }
      // Floor.
      ctx.beginPath();
      ctx.rect(-200, GROUND - 40, W + 400, H);
      blob(ctx, p, p.ground, 8);
      for (let x = -60; x < W + 60; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND - 40);
        ctx.lineTo(x - 60, H);
        stroke(ctx, p, 4);
      }
      return;
    }
    case 'stage': {
      ctx.fillStyle = p.near;
      ctx.fillRect(-200, -200, W + 400, H + 400);
      // Spotlight.
      ctx.beginPath();
      ctx.moveTo(500, -100);
      ctx.lineTo(580, -100);
      ctx.lineTo(880, GROUND);
      ctx.lineTo(200, GROUND);
      ctx.closePath();
      ctx.fillStyle = p.accent2;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      // Curtains with folds, swaying.
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -40 : W + 40;
        ctx.beginPath();
        ctx.moveTo(x0, -40);
        ctx.lineTo(x0 + side * -260, -40);
        ctx.quadraticCurveTo(x0 + side * -200 + Math.sin(ph * Math.PI) * 20, 700, x0 + side * -150, GROUND);
        ctx.lineTo(x0, GROUND);
        ctx.closePath();
        blob(ctx, p, p.accent, 8);
        for (let k = 1; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(x0 + side * -k * 60, -40);
          ctx.quadraticCurveTo(x0 + side * -k * 50, 700, x0 + side * -k * 36, GROUND);
          stroke(ctx, p, 4);
        }
      }
      ctx.beginPath();
      ctx.rect(-40, -40, W + 80, 180);
      blob(ctx, p, p.accent, 8);
      for (let x = 0; x < W; x += 90) {
        ctx.beginPath();
        ctx.arc(x + 45, 140, 45, 0, Math.PI);
        blob(ctx, p, p.accent, 6);
      }
      ctx.beginPath();
      ctx.rect(-40, GROUND - 40, W + 80, 400);
      blob(ctx, p, p.mid, 8);
      for (let x = 40; x < W; x += 120) {
        ell(ctx, x, GROUND - 10, 30, 14);
        blob(ctx, p, p.paper, 5);
      }
      return;
    }
  }
  // Ground for the outside places.
  ctx.beginPath();
  ctx.rect(-200, GROUND - 20, W + 400, H);
  blob(ctx, p, p.ground, 8);
  if (set === 'street' || set === 'city') {
    ctx.beginPath();
    ctx.moveTo(-200, GROUND + 90);
    ctx.lineTo(W + 200, GROUND + 90);
    stroke(ctx, p, 6);
  }
}

// ── The cast ───────────────────────────────────────────────────────────────
interface Actor {
  look: HoseLook;
  move: HoseMove;
  local: number;
  dur: number;
  /** Time on twos (12 drawings a second). */
  t: number;
  ph: number;
  talk: number;
  facing: 1 | -1;
  prop?: HoseProp;
  /** Where the eyes look (-1 left .. 1 right). */
  look2: number;
}

function glove(ctx: C, p: Pal, x: number, y: number, s: number, open = false): void {
  ell(ctx, x, y, 26 * s, 24 * s);
  blob(ctx, p, p.paper, 6 * s);
  if (open)
    for (let k = -1; k <= 1; k++) {
      ell(ctx, x + k * 16 * s, y - 26 * s, 9 * s, 16 * s);
      blob(ctx, p, p.paper, 5 * s);
    }
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) {
    ctx.moveTo(x + k * 8 * s, y - 6 * s);
    ctx.lineTo(x + k * 8 * s, y + 8 * s);
  }
  stroke(ctx, p, 3 * s);
}

function shoe(ctx: C, p: Pal, x: number, y: number, s: number, f: number): void {
  ell(ctx, x + f * 18 * s, y - 16 * s, 46 * s, 22 * s);
  blob(ctx, p, p.ink, 4 * s);
  ell(ctx, x + f * 34 * s, y - 24 * s, 12 * s, 6 * s);
  ctx.fillStyle = p.paper;
  ctx.fill();
}

/** One pie-cut eye: a tall black oval with a wedge cut out, the cut turned the way they look. */
function pieEye(ctx: C, p: Pal, x: number, y: number, rx: number, ry: number, lookX: number, wide: boolean, shut: boolean): void {
  if (shut) {
    ctx.beginPath();
    ctx.moveTo(x - rx, y);
    ctx.quadraticCurveTo(x, y + ry * 0.4, x + rx, y);
    stroke(ctx, p, 6);
    return;
  }
  ell(ctx, x, y, rx * (wide ? 1.5 : 1), ry * (wide ? 1.3 : 1));
  blob(ctx, p, p.paper, 5);
  const px = x + lookX * rx * 0.35;
  const py = y + ry * 0.12;
  ell(ctx, px, py, rx * 0.62, ry * 0.7);
  ctx.fillStyle = p.ink;
  ctx.fill();
  // The pie cut.
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, ry * 0.75, -Math.PI / 2 + lookX * 0.3 - 0.35, -Math.PI / 2 + lookX * 0.3 + 0.25);
  ctx.closePath();
  ctx.fillStyle = p.paper;
  ctx.fill();
}

function drawActor(ctx: C, p: Pal, x0: number, s: number, a: Actor): void {
  const { look, move, t, local, ph } = a;
  const f = a.facing;
  const beat = Math.abs(Math.sin(ph * Math.PI));
  const sq = 1 - 0.06 * Math.cos(ph * Math.PI * 2);
  const bw = 66 * look.w * s;
  const bh = 92 * look.h * s;
  const hr = 82 * s;
  let lift = beat * 14 * s;
  let bodyShake = 0;
  let tilt = 0;
  if (move === 'jump') lift = Math.sin(clamp01(local / 0.8) * Math.PI) * 220 * s;
  if (move === 'shock') lift = local < 0.6 ? Math.sin(clamp01(local / 0.6) * Math.PI) * 260 * s : 0;
  if (move === 'happy' || move === 'dance') lift = beat * 40 * s;
  if (move === 'anger' || move === 'laugh') bodyShake = Math.sin(t * 60) * 6 * s;
  if (move === 'sad') tilt = 0.08 * f;
  if (move === 'sneak') tilt = 0.18 * f;
  if (move === 'fall' && local > 0.2) {
    // Flat on the floor, stars going round.
    ell(ctx, x0, GROUND - 40 * s, bh * 1.2, bw * 0.8);
    blob(ctx, p, p.ink, 8);
    ell(ctx, x0 - f * bh * 1.5, GROUND - 70 * s, hr, hr * 0.92);
    blob(ctx, p, p.skin, 8);
    for (const ex of [-22, 22]) {
      ctx.beginPath();
      const cx = x0 - f * bh * 1.5 + ex * s;
      const cy = GROUND - 84 * s;
      ctx.moveTo(cx - 12 * s, cy - 12 * s);
      ctx.lineTo(cx + 12 * s, cy + 12 * s);
      ctx.moveTo(cx + 12 * s, cy - 12 * s);
      ctx.lineTo(cx - 12 * s, cy + 12 * s);
      stroke(ctx, p, 6);
    }
    for (let k = 0; k < 4; k++) {
      const ang = t * 5 + (k * Math.PI) / 2;
      star(ctx, p, x0 - f * bh * 1.5 + Math.cos(ang) * 120 * s, GROUND - 200 * s + Math.sin(ang) * 30 * s, 20 * s);
    }
    return;
  }
  const footY = GROUND;
  const hipY = footY - 120 * s - lift;
  const walking = move === 'walk' || move === 'run' || move === 'sneak' || move === 'dance';
  const cyc = t * (move === 'run' ? 9 : move === 'sneak' ? 3 : 5);
  // Legs: hoses from the hips to the big shoes (shoes stay on the floor in a shock: they jumped out of them).
  for (const side of [-1, 1]) {
    const sw = walking ? Math.sin(cyc + (side > 0 ? 0 : Math.PI)) : 0;
    const fx = x0 + side * 26 * s + sw * 46 * s * f;
    const fy = footY - (walking ? Math.max(0, Math.cos(cyc + (side > 0 ? 0 : Math.PI))) * 40 * s : 0) - (move === 'shock' ? 0 : move === 'jump' ? lift : 0);
    const hx = x0 + side * 22 * s;
    hose(ctx, p, hx, hipY, fx, fy - 30 * s, side * 14 * s, 16 * s);
    shoe(ctx, p, fx, fy, s, f);
  }
  ctx.save();
  ctx.translate(x0 + bodyShake, hipY);
  ctx.rotate(tilt);
  ctx.scale(1 / sq, sq);
  // Body: a bean.
  ctx.beginPath();
  ctx.moveTo(-bw, 0);
  ctx.bezierCurveTo(-bw * 1.1, -bh * 0.7, -bw * 0.7, -bh * 1.15, 0, -bh * 1.15);
  ctx.bezierCurveTo(bw * 0.7, -bh * 1.15, bw * 1.1, -bh * 0.7, bw, 0);
  ctx.bezierCurveTo(bw * 0.8, bh * 0.22, -bw * 0.8, bh * 0.22, -bw, 0);
  ctx.closePath();
  const bodyFill = look.body === 'grey' ? p.mid : look.body === 'black' ? p.ink : p.paper;
  blob(ctx, p, bodyFill, 8 * s);
  if (look.body === 'dots' || look.body === 'stripes') {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = p.accent;
    if (look.body === 'dots') for (let yy = -bh * 1.2; yy < bh * 0.3; yy += 34 * s) for (let xx = -bw; xx < bw; xx += 34 * s) ell(ctx, xx + ((yy / (34 * s)) % 2) * 17 * s, yy, 8 * s, 8 * s), ctx.fill();
    else for (let yy = -bh * 1.2; yy < bh * 0.3; yy += 30 * s) ctx.fillRect(-bw * 1.2, yy, bw * 2.4, 14 * s);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-bw, 0);
    ctx.bezierCurveTo(-bw * 1.1, -bh * 0.7, -bw * 0.7, -bh * 1.15, 0, -bh * 1.15);
    ctx.bezierCurveTo(bw * 0.7, -bh * 1.15, bw * 1.1, -bh * 0.7, bw, 0);
    ctx.bezierCurveTo(bw * 0.8, bh * 0.22, -bw * 0.8, bh * 0.22, -bw, 0);
    stroke(ctx, p, 8 * s);
  }
  // Buttons.
  for (const by of [-0.35, -0.65]) {
    ell(ctx, 0, by * bh, 9 * s, 9 * s);
    blob(ctx, p, look.body === 'black' ? p.paper : p.ink, 3 * s);
  }
  // Arms: hoses to white gloves, set by the move.
  const shY = -bh * 0.85;
  const wav = Math.sin(t * 8);
  const arms: Array<[number, number, number, boolean]> = (() => {
    // [hand dx (in facing), hand dy, bend, open hand]
    switch (move) {
      case 'point':
        return [
          [170, -bh * 0.95, 10, false],
          [-90, -10, 30, false],
        ];
      case 'shock':
        return [
          [120, -bh * 1.9, -20, true],
          [-120, -bh * 1.9, 20, true],
        ];
      case 'happy':
      case 'dance':
        return [
          [110, -bh * 1.7 + wav * 30, -30, true],
          [-110, -bh * 1.7 - wav * 30, 30, true],
        ];
      case 'sad':
        return [
          [50, 30, 20, false],
          [-50, 30, -20, false],
        ];
      case 'anger':
        return [
          [90, -bh * 0.5 + Math.sin(t * 30) * 10, -40, false],
          [-90, -bh * 0.5 - Math.sin(t * 30) * 10, 40, false],
        ];
      case 'think':
        return [
          [20, -bh * 1.25, -50, false],
          [-70, -bh * 0.35, 30, false],
        ];
      case 'laugh':
        return [
          [40, -bh * 0.4, -40, true],
          [-40, -bh * 0.4, 40, true],
        ];
      case 'whistle':
        return [
          [-60, -bh * 0.2, -30, false],
          [-80, -bh * 0.25, 30, false],
        ];
      case 'shrug':
        return [
          [140, -bh * 1.05, 40, true],
          [-140, -bh * 1.05, -40, true],
        ];
      case 'sneak':
        return [
          [100, -bh * 1.15, -20, true],
          [40, -bh * 1.2, 20, true],
        ];
      case 'talk':
        return [
          [130, -bh * 1.0 + wav * 40, -30, true],
          [-80, 0, 30, false],
        ];
      case 'walk':
      case 'run': {
        const sw = Math.sin(cyc) * (move === 'run' ? 90 : 60);
        return [
          [sw, -10, -30, false],
          [-sw, -10, 30, false],
        ];
      }
      default:
        return [
          [80, -bh * 0.1 + beat * 10, -30, false],
          [-80, -bh * 0.1 + beat * 10, 30, false],
        ];
    }
  })();
  for (const [dx, dy, bend, open] of arms) {
    const sx = (dx > 0 ? bw * 0.85 : -bw * 0.85) * f;
    const hx = dx * s * f;
    const hy = dy;
    hose(ctx, p, sx, shY, hx, hy, bend * s * f, 15 * s);
    glove(ctx, p, hx, hy, s, open);
  }
  // The prop in the front hand.
  if (a.prop) prop(ctx, p, a.prop, arms[0][0] * s * f + f * 20 * s, arms[0][1] - 60 * s, s, t);
  // Head.
  const hy = -bh * 1.15 - hr * 0.85 + (move === 'shock' && local < 0.6 ? -40 * s : 0);
  const hx = f * 6 * s;
  ell(ctx, hx, hy, hr, hr * 0.94);
  blob(ctx, p, p.skin, 8 * s);
  // Ears.
  for (const side of [-1, 1]) {
    ell(ctx, hx + side * hr * 0.98, hy + 6 * s, 18 * s, 26 * s);
    blob(ctx, p, p.skin, 6 * s);
  }
  // Hat.
  hat(ctx, p, look.hat, hx, hy - hr * 0.8, s, f, move === 'shock' && local < 0.8 ? Math.sin(clamp01(local / 0.8) * Math.PI) * 120 * s : 0, t);
  // Face.
  const eyeY = hy - 14 * s;
  const shut = move === 'laugh' || (move === 'happy' && Math.floor(t * 2) % 3 === 0) || (t + look.w) % 3.4 < 0.14;
  const wide = move === 'shock';
  for (const side of [-1, 1]) pieEye(ctx, p, hx + f * 16 * s + side * 26 * s, eyeY, 16 * s, 30 * s, a.look2, wide, shut);
  if (move === 'anger')
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + f * 16 * s + side * 46 * s, eyeY - 44 * s);
      ctx.lineTo(hx + f * 16 * s + side * 8 * s, eyeY - 30 * s);
      stroke(ctx, p, 8 * s);
    }
  // Nose.
  const nx = hx + f * 28 * s;
  const ny = hy + 22 * s;
  if (look.nose === 'long') ell(ctx, nx + f * 20 * s, ny, 30 * s, 13 * s);
  else ell(ctx, nx, ny, look.nose === 'round' ? 22 * s : 14 * s, look.nose === 'round' ? 18 * s : 11 * s);
  ctx.fillStyle = p.ink;
  ctx.fill();
  // Mouth.
  const my = hy + 50 * s;
  const mx = hx + f * 18 * s;
  const open = Math.max(a.talk, move === 'shock' || move === 'laugh' ? 0.9 : 0);
  if (move === 'whistle') {
    ell(ctx, mx + f * 14 * s, my - 4 * s, 10 * s, 10 * s);
    blob(ctx, p, p.ink, 4);
    for (let k = 0; k < 3; k++) {
      const u = (t * 0.7 + k / 3) % 1;
      note(ctx, p, mx + f * (60 + u * 120) * s, my - (40 + u * 180) * s, s, 1 - u);
    }
  } else if (open > 0.15) {
    ctx.beginPath();
    ctx.moveTo(mx - 40 * s, my - 6 * s);
    ctx.quadraticCurveTo(mx, my - 2 * s, mx + 40 * s, my - 6 * s);
    ctx.quadraticCurveTo(mx, my + (10 + open * 50) * s, mx - 40 * s, my - 6 * s);
    blob(ctx, p, p.ink, 5 * s);
    ell(ctx, mx, my + (open * 30) * s, 16 * s, 9 * s * open);
    ctx.fillStyle = p.accent;
    ctx.fill();
  } else {
    ctx.beginPath();
    if (move === 'sad' || move === 'anger') ctx.arc(mx, my + 26 * s, 30 * s, 1.15 * Math.PI, 1.85 * Math.PI);
    else ctx.arc(mx, my - 20 * s, 38 * s, 0.18 * Math.PI, 0.82 * Math.PI);
    stroke(ctx, p, 7 * s);
  }
  ctx.restore();
  const headX = x0 + hx;
  const headY = hipY + hy * sq;
  // Over the head: what they feel.
  if (move === 'anger')
    for (let k = 0; k < 2; k++) {
      const u = (t * 1.6 + k * 0.5) % 1;
      for (const side of [-1, 1]) {
        ell(ctx, headX + side * (hr + 20 * s + u * 40 * s), headY - hr * 0.3 - u * 120 * s, (20 + u * 30) * s, (16 + u * 22) * s);
        ctx.globalAlpha = 1 - u;
        blob(ctx, p, p.paper, 5);
        ctx.globalAlpha = 1;
      }
    }
  if (move === 'sad') {
    const cy = headY - hr * 2.2;
    for (const [dx, r] of [
      [-50, 40],
      [0, 54],
      [50, 40],
    ])
      ell(ctx, headX + dx * s, cy, r * s, r * 0.8 * s), blob(ctx, p, p.mid, 5);
    for (let k = 0; k < 5; k++) {
      const u = (t * 1.4 + k / 5) % 1;
      ctx.beginPath();
      ctx.moveTo(headX + (-60 + k * 30) * s, cy + 40 * s + u * 140 * s);
      ctx.lineTo(headX + (-60 + k * 30) * s, cy + 66 * s + u * 140 * s);
      stroke(ctx, p, 5);
    }
  }
  if (move === 'think') {
    const n = Math.min(3, Math.floor(local * 3) + 1);
    for (let k = 0; k < n; k++) ell(ctx, headX + f * (70 + k * 40) * s, headY - hr - (40 + k * 46) * s, (10 + k * 8) * s, (10 + k * 8) * s), blob(ctx, p, p.paper, 5);
    if (local > 1) {
      ctx.font = `700 ${Math.round(110 * s)}px ${SERIF}`;
      ctx.fillStyle = p.ink;
      ctx.textAlign = 'center';
      ctx.fillText('?', headX + f * 210 * s, headY - hr - 170 * s);
    }
  }
  if (move === 'laugh') {
    ctx.font = `900 ${Math.round(70 * s)}px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = p.ink;
    const k = Math.floor(t * 4) % 2;
    ctx.fillText('HA', headX + f * (150 + k * 30) * s, headY - hr - 30 * s - k * 50 * s);
    ctx.fillText('HA', headX - f * (130 + k * 20) * s, headY - hr - 80 * s + k * 30 * s);
  }
  if (move === 'shock' && local < 1.2) {
    ctx.save();
    ctx.translate(headX, headY);
    for (let k = 0; k < 10; k++) {
      ctx.rotate((Math.PI * 2) / 10);
      ctx.beginPath();
      ctx.moveTo(hr * 1.4, 0);
      ctx.lineTo(hr * 1.4 + 60 * s * (1 - local / 1.2), 0);
      stroke(ctx, p, 7);
    }
    ctx.restore();
  }
}

function hat(ctx: C, p: Pal, kind: HoseLook['hat'], x: number, y: number, s: number, f: number, pop: number, t: number): void {
  const yy = y - pop;
  switch (kind) {
    case 'bowler':
      ell(ctx, x, yy + 6 * s, 90 * s, 18 * s);
      blob(ctx, p, p.ink, 5);
      ctx.beginPath();
      ctx.arc(x, yy + 4 * s, 58 * s, Math.PI, 0);
      blob(ctx, p, p.ink, 5);
      break;
    case 'tophat':
      ell(ctx, x, yy + 6 * s, 88 * s, 16 * s);
      blob(ctx, p, p.ink, 5);
      ctx.beginPath();
      ctx.rect(x - 50 * s, yy - 120 * s, 100 * s, 126 * s);
      blob(ctx, p, p.ink, 5);
      ctx.fillStyle = p.accent;
      ctx.fillRect(x - 50 * s, yy - 20 * s, 100 * s, 18 * s);
      break;
    case 'sailor':
      ctx.beginPath();
      ctx.moveTo(x - 70 * s, yy + 10 * s);
      ctx.lineTo(x - 50 * s, yy - 40 * s);
      ctx.lineTo(x + 50 * s, yy - 40 * s);
      ctx.lineTo(x + 70 * s, yy + 10 * s);
      ctx.closePath();
      blob(ctx, p, p.paper, 6);
      ctx.beginPath();
      ctx.rect(x - 70 * s, yy - 4 * s, 140 * s, 16 * s);
      blob(ctx, p, p.accent, 5);
      break;
    case 'beanie': {
      ctx.beginPath();
      ctx.arc(x, yy + 10 * s, 70 * s, Math.PI, 0);
      blob(ctx, p, p.accent, 6);
      ctx.beginPath();
      ctx.moveTo(x, yy - 60 * s);
      ctx.lineTo(x, yy - 90 * s);
      stroke(ctx, p, 6);
      // A propeller that spins.
      const w = Math.cos(t * 14) * 60 * s;
      ell(ctx, x, yy - 92 * s, Math.abs(w) + 8 * s, 12 * s);
      blob(ctx, p, p.accent2, 5);
      break;
    }
    case 'flower': {
      const fx = x + f * 40 * s;
      const fy = yy - 20 * s;
      ctx.beginPath();
      ctx.moveTo(x + f * 10 * s, yy + 20 * s);
      ctx.quadraticCurveTo(fx - f * 10 * s, fy + 20 * s, fx, fy);
      stroke(ctx, p, 6);
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5;
        ell(ctx, fx + Math.cos(a) * 26 * s, fy + Math.sin(a) * 26 * s, 18 * s, 18 * s);
        blob(ctx, p, p.paper, 5);
      }
      ell(ctx, fx, fy, 16 * s, 16 * s);
      blob(ctx, p, p.accent, 5);
      break;
    }
    case 'curls':
      for (let k = -2; k <= 2; k++) {
        ell(ctx, x + k * 30 * s, yy + 20 * s - Math.abs(k) * -6 * s, 26 * s, 26 * s);
        blob(ctx, p, p.ink, 4);
      }
      break;
  }
}

function star(ctx: C, p: Pal, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5 - Math.PI / 2;
    const rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  blob(ctx, p, p.accent2, 4);
}

function note(ctx: C, p: Pal, x: number, y: number, s: number, alpha: number): void {
  ctx.globalAlpha = alpha;
  ell(ctx, x, y, 16 * s, 12 * s, -0.4);
  ctx.fillStyle = p.ink;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 14 * s, y);
  ctx.lineTo(x + 14 * s, y - 60 * s);
  ctx.lineTo(x + 36 * s, y - 44 * s);
  stroke(ctx, p, 5);
  ctx.globalAlpha = 1;
}

// ── Props ──────────────────────────────────────────────────────────────────
function prop(ctx: C, p: Pal, kind: HoseProp, x: number, y: number, s: number, t: number): void {
  const k = s * 1.2;
  switch (kind) {
    case 'cash':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.rect(x - 60 * k + i * 6 * k, y - 30 * k - i * 10 * k, 120 * k, 56 * k);
        blob(ctx, p, p.accent2, 5);
      }
      ctx.font = `900 ${Math.round(40 * k)}px ${SERIF}`;
      ctx.fillStyle = p.ink;
      ctx.textAlign = 'center';
      ctx.fillText('$', x + 12 * k, y - 34 * k);
      break;
    case 'bag':
      ell(ctx, x, y, 66 * k, 70 * k);
      blob(ctx, p, p.paper, 6);
      ctx.beginPath();
      ctx.moveTo(x - 24 * k, y - 66 * k);
      ctx.lineTo(x, y - 90 * k);
      ctx.lineTo(x + 24 * k, y - 66 * k);
      stroke(ctx, p, 6);
      ctx.font = `900 ${Math.round(64 * k)}px ${SERIF}`;
      ctx.fillStyle = p.ink;
      ctx.textAlign = 'center';
      ctx.fillText('$', x, y + 22 * k);
      break;
    case 'coin':
      ell(ctx, x, y, 40 * k * Math.abs(Math.cos(t * 3)) + 6, 40 * k);
      blob(ctx, p, p.accent2, 6);
      break;
    case 'letter':
    case 'paper':
      ctx.beginPath();
      ctx.rect(x - 50 * k, y - 36 * k, 100 * k, 72 * k);
      blob(ctx, p, p.paper, 5);
      ctx.beginPath();
      if (kind === 'letter') {
        ctx.moveTo(x - 50 * k, y - 36 * k);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 50 * k, y - 36 * k);
      } else for (let i = 0; i < 4; i++) ctx.moveTo(x - 36 * k, y - 20 * k + i * 14 * k), ctx.lineTo(x + 36 * k, y - 20 * k + i * 14 * k);
      stroke(ctx, p, 4);
      break;
    case 'phone':
      ctx.beginPath();
      ctx.rect(x - 10 * k, y - 60 * k, 20 * k, 90 * k);
      blob(ctx, p, p.ink, 4);
      ell(ctx, x, y + 34 * k, 36 * k, 14 * k);
      blob(ctx, p, p.ink, 4);
      ell(ctx, x, y - 66 * k, 22 * k, 14 * k);
      blob(ctx, p, p.ink, 4);
      break;
    case 'key':
      ell(ctx, x - 40 * k, y, 24 * k, 24 * k);
      blob(ctx, p, p.accent2, 6);
      ctx.beginPath();
      ctx.moveTo(x - 16 * k, y);
      ctx.lineTo(x + 50 * k, y);
      ctx.moveTo(x + 36 * k, y);
      ctx.lineTo(x + 36 * k, y + 18 * k);
      ctx.moveTo(x + 50 * k, y);
      ctx.lineTo(x + 50 * k, y + 18 * k);
      stroke(ctx, p, 9);
      break;
    case 'pie':
      ctx.beginPath();
      ctx.ellipse(x, y, 70 * k, 24 * k, 0, 0, Math.PI);
      blob(ctx, p, p.accent, 6);
      ell(ctx, x, y - 4 * k, 66 * k, 20 * k);
      blob(ctx, p, p.paper, 6);
      break;
    case 'bomb':
      ell(ctx, x, y, 50 * k, 50 * k);
      blob(ctx, p, p.ink, 5);
      ctx.beginPath();
      ctx.moveTo(x + 30 * k, y - 40 * k);
      ctx.quadraticCurveTo(x + 50 * k, y - 80 * k, x + 70 * k, y - 70 * k);
      stroke(ctx, p, 6);
      star(ctx, p, x + 72 * k, y - 72 * k, (14 + Math.sin(t * 30) * 6) * k);
      break;
    case 'anvil':
      ctx.beginPath();
      ctx.moveTo(x - 80 * k, y - 40 * k);
      ctx.lineTo(x + 80 * k, y - 40 * k);
      ctx.lineTo(x + 40 * k, y);
      ctx.lineTo(x + 50 * k, y + 40 * k);
      ctx.lineTo(x - 50 * k, y + 40 * k);
      ctx.lineTo(x - 40 * k, y);
      ctx.closePath();
      blob(ctx, p, p.near, 6);
      break;
    case 'umbrella':
      ctx.beginPath();
      ctx.arc(x, y - 60 * k, 90 * k, Math.PI, 0);
      blob(ctx, p, p.accent, 6);
      ctx.beginPath();
      ctx.moveTo(x, y - 60 * k);
      ctx.lineTo(x, y + 40 * k);
      ctx.arc(x - 14 * k, y + 40 * k, 14 * k, 0, Math.PI);
      stroke(ctx, p, 6);
      break;
    case 'clock':
      ell(ctx, x, y, 50 * k, 50 * k);
      blob(ctx, p, p.paper, 6);
      for (const side of [-1, 1]) ell(ctx, x + side * 36 * k, y - 52 * k, 18 * k, 18 * k), blob(ctx, p, p.accent2, 5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(t * 6) * 34 * k, y + Math.sin(t * 6) * 34 * k);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 24 * k);
      stroke(ctx, p, 5);
      break;
    case 'cup':
      ctx.beginPath();
      ctx.moveTo(x - 36 * k, y - 40 * k);
      ctx.lineTo(x + 36 * k, y - 40 * k);
      ctx.lineTo(x + 26 * k, y + 30 * k);
      ctx.lineTo(x - 26 * k, y + 30 * k);
      ctx.closePath();
      blob(ctx, p, p.paper, 5);
      ctx.beginPath();
      ctx.arc(x + 40 * k, y - 6 * k, 16 * k, -Math.PI / 2, Math.PI / 2);
      stroke(ctx, p, 5);
      break;
    case 'flower':
      ctx.beginPath();
      ctx.moveTo(x, y + 50 * k);
      ctx.lineTo(x, y - 20 * k);
      stroke(ctx, p, 6);
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + t;
        ell(ctx, x + Math.cos(a) * 26 * k, y - 30 * k + Math.sin(a) * 26 * k, 18 * k, 18 * k);
        blob(ctx, p, p.paper, 5);
      }
      ell(ctx, x, y - 30 * k, 16 * k, 16 * k);
      blob(ctx, p, p.accent, 5);
      break;
    case 'safe':
      ctx.beginPath();
      ctx.rect(x - 70 * k, y - 70 * k, 140 * k, 140 * k);
      blob(ctx, p, p.near, 7);
      ell(ctx, x, y, 30 * k, 30 * k);
      blob(ctx, p, p.paper, 5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(t * 3) * 26 * k, y + Math.sin(t * 3) * 26 * k);
      stroke(ctx, p, 5);
      break;
    case 'ticker':
      ctx.beginPath();
      ctx.moveTo(x - 80 * k, y);
      for (let i = 0; i < 8; i++) ctx.lineTo(x - 80 * k + i * 24 * k, y + Math.sin(t * 4 + i) * 20 * k);
      stroke(ctx, p, 16);
      break;
  }
}

// ── Film ───────────────────────────────────────────────────────────────────
let grain: HTMLCanvasElement | null = null;
function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  grain = document.createElement('canvas');
  grain.width = 256;
  grain.height = 256;
  const g = grain.getContext('2d')!;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(hash(i * 0.37) * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 34;
  }
  g.putImageData(img, 0, 0);
  return grain;
}

function film(ctx: C, p: Pal, t: number, film: HoseFilm): void {
  const fr = Math.floor(t * 24);
  // Tint.
  if (film !== 'mono') {
    ctx.fillStyle = p.tone;
    ctx.fillRect(0, 0, W, H);
  }
  // Flicker.
  const fl = (hash(fr) - 0.5) * 0.09;
  ctx.fillStyle = fl > 0 ? `rgba(255,250,235,${fl})` : `rgba(0,0,0,${-fl})`;
  ctx.fillRect(0, 0, W, H);
  // Grain (a tiled noise with a new offset each frame, drawn big so it reads as film).
  const gt = grainTile();
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.imageSmoothingEnabled = false;
  const ox = Math.floor(hash(fr + 3) * 256);
  const oy = Math.floor(hash(fr + 7) * 256);
  for (let y = -oy; y < H; y += 512) for (let x = -ox; x < W; x += 512) ctx.drawImage(gt, x, y, 512, 512);
  ctx.restore();
  // Dust and hairs, now and then.
  ctx.fillStyle = p.ink;
  ctx.strokeStyle = p.ink;
  for (let k = 0; k < 5; k++) {
    if (hash(fr * 13 + k) > 0.55) continue;
    const x = hash(fr * 7 + k) * W;
    const y = hash(fr * 11 + k) * H;
    ell(ctx, x, y, 2 + hash(fr + k) * 5, 2 + hash(fr + k * 3) * 4);
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (hash(fr * 3.3) < 0.08) {
    const hx = hash(fr * 5.1) * W;
    const hy = hash(fr * 6.1) * H;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.bezierCurveTo(hx + 30, hy + 40, hx - 20, hy + 70, hx + 10, hy + 120);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // A vertical scratch that wanders for a while.
  const seg = Math.floor(t / 1.7);
  if (hash(seg) < 0.5) {
    const sx = hash(seg + 0.5) * W + Math.sin(t * 9) * 6;
    ctx.fillStyle = 'rgba(255,255,245,0.35)';
    ctx.fillRect(sx, 0, 2, H);
  }
  // Vignette.
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// ── Cards, captions, iris ──────────────────────────────────────────────────
function decoFrame(ctx: C, p: Pal, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = p.ink;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 8;
  ctx.strokeRect(x + 24, y + 24, w - 48, h - 48);
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 42, y + 42, w - 84, h - 84);
  // Corner fans.
  for (const [cx, cy, a] of [
    [x + 42, y + 42, 0],
    [x + w - 42, y + 42, Math.PI / 2],
    [x + w - 42, y + h - 42, Math.PI],
    [x + 42, y + h - 42, -Math.PI / 2],
  ]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(0, 0, 30 + k * 18, 0, Math.PI / 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function titleCard(ctx: C, p: Pal, text: string, local: number, t: number): void {
  // Sunburst behind.
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(t * 0.15);
  ctx.fillStyle = p.accent2;
  for (let k = 0; k < 24; k += 2) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, H, (k * Math.PI) / 12, ((k + 1) * Math.PI) / 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const pop = 0.85 + 0.15 * easeInOut(clamp01(local / 0.3));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(pop, pop);
  decoFrame(ctx, p, -440, -300, 880, 600);
  ctx.fillStyle = p.paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = text.replace(/\*/g, '').toUpperCase();
  let size = 118;
  ctx.font = `700 ${size}px ${SERIF}`;
  const lines = wrapText(ctx, words, 700);
  if (lines.length > 2) {
    size = 84;
    ctx.font = `700 ${size}px ${SERIF}`;
  }
  const ls = wrapText(ctx, words, 700);
  ls.forEach((l, i) => ctx.fillText(l, 0, (i - (ls.length - 1) / 2) * size * 1.1));
  ctx.restore();
}

function wrapText(ctx: C, text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const n = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(n).width > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = n;
  }
  if (cur) out.push(cur);
  return out;
}

/** Old-cartoon captions: two or three words at a time in a heavy serif, cream with a black outline. */
function caption(ctx: C, p: Pal, b: StoryBeat, local: number, wps: number): void {
  const text = b.headline.replace(/\*/g, '').trim();
  if (!text) return;
  const words = text.split(/\s+/);
  const times = wordTimesOf(b, words, wps);
  let lit = -1;
  for (let i = 0; i < words.length; i++) if (local >= times[i]) lit = i;
  if (lit < 0) return;
  const group = Math.floor(lit / 3);
  const shown = words.slice(group * 3, Math.min(words.length, group * 3 + 3));
  ctx.font = `700 92px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const s = shown.join(' ');
  const pop = 1 + 0.08 * Math.max(0, 1 - (local - times[lit]) / 0.12);
  const fitK = Math.min(1, (W - 80) / Math.max(1, ctx.measureText(s).width));
  ctx.save();
  ctx.translate(W / 2, 1640);
  ctx.scale(pop * fitK, pop * fitK);
  ctx.lineWidth = 16;
  ctx.strokeStyle = p.ink;
  ctx.lineJoin = 'round';
  ctx.strokeText(s, 0, 0);
  ctx.fillStyle = '#FFF8E6';
  ctx.fillText(s, 0, 0);
  ctx.restore();
}

function topSign(ctx: C, p: Pal, text: string): void {
  const s = text.replace(/\*/g, '').trim().toUpperCase();
  if (!s) return;
  ctx.font = `700 56px ${SERIF}`;
  const w = ctx.measureText(s).width + 90;
  ctx.save();
  ctx.translate(W / 2, 200);
  decoFrame(ctx, p, -w / 2, -60, w, 120);
  ctx.fillStyle = p.paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, 0, 4);
  ctx.restore();
}

/** Black everywhere except a circle of radius r around (x, y). */
function iris(ctx: C, x: number, y: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2, true);
  ctx.fillStyle = '#000000';
  ctx.fill('evenodd');
  ctx.restore();
}

// ── Frame ──────────────────────────────────────────────────────────────────
const who = (b: StoryBeat): number => (b.tags.includes('who=c') ? 2 : b.tags.includes('who=b') ? 1 : 0);
function setAt(beats: StoryBeat[], i: number, field: string): HoseSet {
  let v = field;
  for (const b of beats.slice(0, i + 1)) for (const t of b.tags) if (t.startsWith('set=')) v = t.slice(4);
  return ((HOSE_SETS as readonly string[]).includes(v) ? v : 'street') as HoseSet;
}
function nightAt(beats: StoryBeat[], i: number, field: string): boolean {
  let n = field === 'night';
  for (const b of beats.slice(0, i + 1)) for (const t of b.tags) if (t === 'night' || t === 'day') n = t === 'night';
  return n;
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const filmId = ((HOSE_FILMS as readonly string[]).includes(str(env.fields, 'film')) ? str(env.fields, 'film') : 'mono') as HoseFilm;
  const p = PALS[filmId];
  // On twos: drawings change 12 times a second.
  const tq = Math.floor(t * 12) / 12;
  const lq = Math.floor(local * 12) / 12;
  const ph = (tq * 120) / 60;
  const fr = Math.floor(t * 24);

  if (b.tags.includes('title')) {
    titleCard(ctx, p, b.headline, local, tq);
    film(ctx, p, t, filmId);
    markLightFrame(true);
    return;
  }

  const cast = hoseCast(str(env.fields, 'cast') || 'bert;mabel');
  const n = cast.length;
  const focus = Math.min(who(b), n - 1);
  const solo = b.tags.includes('solo');
  const field = str(env.fields, 'set');
  const set = setAt(beats, i, field);
  const night = nightAt(beats, i, str(env.fields, 'time'));
  const spots = n === 1 || solo ? [540] : n === 2 ? [330, 750] : [220, 540, 860];
  const xs = cast.map((_, k) => (solo ? (k === focus ? 540 : -9999) : spots[k]));
  const shotTag = b.tags.find((x) => x.startsWith('shot='))?.slice(5);
  const close = shotTag ? shotTag === 'close' : i % 3 === 2;
  // Camera: a slow push all the time, a close shot on the head of whoever the line is about.
  const push = 1 + 0.04 * clamp01(local / Math.max(1, b.dur));
  const zoom = (close ? 1.55 : 1) * push;
  const fxp = xs[focus];
  const fyp = close ? GROUND - 420 : GROUND - 560;
  const shake = b.tags.includes('shake') && local < 0.6 ? Math.sin(local * 70) * 16 * (1 - local / 0.6) : 0;
  // Gate weave: the whole frame jitters a hair.
  const wx = (hash(fr * 1.3) - 0.5) * 4;
  const wy = (hash(fr * 2.1) - 0.5) * 6;

  const view = fxView(b, local);
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  ctx.translate(W / 2 + wx + shake, H * 0.47 + wy);
  ctx.scale(zoom, zoom);
  ctx.translate(-(close ? fxp : 540 + (fxp - 540) * 0.25), -(close ? fyp : H * 0.47));
  drawSet(ctx, p, set, night, tq, ph);
  const moves = hoseMoves(b.visual, n, focus);
  const props = hoseProps(b.b);
  const voiced = b.voDur > 0;
  const text = b.headline.replace(/\*/g, '');
  cast.forEach((name, k) => {
    if (xs[k] < -1000) return;
    const mv = moves[k];
    let x = xs[k];
    if (mv === 'walk' || mv === 'run' || mv === 'sneak') x += (clamp01(lq / Math.max(0.6, b.dur)) - 0.5) * (mv === 'run' ? 360 : 200);
    const facing: 1 | -1 = n > 1 && !solo ? (xs[k] < 540 ? 1 : -1) : mv === 'walk' || mv === 'run' || mv === 'sneak' ? 1 : -1;
    drawActor(ctx, p, x, 1.45, {
      look: HOSE_CAST[name],
      move: mv,
      local: lq,
      dur: b.dur,
      t: tq + k * 0.31,
      ph: ph + k * 0.25,
      talk: mv === 'talk' ? (voiced ? mouthAt(text, lq, b.voStart, b.voDur) : mouthAt(text, lq, 0.1, Math.max(0.5, text.split(/\s+/).length / 3))) : 0,
      facing,
      prop: props.find((q) => (solo && q.who < n && q.who !== focus ? focus : q.who) === k)?.kind,
      look2: n > 1 && !solo ? facing * 0.8 : Math.sin(tq * 0.8) * 0.6,
    });
  });
  // A loose prop (no one has it) drops in from above with a bounce.
  const loose = props.find((q) => q.who >= n);
  if (loose) {
    const u = clamp01(lq / 0.5);
    const y = 700 - (1 - u) * 900 + (u >= 1 ? Math.abs(Math.sin(lq * 6)) * -30 * Math.max(0, 1 - (lq - 0.5)) : 0);
    prop(ctx, p, loose.kind, 540, y, 2.2, tq);
  }
  if (b.tags.includes('rain'))
    for (let k = 0; k < 90; k++) {
      const x = hash(k) * (W + 200) - 100;
      const y = ((hash(k + 9) * H + tq * 1400) % (H + 200)) - 100;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 8, y + 40);
      stroke(ctx, p, 4);
    }
  ctx.restore();

  topSign(ctx, p, b.a);
  if (str(env.fields, 'captions') !== 'off') caption(ctx, p, b, local, num(env.fields, 'wps', 3));
  fxPost(ctx, b, local);

  // Iris: opens on a new place, closes before the next place and on the end line.
  const R = Math.hypot(W, H) * 0.6;
  const prevSet = i > 0 ? setAt(beats, i - 1, field) : set;
  const next = beats[i + 1];
  const nextSet = next && !next.tags.includes('title') ? setAt(beats, i + 1, field) : set;
  const ix = xs[focus] > -1000 ? (close ? W / 2 : 540 + (xs[focus] - 540) * 0.75) : W / 2;
  const iy = close ? H * 0.42 : H * 0.42;
  let ir = Infinity;
  if (i > 0 && (prevSet !== set || beats[i - 1].tags.includes('title')) && local < 0.45) ir = R * easeInOut(local / 0.45);
  else if (b.tags.includes('end') && local > b.dur * 0.55) ir = R * (1 - easeInOut(clamp01((local - b.dur * 0.55) / (b.dur * 0.4))));
  else if (next && (nextSet !== set || next.tags.includes('title')) && local > b.dur - 0.3) ir = R * (1 - easeInOut((local - (b.dur - 0.3)) / 0.3));
  if (ir < Infinity) iris(ctx, ix, iy, ir);
  film(ctx, p, t, filmId);
  // Over a mostly closed iris the frame is black, so the disclaimer turns light.
  markLightFrame(ir > 1000);
}

registerPreset('hose', draw);
