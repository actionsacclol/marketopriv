import { num, screenZoom, storyBeats, str, type StoryBeat } from '@shared/presets';
import { COIN_LAND, CROSS_AT, CROSS_STEP, FOLLOW_CLICK, NUMBER_LAND, POLL_STEP, RADAR_AT, RADAR_STEP, STAMP_AT, TIERS, TIER_LAND, pollStart, WALLET_AT, WALLET_STEP, chartDrawTime, chartPoints, chatMessages, chatTimes, list, parseNum, radarPulses, radarShift, radarSounds, tierItem, type RadarKind } from '@shared/sfx';
import { isAction } from '@shared/character';
import { actionFx, actionLabel, artBackdrop, artOf, cartoonHeadline, dialogueBox, drawMascot } from './storyArt';
import { FONT, H, W, backdrop, clamp01, countUp, drawLines, easeBack, easeInOut, easeOut, fit, font, gradient, hexA, lerp, logo, markLightFrame, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';

// Story: one real event told in beats (the format behind the reference
// accounts' top reels, see research/04). Each beat has a narrated line whose
// words blur in as they are spoken (*word* = accent), and one small animated
// diagram that shows what the line says. A beat can be light or dark, wipe in
// with a colour band, and hold a silence first. A dateline sits on the first
// beat. Motion "kinetic" (the default) makes words pop in with highlight boxes
// on accents, cuts zoom through to the next beat, the camera pushes in slowly
// and numbers / stamps / coins land with a burst; "calm" keeps soft fades. With loop on, the last beat fades into the first frame. The sound
// effect cue times in shared/sfx.ts mirror the animation times here.

const VY = 1010; // visual centre
const KICKER_Y = 292;
const HEAD_TOP = 340;

interface Theme {
  light: boolean;
  ink: string;
  sub: string;
  panel: string;
  stroke: string;
  track: string;
  pos: string;
  neg: string;
  blue: string;
}

const DARK: Theme = { light: false, ink: '#FFFFFF', sub: 'rgba(255,255,255,0.62)', panel: 'rgba(22,22,30,0.95)', stroke: 'rgba(255,255,255,0.12)', track: 'rgba(255,255,255,0.1)', pos: '#22C55E', neg: '#F43F5E', blue: '#3B82F6' };
const LIGHT: Theme = { light: true, ink: '#0B0B0F', sub: 'rgba(11,11,15,0.55)', panel: '#FFFFFF', stroke: 'rgba(0,0,0,0.08)', track: 'rgba(0,0,0,0.08)', pos: '#16A34A', neg: '#E11D48', blue: '#2563EB' };

function hash(n: number): number {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

// ── Background ─────────────────────────────────────────────────────────────
function lightBackdrop(ctx: Ctx, t: number): void {
  ctx.fillStyle = '#ECECEF';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 60, W / 2, H * 0.45, H * 0.6);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Two soft dark blobs drifting at the corners (the keynote look).
  for (const [x, y, r] of [
    [60 + 20 * Math.sin(t * 0.4), 140 + 16 * Math.cos(t * 0.3), 150],
    [W - 50 + 18 * Math.cos(t * 0.35), H - 170 + 14 * Math.sin(t * 0.45), 160],
  ]) {
    const b = ctx.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, 'rgba(10,10,14,0.55)');
    b.addColorStop(0.55, 'rgba(10,10,14,0.22)');
    b.addColorStop(1, 'rgba(10,10,14,0)');
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, W, H);
  }
}

function darkBackdrop(ctx: Ctx, env: Env): void {
  backdrop(ctx, env);
  // Calmer than the other presets' desk: a soft spot behind the visual.
  const g = ctx.createRadialGradient(W / 2, VY, 40, W / 2, VY, 760);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Kinetic look: a dot grid drifting up behind everything. */
function driftGrid(ctx: Ctx, th: Theme, t: number): void {
  const step = 54;
  const off = (t * 16) % step;
  ctx.fillStyle = th.light ? 'rgba(11,11,15,0.07)' : 'rgba(255,255,255,0.06)';
  for (let y = -off; y < H; y += step) for (let x = step / 2; x < W; x += step) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
}

// ── Headline: words blur in as they are spoken ────────────────────────────
export interface Word {
  text: string;
  accent: boolean;
}

export function parseWords(s: string): Word[] {
  const words: Word[] = [];
  let accent = false;
  for (const raw of s.split(/\s+/).filter(Boolean)) {
    let text = '';
    let wordAccent = accent;
    for (const ch of raw) {
      if (ch === '*') {
        accent = !accent;
        if (text === '') wordAccent = accent;
        else if (accent) wordAccent = true;
        continue;
      }
      text += ch;
    }
    if (text) words.push({ text, accent: wordAccent || accent });
  }
  return words;
}

function layoutWords(ctx: Ctx, words: Word[], maxW: number): { size: number; lines: Word[][] } {
  for (let size = 66; ; size = Math.floor(size * 0.94)) {
    font(ctx, size, 600);
    const space = ctx.measureText(' ').width;
    const lines: Word[][] = [[]];
    let w = 0;
    for (const word of words) {
      const ww = ctx.measureText(word.text).width;
      if (lines[lines.length - 1].length && w + space + ww > maxW) {
        lines.push([]);
        w = 0;
      }
      w += (lines[lines.length - 1].length ? space : 0) + ww;
      lines[lines.length - 1].push(word);
    }
    if (lines.length <= 3 || size <= 40) return { size, lines };
  }
}

/** When each word appears: as it is spoken (by its share of the letters), else at the reading speed. */
export function wordTimes(env: Env, beat: StoryBeat, words: Word[]): number[] {
  if (beat.voDur > 0) {
    const total = words.reduce((s, w) => s + w.text.length + 1, 0);
    let acc = 0;
    return words.map((w) => {
      const t = beat.voStart + beat.voDur * 0.9 * (acc / total);
      acc += w.text.length + 1;
      return t;
    });
  }
  const wps = num(env.fields, 'wps', 3.4);
  return words.map((_, i) => beat.voStart + i / wps);
}

/** ghost: words not spoken yet show dimmed instead of hidden (the opening beat, so frame 0 already says the point). */
function headline(ctx: Ctx, env: Env, th: Theme, beat: StoryBeat, local: number, instant: boolean, ghost = false): void {
  const words = parseWords(beat.headline);
  if (!words.length) return;
  const { size, lines } = layoutWords(ctx, words, 900);
  const times = wordTimes(env, beat, words);
  font(ctx, size, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const space = ctx.measureText(' ').width;
  const lh = size * 1.2;
  let idx = 0;
  lines.forEach((line, li) => {
    const widths = line.map((w) => ctx.measureText(w.text).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (line.length - 1);
    let x = W / 2 - total / 2;
    const y = HEAD_TOP + lh * (li + 0.82);
    line.forEach((w, wi) => {
      const since = instant ? 5 : local - times[idx];
      if (ghost && since < 0) {
        ctx.save();
        // Bright enough to read at a glance in a feed: frame 0 is the hook, and most viewers decide on it.
        ctx.globalAlpha *= 0.78;
        ctx.fillStyle = th.ink;
        ctx.fillText(w.text, x, y);
        ctx.restore();
      }
      if (beat.kinetic) {
        kineticWord(ctx, env, th, w, x, y, widths[wi], size, since);
        x += widths[wi] + space;
        idx++;
        return;
      }
      const a = instant ? 1 : easeOut(prog(local, times[idx], 0.22));
      if (a > 0.01) {
        ctx.save();
        ctx.globalAlpha *= a;
        if (a < 0.99) ctx.filter = `blur(${((1 - a) * 12).toFixed(1)}px)`;
        ctx.fillStyle = w.accent ? (th.light ? th.blue : gradient(ctx, x, 0, x + widths[wi], 0, env.accent)) : th.ink;
        ctx.fillText(w.text, x, y + (1 - a) * 10);
        ctx.restore();
      }
      x += widths[wi] + space;
      idx++;
    });
  });
}

/** A word that springs up as it is spoken; an accent word gets a highlight box that sweeps in behind it. */
function kineticWord(ctx: Ctx, env: Env, th: Theme, w: Word, x: number, y: number, ww: number, size: number, since: number): void {
  const a = prog(since, 0, 0.3);
  if (a <= 0) return;
  const s = easeBack(a);
  const cx = x + ww / 2;
  const cy = y - size * 0.35;
  ctx.save();
  ctx.globalAlpha *= clamp01(a * 3);
  ctx.translate(cx, cy + (1 - easeOut(a)) * 40);
  ctx.scale(lerp(0.55, 1, s), lerp(0.55, 1, s));
  ctx.translate(-cx, -cy);
  let fill: string | CanvasGradient = th.ink;
  if (w.accent) {
    const hb = easeOut(prog(since, 0.08, 0.26));
    if (hb > 0) {
      const pad = 12;
      rrect(ctx, x - pad, y - size * 0.86, (ww + pad * 2) * hb, size * 1.12, 14);
      ctx.fillStyle = th.light ? th.blue : gradient(ctx, x, 0, x + ww, 0, env.accent);
      ctx.fill();
    }
    fill = hb > 0.55 ? '#FFFFFF' : th.light ? th.blue : env.accent[1];
  }
  ctx.fillStyle = fill;
  ctx.fillText(w.text, x, y);
  ctx.restore();
}

/** A ring and a spray of particles that fly out from (x, y) when something lands. */
function burst(ctx: Ctx, x: number, y: number, since: number, color: string, r0 = 60, r1 = 280): void {
  const u = prog(since, 0, 0.65);
  if (u <= 0 || u >= 1) return;
  const e = easeOut(u);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, lerp(r0, r1, e), 0, Math.PI * 2);
  ctx.lineWidth = 12 * (1 - u);
  ctx.strokeStyle = hexA(color, 0.55 * (1 - u));
  ctx.stroke();
  ctx.fillStyle = hexA(color, 1 - u);
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2 + hash(k + 3) * 0.5;
    const d = lerp(r0 * 0.8, r1 * (0.75 + 0.6 * hash(k + 11)), e);
    const r = (5 + 6 * hash(k + 7)) * (1 - u * 0.8);
    ctx.beginPath();
    ctx.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function kicker(ctx: Ctx, env: Env, th: Theme): void {
  const k = str(env.fields, 'kicker');
  if (!k) return;
  font(ctx, 26, 600, FONT.mono);
  ctx.textAlign = 'center';
  ctx.fillStyle = th.sub;
  const c = ctx as Ctx & { letterSpacing?: string };
  const prev = c.letterSpacing;
  c.letterSpacing = '4px';
  ctx.fillText(k.toUpperCase(), W / 2, KICKER_Y);
  if (prev !== undefined) c.letterSpacing = prev;
}

// ── Shared bits ────────────────────────────────────────────────────────────
const signColor = (th: Theme, v: string): string | null => (/^\s*[-−]/.test(v) ? th.neg : /^\s*\+/.test(v) ? th.pos : null);
const minus = (s: string): string => s.replace(/^-/, '−');

function bigText(ctx: Ctx, env: Env, th: Theme, text: string, finalText: string, y: number, max: number): void {
  const f = fit(ctx, finalText, { maxW: 900, maxH: max * 1.1, max, maxLines: 1, family: FONT.sans });
  font(ctx, f.size, 700);
  const sc = signColor(th, finalText);
  const fill = sc ?? (th.light ? th.ink : gradient(ctx, 160, 0, 920, 0, env.accent));
  drawLines(ctx, [text], W / 2, y - f.lh / 2, f.lh, { fill, glow: th.light ? undefined : hexA(sc ?? env.accent[1], 0.45) });
}

function sub(ctx: Ctx, th: Theme, text: string, y: number, size = 40): void {
  if (!text) return;
  const f = fit(ctx, text, { maxW: 880, maxH: size * 2.5, max: size, maxLines: 2, weight: 500 });
  font(ctx, f.size, 500);
  drawLines(ctx, f.lines, W / 2, y, f.lh, { fill: th.sub });
}

function panel(ctx: Ctx, th: Theme, x: number, y: number, w: number, h: number, r = 36): void {
  ctx.save();
  ctx.shadowColor = th.light ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 12;
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = th.panel;
  ctx.fill();
  ctx.restore();
  rrect(ctx, x, y, w, h, r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = th.stroke;
  ctx.stroke();
}

function cursor(ctx: Ctx, x: number, y: number, press: number): void {
  const s = 2.3 * (1 - 0.12 * press);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 34);
  ctx.lineTo(9, 26);
  ctx.lineTo(15, 40);
  ctx.lineTo(21, 37);
  ctx.lineTo(15, 24);
  ctx.lineTo(26, 24);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#0B0B0F';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.restore();
}

// ── Visuals ────────────────────────────────────────────────────────────────
function vTitle(ctx: Ctx, env: Env, th: Theme, b: StoryBeat, p: number): void {
  scaled(ctx, lerp(1.08, 1, easeOut(p)), W / 2, VY, () =>
    withAlpha(ctx, p, () => {
      if (b.a) bigText(ctx, env, th, b.a, b.a, VY - 40, 250);
      sub(ctx, th, b.b, VY + 110);
    }),
  );
}

function vNumber(ctx: Ctx, env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const shown = minus(countUp(b.a.replace('−', '-'), easeInOut(prog(local, 0.2, NUMBER_LAND - 0.2))));
  // Kinetic: the number punches when the count lands.
  const punch = b.kinetic && local >= NUMBER_LAND && local < 5 ? 1 + 0.12 * (1 - easeOut(prog(local, NUMBER_LAND, 0.35))) : 1;
  if (b.kinetic && local < 5) burst(ctx, W / 2, VY - 60, local - NUMBER_LAND, signColor(th, b.a) ?? th.blue, 120, 420);
  scaled(ctx, lerp(1.2, 1, easeBack(p)) * punch, W / 2, VY, () =>
    withAlpha(ctx, p, () => {
      bigText(ctx, env, th, shown, b.a, VY - 40, 240);
      withAlpha(ctx, easeOut(prog(local, 0.45, 0.4)), () => sub(ctx, th, b.b, VY + 110));
    }),
  );
}

/** "$%M" with 15.1 → "$15.1M"; no format → "15.1". */
function fmtValue(format: string, v: number): string {
  if (format.includes('~')) {
    const a = Math.abs(v);
    const c = a >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : a >= 1e8 ? `${Math.round(v / 1e6)}M` : a >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : a >= 1e4 ? `${Math.round(v / 1e3)}K` : Math.round(v).toLocaleString('en-US');
    return format.replace('~', c);
  }
  const n = Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1);
  return format.includes('%') ? format.replace('%', n) : n;
}

function vChart(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const pts = chartPoints(b);
  const v = pts.map((q) => q.v);
  if (v.length < 2) return;
  const T = chartDrawTime(b);
  const x0 = 130;
  const x1 = 950;
  const yTop = 860;
  const yBot = 1330;
  const max = Math.max(...v);
  // A balance that moves 10% would look flat from zero: zoom to its range.
  const lo = Math.min(...v);
  const min = lo > 0 && lo > max * 0.4 ? lo - (max - lo) * 0.3 : Math.min(0, lo);
  const X = (k: number): number => x0 + ((x1 - x0) * k) / (v.length - 1);
  const Y = (val: number): number => yBot - ((val - min) / (max - min || 1)) * (yBot - yTop);
  const pos = clamp01((local - 0.2) / T) * (v.length - 1);
  const k0 = Math.min(v.length - 2, Math.floor(pos));
  const fr = pos - k0;
  const cur = lerp(v[k0], v[k0 + 1], easeInOut(fr));
  const tipX = lerp(X(k0), X(k0 + 1), fr);
  const tipY = lerp(Y(v[k0]), Y(v[k0 + 1]), easeInOut(fr));
  let peakK = 0;
  for (let k = 0; k <= Math.min(v.length - 1, Math.ceil(pos)); k++) if (v[k] > v[peakK]) peakK = k;
  const peak = Math.max(v[peakK], cur);
  const crashed = peak > 0 && cur < peak * 0.5 && pos > peakK;
  const color = crashed || cur < v[0] * 0.97 ? th.neg : cur > v[0] * 1.5 ? th.pos : th.ink;
  withAlpha(ctx, p, () => {
    // Baseline.
    ctx.fillStyle = th.track;
    ctx.fillRect(x0, yBot + 4, x1 - x0, 3);
    // Line so far.
    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(X(0), Y(v[0]));
      for (let k = 1; k <= k0; k++) ctx.lineTo(X(k), Y(v[k]));
      ctx.lineTo(tipX, tipY);
    };
    if (b.kinetic) {
      // Kinetic: a coloured area under the line, and a glow on it.
      path();
      ctx.lineTo(tipX, yBot);
      ctx.lineTo(X(0), yBot);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, yTop, 0, yBot);
      g.addColorStop(0, hexA(color, 0.28));
      g.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = g;
      ctx.fill();
    }
    path();
    ctx.save();
    if (b.kinetic) {
      ctx.shadowColor = hexA(color, 0.6);
      ctx.shadowBlur = 24;
    }
    ctx.strokeStyle = b.kinetic ? color : th.ink;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    // Labels along the bottom appear as the line reaches them.
    font(ctx, 28, 600, FONT.mono);
    ctx.textAlign = 'center';
    ctx.fillStyle = th.sub;
    pts.forEach((q, k) => {
      const a = clamp01((pos - k) * 4 + 1);
      if (q.label && a > 0) withAlpha(ctx, a, () => ctx.fillText(q.label, X(k), yBot + 56));
    });
    // Start marker.
    ctx.beginPath();
    ctx.arc(X(0), Y(v[0]), 11, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = th.blue;
    ctx.fillStyle = th.light ? '#FFFFFF' : '#0B0B0F';
    ctx.fill();
    ctx.stroke();
    // Tip.
    ctx.beginPath();
    ctx.arc(tipX, tipY, 13, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    // Crash bracket from the peak down to the tip.
    if (crashed) {
      const a = easeOut(prog(local - 0.2 - (T * (peakK + 1)) / (v.length - 1), 0, 0.3));
      const bx = Math.min(x1 + 50, tipX + 60);
      withAlpha(ctx, a, () => {
        ctx.strokeStyle = th.neg;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bx - 14, Y(peak));
        ctx.lineTo(bx, Y(peak));
        ctx.lineTo(bx, tipY);
        ctx.lineTo(bx - 14, tipY);
        ctx.stroke();
      });
    }
    // Live value above the chart.
    font(ctx, 132, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(fmtValue(b.b, cur), W / 2, 760);
    if (crashed) {
      font(ctx, 40, 600, FONT.mono);
      ctx.fillStyle = th.neg;
      ctx.fillText(`${minus(String(Math.round((cur / peak - 1) * 100)))}% from the top`, W / 2, 815);
    }
  });
}

function vFlow(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const raw = list(b.a);
  const labels = raw.length === 1 && /^\d+$/.test(raw[0]) ? Array.from({ length: Math.min(9, Number(raw[0])) }, () => '') : raw.slice(0, 9);
  const n = Math.max(1, labels.length);
  const top = 840;
  const node = { x: W / 2, y: 1090 };
  const end = 1330;
  const xs = labels.map((_, k) => (n === 1 ? W / 2 : 170 + (740 * k) / (n - 1)));
  withAlpha(ctx, p, () => {
    labels.forEach((label, k) => {
      const a = easeBack(prog(local, 0.1 + k * 0.05, 0.3));
      if (a <= 0) return;
      // Curve into the node, drawn progressively.
      const c = easeInOut(prog(local, 0.3 + k * 0.04, 0.85));
      if (c > 0) {
        ctx.beginPath();
        const steps = 40;
        for (let i = 0; i <= steps * c; i++) {
          const u = i / steps;
          const iu = 1 - u;
          const x = iu * iu * iu * xs[k] + 3 * iu * iu * u * xs[k] + 3 * iu * u * u * node.x + u * u * u * node.x;
          const y = iu * iu * iu * top + 3 * iu * iu * u * (top + 160) + 3 * iu * u * u * (node.y - 150) + u * u * u * node.y;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = th.light ? 'rgba(11,11,15,0.45)' : 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      scaled(ctx, a, xs[k], top, () => {
        ctx.beginPath();
        ctx.arc(xs[k], top, 14, 0, Math.PI * 2);
        ctx.fillStyle = th.ink;
        ctx.fill();
      });
      if (label) {
        font(ctx, 26, 500, FONT.mono);
        ctx.textAlign = 'center';
        ctx.fillStyle = th.sub;
        ctx.fillText(label, xs[k], top - 32);
      }
    });
    const na = easeBack(prog(local, 1.2, 0.3));
    if (na > 0)
      scaled(ctx, na, node.x, node.y, () => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 22, 0, Math.PI * 2);
        ctx.fillStyle = th.ink;
        ctx.fill();
      });
    if (b.b) {
      const ar = easeOut(prog(local, 1.35, 0.4));
      if (ar > 0) {
        const y2 = lerp(node.y + 30, end, ar);
        ctx.strokeStyle = th.blue;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(node.x, node.y + 30);
        ctx.lineTo(node.x, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(node.x, y2 + 6, 16, 0, Math.PI * 2);
        ctx.fillStyle = th.blue;
        ctx.fill();
      }
      withAlpha(ctx, easeOut(prog(local, 1.6, 0.3)), () => {
        font(ctx, 76, 700);
        ctx.textAlign = 'right';
        ctx.fillStyle = th.blue;
        ctx.fillText(b.b, node.x - 44, (node.y + end) / 2 + 26);
      });
    }
  });
}

function vDots(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const cols = 32;
  const rows = 20;
  const step = 27;
  const gx = W / 2 - ((cols - 1) * step) / 2;
  const gy = VY - 150;
  const fill = easeInOut(prog(local, 0.2, 1.6));
  withAlpha(ctx, p, () => {
    font(ctx, 132, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = th.ink;
    ctx.fillText(countUp(b.a, fill), W / 2, gy - 70);
    ctx.fillStyle = th.ink;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        // An oval that fills from the centre out, with a little randomness.
        const dx = (c - (cols - 1) / 2) / (cols / 2);
        const dy = (r - (rows - 1) / 2) / (rows / 2);
        const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 0.75 + hash(c * 97 + r) * 0.25);
        const a = clamp01((fill - d * 0.92) / 0.08);
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(gx + c * step, gy + r * step, 6.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    withAlpha(ctx, easeOut(prog(local, 1.6, 0.4)), () => sub(ctx, th, b.b, gy + rows * step + 30, 34));
  });
}

function vWallet(ctx: Ctx, env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const rows = list(b.b).map((r) => {
    const i = r.lastIndexOf(':');
    return { label: i >= 0 ? r.slice(0, i).trim() : r, value: i >= 0 ? r.slice(i + 1).trim() : '' };
  });
  const w = 900;
  const rowH = 104;
  const head = 140;
  const h = head + rows.length * rowH + 30;
  const x = W / 2 - w / 2;
  const y = VY - h / 2;
  scaled(ctx, lerp(0.92, 1, easeBack(p)), W / 2, VY, () =>
    withAlpha(ctx, p, () => {
      panel(ctx, th, x, y, w, h);
      logo(ctx, env, x + 80, y + 72, 64);
      font(ctx, 46, 700);
      ctx.textAlign = 'left';
      ctx.fillStyle = th.ink;
      ctx.fillText(b.a || 'Wallet', x + 130, y + 86);
      ctx.fillStyle = th.track;
      ctx.fillRect(x + 44, y + head - 14, w - 88, 2);
      rows.forEach((r, k) => {
        const ry = y + head + k * rowH + rowH / 2 + 12;
        font(ctx, 38, 500);
        ctx.textAlign = 'left';
        ctx.fillStyle = th.sub;
        ctx.fillText(r.label, x + 50, ry);
        const at = WALLET_AT + k * WALLET_STEP;
        ctx.textAlign = 'right';
        if (local < at) {
          font(ctx, 34, 500, FONT.mono);
          ctx.fillStyle = th.sub;
          ctx.fillText(`checking${'.'.repeat(1 + (Math.floor(local * 6) % 3))}`, x + w - 50, ry);
        } else {
          const a = easeOut(prog(local, at, 0.3));
          font(ctx, 48, 700, FONT.mono);
          ctx.fillStyle = signColor(th, r.value) ?? th.ink;
          ctx.fillText(minus(countUp(r.value.replace('−', '-'), a)), x + w - 50, ry);
        }
      });
    }),
  );
}

function vFollow(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const clicked = local >= FOLLOW_CLICK;
  const press = clamp01(1 - Math.abs(local - FOLLOW_CLICK) / 0.12);
  const label = clicked ? 'Following' : b.a || 'Follow';
  withAlpha(ctx, p, () => {
    scaled(ctx, 1 - 0.06 * press, W / 2, VY, () => {
      font(ctx, 46, 700);
      const w = ctx.measureText(label).width + 110;
      rrect(ctx, W / 2 - w / 2, VY - 52, w, 104, 52);
      ctx.fillStyle = clicked ? (th.light ? '#E4E4E9' : '#2A2A33') : th.light ? '#0B0B0F' : '#FFFFFF';
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = clicked ? th.ink : th.light ? '#FFFFFF' : '#0B0B0F';
      ctx.fillText(label, W / 2, VY + 16);
    });
    sub(ctx, th, b.b, VY + 150, 38);
    const m = easeInOut(prog(local, 0.2, FOLLOW_CLICK - 0.25));
    const cx = lerp(880, W / 2 + 40, m) + (clicked ? easeOut(prog(local, FOLLOW_CLICK + 0.3, 0.5)) * 60 : 0);
    const cy = lerp(1480, VY + 14, m) + (clicked ? easeOut(prog(local, FOLLOW_CLICK + 0.3, 0.5)) * 80 : 0);
    cursor(ctx, cx, cy, press);
    if (b.kinetic) burst(ctx, W / 2, VY, local - FOLLOW_CLICK, th.blue, 80, 300);
  });
}

function vBars(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const rows = list(b.a).map((r) => {
    const i = r.lastIndexOf(':');
    const label = (i >= 0 ? r.slice(0, i) : r).trim();
    const raw = i >= 0 ? r.slice(i + 1).trim() : '0';
    // *Label = highlighted, !Label = a bad outcome (red even when positive).
    return { label: label.replace(/^[*!]/, ''), hi: label.startsWith('*'), bad: label.startsWith('!'), v: parseNum(raw), raw: minus(raw) };
  });
  if (!rows.length) return;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.v)), 0.001);
  const rowH = 118;
  const gap = 34;
  const top = VY - (rows.length * rowH + (rows.length - 1) * gap) / 2 - 20;
  const x0 = 100;
  const span = 880;
  withAlpha(ctx, p, () => {
    rows.forEach((r, i) => {
      const y = top + i * (rowH + gap);
      const g = easeOut(prog(local, 0.25 + i * 0.22, 0.6));
      withAlpha(ctx, clamp01(g * 1.6), () => {
        font(ctx, r.hi ? 44 : 40, r.hi ? 700 : 600);
        ctx.textAlign = 'left';
        ctx.fillStyle = r.hi ? th.ink : th.sub;
        ctx.fillText(r.label, x0, y + 44);
        font(ctx, r.hi ? 50 : 44, 700, FONT.mono);
        ctx.textAlign = 'right';
        const col = r.v < 0 || r.bad ? th.neg : th.pos;
        ctx.fillStyle = r.hi ? th.blue : col;
        ctx.fillText(`${minus(countUp(r.raw.replace('−', '-'), g))}${b.b.startsWith('%') ? '%' : ''}`, x0 + span, y + 46);
        rrect(ctx, x0, y + 70, span, 30, 15);
        ctx.fillStyle = th.track;
        ctx.fill();
        const w = Math.max(30, (Math.abs(r.v) / maxAbs) * span * (b.kinetic ? Math.min(1.04, easeBack(prog(local, 0.25 + i * 0.22, 0.6))) : g));
        rrect(ctx, x0, y + 70, w, 30, 15);
        ctx.fillStyle = r.hi ? th.blue : hexA(col, 0.85);
        ctx.fill();
      });
    });
    const unit = b.b.replace(/^%\s*/, '');
    withAlpha(ctx, easeOut(prog(local, 0.4 + rows.length * 0.22, 0.4)), () => sub(ctx, th, unit, top + rows.length * (rowH + gap) + 10, 36));
  });
}

function vWallets(ctx: Ctx, env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const cols = 10;
  const rowsN = 7;
  const step = 76;
  const gx = W / 2 - ((cols - 1) * step) / 2;
  const gy = VY - 150;
  withAlpha(ctx, p, () => {
    if (b.a) bigText(ctx, env, th, b.a, b.a, gy - 120, 150);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rowsN; r++) {
        const k = c * rowsN + r;
        const a = easeOut(prog(local, 0.2 + hash(k) * 0.9, 0.3));
        if (a <= 0) continue;
        ctx.beginPath();
        ctx.arc(gx + c * step, gy + 40 + r * 62, lerp(4, 17, a), 0, Math.PI * 2);
        ctx.fillStyle = hexA(th.neg, 0.35 + 0.55 * hash(k + 99));
        ctx.fill();
      }
      font(ctx, 24, 500, FONT.mono);
      ctx.textAlign = 'center';
      ctx.fillStyle = th.sub;
      ctx.fillText(String(c + 1), gx + c * step, gy + 40 + rowsN * 62 + 10);
    }
    withAlpha(ctx, easeOut(prog(local, 0.9, 0.4)), () => sub(ctx, th, b.b, gy + 40 + rowsN * 62 + 50, 38));
  });
}

function vLag(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const x0 = 110;
  const x1 = 970;
  const yb = 1330;
  const yt = 760;
  const price = (u: number): number => {
    const s = 1 / (1 + Math.exp(-(u - 0.42) * 16));
    return yb - 40 - s * (yb - yt - 80) + (hash(Math.floor(u * 60)) - 0.5) * 18;
  };
  const leadU = 0.3;
  const followU = 0.46;
  const drawn = easeOut(prog(local, 0.15, 1.3));
  withAlpha(ctx, p, () => {
    ctx.fillStyle = th.track;
    ctx.fillRect(x0, yb, x1 - x0, 3);
    const band = easeOut(prog(local, 0.9, 0.5));
    if (band > 0) {
      const bx0 = x0 + leadU * (x1 - x0);
      const bx1 = x0 + followU * (x1 - x0);
      ctx.fillStyle = hexA(th.blue, 0.14 * band);
      ctx.fillRect(bx0, yt - 20, bx1 - bx0, yb - yt + 20);
    }
    ctx.beginPath();
    const n = 120;
    for (let i = 0; i <= n * drawn; i++) {
      const u = i / n;
      const x = x0 + u * (x1 - x0);
      if (i === 0) ctx.moveTo(x, price(u));
      else ctx.lineTo(x, price(u));
    }
    ctx.strokeStyle = th.ink;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.stroke();
    const marker = (u: number, label: string, color: string, at: number, above: boolean): void => {
      const a = easeBack(prog(local, at, 0.35));
      if (a <= 0 || !label) return;
      const x = x0 + u * (x1 - x0);
      const y = price(u);
      scaled(ctx, a, x, y, () => {
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = th.light ? '#FFFFFF' : '#0A0A0F';
        ctx.stroke();
        font(ctx, 34, 700, FONT.mono);
        const w = ctx.measureText(label).width + 40;
        const ly = above ? y - 96 : y + 40;
        rrect(ctx, x - w / 2, ly, w, 58, 29);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, ly + 40);
      });
    };
    marker(leadU, b.a, th.pos, 0.55, false);
    marker(followU, b.b, th.neg, 1.0, true);
  });
}

function vSteps(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const items = list(b.a);
  const h = 104;
  const gap = 26;
  // Wide enough for the longest step (up to the safe width); text sits right of the number, shrinking if it must.
  font(ctx, 44, 600);
  const longest = Math.max(0, ...items.map((x) => ctx.measureText(x.replace(/^!/, '')).width));
  const w = Math.min(960, Math.max(760, longest + 190));
  const textL = W / 2 - w / 2 + 100;
  const textW = w - 100 - 44;
  const top = VY - (items.length * h + (items.length - 1) * gap) / 2;
  withAlpha(ctx, p, () =>
    items.forEach((raw, i) => {
      const bad = raw.startsWith('!');
      const text = raw.replace(/^!/, '');
      const a = easeBack(prog(local, 0.2 + i * 0.3, 0.4));
      if (a <= 0) return;
      const y = top + i * (h + gap);
      // Kinetic: each step slides in from the right.
      const slide = b.kinetic ? (1 - easeOut(clamp01(a))) * 160 : 0;
      ctx.save();
      ctx.translate(slide, 0);
      scaled(ctx, lerp(0.85, 1, a), W / 2, y + h / 2, () =>
        withAlpha(ctx, clamp01(a), () => {
          rrect(ctx, W / 2 - w / 2, y, w, h, h / 2);
          ctx.fillStyle = th.panel;
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = bad ? th.neg : th.stroke;
          ctx.stroke();
          font(ctx, 40, 700, FONT.mono);
          ctx.textAlign = 'left';
          ctx.fillStyle = bad ? th.neg : th.blue;
          ctx.fillText(String(i + 1), W / 2 - w / 2 + 44, y + h / 2 + 14);
          font(ctx, 44, 600);
          const tw = ctx.measureText(text).width;
          const size = tw > textW ? Math.max(30, Math.floor((44 * textW) / tw)) : 44;
          font(ctx, size, 600);
          ctx.textAlign = 'center';
          ctx.fillStyle = bad ? th.neg : th.ink;
          ctx.fillText(text, textL + textW / 2, y + h / 2 + size * 0.34);
        }),
      );
      ctx.restore();
    }),
  );
}

function vCard(ctx: Ctx, env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const rows = list(b.b);
  const w = 900;
  const rowH = 96;
  const head = 150;
  const h = head + rows.length * rowH + 40;
  const x = W / 2 - w / 2;
  const y = VY - h / 2;
  scaled(ctx, lerp(0.9, 1, easeBack(p)), W / 2, VY, () =>
    withAlpha(ctx, p, () => {
      panel(ctx, th, x, y, w, h, 40);
      logo(ctx, env, x + 90, y + 82, 84);
      font(ctx, 54, 700);
      ctx.textAlign = 'left';
      ctx.fillStyle = th.ink;
      ctx.fillText(b.a, x + 160, y + 82);
      font(ctx, 28, 500, FONT.mono);
      ctx.fillStyle = th.sub;
      ctx.fillText(str(env.fields, 'card_by'), x + 162, y + 120);
      ctx.fillStyle = th.track;
      ctx.fillRect(x + 50, y + head, w - 100, 2);
      rows.forEach((r, i) => {
        const a = easeOut(prog(local, 0.35 + i * 0.35, 0.35));
        if (a <= 0) return;
        const ry = y + head + 30 + i * rowH;
        withAlpha(ctx, a, () => {
          if (b.kinetic) ctx.translate((1 - a) * 90, 0);
          const cx = x + 84;
          const cy = ry + rowH / 2 - 6;
          ctx.beginPath();
          ctx.arc(cx, cy, 22, 0, Math.PI * 2);
          ctx.fillStyle = th.light ? th.blue : gradient(ctx, cx - 22, 0, cx + 22, 0, env.accent);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - 9, cy);
          ctx.lineTo(cx - 2, cy + 8);
          ctx.lineTo(cx + 10, cy - 8);
          ctx.stroke();
          const t = fit(ctx, r, { maxW: w - 200, maxH: 60, max: 40, maxLines: 1, weight: 600 });
          font(ctx, t.size, 600);
          ctx.textAlign = 'left';
          ctx.fillStyle = th.ink;
          ctx.fillText(r, x + 136, cy + t.size * 0.36);
          if (b.kinetic) ctx.translate(-(1 - a) * 90, 0);
        });
      });
    }),
  );
}

function vCta(ctx: Ctx, env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  scaled(ctx, lerp(0.9, 1, easeOut(p)), W / 2, VY, () =>
    withAlpha(ctx, p, () => {
      const pulse = 1 + 0.03 * Math.sin(local * 4);
      scaled(ctx, pulse, W / 2, VY - 130, () => logo(ctx, env, W / 2, VY - 130, 230));
      if (b.a) bigText(ctx, env, th, b.a, b.a, VY + 70, 130);
      sub(ctx, th, b.b, VY + 160, 42);
    }),
  );
}

/** "Would you copy this?": two answers and a 3-2-1 countdown before the reveal. */
function vPoll(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const opts = list(b.a || 'Copy;Skip').slice(0, 2);
  while (opts.length < 2) opts.push(opts.length ? 'Skip' : 'Copy');
  const at = pollStart(b);
  const n = Math.floor((local - at) / POLL_STEP);
  const counting = local >= at && n < 3;
  const done = local >= at + 3 * POLL_STEP;
  const by = VY - 110;
  withAlpha(ctx, p, () => {
    opts.forEach((label, k) => {
      const appear = easeBack(prog(local, 0.1 + k * 0.12, 0.35));
      // The highlight swings between the two answers while the clock runs.
      const lean = counting ? (n % 2 === k ? 1 : 0) : 0;
      const cx = W / 2 + (k ? 230 : -230);
      scaled(ctx, lerp(0.6, 1, appear) * (1 + 0.05 * lean), cx, by, () =>
        withAlpha(ctx, clamp01(appear), () => {
          rrect(ctx, cx - 200, by - 80, 400, 160, 80);
          const c = k ? th.neg : th.pos;
          ctx.fillStyle = hexA(c, lean ? 0.16 : 0.07);
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.strokeStyle = hexA(c, lean ? 1 : 0.55);
          ctx.stroke();
          font(ctx, 62, 700);
          ctx.textAlign = 'center';
          ctx.fillStyle = c;
          ctx.fillText(label.toUpperCase(), cx, by + 22);
        }),
      );
    });
    const ry = VY + 150;
    const r = 78;
    ctx.beginPath();
    ctx.arc(W / 2, ry, r, 0, Math.PI * 2);
    ctx.lineWidth = 12;
    ctx.strokeStyle = th.track;
    ctx.stroke();
    const left = 1 - clamp01((local - at) / (3 * POLL_STEP));
    if (local >= at && !done) {
      ctx.beginPath();
      ctx.arc(W / 2, ry, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx.lineCap = 'round';
      ctx.strokeStyle = th.blue;
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    const digit = done ? '?' : local < at ? '3' : String(3 - n);
    const tick = done ? prog(local, at + 3 * POLL_STEP, 0.25) : local < at ? 1 : prog(local, at + n * POLL_STEP, 0.2);
    scaled(ctx, lerp(1.35, 1, easeOut(tick)), W / 2, ry, () => {
      font(ctx, 84, 700, FONT.mono);
      ctx.textAlign = 'center';
      ctx.fillStyle = th.ink;
      ctx.fillText(digit, W / 2, ry + 30);
    });
    withAlpha(ctx, easeOut(prog(local, 0.5, 0.4)), () => sub(ctx, th, b.b, ry + 150, 38));
  });
}

/** The verdict, stamped onto the screen with a little shake. */
function vStamp(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const text = minus(b.a || 'VERDICT');
  const c = signColor(th, text) ?? (/\b(bust|busted|false|fake|myth|skip|no|lost|rekt)\b/i.test(text) ? th.neg : /\b(true|confirmed|yes|real|copy)\b/i.test(text) ? th.pos : th.blue);
  const s = prog(local, STAMP_AT, 0.16);
  if (s <= 0) return;
  const shake = Math.sin(local * 95) * 9 * (1 - prog(local, STAMP_AT + 0.16, 0.3)) * (s >= 1 ? 1 : 0);
  withAlpha(ctx, p * clamp01(s * 1.6), () => {
    ctx.save();
    ctx.translate(W / 2 + shake, VY - 30 + shake * 0.4);
    ctx.rotate(-0.12);
    const k = lerp(2.3, 1, s * s);
    ctx.scale(k, k);
    const f = fit(ctx, text, { maxW: 700, maxH: 230, max: 200, maxLines: 1, family: FONT.sans });
    font(ctx, f.size, 800);
    const w = Math.min(860, ctx.measureText(text).width + 120);
    const h = f.size * 1.25 + 40;
    rrect(ctx, -w / 2, -h / 2, w, h, 26);
    ctx.fillStyle = hexA(c, 0.08);
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = c;
    ctx.fillText(text, 0, f.size * 0.36);
    ctx.restore();
  });
  if (b.kinetic && local < 5) {
    burst(ctx, W / 2, VY - 30, local - STAMP_AT - 0.16, c, 200, 560);
    const f = 1 - prog(local, STAMP_AT + 0.14, 0.2);
    if (local >= STAMP_AT + 0.14 && f > 0) {
      ctx.fillStyle = hexA(th.light ? '#FFFFFF' : c, (th.light ? 0.55 : 0.25) * f);
      ctx.fillRect(0, 0, W, H);
    }
  }
  withAlpha(ctx, p * easeOut(prog(local, STAMP_AT + 0.35, 0.4)), () => sub(ctx, th, b.b, VY + 200, 40));
}

/** A gold coin that drops and spins in, lands facing you with a burst and a glint, then floats. */
function vCoin(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const R = 220;
  const cy = VY - 70;
  const spin = easeOut(prog(local, 0, COIN_LAND));
  const ang = (1 - spin) * Math.PI * 6;
  const sx = Math.max(0.04, Math.abs(Math.cos(ang)));
  const fy = local >= COIN_LAND ? Math.sin((local - COIN_LAND) * 2.2) * 10 : 0;
  const drop = (1 - easeBack(prog(local, 0, 0.5))) * -260;
  const y = cy + fy + drop;
  withAlpha(ctx, p, () => {
    // Shadow on the floor.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(W / 2, cy + R + 70, R * 0.8 * (0.85 + 0.15 * sx), 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = th.light ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.45)';
    ctx.filter = 'blur(10px)';
    ctx.fill();
    ctx.restore();
    // Edge, then the face.
    const edge = Math.sin(ang) * 22;
    ctx.beginPath();
    ctx.ellipse(W / 2 + edge, y, R * sx, R, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#B45309';
    ctx.fill();
    const g = ctx.createLinearGradient(W / 2 - R, y - R, W / 2 + R, y + R);
    g.addColorStop(0, '#FDE68A');
    g.addColorStop(0.45, '#F59E0B');
    g.addColorStop(1, '#B45309');
    ctx.beginPath();
    ctx.ellipse(W / 2, y, R * sx, R, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(W / 2, y, R * 0.82 * sx, R * 0.82, 0, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(sx, 1);
    const sym = b.a || '₿';
    const f = fit(ctx, sym, { maxW: R * 1.3, maxH: R * 1.3, max: 250, maxLines: 1, family: FONT.sans });
    font(ctx, f.size, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(124,45,18,0.85)';
    ctx.fillText(sym, 0, f.size * 0.04);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    // A glint sweeps across once it lands.
    const gl = prog(local, COIN_LAND + 0.1, 0.55);
    if (gl > 0 && gl < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(W / 2, y, R * sx, R, 0, 0, Math.PI * 2);
      ctx.clip();
      const gx = lerp(W / 2 - R * 1.6, W / 2 + R * 1.6, easeInOut(gl));
      const sh = ctx.createLinearGradient(gx - 90, 0, gx + 90, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, 'rgba(255,255,255,0.7)');
      sh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(W / 2 - R, y - R, R * 2, R * 2);
      ctx.restore();
    }
    if (b.kinetic && local < 5) burst(ctx, W / 2, cy, local - COIN_LAND, '#F59E0B', R, R + 200);
    if (b.b) {
      const a = easeBack(prog(local, COIN_LAND + 0.1, 0.35));
      if (a > 0)
        scaled(ctx, lerp(0.6, 1, a), W / 2, cy + R + 160, () =>
          withAlpha(ctx, clamp01(a), () => {
            const t = fit(ctx, b.b, { maxW: 900, maxH: 100, max: 84, maxLines: 1, family: FONT.sans });
            font(ctx, t.size, 700);
            ctx.textAlign = 'center';
            ctx.fillStyle = th.ink;
            ctx.fillText(b.b, W / 2, cy + R + 190);
          }),
        );
    }
  });
}

// ── Crosshair ──────────────────────────────────────────────────────────────
const CROSS_COLORS = ['#22C55E', '#F43F5E', '#38BDF8', '#FACC15', '#E879F9', '#FFFFFF', '#FB923C', '#A3E635'];
const CROSS_NAMES: Record<string, string> = { cross: 'Cross', plus: 'Plus', dot: 'Dot', circle: 'Circle', t: 'T-shape', chevron: 'Chevron', x: 'Diagonal X', lineup: 'Lineup' };

/** "cross:#22C55E;dot;circle" → shapes with colours (a colour is optional). */
function crossList(a: string): Array<{ kind: string; color: string; label: string }> {
  const items = list(a || 'cross;dot;circle;t;chevron;x');
  return items.map((it, i) => {
    const [k, c] = it.split(':').map((x) => x.trim());
    const kind = (k || 'cross').toLowerCase().replace(/[^a-z]/g, '') || 'cross';
    return { kind, color: c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : CROSS_COLORS[i % CROSS_COLORS.length], label: CROSS_NAMES[kind] ?? k };
  });
}

/** One crosshair shape at (cx, cy). s = arm length; outlined like an in-game crosshair, with a soft glow. */
function crossShape(ctx: Ctx, kind: string, cx: number, cy: number, s: number, color: string, span: number): void {
  const th = Math.max(5, s * 0.16);
  const gap = s * 0.42;
  const paths: Array<() => void> = [];
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    paths.push(() => {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    });
  };
  let dot = false;
  let ring = 0;
  switch (kind) {
    case 'dot':
      dot = true;
      break;
    case 'plus':
      line(cx - s, cy, cx + s, cy);
      line(cx, cy - s, cx, cy + s);
      break;
    case 'circle':
      ring = s * 0.8;
      dot = true;
      break;
    case 't':
      line(cx - s - gap, cy, cx - gap, cy);
      line(cx + gap, cy, cx + s + gap, cy);
      line(cx, cy + gap, cx, cy + s + gap);
      break;
    case 'chevron':
      line(cx - s * 0.9, cy + s * 0.7, cx, cy);
      line(cx, cy, cx + s * 0.9, cy + s * 0.7);
      break;
    case 'x': {
      const d = s * 0.75;
      const g = gap * 0.75;
      line(cx - g - d, cy - g - d, cx - g, cy - g);
      line(cx + g, cy + g, cx + g + d, cy + g + d);
      line(cx + g, cy - g, cx + g + d, cy - g - d);
      line(cx - g, cy + g, cx - g - d, cy + g + d);
      break;
    }
    case 'lineup':
      line(cx - span, cy, cx + span, cy);
      line(cx, cy - span * 0.7, cx, cy + span * 0.7);
      dot = true;
      break;
    default:
      line(cx - s - gap, cy, cx - gap, cy);
      line(cx + gap, cy, cx + s + gap, cy);
      line(cx, cy - s - gap, cx, cy - gap);
      line(cx, cy + gap, cx, cy + s + gap);
      break;
  }
  const w = kind === 'lineup' ? th * 0.45 : th;
  const stroke = (width: number, style: string, blur: number): void => {
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.fillStyle = style;
    if (blur) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
    }
    ctx.beginPath();
    for (const p of paths) p();
    if (paths.length) ctx.stroke();
    if (ring) {
      ctx.beginPath();
      ctx.arc(cx, cy, ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (dot) {
      ctx.beginPath();
      ctx.arc(cx, cy, (kind === 'dot' ? th * 1.25 : th * 0.7) + (width - w) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  stroke(w + 8, 'rgba(0,0,0,0.85)', 0); // outline
  stroke(w, color, 26); // glow
  stroke(w, color, 0);
}

/** The little game scene the crosshair and radar demos play over; draw it inside a clip of the panel. target = the training dummy. */
function gameScene(ctx: Ctx, px: number, py: number, pw: number, ph: number, local: number, target: boolean): void {
  const cx = px + pw / 2;
  const cy = py + ph / 2;
  // The scene: dusk sky, a far ridge, a floor grid and two cover walls.
  const sky = ctx.createLinearGradient(0, py, 0, py + ph);
  sky.addColorStop(0, '#1E293B');
  sky.addColorStop(0.55, '#334155');
  sky.addColorStop(0.551, '#1F2937');
  sky.addColorStop(1, '#0B1120');
  ctx.fillStyle = sky;
  ctx.fillRect(px, py, pw, ph);
  const horizon = py + ph * 0.55;
  ctx.fillStyle = '#273449';
  ctx.beginPath();
  ctx.moveTo(px, horizon);
  for (let i = 0; i <= 12; i++) ctx.lineTo(px + (pw * i) / 12, horizon - 40 - 50 * Math.abs(Math.sin(i * 1.7)));
  ctx.lineTo(px + pw, horizon);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.16)';
  ctx.lineWidth = 2;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 40, horizon);
    ctx.lineTo(cx + i * 190, py + ph);
    ctx.stroke();
  }
  for (let k = 1; k <= 5; k++) {
    const y = horizon + (ph * 0.45) * Math.pow(k / 5, 1.8);
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + pw, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#475569';
  ctx.fillRect(px + 70, horizon - 150, 170, 230);
  ctx.fillRect(px + pw - 250, horizon - 110, 190, 190);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(px + 70, horizon - 150, 170, 14);
  ctx.fillRect(px + pw - 250, horizon - 110, 190, 14);
  // Warm light low on the horizon.
  const sun = ctx.createRadialGradient(cx - 120, horizon - 30, 10, cx - 120, horizon - 30, 420);
  sun.addColorStop(0, 'rgba(251,191,36,0.22)');
  sun.addColorStop(1, 'rgba(251,191,36,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(px, py, pw, ph);
  if (target) {
    // A dark training dummy beside the aim point, swaying a little, with a red rim light.
    const drift = Math.sin(local * 1.3) * 12;
    const tx = cx + 150 + drift;
    const ty = horizon + 40;
    const dummy = (): void => {
      ctx.beginPath();
      ctx.arc(tx, ty - 120, 26, 0, Math.PI * 2);
      ctx.fill();
      rrect(ctx, tx - 36, ty - 88, 72, 112, 16);
      ctx.fill();
      ctx.fillRect(tx - 26, ty + 20, 20, 60);
      ctx.fillRect(tx + 6, ty + 20, 20, 60);
    };
    ctx.save();
    ctx.translate(3, 0);
    ctx.fillStyle = 'rgba(244,63,94,0.75)';
    dummy();
    ctx.restore();
    ctx.fillStyle = '#0F172A';
    dummy();
  }
  // Vignette.
  const vg = ctx.createRadialGradient(cx, cy, ph * 0.3, cx, cy, pw * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(px, py, pw, ph);
}

/** A small game scene with the crosshair snapping through shapes and colours; the name of each lands under it. */
function vCrosshair(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const items = crossList(b.a);
  const pw = 900;
  const ph = 620;
  const px = (W - pw) / 2;
  const py = VY - 60 - ph / 2;
  const cx = W / 2;
  const cy = py + ph / 2;
  const idx = Math.max(0, Math.min(items.length - 1, Math.floor((local - CROSS_AT) / CROSS_STEP)));
  const since = local - CROSS_AT - idx * CROSS_STEP;
  withAlpha(ctx, p, () => {
    ctx.save();
    rrect(ctx, px, py, pw, ph, 34);
    ctx.clip();
    gameScene(ctx, px, py, pw, ph, local, true);
    // The crosshair: each new shape snaps in from larger with a flash ring.
    if (local >= CROSS_AT) {
      const it = items[idx];
      const snap = easeBack(clamp01(since / 0.22));
      const k = lerp(1.7, 1, snap);
      withAlpha(ctx, clamp01(since / 0.08), () => crossShape(ctx, it.kind, cx, cy, 50 * k, it.color, pw / 2));
      const ring = clamp01(since / 0.35);
      if (ring < 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, lerp(30, 150, easeOut(ring)), 0, Math.PI * 2);
        ctx.lineWidth = 6 * (1 - ring);
        ctx.strokeStyle = hexA(it.color, 0.8 * (1 - ring));
        ctx.stroke();
      }
    }
    ctx.restore();
    // Frame and a HUD tag.
    rrect(ctx, px, py, pw, ph, 34);
    ctx.lineWidth = 3;
    ctx.strokeStyle = th.light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)';
    ctx.stroke();
    font(ctx, 26, 700, FONT.mono);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('OVERLAY', px + 30, py + 48);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.min(items.length, idx + 1)}/${items.length}`, px + pw - 30, py + 48);
  });
  // The current shape's name pops under the scene, with a colour chip.
  if (local >= CROSS_AT) {
    const it = items[idx];
    const a = easeBack(clamp01(since / 0.25));
    const y = py + ph + 92;
    withAlpha(ctx, p * clamp01(a), () =>
      scaled(ctx, lerp(0.7, 1, a), cx, y, () => {
        font(ctx, 64, 800);
        const w = ctx.measureText(it.label).width;
        const chip = 34;
        const total = w + chip + 22;
        ctx.textAlign = 'left';
        ctx.fillStyle = th.ink;
        ctx.fillText(it.label, cx - total / 2 + chip + 22, y + 22);
        ctx.beginPath();
        ctx.arc(cx - total / 2 + chip / 2, y, chip / 2, 0, Math.PI * 2);
        ctx.fillStyle = it.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = th.light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)';
        ctx.stroke();
      }),
    );
  }
  if (b.b) withAlpha(ctx, p * easeOut(prog(local, CROSS_AT + 0.2, 0.4)), () => sub(ctx, th, b.b, py + ph + 180, 40));
}

// ── Sound radar ────────────────────────────────────────────────────────────
// Colours follow Krypt Radar's own pitch colours: low rumble amber, mids purple, high zing cyan.
const RADAR_COLORS: Record<RadarKind, string> = { steps: '#F59E0B', shot: '#22D3EE', other: '#A855F7' };

/** A game scene with a ring round the crosshair: each sound lights the ring on its side and throws a ping; its name and direction land under it. */
function vRadar(ctx: Ctx, _env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const items = radarSounds(b.a);
  const pw = 900;
  const ph = 620;
  const px = (W - pw) / 2;
  const py = VY - 60 - ph / 2;
  const cx = W / 2;
  const cy = py + ph / 2;
  const R = 200;
  const on = local >= RADAR_AT;
  const idx = Math.max(0, Math.min(items.length - 1, Math.floor((local - RADAR_AT) / RADAR_STEP)));
  const since = local - RADAR_AT - idx * RADAR_STEP;
  const it = items[idx];
  const color = it.color ?? RADAR_COLORS[it.kind];
  const pulses = radarPulses(it.kind);
  withAlpha(ctx, p, () => {
    ctx.save();
    rrect(ctx, px, py, pw, ph, 34);
    ctx.clip();
    gameScene(ctx, px, py, pw, ph, local, false);
    const mid = ((it.deg - 90) * Math.PI) / 180;
    // How loud the sound is right now: every pulse hits and decays, and a little of it keeps ringing.
    let level = 0;
    if (on) for (const t0 of pulses) if (since >= t0) level = Math.max(level, Math.exp(-(since - t0) / (it.kind === 'shot' ? 0.34 : 0.2)));
    const glow = on ? 0.32 + 0.68 * level : 0;
    // The side of the screen the sound is on warms up too.
    if (on) {
      const ex = cx + Math.cos(mid) * (pw / 2);
      const ey = cy + Math.sin(mid) * (ph / 2);
      const edge = ctx.createRadialGradient(ex, ey, 10, ex, ey, 330);
      edge.addColorStop(0, hexA(color, 0.42 * glow));
      edge.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = edge;
      ctx.fillRect(px, py, pw, ph);
    }
    // The ring: a dark band with two hairlines, and a small crosshair in the middle of it.
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = 30;
    ctx.strokeStyle = 'rgba(2,6,23,0.42)';
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    for (const r of [R - 15, R + 15]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    crossShape(ctx, 'cross', cx, cy, 18, '#FFFFFF', pw / 2);
    if (on) {
      // The lit part of the ring: brightest in the middle, soft at both ends.
      const spread = ((it.kind === 'shot' ? 36 : 28) * Math.PI) / 180;
      ctx.save();
      ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const half = spread * (1 - k * 0.18);
        ctx.beginPath();
        ctx.arc(cx, cy, R, mid - half, mid + half);
        ctx.lineWidth = 24;
        ctx.shadowColor = color;
        ctx.shadowBlur = k === 4 ? 60 * glow : 0;
        ctx.strokeStyle = hexA(color, glow * (0.2 + k * 0.12));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, R, mid - spread * 0.16, mid + spread * 0.16);
      ctx.lineWidth = 10;
      ctx.strokeStyle = `rgba(255,255,255,${(0.85 * level).toFixed(3)})`;
      ctx.stroke();
      // Pings: each pulse throws a short arc outwards that thins and fades.
      for (const t0 of pulses) {
        const u = (since - t0) / 0.6;
        if (u < 0 || u >= 1) continue;
        const half = (11 * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(cx, cy, R + 34 + 120 * easeOut(u), mid - half, mid + half);
        ctx.lineWidth = 14 * (1 - u) + 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 24 * (1 - u);
        ctx.strokeStyle = hexA(color, 0.95 * (1 - u));
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    // Frame and a HUD tag.
    rrect(ctx, px, py, pw, ph, 34);
    ctx.lineWidth = 3;
    ctx.strokeStyle = th.light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)';
    ctx.stroke();
    font(ctx, 26, 700, FONT.mono);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('SOUND RADAR', px + 30, py + 48);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.min(items.length, idx + 1)}/${items.length}`, px + pw - 30, py + 48);
  });
  // The sound's name and side pop under the scene, with a chip in its colour.
  if (on) {
    const a = easeBack(clamp01(since / 0.25));
    const y = py + ph + 92;
    withAlpha(ctx, p * clamp01(a), () =>
      scaled(ctx, lerp(0.7, 1, a), cx, y, () => {
        font(ctx, 64, 800);
        const side = `  ${it.dir}`;
        const w = ctx.measureText(it.label).width;
        const ws = ctx.measureText(side).width;
        const chip = 34;
        const total = w + ws + chip + 22;
        const x = cx - total / 2;
        ctx.textAlign = 'left';
        ctx.fillStyle = th.ink;
        ctx.fillText(it.label, x + chip + 22, y + 22);
        ctx.fillStyle = color;
        ctx.fillText(side, x + chip + 22 + w, y + 22);
        ctx.beginPath();
        ctx.arc(x + chip / 2, y, chip / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = th.light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)';
        ctx.stroke();
      }),
    );
  }
  if (b.b) withAlpha(ctx, p * easeOut(prog(local, RADAR_AT + 0.2, 0.4)), () => sub(ctx, th, b.b, py + ph + 180, 40));
}

// ── Tier list ──────────────────────────────────────────────────────────────
// Every tier beat drops one item onto the board; the items of the earlier tier
// beats are already on it, so the list fills up over the reel.
const TIER_COLORS: Record<string, string> = { S: '#FF5E7E', A: '#FF9F43', B: '#FFD43B', C: '#7BE07B', D: '#4DABF7', F: '#B197FC' };

function vTier(ctx: Ctx, _env: Env, th: Theme, beats: StoryBeat[], i: number, local: number, p: number): void {
  const b = beats[i];
  const placed = beats.slice(0, i).filter((x) => x.visual === 'tier').map((x) => tierItem(x.a));
  const cur = tierItem(b.a);
  const rowH = 112;
  const gap = 10;
  const w = 960;
  const x0 = W / 2 - w / 2;
  const top = VY - (TIERS.length * (rowH + gap)) / 2 + 30;
  const labelW = 124;
  const chipFont = 36;
  const chipH = 76;
  const landed = local >= TIER_LAND;
  // Where each item sits: left to right in its row, shrinking the row if it fills up.
  const rows = new Map<string, string[]>(TIERS.map((t) => [t, placed.filter((x) => x.tier === t).map((x) => x.item)]));
  rows.get(cur.tier)!.push(cur.item);
  const slots = new Map<string, Array<{ x: number; w: number; size: number }>>();
  for (const t of TIERS) {
    const items = rows.get(t)!;
    let size = chipFont;
    let widths: number[] = [];
    for (;;) {
      font(ctx, size, 700);
      widths = items.map((it) => ctx.measureText(it).width + size * 1.1);
      const total = widths.reduce((n, x) => n + x, 0) + 12 * Math.max(0, items.length - 1);
      if (total <= w - labelW - 36 || size <= 20) break;
      size -= 2;
    }
    let x = x0 + labelW + 18;
    slots.set(
      t,
      widths.map((cw) => {
        const s = { x, w: cw, size };
        x += cw + 12;
        return s;
      }),
    );
  }
  withAlpha(ctx, p, () => {
    TIERS.forEach((t, r) => {
      const y = top + r * (rowH + gap);
      rrect(ctx, x0, y, w, rowH, 18);
      ctx.fillStyle = th.light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      rrect(ctx, x0, y, labelW, rowH, 18);
      ctx.fillStyle = TIER_COLORS[t];
      ctx.fill();
      font(ctx, 64, 800);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#111114';
      ctx.fillText(t, x0 + labelW / 2, y + rowH / 2 + 23);
      const items = rows.get(t)!;
      const sl = slots.get(t)!;
      items.forEach((it, k) => {
        const isCur = t === cur.tier && k === items.length - 1;
        if (isCur && !landed) return;
        const s = sl[k];
        const cy = y + rowH / 2;
        const glow = isCur ? 1 - clamp01((local - TIER_LAND) / 0.8) : 0;
        ctx.save();
        if (glow > 0) {
          ctx.shadowColor = hexA(TIER_COLORS[t], 0.9);
          ctx.shadowBlur = 40 * glow;
        }
        rrect(ctx, s.x, cy - chipH / 2, s.w, chipH, 16);
        ctx.fillStyle = th.panel;
        ctx.fill();
        ctx.restore();
        rrect(ctx, s.x, cy - chipH / 2, s.w, chipH, 16);
        ctx.lineWidth = isCur ? 4 : 2;
        ctx.strokeStyle = isCur ? TIER_COLORS[t] : th.stroke;
        ctx.stroke();
        font(ctx, s.size, 700);
        ctx.textAlign = 'center';
        ctx.fillStyle = th.ink;
        ctx.fillText(it, s.x + s.w / 2, cy + s.size * 0.36);
        if (isCur) burst(ctx, s.x + s.w / 2, cy, local - TIER_LAND, TIER_COLORS[t], 30, 170);
      });
    });
    // The new item: pops in above the board, then flies into its slot.
    if (!landed) {
      const r = TIERS.indexOf(cur.tier as (typeof TIERS)[number]);
      const s = slots.get(cur.tier)![rows.get(cur.tier)!.length - 1];
      const tx = s.x + s.w / 2;
      const ty = top + r * (rowH + gap) + rowH / 2;
      const hx = W / 2;
      const hy = top - 90;
      const pop = easeBack(prog(local, 0, 0.25));
      const fly = easeInOut(prog(local, 0.3, TIER_LAND - 0.3));
      const x = lerp(hx, tx, fly);
      const y = lerp(hy, ty, fly);
      const sc = lerp(1.35, 1, fly) * lerp(0.6, 1, pop);
      scaled(ctx, sc, x, y, () =>
        withAlpha(ctx, clamp01(pop * 2), () => {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.35)';
          ctx.shadowBlur = 30;
          rrect(ctx, x - s.w / 2, y - chipH / 2, s.w, chipH, 16);
          ctx.fillStyle = th.panel;
          ctx.fill();
          ctx.restore();
          rrect(ctx, x - s.w / 2, y - chipH / 2, s.w, chipH, 16);
          ctx.lineWidth = 4;
          ctx.strokeStyle = TIER_COLORS[cur.tier];
          ctx.stroke();
          font(ctx, s.size, 700);
          ctx.textAlign = 'center';
          ctx.fillStyle = th.ink;
          ctx.fillText(cur.item, x, y + s.size * 0.36);
        }),
      );
    }
  });
  if (b.b) withAlpha(ctx, p * easeOut(prog(local, TIER_LAND, 0.4)), () => sub(ctx, th, b.b, top + TIERS.length * (rowH + gap) + 40, 40));
}

// ── Chat ───────────────────────────────────────────────────────────────────
// A phone message thread. Messages of earlier chat beats with the same contact
// stay on screen; this beat's pop in as the line is read, a received one after
// a typing indicator.
function wrapText(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function vChat(ctx: Ctx, env: Env, th: Theme, beats: StoryBeat[], i: number, local: number, p: number): void {
  const b = beats[i];
  const contact = b.b.trim() || 'Unknown';
  // The thread so far: earlier chat beats with this contact (back to the last chat with someone else).
  const earlier: Array<{ text: string; me: boolean }> = [];
  for (let k = i - 1; k >= 0; k--) {
    const x = beats[k];
    if (x.visual !== 'chat') continue;
    if ((x.b.trim() || 'Unknown') !== contact) break;
    earlier.unshift(...chatMessages(x.a));
  }
  const mine = chatMessages(b.a);
  const times = chatTimes(b);
  // The opening beat already shows its first message (frame 0 is the poster).
  if (i === 0 && times.length) local = Math.max(local, times[0] + 0.3);
  const pw = 900;
  const ph = 1060;
  const px = W / 2 - pw / 2;
  const py = VY - ph / 2 + 40;
  const headH = 120;
  const fs = 40;
  const lh = 52;
  const maxW = 600;
  const bubbleBg = th.light ? '#E9E9EE' : '#2A2A33';
  const sentBg = th.light ? th.blue : '#2F6BFF';
  withAlpha(ctx, p, () => {
    panel(ctx, th, px, py, pw, ph, 54);
    // Header: avatar + contact name.
    ctx.beginPath();
    ctx.arc(px + 92, py + headH / 2 + 6, 38, 0, Math.PI * 2);
    ctx.fillStyle = gradient(ctx, px + 54, 0, px + 130, 0, env.accent);
    ctx.fill();
    font(ctx, 38, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(contact.slice(0, 1).toUpperCase(), px + 92, py + headH / 2 + 20);
    font(ctx, 40, 700);
    ctx.textAlign = 'left';
    ctx.fillStyle = th.ink;
    ctx.fillText(contact, px + 152, py + headH / 2 + 20);
    ctx.fillStyle = th.track;
    ctx.fillRect(px + 30, py + headH + 10, pw - 60, 2);
    // Bubbles, bottom-up.
    const items: Array<{ text: string; me: boolean; a: number; typing: boolean }> = earlier.map((m) => ({ ...m, a: 1, typing: false }));
    mine.forEach((m, k) => {
      const since = local - times[k];
      if (since >= 0) items.push({ ...m, a: clamp01(since / 0.28), typing: false });
      else if (!m.me && since > -0.55 && (k === 0 || local >= times[k - 1] + 0.2)) items.push({ ...m, a: clamp01((since + 0.55) / 0.2), typing: true });
    });
    const bodyTop = py + headH + 24;
    let y = py + ph - 36;
    ctx.save();
    rrect(ctx, px, bodyTop, pw, py + ph - bodyTop, 0);
    ctx.clip();
    font(ctx, fs, 500);
    for (let k = items.length - 1; k >= 0 && y > bodyTop - 200; k--) {
      const m = items[k];
      const lines = m.typing ? ['•••'] : wrapText(ctx, m.text, maxW);
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56;
      const bh = lines.length * lh + 34;
      const grow = easeOut(m.a);
      y -= (bh + 18) * grow;
      const bx = m.me ? px + pw - 40 - bw : px + 40;
      const cx = m.me ? bx + bw : bx;
      scaled(ctx, lerp(0.6, 1, easeBack(m.a)), cx, y + bh, () =>
        withAlpha(ctx, clamp01(m.a * 1.5), () => {
          rrect(ctx, bx, y, bw, bh, 30);
          ctx.fillStyle = m.me ? sentBg : bubbleBg;
          ctx.fill();
          if (m.typing) {
            for (let d = 0; d < 3; d++) {
              const bob = Math.sin(env.t * 9 - d * 0.9) * 6;
              ctx.beginPath();
              ctx.arc(bx + 34 + d * 22, y + bh / 2 + bob, 7, 0, Math.PI * 2);
              ctx.fillStyle = th.sub;
              ctx.fill();
            }
            return;
          }
          ctx.textAlign = 'left';
          ctx.fillStyle = m.me ? '#FFFFFF' : th.ink;
          lines.forEach((l, li) => ctx.fillText(l, bx + 28, y + 17 + lh * (li + 0.78)));
        }),
      );
    }
    ctx.restore();
  });
}

// ── Screen recording ───────────────────────────────────────────────────────
// The reel's screen recording (field video) in a frame, from the second in a,
// optionally zooming in on one spot; b is a callout under it.
function vScreen(ctx: Ctx, env: Env, th: Theme, b: StoryBeat, local: number, p: number): void {
  const v = env.video;
  const vs = env.videoSize;
  const maxW = 1000;
  const maxH = 1080;
  const cy = VY + 30;
  let bottom = cy + 300;
  withAlpha(ctx, p, () => {
    if (!v || !vs || vs.w <= 0 || vs.h <= 0) {
      rrect(ctx, W / 2 - 460, cy - 300, 920, 600, 28);
      ctx.fillStyle = th.light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.setLineDash([16, 14]);
      ctx.strokeStyle = th.light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
      font(ctx, 36, 600, FONT.mono);
      ctx.fillStyle = th.sub;
      ctx.textAlign = 'center';
      ctx.fillText(str(env.fields, 'video') ? 'loading recording…' : 'screen recording goes here', W / 2, cy + 12);
      return;
    }
    const zm = screenZoom(b.a);
    const z = lerp(1, zm.z, easeInOut(prog(local, 0.25, 0.7)));
    const sw = vs.w / z;
    const sh = vs.h / z;
    const sx = Math.min(vs.w - sw, Math.max(0, zm.x * vs.w - sw / 2));
    const sy = Math.min(vs.h - sh, Math.max(0, zm.y * vs.h - sh / 2));
    const s = Math.min(maxW / vs.w, maxH / vs.h);
    const w = vs.w * s;
    const h = vs.h * s;
    const x = W / 2 - w / 2;
    const y = cy - h / 2;
    bottom = y + h;
    ctx.save();
    ctx.shadowColor = hexA(env.accent[1], 0.35);
    ctx.shadowBlur = 60;
    rrect(ctx, x, y, w, h, 22);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    rrect(ctx, x, y, w, h, 22);
    ctx.clip();
    ctx.drawImage(v, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
    rrect(ctx, x, y, w, h, 22);
    ctx.lineWidth = 3;
    ctx.strokeStyle = th.light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.16)';
    ctx.stroke();
  });
  if (b.b) {
    const a = easeBack(prog(local, 0.35, 0.35));
    const c = fit(ctx, b.b, { maxW: 860, maxH: 140, max: 52, maxLines: 2 });
    const top = bottom + 46;
    withAlpha(ctx, p * clamp01(a), () =>
      scaled(ctx, lerp(0.8, 1, a), W / 2, top + 40, () => {
        font(ctx, c.size, 700);
        ctx.textAlign = 'center';
        c.lines.forEach((l, li) => {
          const lw = ctx.measureText(l).width;
          const ly = top + li * c.lh * 1.15;
          rrect(ctx, W / 2 - lw / 2 - 26, ly, lw + 52, c.lh * 1.08, 18);
          ctx.fillStyle = gradient(ctx, W / 2 - lw / 2, 0, W / 2 + lw / 2, 0, env.accent);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(l, W / 2, ly + c.lh * 0.82);
        });
      }),
    );
  }
}

// ── Scene ──────────────────────────────────────────────────────────────────
function scene(ctx: Ctx, env: Env, beats: StoryBeat[], i: number, local: number, opts: { animateIn: boolean; exit: number }): Theme {
  const b = beats[i];
  const art = artOf(env.fields);
  const act = isAction(b.visual);
  // Cartoon / ps2 / 3d: the mascot is on screen every beat (the star of a character beat, small and presenting next to a diagram).
  const th = art === 'flat' ? (b.theme === 'light' ? LIGHT : DARK) : art === 'ps2' ? DARK : LIGHT;
  let head: { x: number; y: number; size: number } | null = null;
  if (art !== 'flat') {
    artBackdrop(ctx, env, art, i);
    withAlpha(ctx, 1 - opts.exit, () => (head = drawMascot(ctx, env, art, b, i, local, act ? 'stage' : 'corner')));
  } else {
    if (th.light) lightBackdrop(ctx, env.t);
    else darkBackdrop(ctx, env);
    if (b.kinetic) driftGrid(ctx, th, env.t);
    // A character beat in the flat style: the 3D mascot on the usual backdrop.
    if (act) withAlpha(ctx, 1 - opts.exit, () => (head = drawMascot(ctx, env, '3d', b, i, local, 'stage')));
  }
  if (i === 0 && art !== 'ps2') kicker(ctx, env, th);
  const enter = opts.animateIn ? easeOut(prog(local, 0, b.kinetic ? 0.18 : 0.28)) : 1;
  // Kinetic camera: the new beat zooms up to size, then pushes in slowly.
  const cam = b.kinetic ? lerp(1, 1.04, clamp01(local / b.dur)) * (opts.animateIn ? lerp(0.86, 1, easeOut(prog(local, 0, 0.4))) : 1) : 1;
  ctx.save();
  ctx.translate(W / 2, VY);
  ctx.scale(cam, cam);
  ctx.translate(-W / 2, -VY);
  withAlpha(ctx, enter * (1 - opts.exit), () => {
    if (art === 'cartoon') cartoonHeadline(ctx, env, b, local, false, i === 0);
    else if (art === 'ps2') dialogueBox(ctx, env, b, local, i === 0 && !opts.animateIn, !act);
    else headline(ctx, env, th, b, local, false, i === 0);
    const p = opts.animateIn ? easeOut(prog(local, 0.12, 0.45)) : 1;
    const l = opts.animateIn ? local : 5;
    if (act) {
      if (head) actionFx(ctx, art, b.visual, head, local);
      actionLabel(ctx, env, art, b, local, !opts.animateIn && i === 0);
      return;
    }
    switch (b.visual) {
      case 'title':
        vTitle(ctx, env, th, b, p);
        break;
      case 'number':
        vNumber(ctx, env, th, b, l, p);
        break;
      case 'chart':
        vChart(ctx, env, th, b, opts.animateIn ? local : local + 10, p);
        break;
      case 'flow':
        vFlow(ctx, env, th, b, l, p);
        break;
      case 'dots':
        vDots(ctx, env, th, b, l, p);
        break;
      case 'wallet':
        vWallet(ctx, env, th, b, l, p);
        break;
      case 'follow':
        vFollow(ctx, env, th, b, local, p);
        break;
      case 'bars':
        vBars(ctx, env, th, b, l, p);
        break;
      case 'wallets':
        vWallets(ctx, env, th, b, l, p);
        break;
      case 'lag':
        vLag(ctx, env, th, b, l, p);
        break;
      case 'steps':
        vSteps(ctx, env, th, b, l, p);
        break;
      case 'card':
        vCard(ctx, env, th, b, l, p);
        break;
      case 'cta':
        vCta(ctx, env, th, b, local, p);
        break;
      case 'poll':
        vPoll(ctx, env, th, b, opts.animateIn ? local : Math.max(local, 0.5), p);
        break;
      case 'stamp':
        vStamp(ctx, env, th, b, opts.animateIn ? local : 5, p);
        break;
      case 'coin':
        vCoin(ctx, env, th, b, opts.animateIn ? local : 5, p);
        break;
      case 'tier':
        vTier(ctx, env, th, beats, i, opts.animateIn ? local : 5, p);
        break;
      case 'chat':
        vChat(ctx, env, th, beats, i, local, p);
        break;
      case 'screen':
        vScreen(ctx, env, th, b, local, p);
        break;
      case 'crosshair':
        // The opening beat (no animate-in) still cycles its shapes, starting with the first already on screen.
        vCrosshair(ctx, env, th, b, opts.animateIn ? local : local + CROSS_AT + 0.3, p);
        break;
      case 'radar':
        // The opening beat starts with its first sound already on the ring.
        vRadar(ctx, env, th, b, local + radarShift(!opts.animateIn), p);
        break;
      default:
        break;
    }
  });
  ctx.restore();
  return th;
}

/** A soft colour band sweeping down over the cut. */
function wipe(ctx: Ctx, th: Theme, local: number): void {
  const u = prog(local, 0, 0.5);
  if (u >= 1) return;
  const band = 760;
  const y = lerp(-band, H, easeInOut(u));
  const g = ctx.createLinearGradient(0, y, 0, y + band);
  g.addColorStop(0, hexA(th.blue, 0));
  g.addColorStop(0.3, hexA(th.blue, 1));
  g.addColorStop(0.7, hexA(th.blue, 1));
  g.addColorStop(1, hexA(th.blue, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, band);
}

const LOOP_FADE = 0.45;
const CUT = 0.32;

let cutLayer: HTMLCanvasElement | null = null;

/** Kinetic cut: the last frame of the previous beat flies past the camera (scales up, blurs, fades). */
function zoomThrough(ctx: Ctx, env: Env, beats: StoryBeat[], prev: number, u: number): void {
  if (!cutLayer) {
    cutLayer = document.createElement('canvas');
    cutLayer.width = W;
    cutLayer.height = H;
  }
  const g = cutLayer.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  const pb = beats[prev];
  scene(g, { ...env, t: pb.start + pb.dur }, beats, prev, pb.dur, { animateIn: prev !== 0, exit: 0 });
  const e = u * u;
  ctx.save();
  ctx.globalAlpha = 1 - easeOut(u);
  ctx.filter = `blur(${(e * 18).toFixed(1)}px)`;
  ctx.translate(W / 2, VY);
  ctx.scale(1 + 0.45 * e, 1 + 0.45 * e);
  ctx.drawImage(cutLayer, -W / 2, -VY);
  ctx.restore();
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((b) => t >= b.start && t < b.start + b.dur));
  const b = beats[i];
  const local = t - b.start;
  const loop = env.fields.loop === true;
  const last = i === beats.length - 1;
  // Exit fade at the end of each beat (the last one hands over to the loop
  // instead; a kinetic cut zooms through instead).
  const exit = last || b.kinetic ? 0 : prog(local, b.dur - 0.2, 0.2);
  // The opening beat's visual is there from frame 0 (the poster); its words still blur in.
  const th = scene(ctx, env, beats, i, local, { animateIn: i !== 0, exit });
  if (b.wipe) wipe(ctx, th, local);
  else if (b.kinetic && i > 0 && local < CUT) zoomThrough(ctx, env, beats, i - 1, prog(local, 0, CUT));
  markLightFrame(th.light);
  if (loop && last) {
    const fade = prog(env.t, env.timing.body - LOOP_FADE, LOOP_FADE);
    if (fade > 0) withAlpha(ctx, easeOut(fade), () => scene(ctx, { ...env, t: 0 }, beats, 0, 0, { animateIn: false, exit: 0 }));
  }
}

registerPreset('story', draw);
