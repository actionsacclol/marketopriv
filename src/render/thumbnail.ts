import type { LongVideo } from '@shared/types';
import { FONT } from './engine';
import { seek, videoElement, waitMeta } from './media';

// A long video's YouTube thumbnail, 1280x720: a picture (or a video frame) behind, darkened toward the left; 2-5 big
// words on the left, one in the accent colour (*word*); an optional second picture on the right (a product
// screenshot), tilted with a glow; the Krypt mark in a corner. Readable at phone size: few words, huge type.

const W = 1280;
const H = 720;
const ACCENT = '#FFD84D';
const GLOW = '#a855f7';

async function picture(path: string): Promise<CanvasImageSource & { width: number; height: number }> {
  if (/\.(mp4|mov|webm|mkv)$/i.test(path)) {
    const v = videoElement(path);
    await waitMeta(v);
    await seek(v, Math.min(Math.max(1, v.duration * 0.3), Math.max(0, v.duration - 0.5)));
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    v.removeAttribute('src');
    v.load();
    return c;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = path.startsWith('./') ? path : window.marketo.app.mediaUrl(path);
  await img.decode();
  return img;
}

function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number): void {
  const k = Math.max(w / img.width, h / img.height);
  const sw = w / k;
  const sh = h / k;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Words → lines that fit maxW at this size. */
function wrap(ctx: CanvasRenderingContext2D, words: string[], maxW: number): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    const next = [...cur, w];
    if (cur.length && ctx.measureText(next.join(' ').replace(/\*/g, '')).width > maxW) {
      lines.push(cur);
      cur = [w];
    } else cur = next;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

export async function renderThumbnail(v: LongVideo): Promise<string> {
  await document.fonts.load(`700 100px "Chakra Petch"`).catch(() => undefined);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0b0614';
  ctx.fillRect(0, 0, W, H);
  if (v.thumbnailBg) cover(ctx, await picture(v.thumbnailBg), 0, 0, W, H);
  else {
    const g = ctx.createRadialGradient(W * 0.75, H * 0.4, 50, W * 0.6, H * 0.5, W * 0.8);
    g.addColorStop(0, '#3b0d6b');
    g.addColorStop(1, '#07030d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // Darker where the words go.
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.88)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  shade.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  const side = !!v.thumbnailSide;
  if (side) {
    const img = await picture(v.thumbnailSide!);
    const bw = 600;
    const bh = Math.round(bw * Math.min(0.75, img.height / img.width));
    ctx.save();
    ctx.translate(W - bw / 2 - 40, H / 2 + 10);
    ctx.rotate((-3 * Math.PI) / 180);
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = 50;
    ctx.fillStyle = GLOW;
    ctx.beginPath();
    ctx.roundRect(-bw / 2 - 6, -bh / 2 - 6, bw + 12, bh + 12, 22);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 16);
    ctx.clip();
    cover(ctx, img, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }

  // The words: biggest size where they fit in 3 lines.
  const text = (v.thumbnailText ?? v.title).trim().toUpperCase();
  const words = text.split(/\s+/).filter(Boolean);
  const maxW = side ? 560 : 1100;
  let size = 150;
  let lines: string[][] = [];
  for (; size >= 56; size -= 4) {
    ctx.font = `700 ${size}px ${FONT.sans}`;
    lines = wrap(ctx, words, maxW);
    if (lines.length <= 3 && lines.length * size * 1.02 <= H - 140) break;
  }
  const lh = size * 1.02;
  let y = H / 2 - (lines.length * lh) / 2 + size * 0.82;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const line of lines) {
    let x = 60;
    for (let i = 0; i < line.length; i++) {
      const raw = line[i];
      const hot = /^\*.*\*$/.test(raw) || /^\*/.test(raw) || /\*$/.test(raw);
      const word = raw.replace(/\*/g, '') + (i < line.length - 1 ? ' ' : '');
      ctx.lineWidth = Math.max(8, size * 0.09);
      ctx.strokeStyle = '#000';
      ctx.strokeText(word, x, y);
      ctx.fillStyle = hot ? ACCENT : '#ffffff';
      ctx.fillText(word, x, y);
      x += ctx.measureText(word).width;
    }
    y += lh;
  }

  // The Krypt mark, top left.
  try {
    const logo = await picture('./krypt.png');
    ctx.globalAlpha = 0.95;
    ctx.drawImage(logo, 40, 34, 64, 64);
    ctx.globalAlpha = 1;
  } catch {
    /* no logo file: fine */
  }
  return c.toDataURL('image/png').split(',')[1];
}
