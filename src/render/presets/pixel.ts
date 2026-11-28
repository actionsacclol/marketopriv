import { storyBeats, str, type StoryBeat } from '@shared/presets';
import { PIXEL_CAST, PIXEL_SETS, pixelCast, pixelMoves, pixelProps, type PixelLook, type PixelMove, type PixelProp, type PixelSet } from '@shared/pixel';
import { FONT, H, W, clamp01, markLightFrame, registerPreset, type Ctx, type Env } from '../engine';
import { mouthAt } from '../char3d';
import { applyView, fxMoves, fxPost, fxView } from './fx';

// Pixel Theater: everything is drawn on a 180x320 pixel canvas with whole-pixel rectangles, then blown up 6x with no
// smoothing, so every edge stays a crisp pixel. Words and menus are drawn at full size in a pixel font on top.

const LW = 180;
const LH = 320;
const S = W / LW;
const GROUND = 232;

let small: HTMLCanvasElement | null = null;
const canvas = (): HTMLCanvasElement => {
  if (small) return small;
  small = document.createElement('canvas');
  small.width = LW;
  small.height = LH;
  return small;
};

type P = CanvasRenderingContext2D;
const px = (c: P, x: number, y: number, w: number, h: number, color: string): void => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
const rnd = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ── Places ─────────────────────────────────────────────────────────────────
interface Pal {
  sky: string[];
  far: string;
  mid: string;
  near: string;
  ground: string;
  groundDark: string;
  light: string;
}
const PALS: Record<PixelSet, { day: Pal; night: Pal }> = {
  city: {
    day: { sky: ['#5FA8E8', '#8CC4F0'], far: '#7A9CC8', mid: '#4E6A9A', near: '#36486E', ground: '#5A5E6E', groundDark: '#3E4150', light: '#F8E08A' },
    night: { sky: ['#14183A', '#232A5C'], far: '#2C3570', mid: '#1E2550', near: '#151A38', ground: '#2A2C3A', groundDark: '#1A1B26', light: '#FFD95A' },
  },
  room: {
    day: { sky: ['#9FD0F0', '#C8E6F8'], far: '#E8C9A0', mid: '#C9A27A', near: '#8A5E3C', ground: '#A0703E', groundDark: '#7A522C', light: '#FFF2B0' },
    night: { sky: ['#1C2048', '#2A3068'], far: '#5A4A6E', mid: '#4A3A5E', near: '#3A2A44', ground: '#4A3448', groundDark: '#33233A', light: '#7FD0FF' },
  },
  office: {
    day: { sky: ['#9FD0F0', '#C8E6F8'], far: '#C8CED6', mid: '#9AA4B2', near: '#6E7888', ground: '#7A8494', groundDark: '#5A6272', light: '#9FF0FF' },
    night: { sky: ['#14183A', '#232A5C'], far: '#3A4254', mid: '#2C3344', near: '#1E2432', ground: '#2E3444', groundDark: '#1E2230', light: '#7FE0FF' },
  },
  street: {
    day: { sky: ['#6FB8F0', '#A8D8F8'], far: '#E8A86E', mid: '#C86E5A', near: '#7A4A5A', ground: '#8A8A8A', groundDark: '#6A6A6A', light: '#FFE08A' },
    night: { sky: ['#1A1640', '#2E2662'], far: '#5A3A6A', mid: '#3E2A50', near: '#2A1E3A', ground: '#3A3848', groundDark: '#262432', light: '#FF8AD0' },
  },
  forest: {
    day: { sky: ['#7EC8F0', '#B8E4F8'], far: '#6AA86A', mid: '#3E8A4E', near: '#2A5E36', ground: '#6A8A3A', groundDark: '#4E6A2A', light: '#FFE070' },
    night: { sky: ['#0E1A2E', '#1A2E48'], far: '#1E3A3A', mid: '#14302A', near: '#0C201C', ground: '#1E2E1E', groundDark: '#121E12', light: '#FF9A3A' },
  },
  desert: {
    day: { sky: ['#F0B86A', '#F8D898'], far: '#E8A060', mid: '#D88850', near: '#B86A3E', ground: '#E8C080', groundDark: '#C8A060', light: '#FFF0A0' },
    night: { sky: ['#1E1A3E', '#3A2E5E'], far: '#5A4A6E', mid: '#4A3A5A', near: '#3A2C48', ground: '#6A5A6A', groundDark: '#4A3E4E', light: '#F8F0C0' },
  },
  space: {
    day: { sky: ['#0A0A1E', '#141432'], far: '#3A2A6A', mid: '#5A3A9A', near: '#2A2A4A', ground: '#6A6A7A', groundDark: '#4A4A5A', light: '#9AE8FF' },
    night: { sky: ['#0A0A1E', '#141432'], far: '#3A2A6A', mid: '#5A3A9A', near: '#2A2A4A', ground: '#6A6A7A', groundDark: '#4A4A5A', light: '#9AE8FF' },
  },
  shop: {
    day: { sky: ['#F8E8C8', '#FFF4DC'], far: '#E86E5A', mid: '#F2B84A', near: '#8A5A3A', ground: '#C89A6A', groundDark: '#A07A4E', light: '#FFF8C0' },
    night: { sky: ['#2A2244', '#3A2E5A'], far: '#7A3A4A', mid: '#8A6A3A', near: '#4A322A', ground: '#5A4438', groundDark: '#3E2E26', light: '#FFD070' },
  },
  bank: {
    day: { sky: ['#E8ECF0', '#F8FAFC'], far: '#D8D0C0', mid: '#B8AC98', near: '#8A7E6A', ground: '#C8C0B0', groundDark: '#A8A090', light: '#F2C83A' },
    night: { sky: ['#2A2E3E', '#3A3E52'], far: '#5A5648', mid: '#48443A', near: '#36332C', ground: '#4A4840', groundDark: '#36342E', light: '#F2C83A' },
  },
  void: {
    day: { sky: ['#000000', '#000000'], far: '#000000', mid: '#000000', near: '#000000', ground: '#000000', groundDark: '#000000', light: '#FFFFFF' },
    night: { sky: ['#000000', '#000000'], far: '#000000', mid: '#000000', near: '#000000', ground: '#000000', groundDark: '#000000', light: '#FFFFFF' },
  },
};

function skyBands(c: P, pal: Pal): void {
  const bands = 8;
  for (let i = 0; i < bands; i++) px(c, 0, i * (GROUND / bands), LW, GROUND / bands + 1, i < bands / 2 ? pal.sky[0] : pal.sky[1]);
}
function stars(c: P, t: number, n = 40, seed = 7): void {
  const r = rnd(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * LW);
    const y = 84 + Math.floor(r() * 110);
    const on = Math.sin(t * (1.5 + r() * 3) + i) > -0.3;
    if (on) px(c, x, y, 1, 1, r() > 0.8 ? '#FFF3A0' : '#FFFFFF');
  }
}
function clouds(c: P, t: number, color: string): void {
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(((i * 70 + t * (3 + i)) % (LW + 40)) - 30);
    const y = 100 + i * 18;
    px(c, x, y, 22, 4, color);
    px(c, x + 4, y - 3, 12, 3, color);
  }
}
function ground(c: P, pal: Pal): void {
  px(c, 0, GROUND, LW, LH - GROUND, pal.ground);
  for (let x = 0; x < LW; x += 8) px(c, x + ((x / 8) % 2) * 4, GROUND + 4, 3, 1, pal.groundDark);
  px(c, 0, GROUND, LW, 1, pal.groundDark);
}

function drawSet(c: P, set: PixelSet, night: boolean, t: number, scroll: number, rain: boolean): void {
  const pal = PALS[set][night ? 'night' : 'day'];
  const off = (p: number): number => Math.round(-scroll * p);
  skyBands(c, pal);
  if (night || set === 'space') stars(c, t, set === 'space' ? 70 : 40);
  else if (set !== 'room' && set !== 'office' && set !== 'shop' && set !== 'bank' && set !== 'void') clouds(c, t, '#FFFFFF');
  const r = rnd(31);
  switch (set) {
    case 'city':
    case 'street': {
      // Two rows of buildings, windows that switch on and off.
      for (const [p, col, base, hMax] of [
        [0.3, pal.far, GROUND - 40, 90],
        [0.6, pal.mid, GROUND - 10, 70],
      ] as Array<[number, string, number, number]>) {
        let x = -20 + (off(p) % 40);
        while (x < LW + 20) {
          const w = 18 + Math.floor(r() * 16);
          const h = 30 + Math.floor(r() * hMax);
          px(c, x, base - h, w, h + 50, col);
          for (let wy = base - h + 4; wy < base - 4; wy += 6)
            for (let wx = x + 3; wx < x + w - 3; wx += 5) {
              const lit = (night ? 0.55 : 0.15) > ((Math.sin(wx * 12.9 + wy * 78.2 + Math.floor(t * 0.5)) + 1) / 2);
              px(c, wx, wy, 2, 3, lit ? pal.light : col === pal.far ? pal.mid : pal.near);
            }
          x += w + 2;
        }
      }
      if (set === 'street') {
        // Shop fronts with striped awnings.
        for (let i = 0; i < 3; i++) {
          const x = 6 + i * 60 + (off(0.9) % 60);
          px(c, x, GROUND - 46, 50, 46, pal.near);
          for (let s = 0; s < 50; s += 6) px(c, x + s, GROUND - 50, 3, 6, i % 2 ? '#F2F2F2' : pal.light);
          px(c, x + 6, GROUND - 36, 18, 14, night ? pal.light : '#9AD0F0');
          px(c, x + 32, GROUND - 30, 10, 30, pal.groundDark);
        }
      }
      // Lamp post.
      const lx = 150 + (off(1) % 200);
      px(c, lx, GROUND - 60, 2, 60, '#2A2A3A');
      px(c, lx - 3, GROUND - 64, 8, 4, night ? pal.light : '#D8D8D8');
      break;
    }
    case 'room':
    case 'office': {
      px(c, 0, 0, LW, GROUND, pal.far);
      px(c, 0, GROUND - 30, LW, 30, pal.mid);
      // Window with the outside in it.
      const wx = 38 + off(0.8);
      px(c, wx, 110, 50, 46, '#2A2A3A');
      px(c, wx + 2, 112, 46, 42, night ? '#1C2048' : '#9FD0F0');
      if (night) {
        for (let k = 0; k < 6; k++) if (Math.sin(t * (1.5 + k * 0.7) + k) > -0.3) px(c, wx + 4 + ((k * 13) % 26), 115 + ((k * 7) % 14), 1, 1, '#FFFFFF');
        px(c, wx + 34, 118, 6, 6, '#F8F0C0');
      }
      px(c, wx + 24, 112, 2, 42, '#2A2A3A');
      px(c, wx + 2, 132, 46, 2, '#2A2A3A');
      if (set === 'office') {
        // Desks with glowing screens; the clock's hand moves.
        for (let i = 0; i < 2; i++) {
          const dx = 90 + i * 50 + off(0.9);
          px(c, dx, GROUND - 22, 40, 4, pal.near);
          px(c, dx + 4, GROUND - 18, 3, 18, pal.near);
          px(c, dx + 33, GROUND - 18, 3, 18, pal.near);
          px(c, dx + 12, GROUND - 38, 18, 13, '#1A1A24');
          px(c, dx + 14, GROUND - 36, 14, 9, Math.sin(t * 6 + i) > 0 ? pal.light : '#5AC0E0');
          px(c, dx + 19, GROUND - 25, 4, 3, '#1A1A24');
        }
        const cx = 128 + off(0.8);
        px(c, cx, 104, 14, 14, '#F2F2F2');
        px(c, cx + 6, 105, 2, 6 + (Math.floor(t) % 2), '#1A1A24');
      } else {
        // Bed, desk with a glowing PC, a poster.
        px(c, 100 + off(0.9), GROUND - 18, 60, 18, pal.near);
        px(c, 100 + off(0.9), GROUND - 22, 60, 5, '#E8E8F0');
        px(c, 102 + off(0.9), GROUND - 28, 14, 7, '#F2F2F2');
        px(c, 104 + off(0.8), 120, 18, 24, '#E8423F');
        px(c, 107 + off(0.8), 124, 12, 6, '#F2C33A');
      }
      break;
    }
    case 'forest': {
      for (const [p, col, base] of [
        [0.3, pal.far, GROUND - 30],
        [0.6, pal.mid, GROUND - 6],
      ] as Array<[number, string, number]>) {
        for (let i = -1; i < 9; i++) {
          const x = i * 24 + (off(p) % 24);
          const h = 40 + ((i * 37) % 20);
          for (let k = 0; k < 5; k++) px(c, x + 10 - k * 3, base - h + k * 9, 4 + k * 6, 10, col);
          px(c, x + 10, base - 8, 4, 12, '#4A3A2A');
        }
      }
      if (night) {
        // Campfire.
        const fx = 120 + off(1);
        const f = Math.floor(t * 8) % 3;
        px(c, fx, GROUND - 3, 14, 3, '#5A3A2A');
        px(c, fx + 3, GROUND - 9 - f, 8, 6 + f, '#FF8A2A');
        px(c, fx + 5, GROUND - 13 - f, 4, 5, '#FFE05A');
      }
      break;
    }
    case 'desert': {
      px(c, 110 + off(0.1), 110, 22, 22, pal.light);
      for (const [p, col, y] of [
        [0.3, pal.far, GROUND - 26],
        [0.6, pal.mid, GROUND - 12],
      ] as Array<[number, string, number]>) {
        for (let x = -40; x < LW + 40; x += 2) {
          const xx = x + (off(p) % 80);
          const h = Math.round(10 + 8 * Math.sin(xx * 0.05 + p * 9));
          px(c, x, y - h, 2, h + 40, col);
        }
      }
      const cx = 40 + off(0.9);
      px(c, cx, GROUND - 30, 6, 30, '#3E8A4E');
      px(c, cx - 6, GROUND - 22, 6, 4, '#3E8A4E');
      px(c, cx - 6, GROUND - 28, 3, 6, '#3E8A4E');
      break;
    }
    case 'space': {
      px(c, 44 + off(0.2), 104, 40, 40, pal.mid);
      px(c, 44 + off(0.2), 104, 40, 12, pal.far);
      px(c, 36 + off(0.2), 124, 56, 3, '#C8A0F0');
      // A shooting star now and then.
      const k = (t * 0.4) % 1;
      if (k < 0.25) px(c, LW - k * 600, 96 + k * 80, 4, 1, '#FFFFFF');
      break;
    }
    case 'shop':
    case 'bank': {
      px(c, 0, 0, LW, GROUND, pal.far);
      for (let y = 96; y < GROUND - 40; y += 30) {
        px(c, 10 + off(0.7), y + 18, 160, 3, pal.near);
        for (let x = 14; x < 166; x += 10) px(c, x + off(0.7), y + 8, 6, 10, ['#E8423F', '#3F8CE8', '#45C46A', pal.light][Math.floor((x + y) / 10) % 4]);
      }
      // The counter.
      px(c, 0 + off(1.1), GROUND - 34, LW + 60, 34, pal.mid);
      px(c, 0 + off(1.1), GROUND - 36, LW + 60, 3, pal.near);
      if (set === 'bank') {
        // The vault door with a turning wheel.
        const vx = 112 + off(0.7);
        px(c, vx, 104, 40, 40, '#8A8A9A');
        px(c, vx + 4, 108, 32, 32, '#A8A8B8');
        const a = t * 1.5;
        for (let k = 0; k < 3; k++) {
          const ang = a + (k * Math.PI) / 3;
          for (let s = -10; s <= 10; s += 2) px(c, vx + 19 + Math.cos(ang) * s, 123 + Math.sin(ang) * s, 2, 2, pal.light);
        }
      }
      break;
    }
    case 'void':
      break;
  }
  if (set !== 'void') ground(c, pal);
  if (rain) {
    const rr = rnd(99);
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(rr() * LW);
      const y = Math.floor((rr() * LH + t * 220) % GROUND);
      px(c, x, y, 1, 4, '#9AC8F0');
    }
  }
}

// ── The cast ───────────────────────────────────────────────────────────────
const INKC = '#1A1A24';
const WHITE = '#F8F8F8';
const SHADE = '#C8CCD8';

interface Actor {
  look: PixelLook;
  move: PixelMove;
  local: number;
  t: number;
  talk: number;
  facing: 1 | -1;
  prop?: PixelProp;
}

/** One cast member, feet at (x, GROUND), facing right (mirrored when facing left). */
function drawActor(c: P, x0: number, a: Actor): void {
  const { look, move, t, local } = a;
  const tall = 26 + look.height;
  const f = a.facing;
  // Whole-pixel offsets from the feet, mirrored for facing.
  const R = (dx: number, dy: number, w: number, h: number, col: string): void => px(c, f > 0 ? x0 + dx : x0 - dx - w, GROUND - dy - h, w, h, col);
  let bob = move === 'idle' || move === 'talk' || move === 'think' ? (Math.floor(t * 2.2) % 2) : 0;
  let lift = 0;
  if (move === 'jump') lift = Math.round(Math.max(0, Math.sin(clamp01(local / 0.7) * Math.PI)) * 14);
  if (move === 'happy' || move === 'dance') lift = Math.floor(t * 5) % 2 ? 2 : 0;
  if (move === 'sit') bob = -6;
  const step = Math.floor(t * (move === 'run' ? 10 : 6)) % 2;
  if (move === 'fall' && local > 0.25) {
    // Lying flat.
    R(-12, 0, 24, 8, INKC);
    R(-11, 1, 22, 6, WHITE);
    R(-14, 0, 9, 9, INKC);
    R(-13, 1, 7, 7, WHITE);
    R(-11, 3, 1, 1, INKC);
    R(-9, 3, 1, 1, INKC);
    // Stars over the head.
    for (let k = 0; k < 3; k++) {
      const ang = t * 4 + (k * Math.PI * 2) / 3;
      px(c, x0 - 10 * f + Math.cos(ang) * 7, GROUND - 14 + Math.sin(ang) * 2, 2, 2, '#F2C33A');
    }
    return;
  }
  const y = lift + Math.max(0, bob);
  const sitDrop = move === 'sit' ? 6 : 0;
  // Legs.
  if (move !== 'sit') {
    const walkish = move === 'walk' || move === 'run' || move === 'dance';
    R(-3 + (walkish && step ? 1 : 0), y, 2, 7, INKC);
    R(1 - (walkish && step ? 1 : 0), y, 2, 7, INKC);
  } else {
    R(-3, 0, 8, 2, INKC);
    R(4, 0, 2, 4, INKC);
  }
  const by = y + 7 - sitDrop;
  // Body.
  R(-5, by, 10, 10, INKC);
  R(-4, by + 1, 8, 8, WHITE);
  R(-4, by + 1, 2, 8, SHADE);
  if (look.mark === 'tie') R(0, by + 3, 2, 6, look.color);
  if (look.mark === 'scarf') {
    R(-4, by + 7, 8, 2, look.color);
    R(-3 - ((Math.floor(t * 4) % 2) as number), by + 4, 2, 4, look.color);
  }
  // Arms: per move, as short pixel lines from the shoulders.
  const arm = (sx: number, dx: number, dy: number): void => {
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 0; i <= n; i++) R(sx + Math.round((dx * i) / n), by + 8 - Math.round((dy * i) / n) - 1, 2, 2, INKC);
  };
  const wave = Math.floor(t * 6) % 2;
  switch (move) {
    case 'point':
      arm(4, 7, -1);
      arm(-6, -1, 5);
      break;
    case 'shock':
      arm(4, 3, -6);
      arm(-6, -3, -6);
      break;
    case 'happy':
    case 'dance':
      arm(4, 3, -6 + wave * 2);
      arm(-6, -3, -6 + (1 - wave) * 2);
      break;
    case 'sad':
      arm(4, 1, 6);
      arm(-6, -1, 6);
      break;
    case 'think':
      arm(4, 1, -5);
      arm(-6, -1, 5);
      break;
    case 'phone':
    case 'type':
      arm(4, 4, -2);
      arm(-6, 2, -2);
      break;
    case 'run':
      arm(4, 3, step ? -2 : 3);
      arm(-6, -3, step ? 3 : -2);
      break;
    case 'talk':
      arm(4, 3, Math.round(Math.sin(t * 5) * 2));
      arm(-6, -1, 5);
      break;
    default:
      arm(4, 1, 5);
      arm(-6, -1, 5);
  }
  // Head.
  const hy = by + 10;
  R(-6, hy, 12, 11, INKC);
  R(-5, hy + 1, 10, 9, WHITE);
  R(-5, hy + 1, 10, 2, SHADE);
  // Face: eyes and mouth by move; a blink now and then.
  const blink = (t + look.height * 0.7) % 3.2 < 0.12;
  const ey = hy + 5;
  if (move === 'sleep') {
    R(0, ey, 2, 1, INKC);
    R(3, ey, 2, 1, INKC);
    const z = Math.floor(t * 1.5) % 3;
    for (let k = 0; k <= z; k++) px(c, x0 + f * (8 + k * 4), GROUND - hy - 12 - k * 5, 3, 1, '#FFFFFF');
  } else if (move === 'shock') {
    R(0, ey - 1, 2, 3, INKC);
    R(3, ey - 1, 2, 3, INKC);
  } else if (move === 'happy' || move === 'dance') {
    R(0, ey + 1, 1, 1, INKC);
    R(1, ey + 2, 1, 1, INKC);
    R(3, ey + 2, 1, 1, INKC);
    R(4, ey + 1, 1, 1, INKC);
  } else if (move === 'sad') {
    R(0, ey - 1, 2, 1, INKC);
    R(3, ey - 1, 2, 1, INKC);
    if (Math.floor(t * 2) % 2) R(4, ey - 3, 1, 2, '#5AB0F0');
  } else if (!blink) {
    R(0, ey, 2, 2, INKC);
    R(3, ey, 2, 2, INKC);
  } else {
    R(0, ey, 2, 1, INKC);
    R(3, ey, 2, 1, INKC);
  }
  if (look.glasses) {
    R(-1, ey + 2, 4, 1, INKC);
    R(2, ey + 2, 4, 1, INKC);
  }
  const open = a.talk > 0.3 || move === 'shock';
  if (move === 'sad') R(1, ey - 4, 3, 1, INKC);
  else if (open) R(1, ey - 4, 3, 2, INKC);
  else R(1, ey - 3, 3, 1, INKC);
  // The one coloured thing.
  const top = hy + 11;
  switch (look.mark) {
    case 'cap':
      R(-6, top - 1, 12, 3, look.color);
      R(4, top - 1, 4, 1, look.color);
      break;
    case 'bow':
      R(-2, top - 1, 6, 3, look.color);
      R(0, top, 2, 1, '#FFFFFF');
      break;
    case 'phones':
      R(-6, top - 1, 12, 1, look.color);
      R(-7, hy + 4, 2, 4, look.color);
      R(5, hy + 4, 2, 4, look.color);
      break;
    case 'spikes':
      for (let k = -5; k < 6; k += 3) R(k, top - 1, 2, 3 + ((k + 6) % 2), look.color);
      break;
    default:
      break;
  }
  if (move === 'think') {
    const n = Math.floor(local * 3) % 4;
    for (let k = 0; k < n; k++) px(c, x0 + f * (6 + k * 4), GROUND - hy - 14, 2, 2, '#FFFFFF');
  }
  if (move === 'shock') {
    px(c, x0 - 1, GROUND - top - 12, 2, 6, '#F2C33A');
    px(c, x0 - 1, GROUND - top - 4, 2, 2, '#F2C33A');
  }
  if (move === 'phone') R(8, by + 7, 4, 6, '#2A2A3A');
  if (move === 'phone') R(9, by + 8, 2, 4, Math.sin(t * 8) > 0 ? '#7FE0FF' : '#4AA0C0');
  if (a.prop) drawProp(c, a.prop, f > 0 ? x0 + 9 : x0 - 9 - 10, GROUND - by - 14, t);
  void tall;
}

// ── Props (10x10 pixel icons) ──────────────────────────────────────────────
function drawProp(c: P, kind: PixelProp, x: number, y: number, t: number, k = 1): void {
  const R = (dx: number, dy: number, w: number, h: number, col: string): void => px(c, x + dx * k, y + dy * k, w * k, h * k, col);
  const shine = Math.floor(t * 3) % 4 === 0;
  switch (kind) {
    case 'coin':
      R(2, 0, 6, 10, '#B8860B');
      R(1, 1, 8, 8, '#F2C33A');
      R(4, 2, 2, 6, '#B8860B');
      if (shine) R(2, 2, 1, 2, '#FFFFFF');
      break;
    case 'cash':
      R(0, 2, 10, 6, '#2E8A4A');
      R(1, 3, 8, 4, '#5AC46A');
      R(4, 4, 2, 2, '#2E8A4A');
      break;
    case 'phone':
      R(2, 0, 6, 10, '#2A2A3A');
      R(3, 1, 4, 7, Math.sin(t * 6) > 0 ? '#7FE0FF' : '#4AA0C0');
      break;
    case 'letter':
      R(0, 2, 10, 7, '#F2F2F2');
      R(0, 2, 10, 1, '#C8C8D0');
      R(1, 3, 4, 3, '#C8C8D0');
      R(5, 3, 4, 3, '#C8C8D0');
      break;
    case 'key':
      R(0, 3, 4, 4, '#F2C33A');
      R(4, 4, 6, 2, '#F2C33A');
      R(7, 6, 1, 2, '#F2C33A');
      R(9, 6, 1, 2, '#F2C33A');
      break;
    case 'chest':
      R(0, 2, 10, 8, '#8A5A2A');
      R(0, 2, 10, 3, '#A8743A');
      R(4, 4, 2, 3, '#F2C33A');
      break;
    case 'heart':
      R(1, 2, 3, 3, '#E8423F');
      R(6, 2, 3, 3, '#E8423F');
      R(0, 3, 10, 3, '#E8423F');
      R(1, 6, 8, 1, '#E8423F');
      R(2, 7, 6, 1, '#E8423F');
      R(4, 8, 2, 1, '#E8423F');
      break;
    case 'star':
      R(4, 0, 2, 10, '#F2C33A');
      R(0, 4, 10, 2, '#F2C33A');
      R(2, 2, 6, 6, '#F2C33A');
      break;
    case 'bag':
      R(1, 3, 8, 7, '#C8A06A');
      R(3, 1, 4, 2, '#A8804A');
      R(3, 5, 4, 3, '#2E8A4A');
      break;
    case 'laptop':
      R(1, 1, 8, 6, '#2A2A3A');
      R(2, 2, 6, 4, '#7FE0FF');
      R(0, 7, 10, 2, '#8A8A9A');
      break;
    case 'chart':
      R(0, 0, 10, 10, '#F2F2F2');
      R(1, 7, 2, 2, '#45C46A');
      R(4, 5, 2, 4, '#45C46A');
      R(7, 2, 2, 7, '#45C46A');
      break;
    case 'clock':
      R(1, 1, 8, 8, '#F2F2F2');
      R(4, 2, 2, 3, '#2A2A3A');
      R(4, 4, 3, 2, '#2A2A3A');
      break;
    case 'gift':
      R(0, 3, 10, 7, '#E8423F');
      R(4, 3, 2, 7, '#F2C33A');
      R(2, 1, 6, 2, '#F2C33A');
      break;
    case 'cup':
      R(1, 2, 7, 8, '#F2F2F2');
      R(8, 4, 2, 3, '#F2F2F2');
      R(2, 3, 5, 2, '#8A5A2A');
      break;
    case 'pizza':
      R(0, 0, 10, 2, '#C8863A');
      R(1, 2, 8, 2, '#F2C33A');
      R(2, 4, 6, 2, '#F2C33A');
      R(3, 6, 4, 2, '#F2C33A');
      R(4, 8, 2, 2, '#F2C33A');
      R(3, 3, 2, 2, '#E8423F');
      break;
    case 'trophy':
      R(2, 0, 6, 5, '#F2C33A');
      R(0, 1, 2, 3, '#F2C33A');
      R(8, 1, 2, 3, '#F2C33A');
      R(4, 5, 2, 3, '#F2C33A');
      R(2, 8, 6, 2, '#B8860B');
      break;
  }
}

// ── Words, menus, HUD (full size, pixel font) ─────────────────────────────
function pixFont(ctx: Ctx, size: number): void {
  ctx.font = `400 ${size}px ${FONT.pixel}`;
  ctx.textBaseline = 'top';
}

function wrap(ctx: Ctx, text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** A framed game box (black with a white double border). */
function box(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#FFFFFF';
  const b = S;
  ctx.fillRect(x + b, y + b, w - 2 * b, b);
  ctx.fillRect(x + b, y + h - 2 * b, w - 2 * b, b);
  ctx.fillRect(x + b, y + b, b, h - 2 * b);
  ctx.fillRect(x + w - 2 * b, y + b, b, h - 2 * b);
}

function textBox(ctx: Ctx, text: string, shown: number, name: string, t: number): void {
  const x = 4 * S;
  const y = 246 * S;
  const w = W - 8 * S;
  const h = 62 * S;
  box(ctx, x, y, w, h);
  pixFont(ctx, 40);
  const lines = wrap(ctx, text, w - 14 * S);
  let left = shown;
  const visible: string[] = [];
  for (const l of lines) {
    if (left <= 0) break;
    visible.push(l.slice(0, left));
    left -= l.length + 1;
  }
  const last = visible.slice(-3);
  ctx.fillStyle = '#FFFFFF';
  last.forEach((l, i) => ctx.fillText(l, x + 7 * S, y + 9 * S + i * 16 * S));
  // The "more" arrow blinks when the line is all out.
  if (shown >= text.length && Math.floor(t * 2.5) % 2 === 0) {
    ctx.beginPath();
    ctx.moveTo(x + w - 12 * S, y + h - 10 * S);
    ctx.lineTo(x + w - 6 * S, y + h - 10 * S);
    ctx.lineTo(x + w - 9 * S, y + h - 6 * S);
    ctx.closePath();
    ctx.fill();
  }
  if (name) {
    pixFont(ctx, 30);
    const nw = ctx.measureText(name).width + 10 * S;
    box(ctx, x + 4 * S, y - 13 * S, nw, 16 * S);
    ctx.fillStyle = '#F2C33A';
    ctx.fillText(name, x + 9 * S, y - 9 * S);
  }
}

function menu(ctx: Ctx, options: string[], local: number, dur: number, t: number): void {
  pixFont(ctx, 40);
  const w = Math.max(...options.map((o) => ctx.measureText(o).width)) + 26 * S;
  const h = options.length * 16 * S + 12 * S;
  const x = W - w - 8 * S;
  const y = 246 * S - h - 6 * S;
  box(ctx, x, y, w, h);
  const picked = local > dur * 0.6;
  // The cursor moves down then back up to the first one before it is picked.
  const at = picked ? 0 : Math.floor(local / 0.45) % options.length;
  options.forEach((o, i) => {
    ctx.fillStyle = picked && i === 0 && Math.floor(t * 8) % 2 ? '#F2C33A' : '#FFFFFF';
    ctx.fillText(o, x + 18 * S, y + 8 * S + i * 16 * S);
    if (i === at) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(x + 7 * S, y + 8 * S + i * 16 * S);
      ctx.lineTo(x + 13 * S, y + 11 * S + i * 16 * S);
      ctx.lineTo(x + 7 * S, y + 14 * S + i * 16 * S);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function hud(ctx: Ctx, coins: number | null, hp: number | null, t: number): void {
  pixFont(ctx, 34);
  if (hp !== null) {
    const c = canvas().getContext('2d')!;
    void c;
    for (let i = 0; i < 5; i++) {
      const on = i < hp;
      const x = 6 * S + i * 13 * S;
      const y = 8 * S;
      ctx.fillStyle = '#000000';
      ctx.fillRect(x - S, y - S, 12 * S, 11 * S);
      ctx.fillStyle = on ? '#E8423F' : '#3A3A4A';
      for (const [dx, dy, w, h] of [
        [1, 1, 3, 3],
        [6, 1, 3, 3],
        [0, 2, 10, 3],
        [1, 5, 8, 1],
        [2, 6, 6, 1],
        [4, 7, 2, 1],
      ])
        ctx.fillRect(x + dx * S, y + dy * S, w * S, h * S);
    }
  }
  if (coins !== null) {
    const s = `x${coins}`;
    const w = ctx.measureText(s).width;
    const x = W - w - 8 * S;
    const y = 9 * S;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 16 * S, y - 2 * S, w + 18 * S, 13 * S);
    ctx.fillStyle = Math.floor(t * 3) % 4 ? '#F2C33A' : '#FFF3A0';
    ctx.fillRect(x - 13 * S, y, 8 * S, 9 * S);
    ctx.fillStyle = '#B8860B';
    ctx.fillRect(x - 10 * S, y + 2 * S, 2 * S, 5 * S);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(s, x, y + S);
  }
}

function topLabel(ctx: Ctx, text: string): void {
  const s = text.replace(/\*/g, '').trim().toUpperCase();
  if (!s) return;
  pixFont(ctx, 36);
  const w = ctx.measureText(s).width + 14 * S;
  const x = (W - w) / 2;
  const y = 26 * S;
  box(ctx, x, y, w, 16 * S);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(s, x + 7 * S, y + 5 * S);
}

function titleCard(ctx: Ctx, text: string, local: number, t: number): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  const s = text.replace(/\*/g, '').trim().toUpperCase();
  pixFont(ctx, 76);
  const lines = wrap(ctx, s, W - 20 * S);
  const pop = local < 0.12 ? 0.6 : 1;
  ctx.save();
  ctx.translate(W / 2, H / 2 - 20 * S);
  ctx.scale(pop, pop);
  lines.forEach((l, i) => {
    const w = ctx.measureText(l).width;
    const y = (i - (lines.length - 1) / 2) * 22 * S - 38;
    ctx.fillStyle = '#E8423F';
    ctx.fillText(l, -w / 2 + S, y + S);
    ctx.fillStyle = Math.floor(t * 4) % 2 ? '#FFFFFF' : '#F2C33A';
    ctx.fillText(l, -w / 2, y);
  });
  ctx.restore();
  pixFont(ctx, 30);
  if (Math.floor(t * 1.6) % 2 === 0) {
    const p = 'PRESS START';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(p, (W - ctx.measureText(p).width) / 2, H / 2 + 40 * S);
  }
}

function endCard(ctx: Ctx, text: string, shown: number, t: number): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  pixFont(ctx, 48);
  const lines = wrap(ctx, text.replace(/\*/g, ''), W - 24 * S);
  let left = shown;
  const startY = H / 2 - (lines.length * 20 * S) / 2;
  const pulse = 0.85 + 0.15 * Math.sin(t * 2);
  ctx.fillStyle = `rgba(255,255,255,${pulse})`;
  let cx = 0;
  let cy = startY;
  lines.forEach((l, i) => {
    if (left <= 0) return;
    const part = l.slice(0, left);
    left -= l.length + 1;
    const w = ctx.measureText(l).width;
    const x = (W - w) / 2;
    ctx.fillText(part, x, startY + i * 20 * S);
    cx = x + ctx.measureText(part).width;
    cy = startY + i * 20 * S;
  });
  if (Math.floor(t * 2.2) % 2 === 0) ctx.fillRect(cx + 6, cy, 6 * S, 8 * S);
}

// ── Frame ──────────────────────────────────────────────────────────────────
const who = (b: StoryBeat): number => (b.tags.includes('who=c') ? 2 : b.tags.includes('who=b') ? 1 : 0);
function lastTag(beats: StoryBeat[], i: number, key: string): string {
  let v = '';
  for (const b of beats.slice(0, i + 1)) for (const t of b.tags) if (t.startsWith(key + '=')) v = t.slice(key.length + 1);
  return v;
}
function nightAt(beats: StoryBeat[], i: number, field: string): boolean {
  let n = field === 'night';
  for (const b of beats.slice(0, i + 1)) for (const t of b.tags) if (t === 'night' || t === 'day') n = t === 'night';
  return n;
}
const setOf = (beats: StoryBeat[], i: number, field: string): PixelSet => {
  const v = lastTag(beats, i, 'set') || field;
  return ((PIXEL_SETS as readonly string[]).includes(v) ? v : 'city') as PixelSet;
};

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const cast = pixelCast(str(env.fields, 'cast') || 'pip;mo');
  const n = cast.length;
  const focus = Math.min(who(b), n - 1);
  const text = b.headline.replace(/\*/g, '');
  const voiced = b.voDur > 0;
  // Letters out: with the voice, as it speaks; without, about 22 letters a second.
  const typed = voiced ? Math.floor(clamp01((local - b.voStart) / Math.max(0.3, b.voDur * 0.92)) * text.length) : Math.floor(Math.max(0, local - 0.1) * 22);

  if (b.tags.includes('title')) {
    titleCard(ctx, text, local, t);
    markLightFrame(false);
    return;
  }
  if (b.tags.includes('end')) {
    endCard(ctx, text, typed, t);
    markLightFrame(false);
    return;
  }

  const field = str(env.fields, 'set');
  const set = setOf(beats, i, field);
  const night = nightAt(beats, i, str(env.fields, 'time'));
  const sc = canvas();
  const c = sc.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, LW, LH);

  // Where everyone stands; the camera scrolls a little with whoever the line is about.
  const solo = b.tags.includes('solo');
  const spots = n === 1 || solo ? [90] : n === 2 ? [62, 118] : [44, 90, 136];
  const xs = cast.map((_, k) => (solo ? (k === focus ? 90 : -999) : spots[k]));
  const scroll = Math.round((xs[focus] - 90) * 0.3 + Math.sin(t * 0.4) * 3);
  drawSet(c, set, night, t, scroll + i * 7, b.tags.includes('rain'));
  const moves = pixelMoves(b.visual, n, focus);
  const props = pixelProps(b.b);
  cast.forEach((name, k) => {
    if (xs[k] < -100) return;
    const mv = moves[k];
    let x = xs[k] - scroll;
    // Walking and running cross the stage over the line.
    if (mv === 'walk' || mv === 'run') x += Math.round((clamp01(local / Math.max(0.5, b.dur)) - 0.5) * (mv === 'run' ? 60 : 30));
    const facing: 1 | -1 = n > 1 && !solo ? (xs[k] < 90 ? 1 : -1) : 1;
    drawActor(c, x, {
      look: PIXEL_CAST[name],
      move: mv,
      local,
      t: t + k * 0.37,
      talk: mv === 'talk' ? (voiced ? mouthAt(text, local, b.voStart, b.voDur) : mouthAt(text, local, 0.1, Math.max(0.4, text.length / 22))) : 0,
      facing,
      prop: props.find((p) => (solo && p.who < n && p.who !== focus ? focus : p.who) === k)?.kind,
    });
  });
  // A prop with no one holding it pops up big over the scene, bobbing.
  const loose = props.filter((p) => p.who >= n);
  loose.slice(0, 1).forEach((p) => drawProp(c, p.kind, 75, 120 + Math.round(Math.sin(t * 3) * 2), t, 3));

  // Up-scale with whole pixels; close shots crop to half the stage (2x).
  const shotTag = b.tags.find((x) => x.startsWith('shot='))?.slice(5);
  const close = shotTag ? shotTag === 'close' : i > 0 && i % 3 === 1 && !solo;
  const shake = b.tags.includes('shake') && local < 0.5 ? Math.round(Math.sin(local * 60) * 2) : 0;
  // Block wipe into a new place: big squares fill in, then open out.
  const newSet = i > 0 && setOf(beats, i - 1, field) !== set;
  const view = fxView(b, local);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (fxMoves(view)) applyView(ctx, view);
  // The camera shows part of the stage in whole-pixel steps: wide = 120 px across (9x), close = 72 px (15x), the
  // floor about 70% down, so the cast reads on a phone.
  const cw = close ? 72 : 120;
  const ch = (cw * H) / W;
  const shown = xs.filter((x) => x > -100).map((x) => x - scroll);
  const mid = shown.length ? (Math.min(...shown) + Math.max(...shown)) / 2 : 90;
  const aim = close ? xs[focus] - scroll : mid + (xs[focus] - scroll - mid) * 0.3;
  const lo = shown.length ? Math.min(...shown) - 12 : 0;
  const hi = shown.length ? Math.max(...shown) + 12 : LW;
  const want = close || hi - lo > cw ? aim - cw / 2 : Math.min(lo, Math.max(hi - cw, aim - cw / 2));
  const x0 = Math.max(0, Math.min(LW - cw, want));
  const y0 = GROUND - ch * (close ? 0.72 : 0.7);
  ctx.drawImage(sc, x0, y0, cw, ch, shake * S, 0, W, H);
  ctx.restore();
  if (newSet && local < 0.4) {
    const k = local / 0.4;
    const cell = 20 * S;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < H; y += cell)
      for (let x = 0; x < W; x += cell) {
        const d = ((x / cell + y / cell) % 7) / 7;
        if (d > k) ctx.fillRect(x, y, cell, cell);
      }
  }

  // HUD, label, menu, the text box.
  const coins = lastTag(beats, i, 'coins');
  const hp = lastTag(beats, i, 'hp');
  hud(ctx, coins ? Number(coins) : null, hp ? Number(hp) : null, t);
  topLabel(ctx, b.a);
  const choice = b.tags.find((x) => x.startsWith('choice='));
  if (choice && local > 0.3)
    menu(
      ctx,
      choice
        .slice(7)
        .split('/')
        .map((o) => o.replace(/_/g, ' ').toUpperCase())
        .slice(0, 3),
      local,
      b.dur,
      t,
    );
  const speaker = moves[focus] === 'talk' && n > 1 ? cast[focus].toUpperCase() : '';
  if (str(env.fields, 'captions') !== 'off') textBox(ctx, text, typed, speaker, t);
  fxPost(ctx, b, local);
  markLightFrame(false);
}

registerPreset('pixel', draw);
void H;
