import type { Reel, ReelCover } from '@shared/types';
import { COVER_PLACE_Y } from '@shared/covers';
import { FONT } from './engine';
import { renderStills } from './export';

// A Short / reel cover, 1080x1920: the reel's own frame at cover.t (or a picture), a little darker where the words go,
// and 2-5 big words in one of the looks (shared/covers.ts). The words stay inside the middle 3:4, which is all
// Instagram's grid and TikTok's cover show. Drawn at any scale for the live preview on Create > Thumbnails.

const W = 1080;
const H = 1920;
const MAX_W = 920;

type Pic = CanvasImageSource & { width: number; height: number };

async function load(src: string): Promise<Pic> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  return img;
}

function cover(ctx: CanvasRenderingContext2D, img: Pic): void {
  const k = Math.max(W / img.width, H / img.height);
  const sw = W / k;
  const sh = H / k;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
}

type Word = { w: string; hot: boolean };
const wordsOf = (text: string): Word[] =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ w: raw.replace(/\*/g, ''), hot: /^\*|\*$/.test(raw) }))
    .filter((x) => x.w);

function wrap(ctx: CanvasRenderingContext2D, words: Word[], maxW: number): Word[][] {
  const lines: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const next = [...cur, w];
    if (cur.length && ctx.measureText(next.map((x) => x.w).join(' ')).width > maxW) {
      lines.push(cur);
      cur = [w];
    } else cur = next;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** The biggest size where the words fit in maxLines at maxW. */
function fit(ctx: CanvasRenderingContext2D, words: Word[], font: (px: number) => string, maxW: number, maxLines: number, from: number, to: number): { size: number; lines: Word[][] } {
  let lines: Word[][] = [];
  let size = from;
  for (; size >= to; size -= 6) {
    ctx.font = font(size);
    lines = wrap(ctx, words, maxW);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l.map((x) => x.w).join(' ')).width <= maxW)) break;
  }
  return { size: Math.max(size, to), lines };
}

const lineWidth = (ctx: CanvasRenderingContext2D, line: Word[]): number => ctx.measureText(line.map((x) => x.w).join(' ')).width;

/** One line, centred on x = W/2, each word in white or the accent colour. */
function drawLine(ctx: CanvasRenderingContext2D, line: Word[], y: number, color: string, base: string, stroke: number): void {
  let x = W / 2 - lineWidth(ctx, line) / 2;
  const space = ctx.measureText(' ').width;
  for (const word of line) {
    if (stroke > 0) {
      ctx.lineWidth = stroke;
      ctx.strokeStyle = '#000';
      ctx.strokeText(word.w, x, y);
    }
    ctx.fillStyle = word.hot ? color : base;
    ctx.fillText(word.w, x, y);
    x += ctx.measureText(word.w).width + space;
  }
}

/** A soft dark glow behind the words so they read over any frame. */
function shade(ctx: CanvasRenderingContext2D, cy: number, h: number, alpha: number): void {
  const g = ctx.createLinearGradient(0, cy - h, 0, cy + h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, cy - h, W, h * 2);
}

function drawWords(ctx: CanvasRenderingContext2D, c: ReelCover): void {
  const words = wordsOf(c.look === 'box' ? c.text : c.text.toUpperCase());
  if (c.look === 'frame' || !words.length) return;
  const cy = COVER_PLACE_Y[c.place];
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.textAlign = 'left';

  if (c.look === 'bold') {
    const { size, lines } = fit(ctx, words, (px) => `400 ${px}px ${FONT.impact}`, MAX_W, 4, 230, 90);
    const lh = size * 1.02;
    shade(ctx, cy, (lines.length * lh) / 2 + 260, 0.55);
    let y = cy - (lines.length * lh) / 2 + size * 0.86;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    for (const line of lines) {
      drawLine(ctx, line, y, c.color, '#FFFFFF', Math.max(10, size * 0.11));
      y += lh;
    }
    ctx.restore();
    return;
  }

  if (c.look === 'box') {
    const { size, lines } = fit(ctx, words, (px) => `800 ${px}px ${FONT.meme}`, MAX_W - 60, 4, 120, 56);
    const pad = size * 0.32;
    const lh = size * 1.32;
    let y = cy - (lines.length * lh) / 2;
    for (const line of lines) {
      const w = lineWidth(ctx, line) + pad * 2;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(W / 2 - w / 2, y, w, lh - size * 0.12, size * 0.22);
      ctx.fill();
      drawLine(ctx, line, y + size * 0.98, c.color === '#FFFFFF' ? '#111111' : c.color, '#111111', 0);
      y += lh;
    }
    return;
  }

  // Band: a dark strip across the frame, the words in it.
  const { size, lines } = fit(ctx, words, (px) => `700 ${px}px ${FONT.sans}`, MAX_W, 3, 150, 64);
  const lh = size * 1.08;
  const bandH = lines.length * lh + size * 0.9;
  ctx.fillStyle = 'rgba(8,6,14,0.86)';
  ctx.fillRect(0, cy - bandH / 2, W, bandH);
  ctx.fillStyle = c.color;
  ctx.fillRect(0, cy - bandH / 2, W, 10);
  ctx.fillRect(0, cy + bandH / 2 - 10, W, 10);
  let y = cy - (lines.length * lh) / 2 + size * 0.84;
  for (const line of lines) {
    drawLine(ctx, line, y, c.color, '#FFFFFF', 0);
    y += lh;
  }
}

/** Draw a reel's cover; returns base64 PNG. scale 1 = the full 1080x1920 file, smaller for previews. */
export async function renderCover(reel: Reel, c: ReelCover, scale = 1): Promise<string> {
  await Promise.all([`400 100px Anton`, `800 100px Montserrat`, `700 100px "Chakra Petch"`].map((f) => document.fonts.load(f).catch(() => undefined)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#07030d';
  ctx.fillRect(0, 0, W, H);
  if (c.bg) cover(ctx, await load(window.marketo.app.mediaUrl(c.bg)));
  else {
    // The frame at the size it will be drawn at: a preview needs no full-size render.
    const [still] = await renderStills(reel, [c.t], Math.min(1, Math.max(0.3, scale)), 'vertical');
    cover(ctx, await load(`data:image/png;base64,${still.data}`));
  }
  drawWords(ctx, c);
  return canvas.toDataURL('image/png').split(',')[1];
}
