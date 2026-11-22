import { ACCENTS, presetById, str, timingFor, type Timing } from '@shared/presets';
import type { Fields } from '@shared/types';

// The reel engine: every frame is a pure function of (preset, fields, t), drawn
// on a 1080x1920 canvas. Preview, still frames for the agent and the MP4 export
// all call drawReel, so what you see is what renders.

export const W = 1080;
export const H = 1920;
/** Keep text inside these; Instagram's UI covers the top ~220px, bottom ~380px and a right rail. */
export const SAFE = { left: 80, right: 1000, top: 250, bottom: 1520 };

export type Ctx = CanvasRenderingContext2D;

export interface Env {
  t: number;
  fields: Fields;
  timing: Timing;
  accent: [string, string, string];
  logo: HTMLImageElement | null;
  /** clip preset: the current video frame, already resolved for time t. */
  video: CanvasImageSource | null;
  /** A campaign's ad banner is drawn from here down: captions stay above it (null = no banner). */
  bannerTop: number | null;
  videoSize: { w: number; h: number } | null;
  frame: number;
}

export type PresetDraw = (ctx: Ctx, env: Env) => void;

// A preset whose look changes per scene (story) says whether the frame it
// drew is light, so the disclaimer and vignette match it.
let lightFrame: boolean | null = null;
export const markLightFrame = (light: boolean): void => void (lightFrame = light);
const isLight = (env: Env): boolean => lightFrame ?? str(env.fields, 'theme') === 'light';

export const FONT = {
  sans: '"Chakra Petch", Inter, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  pixel: '"Press Start 2P", monospace',
  /** Captions and meme bars: a heavy round sans. */
  meme: 'Montserrat, "Arial Black", Arial, sans-serif',
  /** Classic top / bottom meme text. */
  impact: 'Anton, Impact, "Arial Black", sans-serif',
  /** Forum post cards and greentext boards. */
  board: 'Arial, Helvetica, sans-serif',
};

// ── Math ───────────────────────────────────────────────────────────────────
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0→1 over [start, start+dur]. */
export const prog = (t: number, start: number, dur: number): number => (dur <= 0 ? (t >= start ? 1 : 0) : clamp01((t - start) / dur));
export const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeBack = (x: number): number => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const lerp = (a: number, b: number, x: number): number => a + (b - a) * x;
/** Entrance that is never fully invisible, so frame 0 already reads (thumbnail + sound-off hook). */
export const hookIn = (t: number, start = 0, dur = 0.35): number => lerp(0.75, 1, easeOut(prog(t, start, dur)));

function hashRand(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── Text ───────────────────────────────────────────────────────────────────
export function font(ctx: Ctx, size: number, weight = 700, family = FONT.sans): void {
  ctx.font = `${weight} ${Math.round(size)}px ${family}`;
}

/** Word-wrap honouring explicit newlines. Very long words are broken by characters. */
export function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxW) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      if (ctx.measureText(word).width <= maxW) {
        line = word;
        continue;
      }
      let chunk = '';
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width > maxW && chunk) {
          out.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}

/** Largest size (≤ max) at which `text` wraps into ≤ maxLines lines within maxW and fits maxH. */
export function fit(ctx: Ctx, text: string, opts: { maxW: number; maxH: number; max: number; min?: number; maxLines?: number; weight?: number; family?: string; lh?: number }): { size: number; lines: string[]; lh: number } {
  const lhK = opts.lh ?? 1.08;
  let size = opts.max;
  const min = opts.min ?? 28;
  for (;;) {
    font(ctx, size, opts.weight ?? 700, opts.family);
    const lines = wrap(ctx, text, opts.maxW);
    const tooMany = opts.maxLines !== undefined && lines.length > opts.maxLines;
    if ((!tooMany && lines.length * size * lhK <= opts.maxH) || size <= min) return { size, lines, lh: size * lhK };
    size = Math.max(min, Math.floor(size * 0.93));
  }
}

export function gradient(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, colors: readonly string[]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
  return g;
}

/** Draw lines centred on x (or left-aligned at x); fill = colour or 'accent' for the gradient. Returns the bottom y. */
export function drawLines(ctx: Ctx, lines: string[], x: number, y: number, lh: number, opts: { align?: CanvasTextAlign; fill?: string | CanvasGradient; glow?: string; shadow?: boolean } = {}): number {
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = opts.fill ?? '#FFFFFF';
  lines.forEach((l, i) => {
    const yy = y + lh * (i + 0.82);
    if (opts.glow) {
      ctx.save();
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur = 36;
      ctx.fillText(l, x, yy);
      ctx.restore();
    } else if (opts.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      ctx.fillText(l, x, yy);
      ctx.restore();
    } else {
      ctx.fillText(l, x, yy);
    }
  });
  return y + lh * lines.length;
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function withAlpha(ctx: Ctx, a: number, fn: () => void): void {
  if (a <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= a;
  fn();
  ctx.restore();
}

/** Scale around a point. */
export function scaled(ctx: Ctx, s: number, cx: number, cy: number, fn: () => void): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  fn();
  ctx.restore();
}

/** A capsule label. Returns its width. */
export function pill(ctx: Ctx, text: string, x: number, y: number, opts: { size?: number; fill?: string | CanvasGradient; stroke?: string; color?: string; align?: 'left' | 'center' | 'right'; family?: string; weight?: number; padX?: number } = {}): number {
  const size = opts.size ?? 30;
  font(ctx, size, opts.weight ?? 600, opts.family ?? FONT.mono);
  const padX = opts.padX ?? size * 0.75;
  const w = ctx.measureText(text).width + padX * 2;
  const h = size * 1.9;
  const left = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
  rrect(ctx, left, y, w, h, h / 2);
  if (opts.fill) {
    ctx.fillStyle = opts.fill;
    ctx.fill();
  }
  if (opts.stroke) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = opts.color ?? '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + padX, y + h / 2 + size * 0.04);
  ctx.textBaseline = 'alphabetic';
  return w;
}

/** Split "1,628 views" / "$0" / "+807%" into a number to count up and its surroundings. */
export function countUp(value: string, p: number): string {
  const m = /^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(value);
  if (!m) return value;
  const target = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(target)) return value;
  const decimals = (m[2].split('.')[1] ?? '').length;
  const cur = target * easeOut(clamp01(p));
  let s = cur.toFixed(decimals);
  if (m[2].includes(',')) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${m[1]}${s}${m[3]}`;
}

// ── Backdrop ───────────────────────────────────────────────────────────────
let grain: HTMLCanvasElement | null = null;
function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = hashRand(i) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grain = c;
  return c;
}

export function backdrop(ctx: Ctx, env: Env): void {
  const { t, accent } = env;
  ctx.fillStyle = '#060609';
  ctx.fillRect(0, 0, W, H);
  // Two slow blooms (the Krypt radial), drifting.
  const blooms: Array<[number, number, number, string, number]> = [
    [W * (0.18 + 0.05 * Math.sin(t * 0.35)), H * (0.08 + 0.03 * Math.cos(t * 0.3)), 900, accent[1], 0.3],
    [W * (0.92 + 0.04 * Math.cos(t * 0.27)), H * (0.78 + 0.04 * Math.sin(t * 0.33)), 820, accent[0], 0.2],
  ];
  for (const [x, y, r, c, a] of blooms) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(c, a));
    g.addColorStop(1, hexA(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // Fine grid, slowly scrolling.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  const step = 72;
  const off = (t * 12) % step;
  ctx.beginPath();
  for (let x = 0; x <= W; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
  }
  for (let y = -step; y <= H; y += step) {
    ctx.moveTo(0, y + off + 0.5);
    ctx.lineTo(W, y + off + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

export function finish(ctx: Ctx, env: Env): void {
  // Vignette + film grain over everything.
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, isLight(env) ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = 'overlay';
  const tile = grainTile();
  const ox = Math.floor(hashRand(env.frame) * 256);
  const oy = Math.floor(hashRand(env.frame + 7) * 256);
  ctx.translate(-ox, -oy);
  ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── Brand pieces ───────────────────────────────────────────────────────────
export function logo(ctx: Ctx, env: Env, cx: number, cy: number, size: number): void {
  if (!env.logo) return;
  ctx.save();
  ctx.shadowColor = 'rgba(168,85,247,0.75)';
  ctx.shadowBlur = size * 0.25;
  ctx.drawImage(env.logo, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

function endCard(ctx: Ctx, env: Env, local: number): void {
  const f = env.fields;
  const p = easeOut(prog(local, 0, 0.35));
  withAlpha(ctx, p, () => {
    ctx.fillStyle = 'rgba(4,4,8,0.82)';
    ctx.fillRect(0, 0, W, H);
    scaled(ctx, lerp(0.92, 1, p), W / 2, 900, () => {
      const pulse = 1 + 0.03 * Math.sin(local * 4);
      scaled(ctx, pulse, W / 2, 700, () => logo(ctx, env, W / 2, 700, 260));
      const title = str(f, 'cta') || 'krypt.cc';
      const t1 = fit(ctx, title, { maxW: 900, maxH: 160, max: 130, maxLines: 1 });
      drawLines(ctx, t1.lines, W / 2, 900, t1.lh, { fill: gradient(ctx, 160, 0, 920, 0, env.accent), glow: hexA(env.accent[1], 0.5) });
      const sub = str(f, 'cta_sub');
      if (sub) {
        const s = fit(ctx, sub, { maxW: 860, maxH: 120, max: 46, weight: 500, maxLines: 2 });
        drawLines(ctx, s.lines, W / 2, 1080, s.lh, { fill: 'rgba(255,255,255,0.78)' });
      }
    });
  });
}

function disclaimer(ctx: Ctx, env: Env): void {
  const d = str(env.fields, 'disclaimer');
  if (!d) return;
  font(ctx, 26, 500, FONT.mono);
  ctx.textAlign = 'center';
  ctx.fillStyle = isLight(env) ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';
  ctx.fillText(d, W / 2, 1585);
}

// ── Frame ──────────────────────────────────────────────────────────────────
const registry = new Map<string, PresetDraw>();
export const registerPreset = (id: string, draw: PresetDraw): void => void registry.set(id, draw);

export interface FrameInput {
  preset: string;
  fields: Fields;
  t: number;
  frame: number;
  logo: HTMLImageElement | null;
  video?: CanvasImageSource | null;
  videoSize?: { w: number; h: number } | null;
  /** The reel's campaign's ad banner (loadBanner), if it has one. */
  banner?: HTMLImageElement | null;
}

/** Where a campaign's ad banner sits: centred, its bottom just above the platforms' caption area. */
const BANNER = { maxW: 900, maxH: 200, bottom: 1520 };

function bannerBox(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const s = Math.min(BANNER.maxW / img.naturalWidth, BANNER.maxH / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  return { x: W / 2 - w / 2, y: BANNER.bottom - h, w, h };
}

function drawBanner(ctx: Ctx, img: HTMLImageElement): void {
  const b = bannerBox(img);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  rrect(ctx, b.x, b.y, b.w, b.h, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.001)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  ctx.drawImage(img, b.x, b.y, b.w, b.h);
  ctx.restore();
}

export function drawReel(ctx: Ctx, input: FrameInput): Timing {
  const timing = timingFor(input.preset, input.fields);
  const accent = ACCENTS[String(input.fields.accent)] ?? ACCENTS.krypt;
  const banner = input.banner && input.banner.naturalWidth > 0 ? input.banner : null;
  const env: Env = { t: input.t, fields: input.fields, timing, accent, logo: input.logo, video: input.video ?? null, videoSize: input.videoSize ?? null, frame: input.frame, bannerTop: banner ? bannerBox(banner).y : null };
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  lightFrame = null;
  backdrop(ctx, env);
  const draw = registry.get(input.preset);
  const out = timing.cta > 0 ? prog(input.t, timing.body, 0.3) : 0;
  if (!draw || !presetById(input.preset)) {
    font(ctx, 48, 600);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`Unknown preset "${input.preset}"`, W / 2, H / 2);
  } else if (out < 1) {
    // The body keeps animating under the end card's fade-in.
    withAlpha(ctx, 1 - out, () => scaled(ctx, lerp(1, 0.94, easeOut(out)), W / 2, H / 2, () => draw(ctx, { ...env, t: Math.min(input.t, timing.body + 0.3) })));
  }
  if (timing.cta > 0 && input.t >= timing.body + 0.2) endCard(ctx, env, input.t - timing.body - 0.2);
  disclaimer(ctx, env);
  finish(ctx, env);
  // Over the vignette and grain, so the brand's banner shows as they made it.
  if (banner) drawBanner(ctx, banner);
  ctx.restore();
  return timing;
}

const banners = new Map<string, Promise<HTMLImageElement | null>>();
/** A campaign's ad banner (a picture path), or null when there is none or it can't be read. */
export function loadBanner(path?: string): Promise<HTMLImageElement | null> {
  const key = (path ?? '').trim();
  if (!key) return Promise.resolve(null);
  let p = banners.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      // Not kept: the user may put the file back or set the banner again.
      img.onerror = () => {
        banners.delete(key);
        resolve(null);
      };
      img.src = window.marketo.app.mediaUrl(key);
    });
    banners.set(key, p);
  }
  return p;
}

// ── Assets ─────────────────────────────────────────────────────────────────
const logos = new Map<string, Promise<HTMLImageElement | null>>();
/** The logo a reel draws: its own `logo` field (an image path), the Krypt mark when that is empty, nothing for "none". */
export function loadLogo(path?: unknown): Promise<HTMLImageElement | null> {
  const key = typeof path === 'string' ? path.trim() : '';
  if (key.toLowerCase() === 'none') return Promise.resolve(null);
  let p = logos.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      // A missing custom logo falls back to the built-in one rather than leaving a hole.
      img.onerror = () => (key ? void loadLogo().then(resolve) : resolve(null));
      img.src = key ? window.marketo.app.mediaUrl(key) : './krypt.png';
    });
    logos.set(key, p);
  }
  return p;
}

// Pictures a reel shows (meme panels, narrated image lines). Drawing is synchronous, so they are loaded first
// (preloadImages) and drawn from here; one still loading draws as an empty frame and redraws when it lands.
const images = new Map<string, { img: HTMLImageElement; ready: Promise<void>; ok: boolean }>();

function imageEntry(path: string): { img: HTMLImageElement; ready: Promise<void>; ok: boolean } {
  let e = images.get(path);
  if (!e) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const entry = { img, ok: false, ready: Promise.resolve() };
    entry.ready = new Promise<void>((resolve) => {
      img.onload = () => {
        entry.ok = true;
        resolve();
      };
      img.onerror = () => resolve();
    });
    img.src = window.marketo.app.mediaUrl(path);
    images.set(path, entry);
    e = entry;
  }
  return e;
}

/** A loaded picture by file path, or null while it loads (or when it can't be read). */
export function imageOf(path: string): HTMLImageElement | null {
  if (!path) return null;
  const e = imageEntry(path);
  return e.ok ? e.img : null;
}

/** The picture files a reel's lines point at (image panels and lines: column a). */
export function imagePaths(fields: Fields): string[] {
  const out = new Set<string>();
  for (const line of String(fields.beats ?? '').split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    if ((c[2] ?? '').toLowerCase() === 'image' && c[3]) out.add(c[3]);
  }
  return [...out];
}

/** Load every picture a reel needs before frames are drawn for export or stills. */
export async function preloadImages(fields: Fields, onLoad?: () => void): Promise<void> {
  await Promise.all(
    imagePaths(fields).map((p) =>
      imageEntry(p).ready.then(() => {
        onLoad?.();
      }),
    ),
  );
}

/** Webfonts load lazily; make sure every face the engine uses is ready before drawing frames that get encoded. */
export async function loadFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`700 64px ${FONT.sans}`),
      document.fonts.load(`600 64px ${FONT.sans}`),
      document.fonts.load(`500 64px ${FONT.sans}`),
      document.fonts.load(`400 32px ${FONT.mono}`),
      document.fonts.load(`500 32px ${FONT.mono}`),
      document.fonts.load(`600 32px ${FONT.mono}`),
      document.fonts.load(`400 24px ${FONT.pixel}`),
      document.fonts.load(`400 64px ${FONT.impact}`),
      document.fonts.load(`600 64px ${FONT.meme}`),
      document.fonts.load(`800 64px ${FONT.meme}`),
      document.fonts.load(`900 64px ${FONT.meme}`),
    ]);
    await document.fonts.ready;
  } catch {
    /* fall back to whatever is available */
  }
}
