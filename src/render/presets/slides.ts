import { areaOf, imageRef, storyBeats, str, type Area, type StoryBeat } from '@shared/presets';
import { FONT, H, W, easeOut, font, gradient, hexA, imageOf, lerp, logo, markLightFrame, prog, registerPreset, rrect, withAlpha, type Ctx, type Env } from '../engine';
import { applyView, fxMoves, fxPost, fxView } from './fx';

// Slideshow: slides to swipe through, the way TikTok photo posts and Instagram
// carousels are made. One slide per beat: a cover with the hook, a point per
// slide (text, a picture, or one frame of a screen recording), a closing slide.
// Each slide is laid out as a finished page, so the same frame works as a
// picture (render_slides) and as a moment of the video version. Everything sits
// between y 300 and 1560: the 4:5 picture is the band 225-1575 of this frame,
// the 2:3 one 90-1710, the 9:16 one all of it.

const X0 = 90;
const X1 = 990;
const MAXW = X1 - X0;
const TOP = 300;
const BOTTOM = 1500;
const FOOT = 1548;

interface Pal {
  text: string;
  sub: string;
  hi: string;
  card: string;
  edge: string;
  /** Text on a highlight-coloured pill. */
  onHi: string;
  light: boolean;
}

function palette(env: Env, over: boolean): Pal {
  const look = str(env.fields, 'look');
  if (over) return { text: '#FFFFFF', sub: 'rgba(255,255,255,0.92)', hi: '#FDE047', card: 'rgba(0,0,0,0.3)', edge: 'rgba(255,255,255,0.25)', onHi: '#111114', light: false };
  if (look === 'light') return { text: '#111114', sub: 'rgba(17,17,20,0.72)', hi: env.accent[0], card: '#FFFFFF', edge: 'rgba(0,0,0,0.12)', onHi: '#FFFFFF', light: true };
  if (look === 'color') return { text: '#FFFFFF', sub: 'rgba(255,255,255,0.9)', hi: '#FDE047', card: 'rgba(0,0,0,0.2)', edge: 'rgba(255,255,255,0.28)', onHi: '#111114', light: false };
  return { text: '#FFFFFF', sub: 'rgba(255,255,255,0.78)', hi: env.accent[1], card: 'rgba(255,255,255,0.06)', edge: 'rgba(255,255,255,0.16)', onHi: '#FFFFFF', light: false };
}

/** The page behind a slide (the dark look keeps the engine's own backdrop). */
function page(ctx: Ctx, env: Env): void {
  const look = str(env.fields, 'look');
  if (look === 'light') {
    ctx.fillStyle = '#F4F2EC';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.95, H * 0.16, 0, W * 0.95, H * 0.16, 900);
    g.addColorStop(0, hexA(env.accent[1], 0.16));
    g.addColorStop(1, hexA(env.accent[1], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (look === 'color') {
    ctx.fillStyle = gradient(ctx, 0, 200, W, H - 200, env.accent);
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.1, H * 0.85, 0, W * 0.1, H * 0.85, 1100);
    g.addColorStop(0, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

// ── Text with *highlighted* words ───────────────────────────────────────────
interface Word {
  s: string;
  hi: boolean;
}

interface Block {
  size: number;
  lh: number;
  lines: Word[][];
  widths: number[];
  h: number;
  weight: number;
  family: string;
}

function words(text: string): Word[] {
  const out: Word[] = [];
  let hi = false;
  for (const part of text.split('*')) {
    for (const s of part.split(/\s+/).filter(Boolean)) out.push({ s, hi });
    hi = !hi;
  }
  return out;
}

/** The largest size (max down to min) at which the text wraps inside maxW x maxH. */
function block(ctx: Ctx, text: string, o: { maxW: number; maxH: number; max: number; min: number; maxLines?: number; weight: number; family: string; lh?: number }): Block | null {
  const ws = words(text);
  if (!ws.length) return null;
  for (let size = o.max; ; size = Math.max(o.min, Math.floor(size * 0.94))) {
    font(ctx, size, o.weight, o.family);
    const space = ctx.measureText(' ').width;
    const lines: Word[][] = [[]];
    const widths: number[] = [0];
    for (const w of ws) {
      const ww = ctx.measureText(w.s).width;
      const cur = lines.length - 1;
      const next = widths[cur] + (lines[cur].length ? space : 0) + ww;
      if (lines[cur].length && next > o.maxW) {
        lines.push([w]);
        widths.push(ww);
      } else {
        lines[cur].push(w);
        widths[cur] = next;
      }
    }
    const lh = size * (o.lh ?? 1.1);
    const fits = lines.length * lh <= o.maxH && (o.maxLines === undefined || lines.length <= o.maxLines) && widths.every((w) => w <= o.maxW);
    if (fits || size <= o.min) return { size, lh, lines, widths, h: lines.length * lh, weight: o.weight, family: o.family };
  }
}

function drawBlock(ctx: Ctx, b: Block, x: number, y: number, maxW: number, center: boolean, color: string, hi: string): void {
  font(ctx, b.size, b.weight, b.family);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const space = ctx.measureText(' ').width;
  b.lines.forEach((line, i) => {
    let cx = center ? x + (maxW - b.widths[i]) / 2 : x;
    const yy = y + b.lh * (i + 0.8);
    for (const w of line) {
      ctx.fillStyle = w.hi ? hi : color;
      ctx.fillText(w.s, cx, yy);
      cx += ctx.measureText(w.s).width + space;
    }
  });
}

/** The text under a title: one paragraph, or a list when it has " / " between parts. */
interface Body {
  items: Block[];
  list: boolean;
  gap: number;
  h: number;
}

function body(ctx: Ctx, text: string, o: { maxH: number; max: number; min: number; family: string }): Body | null {
  const parts = text
    .split(/\s+\/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const list = parts.length > 1;
  for (let size = o.max; ; size = Math.max(o.min, Math.floor(size * 0.94))) {
    const items = parts.map((p) => block(ctx, p, { maxW: MAXW - (list ? 52 : 0), maxH: 4000, max: size, min: size, weight: 600, family: o.family, lh: 1.28 })!).filter(Boolean);
    const gap = list ? size * 0.5 : 0;
    const h = items.reduce((n, b) => n + b.h, 0) + gap * (items.length - 1);
    if (h <= o.maxH || size <= o.min) return { items, list, gap, h };
  }
}

function drawBody(ctx: Ctx, b: Body, y: number, center: boolean, pal: Pal): void {
  let yy = y;
  // A list under centred text sits in the middle as one block (its lines still start at the same edge).
  const wide = b.list ? Math.max(...b.items.flatMap((it) => it.widths)) + 52 : 0;
  const x0 = b.list && center ? X0 + Math.max(0, (MAXW - wide) / 2) : X0;
  for (const it of b.items) {
    if (b.list) {
      ctx.fillStyle = pal.hi;
      ctx.beginPath();
      ctx.arc(x0 + 12, yy + it.lh * 0.5, it.size * 0.17, 0, Math.PI * 2);
      ctx.fill();
      drawBlock(ctx, it, x0 + 52, yy, MAXW - 52, false, pal.sub, pal.hi);
    } else drawBlock(ctx, it, X0, yy, MAXW, center, pal.sub, pal.hi);
    yy += it.h + b.gap;
  }
}

// ── Pictures ────────────────────────────────────────────────────────────────
interface Media {
  src: CanvasImageSource;
  /** The part of the source shown, in its own pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

function crop(src: CanvasImageSource, w: number, h: number, a: Area): Media {
  return { src, sx: a.x * w, sy: a.y * h, sw: Math.max(2, a.w * w), sh: Math.max(2, a.h * h) };
}

/** The slide's picture: null = this kind has none, 'missing' = it has one that is not there (yet). */
function mediaOf(env: Env, b: StoryBeat): Media | 'missing' | null {
  if (b.visual === 'image') {
    const ref = imageRef(b.a);
    const img = imageOf(ref.path);
    return img ? crop(img, img.naturalWidth, img.naturalHeight, ref.area) : 'missing';
  }
  if (b.visual === 'screen') return env.video && env.videoSize ? crop(env.video, env.videoSize.w, env.videoSize.h, areaOf(b.a)) : 'missing';
  return null;
}

function placeholder(ctx: Ctx, x: number, y: number, w: number, h: number, text: string): void {
  rrect(ctx, x, y, w, h, 28);
  ctx.fillStyle = '#16161C';
  ctx.fill();
  font(ctx, 34, 600, FONT.mono);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + h / 2);
}

/** The picture filling the whole frame, dimmed so text reads on it. */
function fullBleed(ctx: Ctx, m: Media | 'missing', local: number, dur: number): void {
  ctx.fillStyle = '#0B0B10';
  ctx.fillRect(0, 0, W, H);
  if (m !== 'missing') {
    // Cover: the part of the picture with the frame's shape, a slow push-in while it shows.
    const s = Math.max(W / m.sw, H / m.sh) * (1 + 0.04 * Math.min(1, local / Math.max(1, dur)));
    const w = m.sw * s;
    const h = m.sh * s;
    ctx.drawImage(m.src, m.sx, m.sy, m.sw, m.sh, (W - w) / 2, (H - h) / 2, w, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── Photo slides: a picture filling the slide, words on it the way TikTok's own text looks ──
const lightColor = (hex: string): boolean => {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return true;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

let grainTile: HTMLCanvasElement | null = null;
/** Film grain: one fixed tile of noise (the same on every frame, so a still and the video match). */
function grain(ctx: Ctx): void {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 256;
    const g = grainTile.getContext('2d')!;
    const d = g.createImageData(256, 256);
    let s = 1234567;
    for (let i = 0; i < d.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = (s >> 16) & 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grainTile, 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** A block of words centred on the slide, in one of TikTok's text styles. */
function drawPhotoBlock(ctx: Ctx, b: Block, y: number, style: string, color: string, hi: string): void {
  font(ctx, b.size, b.weight, b.family);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const space = ctx.measureText(' ').width;
  const dark = lightColor(color) ? '#000000' : '#FFFFFF';
  b.lines.forEach((line, i) => {
    const x0 = (W - b.widths[i]) / 2;
    const yy = y + b.lh * (i + 0.8);
    if (style === 'box') {
      const padX = b.size * 0.34;
      rrect(ctx, x0 - padX, y + b.lh * i + b.lh * 0.02, b.widths[i] + padX * 2, b.lh * 0.98, b.size * 0.22);
      ctx.fillStyle = color;
      ctx.fill();
    }
    const each = (fn: (s: string, x: number, on: boolean) => void): void => {
      let cx = x0;
      for (const w of line) {
        fn(w.s, cx, w.hi);
        cx += ctx.measureText(w.s).width + space;
      }
    };
    if (style === 'outline') {
      ctx.strokeStyle = dark;
      ctx.lineWidth = b.size * 0.17;
      each((s, x) => ctx.strokeText(s, x, yy));
    }
    ctx.save();
    if (style === 'shadow') {
      ctx.shadowColor = lightColor(color) ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = b.size * 0.22;
      ctx.shadowOffsetY = b.size * 0.04;
    }
    // A shadow drawn twice reads on busy pictures.
    for (let k = 0; k < (style === 'shadow' ? 2 : 1); k++)
      each((s, x, on) => {
        ctx.fillStyle = style === 'box' ? (on ? hi : dark) : on ? hi : color;
        ctx.fillText(s, x, yy);
      });
    ctx.restore();
  });
}

function photoSlide(ctx: Ctx, env: Env, b: StoryBeat, cover: boolean, local: number): void {
  const f = env.fields;
  const tag = (k: string): string | undefined => b.tags.find((t) => t.startsWith(`${k}=`))?.slice(k.length + 1);
  const has = (k: string): boolean => b.tags.includes(k);
  const style = tag('style') ?? (str(f, 'text_style') || 'outline');
  const color = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.test(str(f, 'text_color').trim()) ? `#${str(f, 'text_color').trim().replace('#', '')}` : '#FFFFFF';
  const blur = Math.min(40, Math.max(0, Number(tag('blur') ?? 0) || 0));
  const dim = Math.min(0.8, Math.max(0, Number(tag('dim') ?? 0.1) || 0));
  markLightFrame(false);

  ctx.fillStyle = '#0B0B10';
  ctx.fillRect(0, 0, W, H);
  const ref = imageRef(b.a);
  const img = b.a ? imageOf(ref.path) : null;
  if (img) {
    // Cover: the part of the picture with the slide's shape, a slow push-in while it shows in the video.
    const m = crop(img, img.naturalWidth, img.naturalHeight, ref.area);
    const s = Math.max(W / m.sw, H / m.sh) * (1 + 0.04 * Math.min(1, local / Math.max(1, b.dur))) * (blur ? 1.08 : 1);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    if (has('flip')) ctx.scale(-1, 1);
    const filters = [has('bw') ? 'grayscale(1) contrast(1.08)' : '', blur ? `blur(${blur}px)` : ''].filter(Boolean);
    if (filters.length) ctx.filter = filters.join(' ');
    ctx.drawImage(m.src, m.sx, m.sy, m.sw, m.sh, (-m.sw * s) / 2, (-m.sh * s) / 2, m.sw * s, m.sh * s);
    ctx.restore();
    for (const [flag, tint] of [['warm', 'rgba(255,150,60,0.22)'], ['cool', 'rgba(60,125,255,0.22)']] as const) {
      if (!has(flag)) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (has('grain')) grain(ctx);
  } else placeholder(ctx, X0, TOP, MAXW, BOTTOM - TOP, b.a ? 'loading picture…' : 'picture goes here');
  if (dim) {
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, W, H);
  }

  const max = { small: 58, medium: 70, large: 86 }[str(f, 'text_size')] ?? 70;
  const title = block(ctx, b.headline, { maxW: 880, maxH: 620, max: cover ? Math.round(max * 1.12) : max, min: Math.round(max * 0.62), weight: 700, family: FONT.meme, lh: style === 'box' ? 1.42 : 1.22 });
  const lines = b.b
    .split(/\s+\/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => block(ctx, x, { maxW: 880, maxH: 400, max: Math.round(max * 0.72), min: Math.round(max * 0.5), weight: 600, family: FONT.meme, lh: style === 'box' ? 1.42 : 1.25 }))
    .filter((x): x is Block => !!x);
  const gap = max * 0.45;
  const stack = (title ? title.h : 0) + lines.reduce((n, l) => n + gap * 0.6 + l.h, 0) + (title && lines.length ? gap * 0.4 : 0);
  const pos = Math.min(95, Math.max(5, Number(tag('pos') ?? 50) || 50)) / 100;
  let y = Math.min(BOTTOM - stack, Math.max(TOP, TOP + (BOTTOM - TOP) * pos - stack / 2));
  const hi = style === 'box' ? env.accent[0] : '#FDE047';
  // The cover reads on its very first frame; later slides' words fade in.
  withAlpha(ctx, cover ? 1 : easeOut(prog(local, 0, 0.25)), () => {
    if (title) {
      drawPhotoBlock(ctx, title, y, style, color, hi);
      y += title.h + (lines.length ? gap * 0.4 : 0);
    }
    for (const l of lines) {
      y += gap * 0.6;
      drawPhotoBlock(ctx, l, y, style, color, hi);
      y += l.h;
    }
  });

  // A handle or disclaimer, small, when the reel has one (no slide numbers on a photo: TikTok and Instagram show their own dots).
  const foot = [str(f, 'footer').trim(), str(f, 'disclaimer').trim()].filter(Boolean).join(' · ');
  if (foot) {
    ctx.save();
    font(ctx, 26, 600, FONT.meme);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(foot, W / 2, FOOT, MAXW);
    ctx.restore();
  }
}

// ── One slide ───────────────────────────────────────────────────────────────
function footer(ctx: Ctx, env: Env, i: number, n: number, pal: Pal): void {
  const f = env.fields;
  const left = [str(f, 'footer').trim(), str(f, 'disclaimer').trim()].filter(Boolean).join(' · ');
  font(ctx, 26, 500, FONT.mono);
  ctx.textBaseline = 'alphabetic';
  withAlpha(ctx, 0.75, () => {
    ctx.fillStyle = pal.sub;
    if (left) {
      ctx.textAlign = 'left';
      ctx.fillText(left, X0, FOOT, MAXW - 120);
    }
    if (f.counter === true && n > 1) {
      ctx.textAlign = 'right';
      ctx.fillText(`${i + 1}/${n}`, X1, FOOT);
    }
  });
}

function slide(ctx: Ctx, env: Env, beats: StoryBeat[], i: number, local: number): void {
  const b = beats[i];
  const f = env.fields;
  const cover = i === 0;
  if (b.visual === 'photo') return photoSlide(ctx, env, b, cover, local);
  const media = mediaOf(env, b);
  const over = !!media && b.layout === 'over';
  const pal = palette(env, over);
  const center = str(f, 'align') === 'center';
  const bold = str(f, 'font') !== 'brand';
  const family = bold ? FONT.meme : FONT.sans;
  const titleWeight = bold ? 800 : 700;
  markLightFrame(pal.light);

  if (over) fullBleed(ctx, media!, local, b.dur);
  else page(ctx, env);

  // The words come in from the side on every slide but the cover, which has to read on its very first frame.
  const p = cover ? 1 : easeOut(prog(local, 0, 0.3));
  const shadow = (fn: () => void): void => {
    if (!over) return fn();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 3;
    fn();
    ctx.restore();
  };

  withAlpha(ctx, p, () => {
    ctx.save();
    ctx.translate(lerp(70, 0, p), 0);

    if (b.visual === 'end') {
      const mark = env.logo ? 170 : 0;
      const title = block(ctx, b.headline, { maxW: MAXW, maxH: 460, max: 108, min: 54, maxLines: 4, weight: titleWeight, family });
      const btn = b.a.replace(/\*/g, '').trim();
      const line = body(ctx, b.b, { maxH: 200, max: 46, min: 32, family });
      const btnH = btn ? 104 : 0;
      const stack = (mark ? mark + 56 : 0) + (title ? title.h : 0) + (btn ? 56 + btnH : 0) + (line ? 44 + line.h : 0);
      let y = TOP + Math.max(0, (BOTTOM - TOP - stack) / 2);
      if (mark) {
        logo(ctx, env, center ? W / 2 : X0 + mark / 2, y + mark / 2, mark);
        y += mark + 56;
      }
      if (title) {
        shadow(() => drawBlock(ctx, title, X0, y, MAXW, center, pal.text, pal.hi));
        y += title.h;
      }
      if (btn) {
        y += 56;
        font(ctx, 46, 800, family);
        const w = Math.min(MAXW, ctx.measureText(btn).width + 110);
        const x = center ? (W - w) / 2 : X0;
        rrect(ctx, x, y, w, btnH, btnH / 2);
        ctx.fillStyle = pal.hi;
        ctx.fill();
        ctx.fillStyle = pal.onHi;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(btn, x + w / 2, y + btnH / 2 + 3, w - 60);
        ctx.textBaseline = 'alphabetic';
        y += btnH;
      }
      if (line) shadow(() => drawBody(ctx, line, y + 44, center, pal));
    } else if (media && !over) {
      // Title, the picture as a card, the text under it: stacked and centred as one.
      const title = block(ctx, b.headline, { maxW: MAXW, maxH: 280, max: cover ? 96 : 84, min: 46, maxLines: 3, weight: titleWeight, family });
      const text = body(ctx, b.b, { maxH: 300, max: 46, min: 32, family });
      const gap = 48;
      const room = BOTTOM - TOP - (title ? title.h + gap : 0) - (text ? text.h + gap : 0);
      const aspect = media === 'missing' ? 9 / 16 : media.sh / media.sw;
      const cardH = Math.max(120, Math.min(room, MAXW * aspect));
      const cardW = Math.min(MAXW, cardH / aspect);
      const stack = (title ? title.h + gap : 0) + cardH + (text ? text.h + gap : 0);
      let y = TOP + Math.max(0, (BOTTOM - TOP - stack) / 2);
      if (title) {
        drawBlock(ctx, title, X0, y, MAXW, center, pal.text, pal.hi);
        y += title.h + gap;
      }
      const x = X0 + (MAXW - cardW) / 2;
      if (media === 'missing') placeholder(ctx, x, y, cardW, cardH, b.visual === 'screen' ? (str(f, 'video') ? 'loading video…' : 'screen recording goes here') : b.a ? 'loading picture…' : 'picture goes here');
      else {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 14;
        rrect(ctx, x, y, cardW, cardH, 28);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();
        ctx.save();
        rrect(ctx, x, y, cardW, cardH, 28);
        ctx.clip();
        ctx.drawImage(media.src, media.sx, media.sy, media.sw, media.sh, x, y, cardW, cardH);
        ctx.restore();
        rrect(ctx, x, y, cardW, cardH, 28);
        ctx.strokeStyle = pal.edge;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      y += cardH + gap;
      if (text) drawBody(ctx, text, y, center, pal);
    } else {
      // Words only (or words over a full picture): the kicker, the title, the text.
      const kicker = b.visual === 'text' ? b.a.replace(/\*/g, '').trim().toUpperCase() : '';
      const title = block(ctx, b.headline, cover ? { maxW: MAXW, maxH: 660, max: 150, min: 64, maxLines: 5, weight: titleWeight, family, lh: 1.06 } : { maxW: MAXW, maxH: 440, max: 104, min: 54, maxLines: 4, weight: titleWeight, family, lh: 1.08 });
      const text = body(ctx, b.b, { maxH: cover ? 240 : 520, max: cover ? 50 : 56, min: 34, family });
      const kickH = kicker ? 44 : 0;
      const bar = cover && title ? 12 : 0;
      const stack = (kicker ? kickH + 30 : 0) + (title ? title.h : 0) + (bar ? 40 + bar : 0) + (text ? (bar ? 44 : 52) + text.h : 0);
      let y = TOP + Math.max(0, (BOTTOM - TOP - stack) / 2);
      if (kicker) {
        font(ctx, 34, 700, bold ? FONT.meme : FONT.mono);
        ctx.letterSpacing = '4px';
        const w = ctx.measureText(kicker).width;
        ctx.fillStyle = pal.hi;
        ctx.textAlign = 'left';
        shadow(() => ctx.fillText(kicker, center ? (W - w) / 2 : X0, y + 34, MAXW));
        ctx.letterSpacing = '0px';
        y += kickH + 30;
      }
      if (title) {
        shadow(() => drawBlock(ctx, title, X0, y, MAXW, center, pal.text, pal.hi));
        y += title.h;
      }
      if (bar) {
        y += 40;
        rrect(ctx, center ? W / 2 - 80 : X0, y, 160, bar, bar / 2);
        ctx.fillStyle = pal.hi;
        ctx.fill();
        y += bar;
      }
      if (text) shadow(() => drawBody(ctx, text, y + (bar ? 44 : 52), center, pal));
    }
    ctx.restore();
  });

  footer(ctx, env, i, beats.length, pal);
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const v = fxView(b, local);
  ctx.save();
  if (fxMoves(v)) applyView(ctx, v);
  slide(ctx, env, beats, i, local);
  ctx.restore();
  fxPost(ctx, b, local);
}

registerPreset('slides', draw);
