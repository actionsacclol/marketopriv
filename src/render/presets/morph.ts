import { num, str, storyBeats, type StoryBeat } from '@shared/presets';
import { isMorphState, type MorphState } from '@shared/morph';
import { applyView, fxMoves, fxPost, fxView } from './fx';
import { parseWords } from './story';
import { FONT, H, W, clamp01, easeInOut, easeOut, fit, font, hexA, lerp, logo, markLightFrame, prog, registerPreset, rrect, withAlpha, type Ctx, type Env } from '../engine';

// UI motion: one rounded shape that becomes a button, a toggle, a loader, a notification, a player... in turn, with a
// springy morph on every change and a cursor that clicks it just before. Everything is drawn here (no video model,
// no After Effects), cut to the beat of the music (120 BPM by default, the bpm field).

const CX = W / 2;
const CY = 930;

interface Look {
  light: boolean;
  bg: string;
  surface: string;
  ink: string;
  sub: string;
  line: string;
}
const DARK: Look = { light: false, bg: '#07070B', surface: '#F4F4F7', ink: '#0B0B10', sub: 'rgba(255,255,255,0.55)', line: 'rgba(255,255,255,0.07)' };
const LIGHT: Look = { light: true, bg: '#EEEEF2', surface: '#FFFFFF', ink: '#0B0B10', sub: 'rgba(10,10,16,0.5)', line: 'rgba(10,10,16,0.07)' };

interface Geo {
  w: number;
  h: number;
  r: number;
}

const BASE: Record<MorphState, Geo> = {
  button: { w: 560, h: 156, r: 78 },
  pill: { w: 300, h: 104, r: 52 },
  toggle: { w: 320, h: 176, r: 88 },
  checkbox: { w: 200, h: 200, r: 52 },
  slider: { w: 800, h: 96, r: 48 },
  loader: { w: 230, h: 230, r: 115 },
  progress: { w: 800, h: 76, r: 38 },
  search: { w: 860, h: 150, r: 75 },
  input: { w: 860, h: 190, r: 40 },
  notify: { w: 900, h: 250, r: 56 },
  panel: { w: 760, h: 900, r: 64 },
  player: { w: 860, h: 440, r: 60 },
  graph: { w: 880, h: 580, r: 52 },
  message: { w: 720, h: 210, r: 72 },
  avatar: { w: 300, h: 300, r: 150 },
  tabs: { w: 880, h: 156, r: 78 },
  icon: { w: 320, h: 320, r: 84 },
  window: { w: 940, h: 620, r: 40 },
  logo: { w: 380, h: 380, r: 96 },
  word: { w: 860, h: 320, r: 64 },
};

const stateOf = (b: StoryBeat): MorphState => {
  const v = b.visual.trim().toLowerCase();
  return isMorphState(v) ? v : 'button';
};
const tagOf = (b: StoryBeat, name: string): string => b.tags.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
const clean = (s: string): string => s.replace(/\*/g, '');
const pct = (s: string, d: number): number => {
  const n = Number(String(s).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && String(s).trim() !== '' ? Math.min(100, Math.max(0, n)) : d;
};

/** The shape's size for a state: buttons and words grow with their text. */
function geoOf(ctx: Ctx, b: StoryBeat): Geo {
  const st = stateOf(b);
  const g = { ...BASE[st] };
  if (st === 'button' || st === 'pill') {
    font(ctx, st === 'button' ? 62 : 44, 800, FONT.meme);
    const tw = ctx.measureText(clean(b.a || (st === 'button' ? 'Get started' : 'New'))).width;
    g.w = Math.min(900, Math.max(st === 'button' ? 380 : 220, tw + (st === 'button' ? 170 : 130)));
  }
  return g;
}

/** A damped spring from 0 to 1 that overshoots once: the morph's feel. */
const spring = (u: number): number => (u <= 0 ? 0 : u >= 1.6 ? 1 : 1 - Math.exp(-5.2 * u) * Math.cos(10.5 * u));

function fillOf(env: Env, look: Look, b: StoryBeat): string {
  const f = tagOf(b, 'fill');
  if (f === 'accent') return env.accent[0];
  if (f === 'surface') return look.surface;
  if (f === 'ink') return look.light ? '#111116' : '#1B1B22';
  if (/^[0-9a-f]{6}$/.test(f)) return `#${f}`;
  const st = stateOf(b);
  if (st === 'button' || st === 'pill' || st === 'icon') return env.accent[0];
  if (st === 'logo') return look.light ? '#111116' : '#16161D';
  if (st === 'window') return '#101015';
  return look.surface;
}

/** Whether text on a fill should be white. */
function darkFill(hex: string): boolean {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return true;
  const n = parseInt(h, 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l < 150;
}

function mixHex(a: string, b: string, k: number): string {
  const p = (h: string): number[] => {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return k < 0.5 ? a : b;
  const x = p(a);
  const y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`;
}

// ── Contents ───────────────────────────────────────────────────────────────
/** Where the cursor clicks on a state (relative to the shape's centre). */
function clickPoint(st: MorphState, g: Geo, b: StoryBeat): { x: number; y: number } {
  switch (st) {
    case 'toggle':
      return { x: g.w / 2 - g.h / 2, y: 0 };
    case 'slider':
      return { x: -g.w / 2 + (g.w * pct(b.a, 72)) / 100, y: 0 };
    case 'search':
    case 'input':
      return { x: g.w / 2 - 90, y: 0 };
    case 'notify':
      return { x: g.w / 2 - 120, y: -20 };
    case 'panel':
      return { x: 0, y: g.h / 2 - 90 };
    case 'player':
      return { x: 0, y: g.h / 2 - 80 };
    case 'tabs': {
      const n = Math.max(1, tabsOf(b).length);
      const to = Math.min(n, Math.max(1, Number(b.b) || n)) - 1;
      return { x: -g.w / 2 + (g.w / n) * (to + 0.5), y: 0 };
    }
    case 'graph':
      return { x: g.w / 2 - 110, y: -g.h / 2 + 80 };
    case 'window':
      return { x: g.w / 2 - 140, y: g.h / 2 - 90 };
    default:
      return { x: g.w * 0.18, y: g.h * 0.12 };
  }
}

const tabsOf = (b: StoryBeat): string[] =>
  (b.a || 'Home;Search;Profile')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 4);

function centred(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, weight = 800, family = FONT.meme): void {
  font(ctx, size, weight, family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function typed(text: string, local: number, from: number, to: number): string {
  const n = Math.round(text.length * clamp01((local - from) / Math.max(0.05, to - from)));
  return text.slice(0, n);
}

/** One state's insides, drawn around (0,0) inside its shape. `local` = seconds into the state; `dur` its length. */
function contents(ctx: Ctx, env: Env, look: Look, b: StoryBeat, g: Geo, fill: string, local: number, dur: number): void {
  const st = stateOf(b);
  const acc = env.accent;
  const on = darkFill(fill) ? '#FFFFFF' : look.ink;
  const soft = darkFill(fill) ? 'rgba(255,255,255,0.6)' : 'rgba(11,11,16,0.5)';
  const mid = 0.3 * dur;
  ctx.textBaseline = 'middle';
  switch (st) {
    case 'button':
      centred(ctx, clean(b.a || 'Get started'), 0, 3, 62, on);
      break;
    case 'pill': {
      ctx.fillStyle = on;
      ctx.beginPath();
      ctx.arc(-g.w / 2 + 52, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      centred(ctx, clean(b.a || 'New'), 18, 2, 44, on);
      break;
    }
    case 'toggle': {
      const k = easeInOut(prog(local, mid, 0.28));
      const pad = 16;
      const kr = g.h / 2 - pad;
      ctx.fillStyle = hexA(acc[0], 0.92 * k);
      rrect(ctx, -g.w / 2 + 6, -g.h / 2 + 6, g.w - 12, g.h - 12, g.h / 2);
      ctx.fill();
      const kx = lerp(-g.w / 2 + pad + kr, g.w / 2 - pad - kr, k);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = k > 0.5 ? '#FFFFFF' : look.light ? '#D9D9E0' : '#CFCFD8';
      ctx.beginPath();
      ctx.arc(kx, 0, kr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'checkbox': {
      const k = prog(local, mid, 0.3);
      ctx.fillStyle = hexA(acc[0], easeOut(clamp01(k * 2.2)));
      rrect(ctx, -g.w / 2 + 8, -g.h / 2 + 8, g.w - 16, g.h - 16, g.r - 8);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 20;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pts = [[-46, 4], [-12, 38], [52, -36]];
      const len1 = Math.hypot(34, 34);
      const len2 = Math.hypot(64, 74);
      const d = easeOut(k) * (len1 + len2);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      if (d > 0) {
        const a = Math.min(1, d / len1);
        ctx.lineTo(lerp(pts[0][0], pts[1][0], a), lerp(pts[0][1], pts[1][1], a));
        if (d > len1) {
          const c = (d - len1) / len2;
          ctx.lineTo(lerp(pts[1][0], pts[2][0], c), lerp(pts[1][1], pts[2][1], c));
        }
        ctx.stroke();
      }
      break;
    }
    case 'slider': {
      const to = pct(b.a, 72) / 100;
      const k = lerp(0.18, to, easeInOut(prog(local, 0.15 * dur, 0.6 * dur)));
      const x0 = -g.w / 2 + g.h / 2;
      const x1 = g.w / 2 - g.h / 2;
      const kx = lerp(x0, x1, k);
      ctx.fillStyle = look.light ? 'rgba(10,10,16,0.08)' : 'rgba(10,10,16,0.1)';
      rrect(ctx, x0, -9, x1 - x0, 18, 9);
      ctx.fill();
      ctx.fillStyle = acc[0];
      rrect(ctx, x0, -9, kx - x0, 18, 9);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(kx, 0, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = acc[0];
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(kx, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      centred(ctx, `${Math.round(k * 100)}`, kx, -g.h / 2 - 54, 46, look.light ? look.ink : '#FFFFFF', 800, FONT.mono);
      break;
    }
    case 'loader': {
      const a0 = local * 7;
      const span = 1.1 + 0.9 * Math.sin(local * 4.5);
      ctx.strokeStyle = look.light ? 'rgba(10,10,16,0.08)' : 'rgba(10,10,16,0.1)';
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.arc(0, 0, g.w / 2 - 44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = acc[0];
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, g.w / 2 - 44, a0, a0 + span);
      ctx.stroke();
      break;
    }
    case 'progress': {
      const to = pct(b.a, 100) / 100;
      const k = to * easeInOut(prog(local, 0.08 * dur, 0.8 * dur));
      ctx.fillStyle = acc[0];
      rrect(ctx, -g.w / 2 + 10, -g.h / 2 + 10, Math.max(g.h - 20, (g.w - 20) * k), g.h - 20, (g.h - 20) / 2);
      ctx.fill();
      centred(ctx, `${Math.round(k * 100)}%`, 0, -g.h / 2 - 56, 50, look.light ? look.ink : '#FFFFFF', 800, FONT.mono);
      break;
    }
    case 'search':
    case 'input': {
      const text = clean(b.a || (st === 'search' ? 'krypt.cc' : 'you@mail.com'));
      const shown = typed(text, local, 0.12 * dur, 0.7 * dur);
      let x = -g.w / 2 + 64;
      if (st === 'search') {
        ctx.strokeStyle = soft;
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x + 20, -6, 22, 0, Math.PI * 2);
        ctx.moveTo(x + 36, 10);
        ctx.lineTo(x + 52, 26);
        ctx.stroke();
        x += 92;
      } else if (b.b) {
        font(ctx, 30, 600, FONT.meme);
        ctx.textAlign = 'left';
        ctx.fillStyle = soft;
        ctx.fillText(clean(b.b), x, -g.h / 2 + 48);
      }
      const y = st === 'input' && b.b ? 22 : 2;
      font(ctx, 52, 700, FONT.meme);
      ctx.textAlign = 'left';
      ctx.fillStyle = on;
      ctx.fillText(shown, x, y);
      const cx = x + ctx.measureText(shown).width + 8;
      if (Math.floor(local * 2.4) % 2 === 0 || shown.length < text.length) {
        ctx.fillStyle = acc[0];
        ctx.fillRect(cx, y - 32, 6, 64);
      }
      break;
    }
    case 'notify': {
      const ix = -g.w / 2 + 48;
      const grad = ctx.createLinearGradient(ix, -60, ix + 120, 60);
      grad.addColorStop(0, acc[0]);
      grad.addColorStop(1, acc[2]);
      ctx.fillStyle = grad;
      rrect(ctx, ix, -60, 120, 120, 30);
      ctx.fill();
      centred(ctx, clean(b.a || 'K').slice(0, 1).toUpperCase(), ix + 60, 2, 64, '#FFFFFF', 900);
      const tx = ix + 156;
      font(ctx, 46, 800, FONT.meme);
      ctx.textAlign = 'left';
      ctx.fillStyle = on;
      ctx.fillText(clean(b.a || 'Krypt').slice(0, 26), tx, -30);
      font(ctx, 36, 500, FONT.meme);
      ctx.fillStyle = soft;
      const body = fit(ctx, clean(b.b || 'Your setup is ready.'), { maxW: g.w / 2 + 120 - (tx - -g.w / 2) + 200, maxH: 90, max: 36, min: 26, maxLines: 2, weight: 500, family: FONT.meme, lh: 1.15 });
      body.lines.forEach((l, k) => ctx.fillText(l, tx, 26 + k * body.lh));
      font(ctx, 30, 600, FONT.meme);
      ctx.textAlign = 'right';
      ctx.fillText('now', g.w / 2 - 44, -30);
      break;
    }
    case 'panel': {
      const imgH = g.h * 0.52;
      const grad = ctx.createLinearGradient(-g.w / 2, -g.h / 2, g.w / 2, -g.h / 2 + imgH);
      grad.addColorStop(0, acc[0]);
      grad.addColorStop(0.55, acc[1]);
      grad.addColorStop(1, acc[2]);
      ctx.save();
      rrect(ctx, -g.w / 2 + 22, -g.h / 2 + 22, g.w - 44, imgH, g.r - 18);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(-g.w / 2, -g.h / 2, g.w, imgH + 40);
      // A slow light sweep over the picture.
      const sx = lerp(-g.w, g.w, (local / Math.max(0.5, dur)) % 1);
      const sweep = ctx.createLinearGradient(sx - 200, 0, sx + 200, 0);
      sweep.addColorStop(0, 'rgba(255,255,255,0)');
      sweep.addColorStop(0.5, 'rgba(255,255,255,0.22)');
      sweep.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sweep;
      ctx.fillRect(-g.w / 2, -g.h / 2, g.w, imgH + 40);
      ctx.restore();
      const ty = -g.h / 2 + imgH + 100;
      const t1 = fit(ctx, clean(b.a || 'Your new setup'), { maxW: g.w - 110, maxH: 140, max: 60, min: 36, maxLines: 2, weight: 800, family: FONT.meme, lh: 1.1 });
      ctx.textAlign = 'left';
      ctx.fillStyle = on;
      t1.lines.forEach((l, k) => ctx.fillText(l, -g.w / 2 + 56, ty + k * t1.lh));
      font(ctx, 36, 500, FONT.meme);
      ctx.fillStyle = soft;
      ctx.fillText(clean(b.b || 'Ready in one click'), -g.w / 2 + 56, ty + t1.lines.length * t1.lh + 16);
      ctx.fillStyle = acc[0];
      rrect(ctx, -g.w / 2 + 40, g.h / 2 - 140, g.w - 80, 100, 50);
      ctx.fill();
      centred(ctx, 'Open', 0, g.h / 2 - 88, 44, '#FFFFFF');
      break;
    }
    case 'player': {
      const s = g.h - 150;
      const x0 = -g.w / 2 + 44;
      const grad = ctx.createLinearGradient(x0, -g.h / 2, x0 + s, -g.h / 2 + s);
      grad.addColorStop(0, acc[2]);
      grad.addColorStop(1, acc[0]);
      ctx.fillStyle = grad;
      rrect(ctx, x0, -g.h / 2 + 40, s, s, 28);
      ctx.fill();
      const tx = x0 + s + 40;
      font(ctx, 48, 800, FONT.meme);
      ctx.textAlign = 'left';
      ctx.fillStyle = on;
      ctx.fillText(clean(b.a || 'Night drive').slice(0, 18), tx, -g.h / 2 + 100);
      font(ctx, 36, 500, FONT.meme);
      ctx.fillStyle = soft;
      ctx.fillText(clean(b.b || 'Krypt').slice(0, 22), tx, -g.h / 2 + 152);
      // Play / pause in the corner of the cover, an equaliser beside the title.
      for (let k = 0; k < 4; k++) {
        const hgt = 18 + 34 * Math.abs(Math.sin(local * (5 + k * 1.7) + k));
        ctx.fillStyle = acc[0];
        rrect(ctx, tx + k * 26, -g.h / 2 + 250 - hgt, 16, hgt, 6);
        ctx.fill();
      }
      const by = g.h / 2 - 62;
      const k = (0.2 + local / Math.max(1, dur * 3)) % 1;
      ctx.fillStyle = look.light ? 'rgba(10,10,16,0.1)' : 'rgba(10,10,16,0.12)';
      rrect(ctx, -g.w / 2 + 44, by - 7, g.w - 88, 14, 7);
      ctx.fill();
      ctx.fillStyle = acc[0];
      rrect(ctx, -g.w / 2 + 44, by - 7, (g.w - 88) * k, 14, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-g.w / 2 + 44 + (g.w - 88) * k, by, 16, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'graph': {
      const vals = (b.a || '3,5,4,8,12')
        .split(/[,;\s]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .slice(0, 12);
      const v = vals.length >= 2 ? vals : [3, 5, 4, 8, 12];
      const lo = Math.min(...v);
      const hi = Math.max(...v);
      const x0 = -g.w / 2 + 70;
      const x1 = g.w / 2 - 70;
      const y0 = g.h / 2 - 70;
      const y1 = -g.h / 2 + 120;
      const pts = v.map((n, k) => ({ x: lerp(x0, x1, k / (v.length - 1)), y: lerp(y0, y1, hi > lo ? (n - lo) / (hi - lo) : 0.5) }));
      const k = easeInOut(prog(local, 0.05 * dur, 0.75 * dur));
      const upto = k * (pts.length - 1);
      ctx.strokeStyle = look.light ? 'rgba(10,10,16,0.07)' : 'rgba(10,10,16,0.09)';
      ctx.lineWidth = 3;
      for (let r = 0; r < 4; r++) {
        const y = lerp(y0, y1, r / 3);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
      }
      const path = (): number => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        let last = 0;
        for (let p = 1; p < pts.length; p++) {
          if (p - 1 >= upto) break;
          const f = Math.min(1, upto - (p - 1));
          ctx.lineTo(lerp(pts[p - 1].x, pts[p].x, f), lerp(pts[p - 1].y, pts[p].y, f));
          last = p - 1 + f;
        }
        return last;
      };
      const last = path();
      const lx = lerp(pts[Math.floor(last)].x, pts[Math.min(pts.length - 1, Math.ceil(last))].x, last % 1);
      ctx.lineTo(lx, y0);
      ctx.lineTo(pts[0].x, y0);
      ctx.closePath();
      const area = ctx.createLinearGradient(0, y1, 0, y0);
      area.addColorStop(0, hexA(acc[0], 0.3));
      area.addColorStop(1, hexA(acc[0], 0));
      ctx.fillStyle = area;
      ctx.fill();
      path();
      ctx.strokeStyle = acc[0];
      ctx.lineWidth = 12;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      const end = pts[Math.min(pts.length - 1, Math.round(last))];
      if (k > 0.98) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(end.x, end.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = acc[0];
        ctx.lineWidth = 8;
        ctx.stroke();
      }
      font(ctx, 40, 800, FONT.mono);
      ctx.textAlign = 'left';
      ctx.fillStyle = on;
      ctx.fillText(String(Math.round(lerp(v[0], v[v.length - 1], k))), x0, -g.h / 2 + 62);
      break;
    }
    case 'message': {
      const dots = local < 0.32 * dur;
      if (dots) {
        for (let k = 0; k < 3; k++) {
          const y = -Math.max(0, Math.sin(local * 12 - k * 0.9)) * 14;
          ctx.fillStyle = soft;
          ctx.beginPath();
          ctx.arc(-40 + k * 40, y, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const m = fit(ctx, clean(b.a || 'did you try it yet?'), { maxW: g.w - 110, maxH: g.h - 60, max: 54, min: 32, maxLines: 2, weight: 700, family: FONT.meme, lh: 1.15 });
        ctx.textAlign = 'center';
        ctx.fillStyle = on;
        const top = -((m.lines.length - 1) * m.lh) / 2;
        m.lines.forEach((l, k) => ctx.fillText(l, 0, top + k * m.lh));
      }
      break;
    }
    case 'avatar': {
      const grad = ctx.createLinearGradient(-g.w / 2, -g.h / 2, g.w / 2, g.h / 2);
      grad.addColorStop(0, acc[1]);
      grad.addColorStop(1, acc[0]);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, g.w / 2 - 14, 0, Math.PI * 2);
      ctx.fill();
      centred(ctx, clean(b.a || 'KR').slice(0, 2).toUpperCase(), 0, 4, 104, '#FFFFFF', 900);
      const pop = easeOut(prog(local, mid, 0.25));
      ctx.fillStyle = '#22C55E';
      ctx.strokeStyle = fill;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(g.w * 0.33, g.h * 0.33, 34 * pop, 0, Math.PI * 2);
      ctx.fill();
      if (pop > 0.01) ctx.stroke();
      break;
    }
    case 'tabs': {
      const tabs = tabsOf(b);
      const n = Math.max(1, tabs.length);
      const to = Math.min(n, Math.max(1, Number(b.b) || n)) - 1;
      const cw = (g.w - 24) / n;
      const k = easeInOut(prog(local, mid, 0.3));
      const at = lerp(0, to, k);
      ctx.fillStyle = acc[0];
      rrect(ctx, -g.w / 2 + 12 + at * cw, -g.h / 2 + 12, cw, g.h - 24, (g.h - 24) / 2);
      ctx.fill();
      tabs.forEach((label, j) => {
        const lit = Math.max(0, 1 - Math.abs(at - j));
        centred(ctx, label, -g.w / 2 + 12 + cw * (j + 0.5), 2, 42, lit > 0.5 ? '#FFFFFF' : soft, 800);
      });
      break;
    }
    case 'icon': {
      const sheen = ctx.createLinearGradient(0, -g.h / 2, 0, g.h / 2);
      sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      rrect(ctx, -g.w / 2, -g.h / 2, g.w, g.h, g.r);
      ctx.fill();
      const word = clean(b.a || 'K');
      const c = fit(ctx, word, { maxW: g.w - 70, maxH: g.h - 80, max: word.length <= 2 ? 190 : 90, min: 40, maxLines: 1, weight: 900, family: FONT.meme });
      centred(ctx, word, 0, 8, c.size, '#FFFFFF', 900);
      break;
    }
    case 'window': {
      if (env.video && env.videoSize) {
        const { w: vw, h: vh } = env.videoSize;
        const s = Math.max(g.w / vw, (g.h - 56) / vh);
        ctx.save();
        rrect(ctx, -g.w / 2, -g.h / 2 + 56, g.w, g.h - 56, 0);
        ctx.clip();
        ctx.drawImage(env.video, -vw * s * 0.5, -g.h / 2 + 56 + (g.h - 56 - vh * s) / 2, vw * s, vh * s);
        ctx.restore();
      } else {
        for (let r = 0; r < 4; r++) {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          rrect(ctx, -g.w / 2 + 50, -g.h / 2 + 110 + r * 120, (g.w - 100) * (r % 2 ? 0.6 : 0.85), 70, 20);
          ctx.fill();
        }
      }
      ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, k) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(-g.w / 2 + 40 + k * 34, -g.h / 2 + 28, 11, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case 'logo': {
      if (env.logo) logo(ctx, env, 0, 0, g.w * 0.62);
      else centred(ctx, clean(b.a || 'K').slice(0, 2), 0, 6, 180, '#FFFFFF', 900);
      break;
    }
    case 'word': {
      const words = parseWords(b.a || 'DONE');
      const text = words.map((w) => w.text).join(' ');
      const c = fit(ctx, text, { maxW: g.w - 90, maxH: g.h - 70, max: 200, min: 60, maxLines: 2, weight: 900, family: FONT.meme, lh: 1.02 });
      ctx.textAlign = 'center';
      const top = -((c.lines.length - 1) * c.lh) / 2;
      c.lines.forEach((l, k) => {
        font(ctx, c.size, 900, FONT.meme);
        const accentWord = words.some((w) => w.accent && l.includes(w.text));
        ctx.fillStyle = accentWord ? acc[0] : on;
        ctx.fillText(l, 0, top + k * c.lh + 4);
      });
      break;
    }
  }
}

// ── The cursor ─────────────────────────────────────────────────────────────
function cursor(ctx: Ctx, x: number, y: number, press: number): void {
  ctx.save();
  ctx.translate(x, y);
  const s = 1.35 * (1 - 0.16 * press);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 62);
  ctx.lineTo(15, 48);
  ctx.lineTo(26, 72);
  ctx.lineTo(37, 67);
  ctx.lineTo(26, 44);
  ctx.lineTo(46, 44);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0B0B10';
  ctx.stroke();
  ctx.restore();
}

// ── Frame ──────────────────────────────────────────────────────────────────
function backdrop(ctx: Ctx, env: Env, look: Look, g: Geo, beat: number): void {
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, W, H);
  // A dot grid that drifts a little.
  ctx.fillStyle = look.line;
  const step = 54;
  const off = (env.t * 6) % step;
  for (let y = -step; y < H + step; y += step) for (let x = 0; x < W + step; x += step) ctx.fillRect(x - off, y + off, 4, 4);
  // A glow behind the shape, sized to it, that breathes on every beat of the music.
  const r = Math.max(g.w, g.h) * (0.9 + 0.06 * beat);
  const glow = ctx.createRadialGradient(CX, CY, 0, CX, CY, r);
  glow.addColorStop(0, hexA(env.accent[1], look.light ? 0.18 : 0.26));
  glow.addColorStop(1, hexA(env.accent[1], 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function title(ctx: Ctx, env: Env, look: Look, text: string): void {
  const words = parseWords(text);
  if (!words.length) return;
  const plain = words.map((w) => w.text).join(' ');
  const c = fit(ctx, plain, { maxW: 900, maxH: 240, max: 74, min: 40, maxLines: 3, weight: 800, family: FONT.meme, lh: 1.12 });
  font(ctx, c.size, 800, FONT.meme);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const space = ctx.measureText(' ').width;
  // Lay the words out line by line as fit() wrapped them, colouring the *accent* ones.
  let k = 0;
  c.lines.forEach((line, li) => {
    const n = line.split(/\s+/).filter(Boolean).length;
    const ws = words.slice(k, k + n);
    k += n;
    const total = ws.reduce((s, w) => s + ctx.measureText(w.text).width, 0) + space * (ws.length - 1);
    let x = CX - total / 2;
    for (const w of ws) {
      ctx.fillStyle = w.accent ? env.accent[1] : look.light ? look.ink : '#FFFFFF';
      ctx.fillText(w.text, x, 330 + li * c.lh);
      x += ctx.measureText(w.text).width + space;
    }
  });
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const look = str(env.fields, 'look') === 'light' ? LIGHT : DARK;
  const loop = env.fields.loop === true;
  // On a loop the first state morphs out of the last one, so the replay has no seam.
  const prev = i > 0 ? beats[i - 1] : loop && beats.length > 1 ? beats[beats.length - 1] : null;
  const bpm = Math.min(200, Math.max(50, num(env.fields, 'bpm', 120) || 120));
  const beatLen = 60 / bpm;
  const pulse = Math.exp(-((t % beatLen) / 0.11));

  const g1 = geoOf(ctx, b);
  const g0 = prev ? geoOf(ctx, prev) : { w: 0, h: 0, r: 0 };
  // The morph: width leads, height follows a moment later, the corners settle last.
  const morphing = !!prev && !(i === 0 && !loop);
  const kw = morphing ? spring(local / 0.5) : easeOut(prog(local, 0, 0.45));
  const kh = morphing ? spring(Math.max(0, local - 0.04) / 0.5) : kw;
  const kr = morphing ? easeInOut(prog(local, 0, 0.36)) : 1;
  const g = { w: lerp(g0.w, g1.w, kw), h: lerp(g0.h, g1.h, kh), r: lerp(g0.r, g1.r, kr) };
  const f1 = fillOf(env, look, b);
  const f0 = prev ? fillOf(env, look, prev) : f1;
  const fill = mixHex(f0, f1, easeInOut(prog(local, 0.02, 0.3)));

  const view = fxView(b, local);
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  backdrop(ctx, env, look, g, pulse);

  // The shape: a soft shadow under it, a little squash on every beat.
  const squash = 1 + 0.012 * pulse;
  ctx.save();
  ctx.translate(CX, CY);
  ctx.scale(squash, 2 - squash);
  ctx.save();
  ctx.shadowColor = look.light ? 'rgba(20,20,40,0.18)' : 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 26;
  ctx.fillStyle = fill;
  rrect(ctx, -g.w / 2, -g.h / 2, Math.max(1, g.w), Math.max(1, g.h), g.r);
  ctx.fill();
  ctx.restore();
  // The insides: the last state's fade and shrink away as the new one's arrive.
  ctx.save();
  rrect(ctx, -g.w / 2, -g.h / 2, Math.max(1, g.w), Math.max(1, g.h), g.r);
  ctx.clip();
  if (prev && morphing) {
    const out = prog(local, 0, 0.14);
    if (out < 1)
      withAlpha(ctx, 1 - out, () => {
        ctx.save();
        ctx.scale(lerp(1, 0.86, out), lerp(1, 0.86, out));
        contents(ctx, env, look, prev, g0, f0, prev.dur, prev.dur);
        ctx.restore();
      });
  }
  const inK = easeOut(prog(local, morphing ? 0.14 : 0.2, 0.24));
  withAlpha(ctx, inK, () => {
    ctx.save();
    const s = lerp(0.9, 1, inK);
    ctx.scale(s, s);
    contents(ctx, env, look, b, g1, f1, local, b.dur);
    ctx.restore();
  });
  ctx.restore();
  ctx.restore();

  // The label under the shape.
  const label = parseWords(b.headline);
  if (label.length) {
    const text = label.map((w) => w.text).join(' ');
    const a = easeOut(prog(local, 0.18, 0.25));
    withAlpha(ctx, a, () => {
      font(ctx, 46, 700, FONT.meme);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = label.some((w) => w.accent) ? env.accent[1] : look.sub;
      ctx.fillText(text, CX, CY + g1.h / 2 + 96 + 16 * (1 - a));
    });
  }
  title(ctx, env, look, str(env.fields, 'title'));
  if (env.fields.counter === true) {
    font(ctx, 32, 700, FONT.mono);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = look.sub;
    ctx.fillText(`${String(i + 1).padStart(2, '0')} / ${String(beats.length).padStart(2, '0')}`, CX, 1520);
  }

  // The cursor: it presses at the start of every change (where it waited on the last state), drifts off, then glides
  // to this state's own click spot before the next change.
  if (env.fields.cursor !== false) {
    const here = clickPoint(stateOf(b), g1, b);
    const target = { x: CX + here.x, y: CY + here.y };
    const from = prev && morphing ? clickPoint(stateOf(prev), g0, prev) : null;
    const pressAt = from ? { x: CX + from.x, y: CY + from.y } : { x: CX + 300, y: CY + 520 };
    const click = !!from && !b.tags.includes('noclick');
    const drift = easeOut(prog(local, 0.1, 0.4));
    const rest = { x: pressAt.x + 70 * drift, y: pressAt.y + 90 * drift };
    const isLast = i === beats.length - 1 && !loop;
    const go = isLast ? 0 : easeInOut(prog(local, Math.max(0.15, b.dur - 0.5), 0.42));
    const x = lerp(rest.x, target.x, go);
    const y = lerp(rest.y, target.y, go);
    if (click) {
      const rp = prog(local, 0, 0.42);
      if (rp < 1) {
        ctx.strokeStyle = hexA(look.light ? '#0B0B10' : '#FFFFFF', 0.5 * (1 - rp));
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(pressAt.x, pressAt.y, lerp(16, 96, easeOut(rp)), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const press = click ? Math.sin(Math.PI * clamp01(local / 0.14)) : 0;
    withAlpha(ctx, i === 0 && !morphing ? easeOut(prog(local, 0.15, 0.3)) : 1, () => cursor(ctx, x, y, press));
  }
  ctx.restore();
  fxPost(ctx, b, local);
  markLightFrame(look.light);
}

registerPreset('morph', draw);
